import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents, businesses, deviceGrants, devices, docCounters, idempotencyKeys, tabSessions,
} from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { can, type Permission } from "@/lib/permissions";
import { MoneyError } from "@/lib/money";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DB = typeof db | Tx;
export type Device = typeof devices.$inferSelect;
export type Business = typeof businesses.$inferSelect;

export const DEVICE_COOKIE = "bf_device";
export const TAB_TTL_MS = 2 * 60 * 1000;
const MAX_BODY = 256 * 1024;

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error") {
    super(message);
  }
}

export type Ctx = {
  deviceId: string;
  deviceName: string;
  operator: string | null;
  workspaceId: string;
  businessId: string;
  branchId: string | null;
  role: string;
};

/* ───────── rate limit (best-effort, in-memory per instance) ───────── */
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return;
  }
  b.n++;
  if (b.n > max) throw new HttpError(429, "Terlalu banyak permintaan. Coba lagi sebentar lagi.", "rate_limited");
}

export const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

/* ───────── device auth ───────── */
export async function findDevice(req: NextRequest): Promise<Device | null> {
  const t = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!t || t.length > 200) return null;
  const [d] = await db.select().from(devices).where(and(eq(devices.tokenHash, sha256(t)), eq(devices.status, "active"))).limit(1);
  return d ?? null;
}

export async function findGrant(deviceId: string) {
  const [g] = await db
    .select()
    .from(deviceGrants)
    .where(and(eq(deviceGrants.deviceId, deviceId), eq(deviceGrants.status, "active")))
    .orderBy(desc(deviceGrants.createdAt))
    .limit(1);
  return g ?? null;
}

export async function createDevice(name = "Perangkat"): Promise<{ device: Device; token: string }> {
  const token = randomToken(32);
  const [device] = await db.insert(devices).values({ tokenHash: sha256(token), name }).returning();
  return { device, token };
}

export function secureCookie(req: NextRequest) {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

export function setDeviceCookie(res: NextResponse, req: NextRequest, token: string) {
  res.cookies.set(DEVICE_COOKIE, token, {
    httpOnly: true, secure: secureCookie(req), sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 400,
  });
  return res;
}

export async function issueTab(deviceId: string): Promise<string> {
  const token = randomToken(32);
  await db.insert(tabSessions).values({ tokenHash: sha256(token), deviceId, expiresAt: new Date(Date.now() + TAB_TTL_MS) });
  // housekeeping ringan: hapus sesi kedaluwarsa milik perangkat ini
  await db.delete(tabSessions).where(and(eq(tabSessions.deviceId, deviceId), sql`${tabSessions.expiresAt} < now() - interval '1 hour'`));
  return token;
}

async function verifyTab(req: NextRequest, deviceId: string) {
  const t = req.headers.get("x-tab-session");
  if (!t || t.length > 200) throw new HttpError(401, "Aplikasi terkunci. Masukkan PIN.", "locked");
  const [s] = await db
    .update(tabSessions)
    .set({ expiresAt: new Date(Date.now() + TAB_TTL_MS) })
    .where(and(eq(tabSessions.tokenHash, sha256(t)), eq(tabSessions.deviceId, deviceId), isNull(tabSessions.revokedAt), gt(tabSessions.expiresAt, sql`now()`)))
    .returning({ id: tabSessions.id });
  if (!s) throw new HttpError(401, "Sesi tab berakhir. Masukkan PIN.", "locked");
  return s.id;
}

export async function revokeTab(req: NextRequest) {
  const t = req.headers.get("x-tab-session");
  if (!t) return;
  await db.update(tabSessions).set({ revokedAt: new Date() }).where(eq(tabSessions.tokenHash, sha256(t)));
}

/* ───────── route framework ───────── */
export type RouteArgs = {
  req: NextRequest;
  params: Record<string, string>;
  query: URLSearchParams;
  ctx: Ctx;
  device: Device | null;
  idemKey: string | null;
  json<T>(schema: ZodType<T>): Promise<T>;
};
export type Route = {
  method: string;
  pattern: string;
  auth: "none" | "device" | "tab";
  perm?: Permission;
  handler: (a: RouteArgs) => Promise<unknown>;
};

export function r(
  method: Route["method"],
  pattern: string,
  opts: { auth?: Route["auth"]; perm?: Permission },
  handler: Route["handler"],
): Route {
  return { method, pattern, auth: opts.auth ?? "tab", perm: opts.perm, handler };
}

function match(pattern: string, segs: string[]): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  if (p.length !== segs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(segs[i]);
    else if (p[i] !== segs[i]) return null;
  }
  return params;
}

export function problem(status: number, title: string, code: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { type: "about:blank", title, status, code, detail: title, ...extra },
    { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } },
  );
}

export async function dispatch(routes: Route[], req: NextRequest, segs: string[]): Promise<Response> {
  try {
    let found: { route: Route; params: Record<string, string> } | null = null;
    let pathMatched = false;
    for (const route of routes) {
      const params = match(route.pattern, segs);
      if (!params) continue;
      pathMatched = true;
      if (route.method === req.method) { found = { route, params }; break; }
    }
    if (!found) return problem(pathMatched ? 405 : 404, pathMatched ? "Metode tidak diizinkan" : "Endpoint tidak ditemukan", "not_found");
    const { route, params } = found;
    const mutating = req.method !== "GET" && req.method !== "HEAD";

    rateLimit(`${clientIp(req)}:${route.auth === "none" ? route.pattern : "api"}`, route.auth === "none" ? 40 : 600, 60_000);

    if (mutating) {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== req.headers.get("host")) throw new HttpError(403, "Origin tidak diizinkan", "csrf");
      if (req.headers.get("x-requested-with") !== "bf") throw new HttpError(403, "Header permintaan tidak valid", "csrf");
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > MAX_BODY) throw new HttpError(413, "Payload terlalu besar", "payload_too_large");
    }

    let device: Device | null = null;
    let ctx = null as unknown as Ctx;
    if (route.auth !== "none") {
      device = await findDevice(req);
      if (!device) throw new HttpError(401, "Perangkat tidak dikenali atau telah dicabut.", "device_unknown");
      if (route.auth === "tab" || route.perm) {
        // lanjut ke grant di bawah
      }
      const grant = await findGrant(device.id);
      if (grant) {
        ctx = {
          deviceId: device.id, deviceName: device.name, operator: device.operatorName,
          workspaceId: grant.workspaceId, businessId: grant.businessId, branchId: grant.branchId, role: grant.role,
        };
      } else if (route.auth === "tab") {
        throw new HttpError(403, "Perangkat belum memiliki akses ke bisnis.", "no_grant");
      }
      if (route.auth === "tab") await verifyTab(req, device.id);
      if (route.perm && (!ctx || !can(ctx.role, route.perm))) throw new HttpError(403, "Perangkat ini tidak memiliki izin untuk aksi tersebut.", "forbidden");
    }

    const idemRaw = req.headers.get("idempotency-key");
    const args: RouteArgs = {
      req, params, query: req.nextUrl.searchParams, ctx, device,
      idemKey: idemRaw && idemRaw.length <= 100 ? idemRaw : null,
      async json<T>(schema: ZodType<T>) {
        const text = await req.text();
        if (text.length > MAX_BODY) throw new HttpError(413, "Payload terlalu besar", "payload_too_large");
        let raw: unknown;
        try { raw = text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, "JSON tidak valid", "bad_json"); }
        return schema.parse(raw);
      },
    };
    const result = await route.handler(args);
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true }, { status: req.method === "POST" ? 201 : 200 });
  } catch (e) {
    if (e instanceof HttpError) return problem(e.status, e.message, e.code);
    if (e instanceof ZodError) {
      return problem(422, e.issues[0]?.message ?? "Input tidak valid", "validation", {
        errors: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (e instanceof MoneyError) return problem(422, e.message, "validation");
    const pg = ((e as { cause?: unknown }).cause ?? e) as { code?: string };
    if (pg?.code === "23505") return problem(409, "Data duplikat (nilai unik sudah ada).", "conflict");
    if (pg?.code === "23514") return problem(422, "Data melanggar aturan integritas.", "constraint");
    if (pg?.code === "23503") return problem(422, "Referensi data tidak valid.", "reference");
    console.error("[api] unhandled", (e as Error)?.message);
    return problem(500, "Terjadi kesalahan pada server.", "internal");
  }
}

/* ───────── helpers ───────── */
export async function audit(
  d: DB, ctx: Pick<Ctx, "workspaceId" | "deviceId" | "operator">,
  action: string, resource: string, resourceId?: string | null, meta: Record<string, unknown> = {},
) {
  await d.insert(auditEvents).values({
    workspaceId: ctx.workspaceId, deviceId: ctx.deviceId, operator: ctx.operator, action, resource, resourceId: resourceId ?? null, meta,
  });
}

export async function nextNumber(d: DB, workspaceId: string, key: string, prefix: string) {
  const [row] = await d
    .insert(docCounters)
    .values({ workspaceId, key, value: 1 })
    .onConflictDoUpdate({ target: [docCounters.workspaceId, docCounters.key], set: { value: sql`${docCounters.value} + 1` } })
    .returning({ v: docCounters.value });
  return `${prefix}-${String(row.v).padStart(5, "0")}`;
}

export async function idempotent<T>(tx: Tx, ctx: Ctx, key: string | null, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();
  const ins = await tx.insert(idempotencyKeys).values({ workspaceId: ctx.workspaceId, key: `${ctx.deviceId}:${key}` }).onConflictDoNothing().returning({ id: idempotencyKeys.id });
  if (!ins.length) {
    const [row] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.workspaceId, ctx.workspaceId), eq(idempotencyKeys.key, `${ctx.deviceId}:${key}`)));
    if (row?.response != null) return row.response as T;
    throw new HttpError(409, "Permintaan yang sama sedang diproses.", "in_progress");
  }
  const res = await fn();
  await tx.update(idempotencyKeys).set({ response: res as unknown }).where(eq(idempotencyKeys.id, ins[0].id));
  return res;
}

export async function getBusiness(d: DB, ctx: Ctx): Promise<Business> {
  const [b] = await d.select().from(businesses).where(and(eq(businesses.id, ctx.businessId), eq(businesses.workspaceId, ctx.workspaceId)));
  if (!b) throw new HttpError(404, "Bisnis tidak ditemukan", "not_found");
  return b;
}

export function todayIn(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

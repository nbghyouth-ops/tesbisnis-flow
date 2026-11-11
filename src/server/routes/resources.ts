import { and, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import type { PgTable, AnyPgColumn } from "drizzle-orm/pg-core";
import { z, type ZodType } from "zod";
import { db } from "@/db";
import {
  assets, attendance, bookingResources, campaigns, clientActivities, clientContacts, clients,
  employees, opsLogs, products, projects, suppliers, tasks,
} from "@/db/schema";
import { can, type Permission } from "@/lib/permissions";
import { RESOURCES, type Field, type ResourceMeta } from "@/lib/resource-meta";
import { assertCurrencyPrecision } from "@/lib/money";
import { audit, getBusiness, HttpError, nextNumber, r, type Ctx, type Route } from "../core";

type AnyTable = PgTable & Record<string, AnyPgColumn>;
const TABLES: Record<string, PgTable> = {
  clients, "client-contacts": clientContacts, "client-activities": clientActivities, products, suppliers,
  employees, attendance, tasks, projects, assets, campaigns, "ops-logs": opsLogs, "booking-resources": bookingResources,
};
const table = (k: string) => TABLES[k] as AnyTable;

function metaOf(key: string): ResourceMeta {
  const m = RESOURCES[key];
  if (!m) throw new HttpError(404, "Resource tidak ditemukan", "not_found");
  return m;
}
function need(ctx: Ctx, m: ResourceMeta, verb: "read" | "write") {
  if (!can(ctx.role, `${m.perm}:${verb}` as Permission)) throw new HttpError(403, "Perangkat ini tidak memiliki izin untuk aksi tersebut.", "forbidden");
}

const empty = (v: unknown) => (v === "" || v === undefined ? null : v);

function fieldSchema(f: Field): ZodType {
  const req = (s: z.ZodType) => s;
  let s: ZodType;
  switch (f.type) {
    case "text": s = z.string().trim().max(300); break;
    case "textarea": s = z.string().trim().max(4000); break;
    case "int": s = z.coerce.number().int("Harus bilangan bulat").min(0).max(1_000_000_000); break;
    case "qty": s = z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string().regex(/^\d{1,15}(\.\d{1,3})?$/, `${f.label} tidak valid`)); break;
    case "money": s = z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string().regex(/^\d{1,15}(\.\d{1,2})?$/, `${f.label} tidak valid`)); break;
    case "date": s = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${f.label} tidak valid`); break;
    case "time": s = z.string().regex(/^\d{2}:\d{2}$/, `${f.label} tidak valid`); break;
    case "select": s = z.enum((f.options ?? []).map((o) => o.value) as [string, ...string[]]); break;
    case "bool": s = z.boolean(); break;
    case "ref": s = z.string().uuid(); break;
  }
  if (f.required) return z.any().refine((v) => v !== undefined && v !== null && v !== "", { message: `${f.label} wajib diisi` }).pipe(req(s));
  if (f.type === "select" || f.type === "bool") return s.optional();
  return z.preprocess(empty, s.nullable().optional());
}

function buildSchema(m: ResourceMeta, partial: boolean) {
  const shape: Record<string, ZodType> = {};
  for (const f of m.fields) shape[f.name] = partial ? fieldSchema(f).optional() : fieldSchema(f);
  return z.object(shape).strict();
}

async function checkRefs(ctx: Ctx, m: ResourceMeta, row: Record<string, unknown>) {
  for (const f of m.fields) {
    const v = row[f.name];
    if (f.type !== "ref" || !v || !f.ref) continue;
    const t = table(f.ref);
    const [hit] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, v as string), eq(t.workspaceId, ctx.workspaceId))).limit(1);
    if (!hit) throw new HttpError(422, `${f.label} tidak ditemukan pada bisnis ini.`, "bad_reference");
  }
}

export const resourceRoutes: Route[] = [
  r("GET", "/r/:key", {}, async ({ ctx, params, query }) => {
    const m = metaOf(params.key); need(ctx, m, "read");
    const t = table(m.key);
    const conds: SQL[] = [eq(t.workspaceId, ctx.workspaceId)];
    for (const f of m.fields) {
      const qv = query.get(f.name);
      if (qv && (f.type === "ref" || f.type === "select")) {
        if (f.type === "ref" && !z.string().uuid().safeParse(qv).success) throw new HttpError(422, "Filter tidak valid");
        conds.push(eq(t[f.name], qv));
      }
    }
    const q = query.get("q")?.slice(0, 80);
    if (q) conds.push(ilike(t[m.titleField], `%${q.replace(/[%_\\]/g, "\\$&")}%`));
    if (m.key === "client-activities" && !can(ctx.role, "crm:write")) conds.push(eq(t.isInternal, false));
    const limit = Math.min(Number(query.get("limit") ?? 200) || 200, 500);
    const items = await db.select().from(t).where(and(...conds)).orderBy(desc(t.createdAt)).limit(limit);
    return { items };
  }),

  r("POST", "/r/:key", {}, async ({ ctx, params, json, idemKey }) => {
    const m = metaOf(params.key); need(ctx, m, "write");
    const row = (await json(buildSchema(m, false))) as Record<string, unknown>;
    await checkRefs(ctx, m, row);
    const biz = await getBusiness(db, ctx);
    for (const f of m.fields) if (f.type === "money" && typeof row[f.name] === "string") assertCurrencyPrecision(row[f.name] as string, biz.currency);
    const t = table(m.key);
    return db.transaction(async (tx) => {
      const values: Record<string, unknown> = { ...row, workspaceId: ctx.workspaceId, businessId: ctx.businessId };
      if (m.auto) values[m.auto.col] = await nextNumber(tx, ctx.workspaceId, m.key, m.auto.prefix);
      if ("deviceId" in t) values.deviceId = ctx.deviceId;
      if ("operator" in t) values.operator = ctx.operator;
      void idemKey;
      const [created] = await tx.insert(t).values(values as never).returning();
      if (m.key === "client-activities") {
        await tx.update(clients).set({ lastActivityAt: new Date() }).where(and(eq(clients.id, row.clientId as string), eq(clients.workspaceId, ctx.workspaceId)));
      }
      await audit(tx, ctx, "create", m.key, (created as { id: string }).id);
      return { item: created };
    });
  }),

  r("PATCH", "/r/:key/:id", {}, async ({ ctx, params, json }) => {
    const m = metaOf(params.key); need(ctx, m, "write");
    if (m.noEdit) throw new HttpError(405, "Data ini tidak dapat diubah.", "immutable");
    if (!z.string().uuid().safeParse(params.id).success) throw new HttpError(404, "Tidak ditemukan", "not_found");
    const row = (await json(buildSchema(m, true))) as Record<string, unknown>;
    for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
    await checkRefs(ctx, m, row);
    const t = table(m.key);
    const biz = await getBusiness(db, ctx);
    for (const f of m.fields) if (f.type === "money" && typeof row[f.name] === "string") assertCurrencyPrecision(row[f.name] as string, biz.currency);
    if (!Object.keys(row).length) throw new HttpError(422, "Tidak ada perubahan");
    const [u] = await db.update(t).set(row as never).where(and(eq(t.id, params.id), eq(t.workspaceId, ctx.workspaceId))).returning();
    if (!u) throw new HttpError(404, "Tidak ditemukan", "not_found");
    await audit(db, ctx, "update", m.key, params.id, { fields: Object.keys(row) });
    return { item: u };
  }),

  r("DELETE", "/r/:key/:id", {}, async ({ ctx, params }) => {
    const m = metaOf(params.key); need(ctx, m, "write");
    if (!z.string().uuid().safeParse(params.id).success) throw new HttpError(404, "Tidak ditemukan", "not_found");
    const t = table(m.key);
    if (m.archive) {
      const [u] = await db.update(t).set({ [m.archive.col]: m.archive.value } as never).where(and(eq(t.id, params.id), eq(t.workspaceId, ctx.workspaceId))).returning({ id: t.id });
      if (!u) throw new HttpError(404, "Tidak ditemukan", "not_found");
      await audit(db, ctx, "archive", m.key, params.id);
      return { ok: true };
    }
    if (!m.remove) throw new HttpError(405, "Data ini tidak dapat dihapus.", "immutable");
    const [d] = await db.delete(t).where(and(eq(t.id, params.id), eq(t.workspaceId, ctx.workspaceId))).returning({ id: t.id });
    if (!d) throw new HttpError(404, "Tidak ditemukan", "not_found");
    await audit(db, ctx, "delete", m.key, params.id);
    return { ok: true };
  }),
];

void sql;

import { NextResponse } from "next/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  accountingPeriods, branches, businesses, cashAccounts, coaAccounts, deviceGrants, devices, financeCategories,
  legalAcceptances, legalDocuments, onboardingDrafts, pairingCodes, tabSessions, warehouses, workspaces,
} from "@/db/schema";
import { hashPin, pairingCode, sha256, validatePin, verifyPin } from "@/lib/crypto";
import { LEGAL_DOCS, LEGAL_VERSION } from "@/lib/legal";
import { assertCurrencyPrecision, toCents } from "@/lib/money";
import { ROLES } from "@/lib/permissions";
import {
  audit, clientIp, createDevice, findDevice, findGrant, HttpError, issueTab, r, rateLimit, revokeTab,
  setDeviceCookie, todayIn, type Ctx, type Device, type Route,
} from "../core";
import { DEFAULT_COA, postJournal } from "../accounting";

/* ───────── helpers ───────── */
async function ensureDevice(req: Parameters<typeof findDevice>[0]) {
  const existing = await findDevice(req);
  if (existing) return { device: existing, token: null as string | null };
  const { device, token } = await createDevice();
  return { device, token };
}
const withCookie = (res: NextResponse, req: Parameters<typeof findDevice>[0], token: string | null) =>
  token ? setDeviceCookie(res, req, token) : res;

const pinPair = z.object({ pin: z.string().max(10), confirm: z.string().max(10) });
function checkPins(pin: string, confirm: string) {
  const err = validatePin(pin);
  if (err) throw new HttpError(422, err, "weak_pin");
  if (pin !== confirm) throw new HttpError(422, "Konfirmasi PIN tidak sama.", "pin_mismatch");
}

async function lockDevice(deviceId: string) {
  await db.update(tabSessions).set({ revokedAt: new Date() }).where(and(eq(tabSessions.deviceId, deviceId), isNull(tabSessions.revokedAt)));
}

async function ensureLegal() {
  const ids: Record<string, string> = {};
  for (const kind of ["terms", "privacy"] as const) {
    await db.insert(legalDocuments).values({ kind, version: LEGAL_VERSION, title: LEGAL_DOCS[kind].title, body: LEGAL_DOCS[kind].body.join("\n\n") }).onConflictDoNothing();
    const [d] = await db.select({ id: legalDocuments.id }).from(legalDocuments).where(and(eq(legalDocuments.kind, kind), eq(legalDocuments.version, LEGAL_VERSION)));
    ids[kind] = d.id;
  }
  return ids;
}

/* ───────── onboarding schema ───────── */
const str = (n = 200) => z.string().trim().max(n).optional().or(z.literal(""));
export const onboardingSchema = z.object({
  needs: z.array(z.string().max(40)).max(20).default([]),
  problems: z.array(z.string().max(40)).max(20).default([]),
  solutions: z.array(z.string().max(40)).max(20).default([]),
  templateKey: z.string().max(40),
  businessModel: str(60),
  name: z.string().trim().min(2, "Nama bisnis minimal 2 karakter").max(120),
  legalName: str(), tradeName: str(), slogan: str(), description: str(1000),
  industry: str(), productsServices: str(500), scale: str(40), employeeEstimate: str(20), branchCount: str(10),
  salesChannels: z.array(z.string().max(40)).max(10).default([]), operatingHours: str(100),
  ownerName: z.string().trim().min(2, "Nama pemilik/manajer wajib diisi").max(120),
  ownerPosition: str(80), deviceName: z.string().trim().min(1, "Nama perangkat wajib diisi").max(60),
  country: str(80), province: str(80), city: str(80), address: str(300),
  timezone: z.string().max(60).refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Zona waktu tidak valid"),
  language: z.enum(["id", "en"]), dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
  currency: z.enum(["IDR", "USD", "EUR", "SGD", "MYR", "JPY"]),
  cashAccounts: z.array(z.object({
    name: z.string().trim().min(1).max(60), kind: z.enum(["cash", "bank", "ewallet"]),
    openingBalance: z.string().trim().regex(/^\d{1,15}(\.\d{1,2})?$/, "Saldo awal tidak valid").optional().or(z.literal("")),
  })).min(1, "Minimal satu akun kas/bank").max(10),
  incomeCategories: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  expenseCategories: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
  fiscalStartMonth: z.coerce.number().int().min(1).max(12).default(1),
  mainBranchName: z.string().trim().min(1, "Nama cabang utama wajib diisi").max(80),
  extraBranches: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  modules: z.array(z.string().max(40)).max(30).default([]),
  mode: z.enum(["simple", "advanced"]),
  acceptTerms: z.literal(true, { error: "Setujui Syarat & Ketentuan" }),
  acceptPrivacy: z.literal(true, { error: "Setujui Kebijakan Privasi" }),
});

async function nextCoaCode(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], workspaceId: string, prefix: string, width = 4) {
  const res = await tx.execute(sql`select max(code) as m from coa_accounts where workspace_id = ${workspaceId} and code like ${prefix + "%"} and length(code) = ${width}`);
  const m = (res.rows[0] as { m: string | null }).m;
  return m ? String(Number(m) + 1) : prefix + "01".padStart(width - prefix.length, "0");
}

export const deviceRoutes: Route[] = [
  /* ── status (tanpa sesi tab; hanya info non-sensitif untuk layar PIN) ── */
  r("GET", "/device/status", { auth: "none" }, async ({ req }) => {
    const device = await findDevice(req);
    if (!device) return { known: false };
    const grant = await findGrant(device.id);
    let business: { name: string } | null = null;
    if (grant) {
      const [b] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, grant.businessId));
      business = b ?? null;
    }
    return {
      known: true, hasGrant: !!grant, pinSet: !!device.pinHash, pinLength: device.pinLength ?? 6,
      deviceName: device.name, operatorName: device.operatorName, business, role: grant?.role ?? null,
      lockedUntil: device.lockedUntil && device.lockedUntil > new Date() ? device.lockedUntil : null,
    };
  }),

  r("POST", "/device/unlock", { auth: "device" }, async ({ json, device, ctx }) => {
    if (!ctx || !device) throw new HttpError(403, "Perangkat belum memiliki akses ke bisnis.", "no_grant");
    const { pin } = await json(z.object({ pin: z.string().max(10) }));
    if (device.lockedUntil && device.lockedUntil > new Date()) {
      throw new HttpError(429, `Terlalu banyak percobaan. Coba lagi ${Math.ceil((+device.lockedUntil - Date.now()) / 1000)} detik lagi.`, "pin_locked");
    }
    if (!device.pinHash || !(await verifyPin(device.pinHash, pin))) {
      const fails = device.failedAttempts + 1;
      const lockMs = fails >= 5 ? Math.min(30_000 * 2 ** Math.min(fails - 5, 7), 3_600_000) : 0;
      await db.update(devices).set({ failedAttempts: fails, lockedUntil: lockMs ? new Date(Date.now() + lockMs) : null }).where(eq(devices.id, device.id));
      await audit(db, ctx, "pin.failed", "device", device.id, { fails });
      throw new HttpError(401, lockMs ? "PIN salah. Perangkat dikunci sementara." : "PIN salah.", "pin_invalid");
    }
    await db.update(devices).set({ failedAttempts: 0, lockedUntil: null, lastActiveAt: new Date() }).where(eq(devices.id, device.id));
    const tab = await issueTab(device.id);
    await audit(db, ctx, "unlock", "device", device.id);
    return NextResponse.json({ tab, role: ctx.role });
  }),

  r("POST", "/device/lock", { auth: "none" }, async ({ req }) => {
    await revokeTab(req);
    return NextResponse.json({ ok: true });
  }),

  r("POST", "/device/heartbeat", { auth: "tab" }, async () => NextResponse.json({ ok: true })),

  /* Ubah PIN: sesuai spesifikasi tidak memerlukan PIN lama; langsung membuka dashboard. */
  r("POST", "/device/change-pin", { auth: "device" }, async ({ json, device, ctx }) => {
    if (!ctx || !device) throw new HttpError(403, "Perangkat belum memiliki akses ke bisnis.", "no_grant");
    const { pin, confirm } = await json(pinPair);
    checkPins(pin, confirm);
    await db.update(devices).set({ pinHash: await hashPin(pin), pinLength: pin.length, failedAttempts: 0, lockedUntil: null }).where(eq(devices.id, device.id));
    await lockDevice(device.id); // semua sesi tab lama dicabut
    const tab = await issueTab(device.id);
    await audit(db, ctx, "pin.changed", "device", device.id);
    return NextResponse.json({ tab, role: ctx.role });
  }),

  r("GET", "/device/me", {}, async ({ ctx }) => ({
    deviceId: ctx.deviceId, deviceName: ctx.deviceName, operatorName: ctx.operator, role: ctx.role,
  })),

  r("PATCH", "/device/me", {}, async ({ ctx, json }) => {
    const b = await json(z.object({ deviceName: z.string().trim().min(1).max(60).optional(), operatorName: z.string().trim().max(80).nullable().optional() }));
    await db.update(devices).set({ ...(b.deviceName ? { name: b.deviceName } : {}), ...(b.operatorName !== undefined ? { operatorName: b.operatorName || null } : {}) }).where(eq(devices.id, ctx.deviceId));
    return { ok: true };
  }),

  r("GET", "/devices", { perm: "devices:read" }, async ({ ctx }) => {
    const rows = await db
      .select({ id: devices.id, name: devices.name, operatorName: devices.operatorName, status: devices.status, lastActiveAt: devices.lastActiveAt, createdAt: devices.createdAt, role: deviceGrants.role, grantStatus: deviceGrants.status })
      .from(deviceGrants).innerJoin(devices, eq(devices.id, deviceGrants.deviceId))
      .where(eq(deviceGrants.workspaceId, ctx.workspaceId)).orderBy(desc(deviceGrants.createdAt));
    return { items: rows, self: ctx.deviceId };
  }),

  r("POST", "/devices/pairing", { perm: "devices:manage" }, async ({ ctx, json }) => {
    const { role } = await json(z.object({ role: z.enum(ROLES).refine((x) => x !== "owner", "Peran owner tidak dapat dibagikan lewat pairing") }));
    const code = pairingCode();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await db.insert(pairingCodes).values({ codeHash: sha256(code), workspaceId: ctx.workspaceId, businessId: ctx.businessId, role, createdByDeviceId: ctx.deviceId, expiresAt });
    await audit(db, ctx, "pairing.create", "device", null, { role });
    return { code, expiresAt };
  }),

  r("POST", "/device/pair", { auth: "none" }, async ({ req, json }) => {
    rateLimit(`pair:${clientIp(req)}`, 8, 10 * 60_000);
    const b = await json(z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{8}$/, "Kode pairing tidak valid"), pin: z.string().max(10), confirm: z.string().max(10), deviceName: z.string().trim().min(1).max(60).default("Perangkat baru") }));
    checkPins(b.pin, b.confirm);
    const pinHash = await hashPin(b.pin);
    const out = await db.transaction(async (tx) => {
      const [pc] = await tx.update(pairingCodes).set({ usedAt: new Date() })
        .where(and(eq(pairingCodes.codeHash, sha256(b.code)), isNull(pairingCodes.usedAt), sql`${pairingCodes.expiresAt} > now()`)).returning();
      if (!pc) throw new HttpError(422, "Kode pairing tidak valid atau sudah kedaluwarsa.", "bad_code");
      const { device, token } = await (async () => {
        const t = (await import("@/lib/crypto")).randomToken(32);
        const [d] = await tx.insert(devices).values({ tokenHash: sha256(t), name: b.deviceName, pinHash, pinLength: b.pin.length }).returning();
        return { device: d, token: t };
      })();
      await tx.update(pairingCodes).set({ usedByDeviceId: device.id }).where(eq(pairingCodes.id, pc.id));
      await tx.insert(deviceGrants).values({ deviceId: device.id, workspaceId: pc.workspaceId, businessId: pc.businessId, role: pc.role });
      await audit(tx, { workspaceId: pc.workspaceId, deviceId: device.id, operator: null }, "pairing.redeem", "device", device.id, { role: pc.role });
      return { token };
    });
    return setDeviceCookie(NextResponse.json({ ok: true }, { status: 201 }), req, out.token);
  }),

  r("POST", "/devices/:id/revoke", { perm: "devices:manage" }, async ({ ctx, params }) => {
    if (!z.string().uuid().safeParse(params.id).success) throw new HttpError(404, "Tidak ditemukan", "not_found");
    await db.transaction(async (tx) => {
      const [g] = await tx.select().from(deviceGrants).where(and(eq(deviceGrants.deviceId, params.id), eq(deviceGrants.workspaceId, ctx.workspaceId))).for("update");
      if (!g) throw new HttpError(404, "Perangkat tidak ditemukan", "not_found");
      if (g.role === "owner") {
        const owners = await tx.select({ id: deviceGrants.id }).from(deviceGrants).where(and(eq(deviceGrants.workspaceId, ctx.workspaceId), eq(deviceGrants.role, "owner"), eq(deviceGrants.status, "active")));
        if (owners.length <= 1) throw new HttpError(409, "Tidak dapat mencabut satu-satunya Owner Device.", "last_owner");
      }
      await tx.update(deviceGrants).set({ status: "revoked" }).where(eq(deviceGrants.id, g.id));
      await tx.update(tabSessions).set({ revokedAt: new Date() }).where(and(eq(tabSessions.deviceId, params.id), isNull(tabSessions.revokedAt)));
      const others = await tx.select({ id: deviceGrants.id }).from(deviceGrants).where(and(eq(deviceGrants.deviceId, params.id), eq(deviceGrants.status, "active")));
      if (!others.length) await tx.update(devices).set({ status: "revoked" }).where(eq(devices.id, params.id));
      await audit(tx, ctx, "device.revoke", "device", params.id);
    });
    return { ok: true };
  }),

  r("PATCH", "/devices/:id", { perm: "devices:manage" }, async ({ ctx, params, json }) => {
    const { role } = await json(z.object({ role: z.enum(ROLES) }));
    await db.transaction(async (tx) => {
      const [g] = await tx.select().from(deviceGrants).where(and(eq(deviceGrants.deviceId, params.id), eq(deviceGrants.workspaceId, ctx.workspaceId), eq(deviceGrants.status, "active"))).for("update");
      if (!g) throw new HttpError(404, "Perangkat tidak ditemukan", "not_found");
      if (g.role === "owner" && role !== "owner") {
        const owners = await tx.select({ id: deviceGrants.id }).from(deviceGrants).where(and(eq(deviceGrants.workspaceId, ctx.workspaceId), eq(deviceGrants.role, "owner"), eq(deviceGrants.status, "active")));
        if (owners.length <= 1) throw new HttpError(409, "Harus ada minimal satu Owner Device.", "last_owner");
      }
      await tx.update(deviceGrants).set({ role }).where(eq(deviceGrants.id, g.id));
      await audit(tx, ctx, "device.role", "device", params.id, { role });
    });
    return { ok: true };
  }),

  /* ───────── onboarding ───────── */
  r("GET", "/onboarding/draft", { auth: "none" }, async ({ req }) => {
    const device = await findDevice(req);
    if (!device) return { draft: null, step: 0, pinSet: false };
    if (await findGrant(device.id)) return { completed: true };
    const [d] = await db.select().from(onboardingDrafts).where(eq(onboardingDrafts.deviceId, device.id));
    return { draft: d?.data ?? null, step: d?.step ?? 0, pinSet: !!device.pinHash };
  }),

  r("POST", "/onboarding/draft", { auth: "none" }, async ({ req, json }) => {
    const b = await json(z.object({ step: z.number().int().min(0).max(30), data: z.record(z.string(), z.unknown()) }));
    delete b.data.pin; delete b.data.confirm;
    const { device, token } = await ensureDevice(req);
    if (await findGrant(device.id)) throw new HttpError(409, "Bisnis sudah dibuat pada perangkat ini.", "already_done");
    await db.insert(onboardingDrafts).values({ deviceId: device.id, step: b.step, data: b.data })
      .onConflictDoUpdate({ target: onboardingDrafts.deviceId, set: { step: b.step, data: b.data, updatedAt: new Date() } });
    return withCookie(NextResponse.json({ ok: true }), req, token);
  }),

  r("POST", "/onboarding/pin", { auth: "none" }, async ({ req, json }) => {
    rateLimit(`obpin:${clientIp(req)}`, 20, 10 * 60_000);
    const { pin, confirm } = await json(pinPair);
    checkPins(pin, confirm);
    const { device, token } = await ensureDevice(req);
    if (await findGrant(device.id)) throw new HttpError(409, "Bisnis sudah dibuat pada perangkat ini.", "already_done");
    await db.update(devices).set({ pinHash: await hashPin(pin), pinLength: pin.length }).where(eq(devices.id, device.id));
    return withCookie(NextResponse.json({ ok: true }), req, token);
  }),

  r("POST", "/onboarding/complete", { auth: "none" }, async ({ req, json }) => {
    const device = await findDevice(req);
    if (!device) throw new HttpError(401, "Mulai onboarding terlebih dahulu.", "device_unknown");
    const existing = await findGrant(device.id);
    if (existing) return { ok: true, alreadyDone: true };
    if (!device.pinHash) throw new HttpError(422, "PIN belum dibuat.", "pin_missing");
    const d = await json(onboardingSchema);
    for (const c of d.cashAccounts) if (c.openingBalance) assertCurrencyPrecision(c.openingBalance, d.currency);
    const legalIds = await ensureLegal();
    const tz = d.timezone;

    await db.transaction(async (tx) => {
      const [w] = await tx.insert(workspaces).values({ name: d.name }).returning();
      const [b] = await tx.insert(businesses).values({
        workspaceId: w.id, name: d.name, legalName: d.legalName || null, tradeName: d.tradeName || null, slogan: d.slogan || null,
        description: d.description || null, templateKey: d.templateKey, businessModel: d.businessModel || null, industry: d.industry || null,
        currency: d.currency, timezone: tz, language: d.language, dateFormat: d.dateFormat, country: d.country || null,
        province: d.province || null, city: d.city || null, address: d.address || null,
        settings: {
          needs: d.needs, problems: d.problems, solutions: d.solutions, modules: d.modules, mode: d.mode,
          productsServices: d.productsServices, scale: d.scale, employeeEstimate: d.employeeEstimate, branchCount: d.branchCount,
          salesChannels: d.salesChannels, operatingHours: d.operatingHours, ownerName: d.ownerName, ownerPosition: d.ownerPosition,
          fiscalStartMonth: d.fiscalStartMonth, taxRate: "0", approvalThreshold: "0",
        },
      }).returning();
      const [mainBranch] = await tx.insert(branches).values({ workspaceId: w.id, businessId: b.id, name: d.mainBranchName, code: "PUSAT", isMain: true }).returning();
      if (d.extraBranches.length) await tx.insert(branches).values(d.extraBranches.map((n, i) => ({ workspaceId: w.id, businessId: b.id, name: n, code: `CAB${i + 1}` })));
      await tx.insert(warehouses).values({ workspaceId: w.id, businessId: b.id, branchId: mainBranch.id, name: `Gudang ${d.mainBranchName}`, isDefault: true });

      // Chart of Accounts
      const coa = await tx.insert(coaAccounts).values(DEFAULT_COA.map((a) => ({ ...a, workspaceId: w.id, businessId: b.id }))).returning();
      const byName = new Map(coa.map((a) => [a.name.toLowerCase(), a]));
      const equityOpening = coa.find((a) => a.subtype === "opening")!;
      const ctx: Ctx = { deviceId: device.id, deviceName: d.deviceName, operator: d.ownerName, workspaceId: w.id, businessId: b.id, branchId: mainBranch.id, role: "owner" };

      // Akun Kas & Bank, masing-masing tertaut ke satu akun COA
      const today = todayIn(tz);
      let idx = 0;
      for (const ca of d.cashAccounts) {
        idx++;
        const [coaAcc] = await tx.insert(coaAccounts).values({ workspaceId: w.id, businessId: b.id, code: String(1100 + idx), name: ca.name, type: "asset", subtype: ca.kind === "bank" ? "bank" : "cash" }).returning();
        const [acc] = await tx.insert(cashAccounts).values({ workspaceId: w.id, businessId: b.id, name: ca.name, kind: ca.kind, coaAccountId: coaAcc.id }).returning();
        if (ca.openingBalance && toCents(ca.openingBalance) > 0n) {
          await postJournal(tx, ctx, {
            date: today, memo: `Saldo awal ${ca.name}`, source: "opening", sourceId: acc.id,
            lines: [{ accountId: coaAcc.id, debit: ca.openingBalance }, { accountId: equityOpening.id, credit: ca.openingBalance }],
          });
        }
      }

      // Kategori
      const mkCats = async (kind: "income" | "expense", names: string[], type: "revenue" | "expense", prefix: string) => {
        for (const n of [...new Set(names)]) {
          let acc = byName.get(n.toLowerCase());
          if (!acc || acc.type !== type) {
            const code = await nextCoaCode(tx, w.id, prefix);
            [acc] = await tx.insert(coaAccounts).values({ workspaceId: w.id, businessId: b.id, code, name: n, type }).returning();
            byName.set(n.toLowerCase(), acc);
          }
          await tx.insert(financeCategories).values({ workspaceId: w.id, businessId: b.id, kind, name: n, coaAccountId: acc.id });
        }
      };
      await mkCats("income", d.incomeCategories, "revenue", "41");
      await mkCats("expense", d.expenseCategories, "expense", "61");

      // Periode akuntansi
      const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
      const startYear = d.fiscalStartMonth > month ? year - 1 : year;
      const start = `${startYear}-${String(d.fiscalStartMonth).padStart(2, "0")}-01`;
      const endD = new Date(Date.UTC(startYear + 1, d.fiscalStartMonth - 1, 0));
      await tx.insert(accountingPeriods).values({ workspaceId: w.id, businessId: b.id, startDate: start, endDate: endD.toISOString().slice(0, 10) });

      await tx.insert(deviceGrants).values({ deviceId: device.id, workspaceId: w.id, businessId: b.id, role: "owner" });
      await tx.update(devices).set({ name: d.deviceName, operatorName: d.ownerName }).where(eq(devices.id, device.id));
      await tx.insert(legalAcceptances).values([
        { workspaceId: w.id, deviceId: device.id, documentId: legalIds.terms, kind: "terms", version: LEGAL_VERSION },
        { workspaceId: w.id, deviceId: device.id, documentId: legalIds.privacy, kind: "privacy", version: LEGAL_VERSION },
      ]);
      await tx.update(onboardingDrafts).set({ completedAt: new Date(), data: {} }).where(eq(onboardingDrafts.deviceId, device.id));
      await audit(tx, ctx, "workspace.create", "workspace", w.id, { template: d.templateKey });
    });
    return { ok: true };
  }),
];

export type { Device };

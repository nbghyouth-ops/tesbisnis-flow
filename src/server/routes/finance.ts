import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accountingPeriods, budgets, cashAccounts, coaAccounts, financeCategories, financeTransactions, notifications } from "@/db/schema";
import { assertCurrencyPrecision, toCents } from "@/lib/money";
import { audit, getBusiness, HttpError, idempotent, nextNumber, r, todayIn, type Ctx, type Route, type Tx } from "../core";
import { postJournal, reverseJournal } from "../accounting";

/** State machine transaksi keuangan (Bab 8.7). */
export const TX_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_approval", "posted"],
  pending_approval: ["approved", "rejected"],
  approved: ["posted"],
  posted: ["reversed"],
  rejected: [],
  reversed: [],
};
export const canTransition = (from: string, to: string) => TX_TRANSITIONS[from]?.includes(to) ?? false;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid");
const amount = z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string().regex(/^\d{1,15}(\.\d{1,2})?$/, "Nominal tidak valid").refine((v) => toCents(v) > 0n, "Nominal harus lebih dari nol"));

const quickTx = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount,
  categoryId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid(),
  toAccountId: z.string().uuid().optional().nullable(),
  date: date.optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  reference: z.string().trim().max(100).optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  supplierName: z.string().trim().max(120).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
});

async function transit(tx: Tx, ctx: Ctx, id: string, from: string, to: string) {
  if (!canTransition(from, to)) throw new HttpError(409, `Transisi status ${from} → ${to} tidak diizinkan.`, "bad_transition");
  await tx.update(financeTransactions).set({ state: to }).where(eq(financeTransactions.id, id));
  await audit(tx, ctx, `transaction.${to}`, "finance_transaction", id, { from });
}

type TxRow = typeof financeTransactions.$inferSelect;
async function postTx(tx: Tx, ctx: Ctx, t: TxRow) {
  const [acc] = await tx.select().from(cashAccounts).where(and(eq(cashAccounts.id, t.accountId), eq(cashAccounts.workspaceId, ctx.workspaceId)));
  if (!acc) throw new HttpError(422, "Akun kas/bank tidak ditemukan.", "bad_account");
  let debit: string, credit: string;
  if (t.type === "transfer") {
    const [to] = await tx.select().from(cashAccounts).where(and(eq(cashAccounts.id, t.toAccountId!), eq(cashAccounts.workspaceId, ctx.workspaceId)));
    if (!to) throw new HttpError(422, "Akun tujuan tidak ditemukan.", "bad_account");
    debit = to.coaAccountId; credit = acc.coaAccountId;
  } else {
    const [cat] = await tx.select().from(financeCategories).where(and(eq(financeCategories.id, t.categoryId!), eq(financeCategories.workspaceId, ctx.workspaceId)));
    if (!cat) throw new HttpError(422, "Kategori tidak ditemukan.", "bad_category");
    if (t.type === "income") { debit = acc.coaAccountId; credit = cat.coaAccountId; }
    else { debit = cat.coaAccountId; credit = acc.coaAccountId; }
  }
  const jid = await postJournal(tx, ctx, {
    date: t.txDate, memo: `${t.number}${t.note ? " — " + t.note : ""}`, source: t.type, sourceId: t.id,
    lines: [{ accountId: debit, debit: t.amount }, { accountId: credit, credit: t.amount }],
  });
  await tx.update(financeTransactions).set({ journalId: jid }).where(eq(financeTransactions.id, t.id));
  await transit(tx, ctx, t.id, t.state === "approved" ? "approved" : "draft", "posted");
  return jid;
}

async function lockTx(tx: Tx, ctx: Ctx, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Transaksi tidak ditemukan", "not_found");
  const [t] = await tx.select().from(financeTransactions).where(and(eq(financeTransactions.id, id), eq(financeTransactions.workspaceId, ctx.workspaceId))).for("update");
  if (!t) throw new HttpError(404, "Transaksi tidak ditemukan", "not_found");
  return t;
}

export const financeRoutes: Route[] = [
  r("GET", "/finance/cash-accounts", { perm: "finance:read" }, async ({ ctx }) => {
    const res = await db.execute(sql`
      select a.id, a.name, a.kind, a.is_active as "isActive", a.coa_account_id as "coaAccountId",
        coalesce((select sum(l.debit - l.credit) from journal_lines l where l.account_id = a.coa_account_id and l.workspace_id = a.workspace_id),0)::text as balance
      from cash_accounts a where a.workspace_id = ${ctx.workspaceId} order by a.created_at`);
    return { items: res.rows };
  }),

  r("POST", "/finance/cash-accounts", { perm: "finance:write" }, async ({ ctx, json }) => {
    const b = await json(z.object({ name: z.string().trim().min(1).max(60), kind: z.enum(["cash", "bank", "ewallet"]), openingBalance: z.string().regex(/^\d{1,15}(\.\d{1,2})?$/).optional().or(z.literal("")) }));
    const biz = await getBusiness(db, ctx);
    if (b.openingBalance) assertCurrencyPrecision(b.openingBalance, biz.currency);
    return db.transaction(async (tx) => {
      const res = await tx.execute(sql`select max(code) as m from coa_accounts where workspace_id = ${ctx.workspaceId} and code like '11__'`);
      const m = (res.rows[0] as { m: string | null }).m;
      const code = m ? String(Number(m) + 1) : "1101";
      const [coa] = await tx.insert(coaAccounts).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, code, name: b.name, type: "asset", subtype: b.kind === "bank" ? "bank" : "cash" }).returning();
      const [acc] = await tx.insert(cashAccounts).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, name: b.name, kind: b.kind, coaAccountId: coa.id }).returning();
      if (b.openingBalance && toCents(b.openingBalance) > 0n) {
        const [eq3] = await tx.select().from(coaAccounts).where(and(eq(coaAccounts.workspaceId, ctx.workspaceId), eq(coaAccounts.subtype, "opening")));
        await postJournal(tx, ctx, { date: todayIn(biz.timezone), memo: `Saldo awal ${b.name}`, source: "opening", sourceId: acc.id, lines: [{ accountId: coa.id, debit: b.openingBalance }, { accountId: eq3.id, credit: b.openingBalance }] });
      }
      await audit(tx, ctx, "create", "cash_account", acc.id);
      return { item: acc };
    });
  }),

  r("GET", "/finance/categories", { perm: "finance:read" }, async ({ ctx }) => {
    const res = await db.execute(sql`select c.id, c.kind, c.name, c.is_active as "isActive", a.code, a.name as "accountName" from finance_categories c join coa_accounts a on a.id = c.coa_account_id where c.workspace_id = ${ctx.workspaceId} order by c.kind, c.name`);
    return { items: res.rows };
  }),

  r("POST", "/finance/categories", { perm: "finance:write" }, async ({ ctx, json }) => {
    const b = await json(z.object({ kind: z.enum(["income", "expense"]), name: z.string().trim().min(1).max(60) }));
    return db.transaction(async (tx) => {
      const prefix = b.kind === "income" ? "41" : "61";
      const res = await tx.execute(sql`select max(code) as m from coa_accounts where workspace_id = ${ctx.workspaceId} and code like ${prefix + "__"}`);
      const m = (res.rows[0] as { m: string | null }).m;
      const [coa] = await tx.insert(coaAccounts).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, code: m ? String(Number(m) + 1) : prefix + "01", name: b.name, type: b.kind === "income" ? "revenue" : "expense" }).returning();
      const [cat] = await tx.insert(financeCategories).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, kind: b.kind, name: b.name, coaAccountId: coa.id }).returning();
      await audit(tx, ctx, "create", "finance_category", cat.id);
      return { item: cat };
    });
  }),

  // Kategori tidak dihapus; hanya dinonaktifkan agar riwayat tetap utuh.
  r("PATCH", "/finance/categories/:id", { perm: "finance:write" }, async ({ ctx, params, json }) => {
    const b = await json(z.object({ isActive: z.boolean() }));
    const [u] = await db.update(financeCategories).set({ isActive: b.isActive }).where(and(eq(financeCategories.id, params.id), eq(financeCategories.workspaceId, ctx.workspaceId))).returning({ id: financeCategories.id });
    if (!u) throw new HttpError(404, "Kategori tidak ditemukan", "not_found");
    return { ok: true };
  }),

  r("GET", "/finance/coa", { perm: "finance:read" }, async ({ ctx }) => {
    const res = await db.execute(sql`select id, code, name, type, subtype, is_active as "isActive" from coa_accounts where workspace_id = ${ctx.workspaceId} order by code`);
    return { items: res.rows };
  }),

  r("GET", "/finance/transactions", { perm: "finance:read" }, async ({ ctx, query }) => {
    const state = query.get("state") || null, type = query.get("type") || null;
    const from = query.get("from") || null, to = query.get("to") || null, acc = query.get("accountId") || null;
    for (const v of [from, to]) if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(422, "Rentang tanggal tidak valid");
    if (acc && !z.string().uuid().safeParse(acc).success) throw new HttpError(422, "Akun tidak valid");
    const limit = Math.min(Number(query.get("limit") ?? 100) || 100, 300);
    const res = await db.execute(sql`
      select t.id, t.number, t.type, t.state, t.amount::text as amount, t.tx_date::text as "txDate", t.tx_time as "txTime", t.note, t.reference,
        t.supplier_name as "supplierName", t.requires_approval as "requiresApproval", t.operator, t.journal_id as "journalId", t.created_at as "createdAt",
        c.name as "categoryName", a.name as "accountName", ta.name as "toAccountName"
      from finance_transactions t
      left join finance_categories c on c.id = t.category_id
      join cash_accounts a on a.id = t.account_id
      left join cash_accounts ta on ta.id = t.to_account_id
      where t.workspace_id = ${ctx.workspaceId}
        and (${state}::text is null or t.state = ${state}) and (${type}::text is null or t.type = ${type})
        and (${from}::date is null or t.tx_date >= ${from}::date) and (${to}::date is null or t.tx_date <= ${to}::date)
        and (${acc}::uuid is null or t.account_id = ${acc}::uuid or t.to_account_id = ${acc}::uuid)
      order by t.tx_date desc, t.created_at desc limit ${limit}`);
    return { items: res.rows };
  }),

  r("POST", "/finance/transactions", { perm: "finance:write" }, async ({ ctx, json, idemKey }) => {
    const b = await json(quickTx);
    const biz = await getBusiness(db, ctx);
    assertCurrencyPrecision(b.amount, biz.currency);
    if (b.type === "transfer") {
      if (!b.toAccountId) throw new HttpError(422, "Akun tujuan wajib diisi.");
      if (b.toAccountId === b.accountId) throw new HttpError(422, "Akun asal dan tujuan tidak boleh sama.");
    } else if (!b.categoryId) throw new HttpError(422, "Kategori wajib dipilih.");
    const txDate = b.date ?? todayIn(biz.timezone);
    return db.transaction((tx) => idempotent(tx, ctx, idemKey, async () => {
      const accs = await tx.select().from(cashAccounts).where(and(eq(cashAccounts.workspaceId, ctx.workspaceId), eq(cashAccounts.isActive, true)));
      if (!accs.some((a) => a.id === b.accountId) || (b.toAccountId && !accs.some((a) => a.id === b.toAccountId))) throw new HttpError(422, "Akun kas/bank tidak valid atau nonaktif.", "bad_account");
      if (b.categoryId) {
        const [c] = await tx.select().from(financeCategories).where(and(eq(financeCategories.id, b.categoryId), eq(financeCategories.workspaceId, ctx.workspaceId), eq(financeCategories.kind, b.type), eq(financeCategories.isActive, true)));
        if (!c) throw new HttpError(422, "Kategori tidak sesuai jenis transaksi atau sudah nonaktif.", "bad_category");
      }
      const threshold = String((biz.settings as { approvalThreshold?: string }).approvalThreshold ?? "0");
      const requiresApproval = b.type === "expense" && /^\d+(\.\d+)?$/.test(threshold) && toCents(threshold.split(".")[0]) > 0n && toCents(b.amount) >= toCents(threshold.split(".")[0]);
      const number = await nextNumber(tx, ctx.workspaceId, "fintx", "TRX");
      const [row] = await tx.insert(financeTransactions).values({
        workspaceId: ctx.workspaceId, businessId: ctx.businessId, branchId: ctx.branchId, number, type: b.type, state: "draft", amount: b.amount,
        categoryId: b.type === "transfer" ? null : b.categoryId, accountId: b.accountId, toAccountId: b.type === "transfer" ? b.toAccountId : null,
        txDate, txTime: b.time ?? null, note: b.note ?? null, reference: b.reference ?? null, clientId: b.clientId ?? null,
        supplierName: b.supplierName ?? null, projectId: b.projectId ?? null, requiresApproval, deviceId: ctx.deviceId, operator: ctx.operator,
      }).returning();
      await audit(tx, ctx, "transaction.draft", "finance_transaction", row.id, { type: b.type });
      if (requiresApproval) {
        await transit(tx, ctx, row.id, "draft", "pending_approval");
        await tx.insert(notifications).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, kind: "pending_approval", title: `Pengeluaran ${number} menunggu persetujuan`, body: `Nominal ${b.amount}` });
      }
      else await postTx(tx, ctx, row);
      return { id: row.id, number, state: requiresApproval ? "pending_approval" : "posted" };
    }));
  }),

  r("POST", "/finance/transactions/:id/approve", { perm: "finance:approve" }, async ({ ctx, params }) => {
    await db.transaction(async (tx) => {
      const t = await lockTx(tx, ctx, params.id);
      await transit(tx, ctx, t.id, t.state, "approved");
      await postTx(tx, ctx, { ...t, state: "approved" });
    });
    return { ok: true };
  }),

  r("POST", "/finance/transactions/:id/reject", { perm: "finance:approve" }, async ({ ctx, params }) => {
    await db.transaction(async (tx) => {
      const t = await lockTx(tx, ctx, params.id);
      await transit(tx, ctx, t.id, t.state, "rejected");
    });
    return { ok: true };
  }),

  r("POST", "/finance/transactions/:id/reverse", { perm: "finance:approve" }, async ({ ctx, params, json }) => {
    const b = await json(z.object({ reason: z.string().trim().min(3, "Alasan pembalikan wajib diisi").max(300) }));
    const biz = await getBusiness(db, ctx);
    await db.transaction(async (tx) => {
      const t = await lockTx(tx, ctx, params.id);
      if (!canTransition(t.state, "reversed") || !t.journalId) throw new HttpError(409, "Hanya transaksi posted yang dapat dibalik.", "bad_transition");
      await reverseJournal(tx, ctx, t.journalId, todayIn(biz.timezone), b.reason);
      await transit(tx, ctx, t.id, t.state, "reversed");
    });
    return { ok: true };
  }),

  r("GET", "/finance/journal", { perm: "finance:read" }, async ({ ctx, query }) => {
    const limit = Math.min(Number(query.get("limit") ?? 50) || 50, 200);
    const res = await db.execute(sql`
      select e.id, e.number, e.entry_date::text as "entryDate", e.memo, e.source, e.status, e.operator,
        (select json_agg(json_build_object('code', a.code, 'name', a.name, 'debit', l.debit::text, 'credit', l.credit::text) order by l.debit desc, a.code)
           from journal_lines l join coa_accounts a on a.id = l.account_id where l.entry_id = e.id) as lines
      from journal_entries e where e.workspace_id = ${ctx.workspaceId} order by e.created_at desc limit ${limit}`);
    return { items: res.rows };
  }),

  r("GET", "/finance/receivables", { perm: "finance:read" }, async ({ ctx }) => {
    const res = await db.execute(sql`
      select i.id, i.number, i.total::text as total, i.paid::text as paid, (i.total - i.paid)::text as outstanding, i.due_date::text as "dueDate", i.status, c.name as "clientName"
      from invoices i left join clients c on c.id = i.client_id
      where i.workspace_id = ${ctx.workspaceId} and i.status in ('unpaid','partial') order by i.issued_at limit 200`);
    return { items: res.rows };
  }),

  r("GET", "/finance/payables", { perm: "finance:read" }, async ({ ctx }) => {
    const res = await db.execute(sql`
      select b.id, b.number, b.total::text as total, b.paid::text as paid, (b.total - b.paid)::text as outstanding, b.status, s.name as "supplierName"
      from supplier_bills b join suppliers s on s.id = b.supplier_id
      where b.workspace_id = ${ctx.workspaceId} and b.status in ('unpaid','partial') order by b.created_at limit 200`);
    return { items: res.rows };
  }),

  r("GET", "/finance/budgets", { perm: "finance:read" }, async ({ ctx, query }) => {
    const month = query.get("month") ?? "";
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(422, "Bulan tidak valid (YYYY-MM)");
    const res = await db.execute(sql`
      select c.id as "categoryId", c.name, coalesce(b.amount,0)::text as budget,
        coalesce((select sum(t.amount) from finance_transactions t where t.category_id = c.id and t.state = 'posted' and to_char(t.tx_date,'YYYY-MM') = ${month}),0)::text as actual
      from finance_categories c left join budgets b on b.category_id = c.id and b.month = ${month}
      where c.workspace_id = ${ctx.workspaceId} and c.kind = 'expense' and c.is_active order by c.name`);
    return { items: res.rows };
  }),

  r("POST", "/finance/budgets", { perm: "finance:write" }, async ({ ctx, json }) => {
    const b = await json(z.object({ categoryId: z.string().uuid(), month: z.string().regex(/^\d{4}-\d{2}$/), amount: z.string().regex(/^\d{1,15}(\.\d{1,2})?$/) }));
    const [cat] = await db.select({ id: financeCategories.id }).from(financeCategories).where(and(eq(financeCategories.id, b.categoryId), eq(financeCategories.workspaceId, ctx.workspaceId), eq(financeCategories.kind, "expense")));
    if (!cat) throw new HttpError(422, "Kategori beban tidak ditemukan");
    await db.insert(budgets).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, ...b })
      .onConflictDoUpdate({ target: [budgets.workspaceId, budgets.categoryId, budgets.month], set: { amount: b.amount } });
    await audit(db, ctx, "budget.set", "budget", b.categoryId, { month: b.month });
    return { ok: true };
  }),

  r("GET", "/finance/periods", { perm: "finance:read" }, async ({ ctx }) => {
    const res = await db.execute(sql`select id, start_date::text as "startDate", end_date::text as "endDate", status from accounting_periods where workspace_id = ${ctx.workspaceId} order by start_date desc`);
    return { items: res.rows };
  }),

  // Period close = kunci periode: jurnal dengan tanggal di dalam rentang ditolak.
  r("POST", "/finance/periods/close", { perm: "finance:approve" }, async ({ ctx, json }) => {
    const b = await json(z.object({ startDate: date, endDate: date }));
    if (b.endDate < b.startDate) throw new HttpError(422, "Tanggal akhir sebelum tanggal awal.");
    const pend = await db.execute(sql`select count(*)::int as n from finance_transactions where workspace_id = ${ctx.workspaceId} and state in ('pending_approval','approved') and tx_date between ${b.startDate}::date and ${b.endDate}::date`);
    if ((pend.rows[0] as { n: number }).n > 0) throw new HttpError(409, "Masih ada transaksi menunggu persetujuan pada periode ini.", "pending_exists");
    const [p] = await db.insert(accountingPeriods).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, startDate: b.startDate, endDate: b.endDate, status: "closed", closedAt: new Date() }).returning();
    await audit(db, ctx, "period.close", "accounting_period", p.id, b);
    return { item: p };
  }),
];

void accountingPeriods;

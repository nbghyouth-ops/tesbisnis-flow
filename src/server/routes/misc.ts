import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  bookingResources, bookings, branches, businesses, cashAccounts, cashSessions, clientActivities, clientContacts, clients,
  financeTransactions, invoices, legalAcceptances, notifications, projects, warehouses,
} from "@/db/schema";
import { assertCurrencyPrecision, fromCents, toCents } from "@/lib/money";
import { can } from "@/lib/permissions";
import { templateByKey } from "@/lib/templates";
import { audit, getBusiness, HttpError, r, todayIn, type Route } from "../core";
import { accountTotals, normalBalance } from "../accounting";

const uuid = z.string().uuid();
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const rangeOf = (q: URLSearchParams, tz: string) => {
  const to = q.get("to") || todayIn(tz);
  const d = new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 29);
  const from = q.get("from") || d.toISOString().slice(0, 10);
  if (!dateRe.test(from) || !dateRe.test(to)) throw new HttpError(422, "Rentang tanggal tidak valid");
  if (from > to) throw new HttpError(422, "Tanggal awal setelah tanggal akhir");
  if (+new Date(to) - +new Date(from) > 400 * 86400_000) throw new HttpError(422, "Rentang maksimal 400 hari");
  return { from, to };
};

type Col = { key: string; label: string; align?: "right" };
type Report = { title: string; description: string; columns: Col[]; rows: Record<string, unknown>[] };

export const miscRoutes: Route[] = [
  /* ───────── dashboard ───────── */
  r("GET", "/dashboard", {}, async ({ ctx, query }) => {
    const biz = await getBusiness(db, ctx);
    const { from, to } = rangeOf(query, biz.timezone);
    const ws = ctx.workspaceId;
    const can_ = (p: Parameters<typeof can>[1]) => can(ctx.role, p);
    const out: Record<string, unknown> = { currency: biz.currency, from, to, business: biz.name };
    if (can_("finance:read")) {
      const bal = await db.execute(sql`select coalesce(sum(l.debit - l.credit),0)::text as v from journal_lines l join coa_accounts a on a.id = l.account_id where l.workspace_id = ${ws} and a.subtype in ('cash','bank')`);
      const pl = await db.execute(sql`
        select a.type, coalesce(sum(case when a.type='revenue' then l.credit - l.debit else l.debit - l.credit end),0)::text as v
        from journal_lines l join journal_entries e on e.id = l.entry_id join coa_accounts a on a.id = l.account_id
        where l.workspace_id = ${ws} and a.type in ('revenue','expense') and e.entry_date between ${from}::date and ${to}::date group by a.type`);
      const flow = await db.execute(sql`
        select coalesce(sum(l.debit - l.credit),0)::text as v from journal_lines l join journal_entries e on e.id = l.entry_id join coa_accounts a on a.id = l.account_id
        where l.workspace_id = ${ws} and a.subtype in ('cash','bank') and e.entry_date between ${from}::date and ${to}::date`);
      const series = await db.execute(sql`
        select e.entry_date::text as day,
          coalesce(sum(case when a.type='revenue' then l.credit - l.debit else 0 end),0)::text as income,
          coalesce(sum(case when a.type='expense' then l.debit - l.credit else 0 end),0)::text as expense
        from journal_lines l join journal_entries e on e.id = l.entry_id join coa_accounts a on a.id = l.account_id
        where l.workspace_id = ${ws} and a.type in ('revenue','expense') and e.entry_date between ${from}::date and ${to}::date
        group by e.entry_date order by e.entry_date`);
      const ar = await db.execute(sql`select coalesce(sum(total - paid),0)::text as v, count(*)::int as n from invoices where workspace_id = ${ws} and status in ('unpaid','partial')`);
      const ap = await db.execute(sql`select coalesce(sum(total - paid),0)::text as v, count(*)::int as n from supplier_bills where workspace_id = ${ws} and status in ('unpaid','partial')`);
      const pend = await db.execute(sql`select count(*)::int as n from finance_transactions where workspace_id = ${ws} and state = 'pending_approval'`);
      const month = todayIn(biz.timezone).slice(0, 7);
      const bud = await db.execute(sql`
        select coalesce(sum(b.amount),0)::text as budget,
          coalesce(sum((select coalesce(sum(t.amount),0) from finance_transactions t where t.category_id = b.category_id and t.state = 'posted' and to_char(t.tx_date,'YYYY-MM') = ${month})),0)::text as actual
        from budgets b where b.workspace_id = ${ws} and b.month = ${month}`);
      const plRows = pl.rows as { type: string; v: string }[];
      out.finance = {
        cashTotal: (bal.rows[0] as { v: string }).v,
        income: plRows.find((x) => x.type === "revenue")?.v ?? "0",
        expense: plRows.find((x) => x.type === "expense")?.v ?? "0",
        netCashflow: (flow.rows[0] as { v: string }).v,
        receivables: ar.rows[0], payables: ap.rows[0], pendingApprovals: (pend.rows[0] as { n: number }).n,
        budget: bud.rows[0], series: series.rows,
      };
    }
    if (can_("inventory:read")) {
      const low = await db.execute(sql`
        select p.id, p.name, coalesce(sum(m.quantity),0)::text as on_hand, p.reorder_level::text as reorder
        from products p left join stock_movements m on m.product_id = p.id
        where p.workspace_id = ${ws} and p.track_stock and p.kind = 'product' and p.is_active and p.reorder_level > 0
        group by p.id having coalesce(sum(m.quantity),0) <= p.reorder_level order by p.name limit 10`);
      out.lowStock = low.rows;
    }
    if (can_("sales:read")) {
      const s = await db.execute(sql`select count(*)::int as n, coalesce(sum(total),0)::text as v from invoices where workspace_id = ${ws} and status <> 'reversed' and (issued_at at time zone ${biz.timezone})::date between ${from}::date and ${to}::date`);
      out.sales = s.rows[0];
    }
    if (can_("tasks:read")) {
      const t = await db.execute(sql`select count(*)::int as open, count(*) filter (where due_date < ${todayIn(biz.timezone)}::date)::int as overdue from tasks where workspace_id = ${ws} and status <> 'done'`);
      out.tasks = t.rows[0];
    }
    if (can_("booking:read")) {
      const bk = await db.execute(sql`select count(*)::int as n from bookings where workspace_id = ${ws} and status = 'confirmed' and (starts_at at time zone ${biz.timezone})::date = ${todayIn(biz.timezone)}::date`);
      out.bookingsToday = (bk.rows[0] as { n: number }).n;
    }
    if (can_("audit:read")) {
      const act = await db.execute(sql`select a.action, a.resource, a.operator, a.created_at as "createdAt", d.name as "deviceName" from audit_events a left join devices d on d.id = a.device_id where a.workspace_id = ${ws} and a.action not like 'pin.%' and a.action <> 'unlock' order by a.created_at desc limit 8`);
      out.recent = act.rows;
    }
    return out;
  }),

  /* ───────── reports (semua angka bersumber dari jurnal/transaksi sah) ───────── */
  r("GET", "/reports/:name", { perm: "reports:read" }, async ({ ctx, params, query }): Promise<Report> => {
    const biz = await getBusiness(db, ctx);
    const { from, to } = rangeOf(query, biz.timezone);
    const ws = ctx.workspaceId;
    const num = { align: "right" as const };
    switch (params.name) {
      case "trial-balance": {
        const t = await accountTotals(db, ws, undefined, to);
        const rows = t.filter((a) => toCents(a.debit) + toCents(a.credit) > 0n).map((a) => {
          const net = toCents(a.debit) - toCents(a.credit);
          return { code: a.code, name: a.name, debit: net > 0n ? fromCents(net) : "0.00", credit: net < 0n ? fromCents(-net) : "0.00" };
        });
        const td = rows.reduce((s, x) => s + toCents(x.debit), 0n), tc = rows.reduce((s, x) => s + toCents(x.credit), 0n);
        rows.push({ code: "", name: `TOTAL ${td === tc ? "(seimbang)" : "(TIDAK SEIMBANG)"}`, debit: fromCents(td), credit: fromCents(tc) });
        return { title: "Neraca Saldo", description: `Per ${to}`, columns: [{ key: "code", label: "Kode" }, { key: "name", label: "Akun" }, { key: "debit", label: "Debit", ...num }, { key: "credit", label: "Kredit", ...num }], rows };
      }
      case "profit-loss": {
        const t = await accountTotals(db, ws, from, to);
        const rows: Record<string, unknown>[] = [];
        let rev = 0n, exp = 0n;
        for (const a of t) {
          if (a.type !== "revenue" && a.type !== "expense") continue;
          const v = toCents(normalBalance(a.type, a.debit, a.credit));
          if (v === 0n) continue;
          rows.push({ section: a.type === "revenue" ? "Pendapatan" : "Beban", code: a.code, name: a.name, amount: fromCents(v) });
          if (a.type === "revenue") rev += v; else exp += v;
        }
        rows.push({ section: "", code: "", name: "Total Pendapatan", amount: fromCents(rev) }, { section: "", code: "", name: "Total Beban", amount: fromCents(exp) }, { section: "", code: "", name: "LABA / (RUGI) BERSIH", amount: fromCents(rev - exp) });
        return { title: "Laba Rugi", description: `${from} s.d. ${to}`, columns: [{ key: "section", label: "Bagian" }, { key: "code", label: "Kode" }, { key: "name", label: "Akun" }, { key: "amount", label: "Jumlah", ...num }], rows };
      }
      case "balance-sheet": {
        const t = await accountTotals(db, ws, undefined, to);
        const rows: Record<string, unknown>[] = [];
        let A = 0n, L = 0n, E = 0n, earn = 0n;
        for (const a of t) {
          const v = toCents(normalBalance(a.type, a.debit, a.credit));
          if (a.type === "revenue") earn += v; else if (a.type === "expense") earn -= v;
          if (v === 0n || (a.type !== "asset" && a.type !== "liability" && a.type !== "equity")) continue;
          rows.push({ section: a.type === "asset" ? "Aset" : a.type === "liability" ? "Liabilitas" : "Ekuitas", code: a.code, name: a.name, amount: fromCents(v) });
          if (a.type === "asset") A += v; else if (a.type === "liability") L += v; else E += v;
        }
        rows.push({ section: "Ekuitas", code: "", name: "Laba Berjalan (kumulatif)", amount: fromCents(earn) });
        E += earn;
        rows.push({ section: "", code: "", name: "Total Aset", amount: fromCents(A) }, { section: "", code: "", name: "Total Liabilitas + Ekuitas", amount: fromCents(L + E) }, { section: "", code: "", name: A === L + E ? "Seimbang" : "TIDAK SEIMBANG", amount: fromCents(A - L - E) });
        return { title: "Neraca", description: `Per ${to}`, columns: [{ key: "section", label: "Bagian" }, { key: "code", label: "Kode" }, { key: "name", label: "Akun" }, { key: "amount", label: "Jumlah", ...num }], rows };
      }
      case "cash-flow": {
        const op = await db.execute(sql`select coalesce(sum(l.debit - l.credit),0)::text as v from journal_lines l join journal_entries e on e.id = l.entry_id join coa_accounts a on a.id = l.account_id where l.workspace_id = ${ws} and a.subtype in ('cash','bank') and e.entry_date < ${from}::date`);
        const mv = await db.execute(sql`
          select e.source, coalesce(sum(l.debit),0)::text as inflow, coalesce(sum(l.credit),0)::text as outflow
          from journal_lines l join journal_entries e on e.id = l.entry_id join coa_accounts a on a.id = l.account_id
          where l.workspace_id = ${ws} and a.subtype in ('cash','bank') and e.entry_date between ${from}::date and ${to}::date group by e.source order by e.source`);
        const labels: Record<string, string> = { sale: "Penjualan tunai", payment: "Pelunasan piutang", income: "Pemasukan", expense: "Pengeluaran", transfer: "Transfer antar akun kas", purchase: "Pembelian", bill_payment: "Pembayaran utang", opening: "Saldo awal", adjustment: "Penyesuaian", reversal: "Pembalikan" };
        const rows: Record<string, unknown>[] = [{ source: "Saldo awal periode", inflow: "", outflow: "", net: (op.rows[0] as { v: string }).v }];
        let net = toCents((op.rows[0] as { v: string }).v);
        for (const m of mv.rows as { source: string; inflow: string; outflow: string }[]) {
          const n = toCents(m.inflow) - toCents(m.outflow); net += n;
          rows.push({ source: labels[m.source] ?? m.source, inflow: m.inflow, outflow: m.outflow, net: fromCents(n) });
        }
        rows.push({ source: "SALDO AKHIR KAS & BANK", inflow: "", outflow: "", net: fromCents(net) });
        return { title: "Arus Kas", description: `${from} s.d. ${to} — transfer antar akun tidak mengubah total kas`, columns: [{ key: "source", label: "Sumber" }, { key: "inflow", label: "Masuk", ...num }, { key: "outflow", label: "Keluar", ...num }, { key: "net", label: "Bersih", ...num }], rows };
      }
      case "ledger": {
        const acc = query.get("accountId");
        if (!acc || !uuid.safeParse(acc).success) throw new HttpError(422, "Pilih akun untuk buku besar.");
        const res = await db.execute(sql`
          select e.entry_date::text as date, e.number, e.memo, l.debit::text as debit, l.credit::text as credit, a.type
          from journal_lines l join journal_entries e on e.id = l.entry_id join coa_accounts a on a.id = l.account_id
          where l.workspace_id = ${ws} and l.account_id = ${acc}::uuid and e.entry_date between ${from}::date and ${to}::date order by e.entry_date, e.created_at, l.id`);
        let run = 0n;
        const rows = (res.rows as { date: string; number: string; memo: string; debit: string; credit: string; type: string }[]).map((x) => {
          const d = toCents(x.debit), c = toCents(x.credit);
          run += x.type === "asset" || x.type === "expense" ? d - c : c - d;
          return { date: x.date, number: x.number, memo: x.memo, debit: x.debit, credit: x.credit, balance: fromCents(run) };
        });
        return { title: "Buku Besar", description: `${from} s.d. ${to}`, columns: [{ key: "date", label: "Tanggal" }, { key: "number", label: "No. Jurnal" }, { key: "memo", label: "Keterangan" }, { key: "debit", label: "Debit", ...num }, { key: "credit", label: "Kredit", ...num }, { key: "balance", label: "Saldo", ...num }], rows };
      }
      case "sales-daily": {
        const res = await db.execute(sql`
          select (issued_at at time zone ${biz.timezone})::date::text as day, count(*)::int as count, coalesce(sum(subtotal - discount),0)::text as net, coalesce(sum(tax),0)::text as tax, coalesce(sum(total),0)::text as total, coalesce(sum(paid),0)::text as paid
          from invoices where workspace_id = ${ws} and status <> 'reversed' and (issued_at at time zone ${biz.timezone})::date between ${from}::date and ${to}::date group by 1 order by 1`);
        return { title: "Penjualan Harian", description: `${from} s.d. ${to} (tidak termasuk faktur dibalik)`, columns: [{ key: "day", label: "Tanggal" }, { key: "count", label: "Jumlah faktur", ...num }, { key: "net", label: "Penjualan bersih", ...num }, { key: "tax", label: "Pajak", ...num }, { key: "total", label: "Total", ...num }, { key: "paid", label: "Dibayar", ...num }], rows: res.rows };
      }
      case "sales-products": {
        const res = await db.execute(sql`
          select p.sku, p.name, sum(l.quantity)::text as qty, sum(l.line_total)::text as revenue, sum(l.quantity * l.unit_cost)::numeric(18,2)::text as cost
          from invoice_lines l join invoices i on i.id = l.invoice_id join products p on p.id = l.product_id
          where l.workspace_id = ${ws} and i.status <> 'reversed' and (i.issued_at at time zone ${biz.timezone})::date between ${from}::date and ${to}::date group by p.id order by sum(l.line_total) desc limit 200`);
        return { title: "Penjualan per Produk", description: `${from} s.d. ${to}`, columns: [{ key: "sku", label: "SKU" }, { key: "name", label: "Produk" }, { key: "qty", label: "Qty", ...num }, { key: "revenue", label: "Pendapatan", ...num }, { key: "cost", label: "HPP", ...num }], rows: res.rows };
      }
      case "inventory-valuation": {
        const res = await db.execute(sql`
          select p.sku, p.name, coalesce(sum(m.quantity),0)::text as "onHand", p.avg_cost::text as "avgCost", (coalesce(sum(m.quantity),0) * p.avg_cost)::numeric(18,2)::text as value
          from products p left join stock_movements m on m.product_id = p.id and m.created_at < (${to}::date + 1)
          where p.workspace_id = ${ws} and p.track_stock and p.kind = 'product' group by p.id order by p.name`);
        return { title: "Nilai Persediaan", description: `Rata-rata bergerak, per ${to}`, columns: [{ key: "sku", label: "SKU" }, { key: "name", label: "Produk" }, { key: "onHand", label: "Stok", ...num }, { key: "avgCost", label: "Biaya rata-rata", ...num }, { key: "value", label: "Nilai", ...num }], rows: res.rows };
      }
      case "client-summary": {
        const res = await db.execute(sql`
          select c.code, c.name, count(i.id)::int as invoices, coalesce(sum(i.total),0)::text as billed, coalesce(sum(i.paid),0)::text as paid, coalesce(sum(i.total - i.paid),0)::text as outstanding
          from clients c left join invoices i on i.client_id = c.id and i.status <> 'reversed' where c.workspace_id = ${ws} and c.status <> 'archived' group by c.id order by sum(i.total) desc nulls last limit 300`);
        return { title: "Ringkasan Keuangan Klien", description: "Seluruh faktur aktif", columns: [{ key: "code", label: "Kode" }, { key: "name", label: "Klien" }, { key: "invoices", label: "Faktur", ...num }, { key: "billed", label: "Ditagih", ...num }, { key: "paid", label: "Dibayar", ...num }, { key: "outstanding", label: "Piutang", ...num }], rows: res.rows };
      }
      default: throw new HttpError(404, "Laporan tidak ditemukan", "not_found");
    }
  }),

  /* ───────── bookings (anti double booking: advisory lock + cek overlap dalam satu transaksi) ───────── */
  r("GET", "/bookings", { perm: "booking:read" }, async ({ ctx, query }) => {
    const biz = await getBusiness(db, ctx);
    const { from, to } = rangeOf(query, biz.timezone);
    const res = await db.execute(sql`
      select b.id, b.customer_name as "customerName", b.service, b.starts_at as "startsAt", b.ends_at as "endsAt", b.status, b.payment_status as "paymentStatus", b.notes, r.name as "resourceName", b.resource_id as "resourceId"
      from bookings b join booking_resources r on r.id = b.resource_id
      where b.workspace_id = ${ctx.workspaceId} and b.starts_at < (${to}::date + 31) and b.ends_at >= ${from}::date order by b.starts_at limit 300`);
    return { items: res.rows };
  }),

  r("POST", "/bookings", { perm: "booking:write" }, async ({ ctx, json }) => {
    const b = await json(bookingSchema);
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${b.resourceId}))`);
      const [res] = await tx.select().from(bookingResources).where(and(eq(bookingResources.id, b.resourceId), eq(bookingResources.workspaceId, ctx.workspaceId)));
      if (!res || !res.isActive) throw new HttpError(422, "Sumber daya tidak tersedia.", "resource_unavailable");
      if (b.clientId) {
        const [c] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, b.clientId), eq(clients.workspaceId, ctx.workspaceId)));
        if (!c) throw new HttpError(422, "Klien tidak ditemukan.");
      }
      await assertFree(tx, b.resourceId, b.startsAt, b.endsAt);
      const [row] = await tx.insert(bookings).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, resourceId: b.resourceId, clientId: b.clientId ?? null, customerName: b.customerName, service: b.service ?? null, startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt), notes: b.notes ?? null, deviceId: ctx.deviceId }).returning();
      await audit(tx, ctx, "booking.create", "booking", row.id);
      return { item: row };
    });
  }),

  r("POST", "/bookings/:id/reschedule", { perm: "booking:write" }, async ({ ctx, params, json }) => {
    const b = await json(z.object({ startsAt: z.string(), endsAt: z.string() }));
    checkRange(b.startsAt, b.endsAt);
    await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(bookings).where(and(eq(bookings.id, params.id), eq(bookings.workspaceId, ctx.workspaceId)));
      if (!cur) throw new HttpError(404, "Booking tidak ditemukan", "not_found");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${cur.resourceId}::text))`);
      if (cur.status !== "confirmed") throw new HttpError(409, "Hanya booking terkonfirmasi yang dapat dijadwalkan ulang.", "bad_status");
      await assertFree(tx, cur.resourceId, b.startsAt, b.endsAt, cur.id);
      await tx.update(bookings).set({ startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt) }).where(eq(bookings.id, cur.id));
      await audit(tx, ctx, "booking.reschedule", "booking", cur.id);
    });
    return { ok: true };
  }),

  r("POST", "/bookings/:id/status", { perm: "booking:write" }, async ({ ctx, params, json }) => {
    const b = await json(z.object({ status: z.enum(["cancelled", "completed"]).optional(), paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional() }));
    const [u] = await db.update(bookings).set({ ...b }).where(and(eq(bookings.id, params.id), eq(bookings.workspaceId, ctx.workspaceId))).returning({ id: bookings.id });
    if (!u) throw new HttpError(404, "Booking tidak ditemukan", "not_found");
    await audit(db, ctx, "booking.status", "booking", u.id, b);
    return { ok: true };
  }),

  /* ───────── kas ───────── */
  r("GET", "/cash/sessions", { perm: "ops:read" }, async ({ ctx }) => {
    const res = await db.execute(sql`
      select s.id, s.status, s.opening_amount::text as "openingAmount", s.expected_amount::text as "expectedAmount", s.counted_amount::text as "countedAmount", s.variance::text as variance, s.opened_at as "openedAt", s.closed_at as "closedAt", s.note, a.name as "accountName", s.account_id as "accountId"
      from cash_sessions s join cash_accounts a on a.id = s.account_id where s.workspace_id = ${ctx.workspaceId} order by s.opened_at desc limit 50`);
    return { items: res.rows };
  }),

  r("POST", "/cash/open", { perm: "ops:write" }, async ({ ctx, json }) => {
    const b = await json(z.object({ accountId: uuid, openingAmount: z.string().regex(/^\d{1,15}(\.\d{1,2})?$/, "Nominal tidak valid") }));
    const biz = await getBusiness(db, ctx);
    assertCurrencyPrecision(b.openingAmount, biz.currency);
    const [a] = await db.select().from(cashAccounts).where(and(eq(cashAccounts.id, b.accountId), eq(cashAccounts.workspaceId, ctx.workspaceId), eq(cashAccounts.kind, "cash"), eq(cashAccounts.isActive, true)));
    if (!a) throw new HttpError(422, "Pilih akun kas (bukan bank) yang aktif.", "bad_account");
    try {
      const [s] = await db.insert(cashSessions).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, accountId: a.id, openingAmount: b.openingAmount, openedBy: ctx.deviceId }).returning();
      await audit(db, ctx, "cash.open", "cash_session", s.id);
      return { item: s };
    } catch (e) {
      if ((e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505") throw new HttpError(409, "Sesi kas untuk akun ini masih terbuka.", "already_open");
      throw e;
    }
  }),

  r("POST", "/cash/:id/close", { perm: "ops:write" }, async ({ ctx, params, json }) => {
    const b = await json(z.object({ countedAmount: z.string().regex(/^\d{1,15}(\.\d{1,2})?$/, "Nominal tidak valid"), note: z.string().trim().max(300).optional().nullable() }));
    return db.transaction(async (tx) => {
      const [s] = await tx.select().from(cashSessions).where(and(eq(cashSessions.id, params.id), eq(cashSessions.workspaceId, ctx.workspaceId))).for("update");
      if (!s) throw new HttpError(404, "Sesi tidak ditemukan", "not_found");
      if (s.status !== "open") throw new HttpError(409, "Sesi kas sudah ditutup.", "already_closed");
      const mv = await tx.execute(sql`
        select coalesce(sum(l.debit - l.credit),0)::text as v from journal_lines l join journal_entries e on e.id = l.entry_id
        join cash_accounts ca on ca.coa_account_id = l.account_id
        where ca.id = ${s.accountId} and e.created_at >= ${s.openedAt.toISOString()}::timestamptz and e.source <> 'opening'`);
      const expected = toCents(s.openingAmount) + toCents((mv.rows[0] as { v: string }).v.replace("-", "")) * ((mv.rows[0] as { v: string }).v.startsWith("-") ? -1n : 1n);
      const counted = toCents(b.countedAmount);
      await tx.update(cashSessions).set({ status: "closed", expectedAmount: fromCents(expected), countedAmount: fromCents(counted), variance: fromCents(counted - expected), closedAt: new Date(), note: b.note ?? null }).where(eq(cashSessions.id, s.id));
      await audit(tx, ctx, "cash.close", "cash_session", s.id, { variance: fromCents(counted - expected) });
      return { expected: fromCents(expected), counted: fromCents(counted), variance: fromCents(counted - expected) };
    });
  }),

  /* ───────── pengaturan bisnis ───────── */
  r("GET", "/business", {}, async ({ ctx }) => {
    const biz = await getBusiness(db, ctx);
    const brs = await db.select().from(branches).where(eq(branches.workspaceId, ctx.workspaceId));
    const whs = await db.select().from(warehouses).where(eq(warehouses.workspaceId, ctx.workspaceId));
    return { business: biz, branches: brs, warehouses: whs, template: templateByKey(biz.templateKey), role: ctx.role };
  }),

  r("PATCH", "/business", { perm: "settings:write" }, async ({ ctx, json }) => {
    const b = await json(z.object({
      name: z.string().trim().min(2).max(120).optional(), legalName: z.string().trim().max(200).nullable().optional(),
      tradeName: z.string().trim().max(200).nullable().optional(), slogan: z.string().trim().max(200).nullable().optional(),
      description: z.string().trim().max(1000).nullable().optional(), address: z.string().trim().max(300).nullable().optional(),
      templateKey: z.string().max(40).optional(),
      taxRate: z.string().regex(/^\d{1,2}(\.\d{1,2})?$|^100$/, "Tarif pajak 0–100").optional(),
      approvalThreshold: z.string().regex(/^\d{1,15}$/, "Ambang persetujuan: angka bulat").optional(),
    }));
    const biz = await getBusiness(db, ctx);
    const { taxRate, approvalThreshold, templateKey, ...rest } = b;
    if (templateKey && templateByKey(templateKey).key !== templateKey) throw new HttpError(422, "Template tidak dikenal");
    const settings = { ...biz.settings, ...(taxRate !== undefined ? { taxRate } : {}), ...(approvalThreshold !== undefined ? { approvalThreshold } : {}) };
    await db.update(businesses).set({ ...rest, ...(templateKey ? { templateKey } : {}), settings }).where(eq(businesses.id, ctx.businessId));
    await audit(db, ctx, "business.update", "business", ctx.businessId, { fields: Object.keys(b) });
    return { ok: true };
  }),

  r("POST", "/branches", { perm: "settings:write" }, async ({ ctx, json }) => {
    const b = await json(z.object({ name: z.string().trim().min(1).max(80), address: z.string().trim().max(300).optional().nullable() }));
    const [row] = await db.insert(branches).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, name: b.name, address: b.address ?? null }).returning();
    await audit(db, ctx, "create", "branch", row.id);
    return { item: row };
  }),

  r("POST", "/warehouses", { perm: "settings:write" }, async ({ ctx, json }) => {
    const b = await json(z.object({ name: z.string().trim().min(1).max(80), branchId: uuid.optional().nullable() }));
    if (b.branchId) {
      const [br] = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.id, b.branchId), eq(branches.workspaceId, ctx.workspaceId)));
      if (!br) throw new HttpError(422, "Cabang tidak ditemukan");
    }
    const [row] = await db.insert(warehouses).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, name: b.name, branchId: b.branchId ?? null }).returning();
    await audit(db, ctx, "create", "warehouse", row.id);
    return { item: row };
  }),

  r("GET", "/legal", {}, async ({ ctx }) => {
    const res = await db.execute(sql`select d.kind, d.version, d.title, d.body, d.effective_at as "effectiveAt" from legal_documents d order by d.kind, d.effective_at desc`);
    const acc = await db.select().from(legalAcceptances).where(eq(legalAcceptances.workspaceId, ctx.workspaceId));
    return { documents: res.rows, acceptances: acc };
  }),

  r("GET", "/audit", { perm: "audit:read" }, async ({ ctx, query }) => {
    const limit = Math.min(Number(query.get("limit") ?? 100) || 100, 300);
    const res = await db.execute(sql`
      select a.id, a.action, a.resource, a.resource_id as "resourceId", a.operator, a.meta, a.created_at as "createdAt", d.name as "deviceName"
      from audit_events a left join devices d on d.id = a.device_id where a.workspace_id = ${ctx.workspaceId} order by a.created_at desc limit ${limit}`);
    return { items: res.rows };
  }),

  r("GET", "/search", {}, async ({ ctx, query }) => {
    const q = (query.get("q") ?? "").trim().slice(0, 60);
    if (q.length < 2) return { items: [] };
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    const ws = ctx.workspaceId;
    const items: { type: string; id: string; label: string; href: string }[] = [];
    if (can(ctx.role, "crm:read")) {
      const c = await db.execute(sql`select id, code, name from clients where workspace_id = ${ws} and status <> 'archived' and (name ilike ${like} or code ilike ${like} or phone ilike ${like}) limit 5`);
      for (const x of c.rows as { id: string; code: string; name: string }[]) items.push({ type: "Klien", id: x.id, label: `${x.name} (${x.code})`, href: `/crm/${x.id}` });
    }
    if (can(ctx.role, "inventory:read")) {
      const p = await db.execute(sql`select id, sku, name from products where workspace_id = ${ws} and (name ilike ${like} or sku ilike ${like} or barcode ilike ${like}) limit 5`);
      for (const x of p.rows as { id: string; sku: string; name: string }[]) items.push({ type: "Produk", id: x.id, label: `${x.name} (${x.sku})`, href: "/products" });
    }
    if (can(ctx.role, "sales:read")) {
      const i = await db.execute(sql`select id, number from invoices where workspace_id = ${ws} and number ilike ${like} limit 5`);
      for (const x of i.rows as { id: string; number: string }[]) items.push({ type: "Faktur", id: x.id, label: x.number, href: "/sales" });
    }
    return { items };
  }),

  r("GET", "/notifications", {}, async ({ ctx }) => {
    const items = await db.select().from(notifications).where(eq(notifications.workspaceId, ctx.workspaceId)).orderBy(sql`${notifications.createdAt} desc`).limit(30);
    return { items };
  }),

  r("POST", "/notifications/read", {}, async ({ ctx }) => {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.workspaceId, ctx.workspaceId), sql`${notifications.readAt} is null`));
    return { ok: true };
  }),

  /* ───────── CRM terpadu ───────── */
  r("GET", "/crm/clients/:id", { perm: "crm:read" }, async ({ ctx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Klien tidak ditemukan", "not_found");
    const [c] = await db.select().from(clients).where(and(eq(clients.id, params.id), eq(clients.workspaceId, ctx.workspaceId)));
    if (!c) throw new HttpError(404, "Klien tidak ditemukan", "not_found");
    const ws = ctx.workspaceId;
    const contacts = await db.select().from(clientContacts).where(and(eq(clientContacts.clientId, c.id), eq(clientContacts.workspaceId, ws)));
    const acts = await db.select().from(clientActivities).where(and(eq(clientActivities.clientId, c.id), eq(clientActivities.workspaceId, ws))).orderBy(sql`${clientActivities.createdAt} desc`).limit(100);
    const invs = await db.select().from(invoices).where(and(eq(invoices.clientId, c.id), eq(invoices.workspaceId, ws))).orderBy(sql`${invoices.issuedAt} desc`).limit(100);
    const pays = await db.execute(sql`select p.id, p.amount::text as amount, p.paid_at as "paidAt", i.number, a.name as "accountName", p.reversed from payments p join invoices i on i.id = p.invoice_id join cash_accounts a on a.id = p.account_id where i.client_id = ${c.id} and p.workspace_id = ${ws} order by p.paid_at desc limit 100`);
    const bks = await db.select().from(bookings).where(and(eq(bookings.clientId, c.id), eq(bookings.workspaceId, ws))).limit(50);
    const prj = await db.select().from(projects).where(and(eq(projects.clientId, c.id), eq(projects.workspaceId, ws)));
    let billed = 0n, paid = 0n;
    for (const i of invs) if (i.status !== "reversed") { billed += toCents(i.total); paid += toCents(i.paid); }
    const aud = can(ctx.role, "audit:read")
      ? (await db.execute(sql`select action, resource, operator, created_at as "createdAt" from audit_events where workspace_id = ${ws} and resource_id = ${c.id} order by created_at desc limit 50`)).rows : [];
    const canInternal = can(ctx.role, "crm:write");
    return {
      client: c, contacts, activities: canInternal ? acts : acts.filter((a) => !a.isInternal), invoices: invs, payments: pays.rows, bookings: bks, projects: prj, audit: aud,
      financial: { billed: fromCents(billed), paid: fromCents(paid), outstanding: fromCents(billed - paid) },
    };
  }),

  // Deteksi kemungkinan duplikat — tidak pernah menggabung otomatis.
  r("GET", "/crm/duplicates", { perm: "crm:write" }, async ({ ctx }) => {
    const res = await db.execute(sql`
      with norm as (
        select id, code, name, phone, email, lower(regexp_replace(name, '\s+', ' ', 'g')) as nname, regexp_replace(coalesce(phone,''), '\D', '', 'g') as nphone, lower(coalesce(email,'')) as nemail
        from clients where workspace_id = ${ctx.workspaceId} and status <> 'archived')
      select reason, key, json_agg(json_build_object('id', id, 'code', code, 'name', name, 'phone', phone)) as clients from (
        select 'Nama sama' as reason, nname as key, id, code, name, phone from norm where nname <> '' and nname in (select nname from norm group by nname having count(*) > 1)
        union all
        select 'Telepon sama', nphone, id, code, name, phone from norm where length(nphone) >= 6 and nphone in (select nphone from norm where length(nphone) >= 6 group by nphone having count(*) > 1)
        union all
        select 'Email sama', nemail, id, code, name, phone from norm where nemail <> '' and nemail in (select nemail from norm where nemail <> '' group by nemail having count(*) > 1)
      ) d group by reason, key order by reason limit 50`);
    return { items: res.rows };
  }),

  r("POST", "/crm/merge", { perm: "crm:write" }, async ({ ctx, json }) => {
    const b = await json(z.object({ sourceId: uuid, targetId: uuid }));
    if (b.sourceId === b.targetId) throw new HttpError(422, "Klien sumber dan tujuan sama.");
    await db.transaction(async (tx) => {
      const rows = await tx.select().from(clients).where(and(inArray(clients.id, [b.sourceId, b.targetId]), eq(clients.workspaceId, ctx.workspaceId))).orderBy(clients.id).for("update");
      if (rows.length !== 2) throw new HttpError(404, "Klien tidak ditemukan", "not_found");
      const src = rows.find((x) => x.id === b.sourceId)!;
      if (src.status === "archived" && src.mergedIntoId) throw new HttpError(409, "Klien sumber sudah digabung.");
      for (const t of [clientContacts, clientActivities, invoices, bookings, projects, financeTransactions] as const) {
        await tx.update(t).set({ clientId: b.targetId } as never).where(and(eq(t.clientId, b.sourceId), eq(t.workspaceId, ctx.workspaceId)));
      }
      await tx.update(clients).set({ status: "archived", mergedIntoId: b.targetId }).where(eq(clients.id, b.sourceId));
      await audit(tx, ctx, "client.merge", "clients", b.targetId, { sourceId: b.sourceId });
    });
    return { ok: true };
  }),

  r("GET", "/projects/costs", { perm: "projects:read" }, async ({ ctx }) => {
    const res = await db.execute(sql`select project_id as "projectId", sum(amount)::text as cost from finance_transactions where workspace_id = ${ctx.workspaceId} and type = 'expense' and state = 'posted' and project_id is not null group by project_id`);
    return { items: res.rows };
  }),
];

/* ───────── helpers booking ───────── */
const bookingSchema = z.object({
  resourceId: uuid, customerName: z.string().trim().min(1, "Nama pelanggan wajib diisi").max(120), clientId: uuid.optional().nullable(),
  service: z.string().trim().max(120).optional().nullable(), startsAt: z.string(), endsAt: z.string(), notes: z.string().trim().max(500).optional().nullable(),
}).superRefine((v, c) => { try { checkRange(v.startsAt, v.endsAt); } catch (e) { c.addIssue({ code: "custom", message: (e as Error).message }); } });

function checkRange(a: string, b: string) {
  const s = Date.parse(a), e = Date.parse(b);
  if (Number.isNaN(s) || Number.isNaN(e)) throw new HttpError(422, "Waktu tidak valid");
  if (e <= s) throw new HttpError(422, "Waktu selesai harus setelah waktu mulai.");
  if (e - s > 31 * 86400_000) throw new HttpError(422, "Durasi booking maksimal 31 hari.");
}

async function assertFree(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], resourceId: string, startsAt: string, endsAt: string, excludeId?: string) {
  const res = await tx.execute(sql`
    select id from bookings where resource_id = ${resourceId}::uuid and status = 'confirmed' and starts_at < ${new Date(endsAt).toISOString()}::timestamptz and ends_at > ${new Date(startsAt).toISOString()}::timestamptz
      and (${excludeId ?? null}::uuid is null or id <> ${excludeId ?? null}::uuid) limit 1`);
  if (res.rows.length) throw new HttpError(409, "Jadwal bentrok dengan booking lain pada sumber daya yang sama.", "double_booking");
}

void or;

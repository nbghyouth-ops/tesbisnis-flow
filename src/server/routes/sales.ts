import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  cashAccounts, clients, coaAccounts, invoiceLines, invoices, payments, products, purchaseOrderLines, purchaseOrders,
  stockMovements, supplierBills, suppliers, warehouses,
} from "@/db/schema";
import { assertCurrencyPrecision, fromCents, fromMilli, mulQty, percentOf, toCents, toMilli } from "@/lib/money";
import { audit, getBusiness, HttpError, idempotent, nextNumber, r, todayIn, type Ctx, type Route, type Tx } from "../core";
import { accountBySubtype, postJournal, reverseJournal, type JLine } from "../accounting";

const money = z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string().regex(/^\d{1,15}(\.\d{1,2})?$/, "Nominal tidak valid"));
const qtyS = z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string().regex(/^\d{1,12}(\.\d{1,3})?$/, "Kuantitas tidak valid").refine((v) => toMilli(v) > 0n, "Kuantitas harus lebih dari nol"));
const uuid = z.string().uuid();

const signedMilli = (s: string) => (s.startsWith("-") ? -toMilli(s.slice(1)) : toMilli(s));

async function onHand(tx: Tx, ws: string, productId: string, warehouseId: string): Promise<bigint> {
  const res = await tx.execute(sql`select coalesce(sum(quantity),0)::text as q from stock_movements where workspace_id = ${ws} and product_id = ${productId} and warehouse_id = ${warehouseId}`);
  return signedMilli((res.rows[0] as { q: string }).q);
}
async function onHandAll(tx: Tx, ws: string, productId: string): Promise<bigint> {
  const res = await tx.execute(sql`select coalesce(sum(quantity),0)::text as q from stock_movements where workspace_id = ${ws} and product_id = ${productId}`);
  return signedMilli((res.rows[0] as { q: string }).q);
}

async function defaultWarehouse(tx: Tx, ctx: Ctx) {
  const [w] = await tx.select().from(warehouses).where(and(eq(warehouses.workspaceId, ctx.workspaceId), eq(warehouses.status, "active"))).orderBy(sql`${warehouses.isDefault} desc`).limit(1);
  if (!w) throw new HttpError(422, "Gudang belum tersedia.", "no_warehouse");
  return w;
}

async function codeAccount(tx: Tx, ws: string, code: string) {
  const [a] = await tx.select({ id: coaAccounts.id }).from(coaAccounts).where(and(eq(coaAccounts.workspaceId, ws), eq(coaAccounts.code, code)));
  if (!a) throw new HttpError(422, `Akun ${code} tidak ada di Bagan Akun.`, "coa_missing");
  return a.id;
}

/** Moving weighted average (dibulatkan ke sen). */
export function weightedAvg(onHandMilli: bigint, avgCents: bigint, inMilli: bigint, inCostCents: bigint): bigint {
  if (onHandMilli <= 0n) return inCostCents;
  const total = onHandMilli + inMilli;
  return (onHandMilli * avgCents + inMilli * inCostCents + total / 2n) / total;
}

async function cashAccountsMap(tx: Tx, ctx: Ctx, ids: string[]) {
  const rows = ids.length ? await tx.select().from(cashAccounts).where(and(inArray(cashAccounts.id, ids), eq(cashAccounts.workspaceId, ctx.workspaceId), eq(cashAccounts.isActive, true))) : [];
  return new Map(rows.map((a) => [a.id, a]));
}

const checkoutSchema = z.object({
  clientId: uuid.optional().nullable(),
  channel: z.enum(["pos", "invoice"]).default("pos"),
  lines: z.array(z.object({ productId: uuid, quantity: qtyS })).min(1, "Keranjang kosong").max(100),
  discount: money.optional(),
  payments: z.array(z.object({ accountId: uuid, amount: money })).max(5).default([]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});

export const salesRoutes: Route[] = [
  r("GET", "/sales/pos-meta", { perm: "sales:write" }, async ({ ctx }) => {
    const biz = await getBusiness(db, ctx);
    const accs = await db.select({ id: cashAccounts.id, name: cashAccounts.name, kind: cashAccounts.kind }).from(cashAccounts).where(and(eq(cashAccounts.workspaceId, ctx.workspaceId), eq(cashAccounts.isActive, true)));
    return { accounts: accs, taxRate: String((biz.settings as { taxRate?: string }).taxRate ?? "0"), currency: biz.currency };
  }),

  r("POST", "/sales/checkout", { perm: "sales:write" }, async ({ ctx, json, idemKey }) => {
    const b = await json(checkoutSchema);
    const biz = await getBusiness(db, ctx);
    for (const l of b.lines) void l;
    if (b.discount) assertCurrencyPrecision(b.discount, biz.currency);
    for (const p of b.payments) assertCurrencyPrecision(p.amount, biz.currency);
    const taxRate = String((biz.settings as { taxRate?: string }).taxRate ?? "0");

    return db.transaction((tx) => idempotent(tx, ctx, idemKey, async () => {
      // gabungkan baris produk yang sama
      const merged = new Map<string, bigint>();
      for (const l of b.lines) merged.set(l.productId, (merged.get(l.productId) ?? 0n) + toMilli(l.quantity));
      const ids = [...merged.keys()].sort();
      // kunci baris produk (urut) → serialisasi checkout bersamaan pada produk yang sama
      const prods = await tx.select().from(products).where(and(inArray(products.id, ids), eq(products.workspaceId, ctx.workspaceId))).orderBy(products.id).for("update");
      if (prods.length !== ids.length) throw new HttpError(422, "Ada produk yang tidak ditemukan.", "bad_product");
      if (b.clientId) {
        const [c] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, b.clientId), eq(clients.workspaceId, ctx.workspaceId)));
        if (!c) throw new HttpError(422, "Pelanggan tidak ditemukan.", "bad_client");
      }
      const wh = await defaultWarehouse(tx, ctx);

      let subtotal = 0n, cogs = 0n, allServices = true;
      const lineRows: { p: typeof prods[number]; qtyMilli: bigint; total: bigint; cost: bigint }[] = [];
      for (const p of prods) {
        if (!p.isActive) throw new HttpError(422, `Produk "${p.name}" nonaktif.`, "inactive_product");
        const q = merged.get(p.id)!;
        if (p.trackStock && p.kind === "product") {
          const have = await onHand(tx, ctx.workspaceId, p.id, wh.id);
          if (have < q) throw new HttpError(409, `Stok "${p.name}" tidak cukup (tersedia ${fromMilli(have)}).`, "insufficient_stock");
        }
        const total = mulQty(fromMilli(q), p.price);
        const cost = p.trackStock ? mulQty(fromMilli(q), p.avgCost) : 0n;
        if (p.kind === "product") allServices = false;
        subtotal += total; cogs += cost;
        lineRows.push({ p, qtyMilli: q, total, cost });
      }
      const discount = b.discount ? toCents(b.discount) : 0n;
      if (discount > subtotal) throw new HttpError(422, "Diskon melebihi subtotal.", "bad_discount");
      const taxable = subtotal - discount;
      const tax = percentOf(taxable, taxRate);
      const total = taxable + tax;
      if (total <= 0n) throw new HttpError(422, "Total transaksi harus lebih dari nol.", "bad_total");

      const accMap = await cashAccountsMap(tx, ctx, b.payments.map((p) => p.accountId));
      let paid = 0n;
      for (const p of b.payments) {
        if (!accMap.has(p.accountId)) throw new HttpError(422, "Akun pembayaran tidak valid.", "bad_account");
        const a = toCents(p.amount);
        if (a <= 0n) throw new HttpError(422, "Nominal pembayaran harus lebih dari nol.");
        paid += a;
      }
      if (paid > total) throw new HttpError(422, "Pembayaran melebihi total tagihan.", "overpay");
      if (paid < total && !b.clientId) throw new HttpError(422, "Pilih pelanggan untuk transaksi yang belum lunas (piutang).", "client_required");

      const today = todayIn(biz.timezone);
      const number = await nextNumber(tx, ctx.workspaceId, "invoice", "INV");
      const status = paid === total ? "paid" : paid > 0n ? "partial" : "unpaid";
      const [inv] = await tx.insert(invoices).values({
        workspaceId: ctx.workspaceId, businessId: ctx.businessId, branchId: ctx.branchId, number, clientId: b.clientId ?? null, channel: b.channel,
        status, subtotal: fromCents(subtotal), discount: fromCents(discount), tax: fromCents(tax), total: fromCents(total), paid: fromCents(paid),
        cogs: fromCents(cogs), dueDate: b.dueDate ?? null, note: b.note ?? null, deviceId: ctx.deviceId, operator: ctx.operator,
      }).returning();

      await tx.insert(invoiceLines).values(lineRows.map((l) => ({
        workspaceId: ctx.workspaceId, invoiceId: inv.id, productId: l.p.id, description: l.p.name, quantity: fromMilli(l.qtyMilli),
        unitPrice: l.p.price, unitCost: l.p.trackStock ? l.p.avgCost : "0", lineTotal: fromCents(l.total),
      })));
      const moves = lineRows.filter((l) => l.p.trackStock && l.p.kind === "product");
      if (moves.length) {
        await tx.insert(stockMovements).values(moves.map((l) => ({
          workspaceId: ctx.workspaceId, businessId: ctx.businessId, warehouseId: wh.id, productId: l.p.id, quantity: fromMilli(-l.qtyMilli),
          unitCost: l.p.avgCost, kind: "sale", refType: "invoice", refId: inv.id, deviceId: ctx.deviceId,
        })));
      }

      // Jurnal: Dr Kas/Bank + Dr Piutang; Cr Pendapatan (+ Utang Pajak); Dr HPP / Cr Persediaan
      const lines: JLine[] = [];
      for (const p of b.payments) lines.push({ accountId: accMap.get(p.accountId)!.coaAccountId, debit: fromCents(toCents(p.amount)) });
      if (total - paid > 0n) lines.push({ accountId: await accountBySubtype(tx, ctx.workspaceId, "receivable"), debit: fromCents(total - paid) });
      lines.push({ accountId: await codeAccount(tx, ctx.workspaceId, allServices ? "4102" : "4101"), credit: fromCents(taxable) });
      if (tax > 0n) lines.push({ accountId: await accountBySubtype(tx, ctx.workspaceId, "tax"), credit: fromCents(tax) });
      if (cogs > 0n) {
        lines.push({ accountId: await accountBySubtype(tx, ctx.workspaceId, "cogs"), debit: fromCents(cogs) });
        lines.push({ accountId: await accountBySubtype(tx, ctx.workspaceId, "inventory"), credit: fromCents(cogs) });
      }
      // gabungkan baris pada akun yang sama agar jurnal ringkas
      const jid = await postJournal(tx, ctx, { date: today, memo: `Penjualan ${number}`, source: "sale", sourceId: inv.id, lines });
      await tx.update(invoices).set({ journalId: jid }).where(eq(invoices.id, inv.id));
      for (const p of b.payments) {
        await tx.insert(payments).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, invoiceId: inv.id, accountId: p.accountId, amount: fromCents(toCents(p.amount)), journalId: jid, deviceId: ctx.deviceId });
      }
      await audit(tx, ctx, "sale.checkout", "invoice", inv.id, { number, total: fromCents(total) });
      return { id: inv.id, number, total: fromCents(total), paid: fromCents(paid), status };
    }));
  }),

  r("GET", "/sales/invoices", { perm: "sales:read" }, async ({ ctx, query }) => {
    const status = query.get("status") || null;
    const from = query.get("from") || null, to = query.get("to") || null;
    for (const v of [from, to]) if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(422, "Rentang tanggal tidak valid");
    const cl = query.get("clientId") || null;
    if (cl && !uuid.safeParse(cl).success) throw new HttpError(422, "Klien tidak valid");
    const res = await db.execute(sql`
      select i.id, i.number, i.status, i.channel, i.total::text as total, i.paid::text as paid, i.issued_at as "issuedAt", i.due_date::text as "dueDate", i.operator, c.name as "clientName"
      from invoices i left join clients c on c.id = i.client_id
      where i.workspace_id = ${ctx.workspaceId} and (${status}::text is null or i.status = ${status})
        and (${cl}::uuid is null or i.client_id = ${cl}::uuid)
        and (${from}::date is null or i.issued_at >= ${from}::date) and (${to}::date is null or i.issued_at < ${to}::date + 1)
      order by i.issued_at desc limit 200`);
    return { items: res.rows };
  }),

  r("GET", "/sales/invoices/:id", { perm: "sales:read" }, async ({ ctx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Faktur tidak ditemukan", "not_found");
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, params.id), eq(invoices.workspaceId, ctx.workspaceId)));
    if (!inv) throw new HttpError(404, "Faktur tidak ditemukan", "not_found");
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id));
    const pays = await db.select().from(payments).where(eq(payments.invoiceId, inv.id));
    return { invoice: inv, lines, payments: pays };
  }),

  r("POST", "/sales/invoices/:id/payments", { perm: "sales:write" }, async ({ ctx, params, json, idemKey }) => {
    const b = await json(z.object({ accountId: uuid, amount: money, reference: z.string().trim().max(100).optional().nullable() }));
    const biz = await getBusiness(db, ctx);
    assertCurrencyPrecision(b.amount, biz.currency);
    return db.transaction((tx) => idempotent(tx, ctx, idemKey, async () => {
      if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Faktur tidak ditemukan", "not_found");
      const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, params.id), eq(invoices.workspaceId, ctx.workspaceId))).for("update");
      if (!inv) throw new HttpError(404, "Faktur tidak ditemukan", "not_found");
      if (inv.status !== "unpaid" && inv.status !== "partial") throw new HttpError(409, "Faktur tidak dapat dibayar pada status ini.", "bad_status");
      const acc = (await cashAccountsMap(tx, ctx, [b.accountId])).get(b.accountId);
      if (!acc) throw new HttpError(422, "Akun pembayaran tidak valid.", "bad_account");
      const amt = toCents(b.amount), out = toCents(inv.total) - toCents(inv.paid);
      if (amt <= 0n) throw new HttpError(422, "Nominal harus lebih dari nol.");
      if (amt > out) throw new HttpError(422, `Pembayaran melebihi sisa tagihan (${fromCents(out)}).`, "overpay");
      // Pembayaran faktur mengurangi Piutang (bukan pendapatan lagi).
      const jid = await postJournal(tx, ctx, {
        date: todayIn(biz.timezone), memo: `Pembayaran ${inv.number}`, source: "payment", sourceId: inv.id,
        lines: [{ accountId: acc.coaAccountId, debit: fromCents(amt) }, { accountId: await accountBySubtype(tx, ctx.workspaceId, "receivable"), credit: fromCents(amt) }],
      });
      const newPaid = toCents(inv.paid) + amt;
      await tx.update(invoices).set({ paid: fromCents(newPaid), status: newPaid === toCents(inv.total) ? "paid" : "partial" }).where(eq(invoices.id, inv.id));
      await tx.insert(payments).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, invoiceId: inv.id, accountId: acc.id, amount: fromCents(amt), reference: b.reference ?? null, journalId: jid, deviceId: ctx.deviceId });
      await audit(tx, ctx, "invoice.payment", "invoice", inv.id, { amount: fromCents(amt) });
      return { ok: true, paid: fromCents(newPaid) };
    }));
  }),

  // Retur/refund penuh: pembalikan jurnal penjualan + pembayaran, stok dikembalikan.
  r("POST", "/sales/invoices/:id/reverse", { perm: "finance:approve" }, async ({ ctx, params, json }) => {
    const b = await json(z.object({ reason: z.string().trim().min(3, "Alasan wajib diisi").max(300) }));
    const biz = await getBusiness(db, ctx);
    await db.transaction(async (tx) => {
      if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Faktur tidak ditemukan", "not_found");
      const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, params.id), eq(invoices.workspaceId, ctx.workspaceId))).for("update");
      if (!inv) throw new HttpError(404, "Faktur tidak ditemukan", "not_found");
      if (inv.status === "reversed") throw new HttpError(409, "Faktur sudah dibalik.", "already_reversed");
      const today = todayIn(biz.timezone);
      const pays = await tx.select().from(payments).where(and(eq(payments.invoiceId, inv.id), eq(payments.reversed, false)));
      const jids = new Set<string>([inv.journalId!, ...pays.map((p) => p.journalId!).filter(Boolean)]);
      for (const j of jids) await reverseJournal(tx, ctx, j, today, b.reason);
      await tx.update(payments).set({ reversed: true }).where(eq(payments.invoiceId, inv.id));
      const moves = await tx.select().from(stockMovements).where(and(eq(stockMovements.refId, inv.id), eq(stockMovements.kind, "sale")));
      if (moves.length) {
        await tx.insert(stockMovements).values(moves.map((m) => ({
          workspaceId: ctx.workspaceId, businessId: ctx.businessId, warehouseId: m.warehouseId, productId: m.productId,
          quantity: fromMilli(-signedMilli(m.quantity)), unitCost: m.unitCost, kind: "sale_reversal", refType: "invoice", refId: inv.id, note: b.reason, deviceId: ctx.deviceId,
        })));
      }
      await tx.update(invoices).set({ status: "reversed" }).where(eq(invoices.id, inv.id));
      await audit(tx, ctx, "invoice.reverse", "invoice", inv.id, { reason: b.reason });
    });
    return { ok: true };
  }),

  /* ───────── inventory ───────── */
  r("GET", "/inventory/stock", { perm: "inventory:read" }, async ({ ctx }) => {
    const res = await db.execute(sql`
      select p.id, p.sku, p.name, p.unit, p.avg_cost::text as "avgCost", p.reorder_level::text as "reorderLevel",
        coalesce(sum(m.quantity),0)::text as "onHand",
        (coalesce(sum(m.quantity),0) * p.avg_cost)::numeric(18,2)::text as value
      from products p left join stock_movements m on m.product_id = p.id
      where p.workspace_id = ${ctx.workspaceId} and p.track_stock and p.kind = 'product' and p.is_active
      group by p.id order by p.name`);
    return { items: res.rows };
  }),

  r("GET", "/inventory/movements", { perm: "inventory:read" }, async ({ ctx, query }) => {
    const pid = query.get("productId") || null;
    if (pid && !uuid.safeParse(pid).success) throw new HttpError(422, "Produk tidak valid");
    const res = await db.execute(sql`
      select m.id, m.created_at as "createdAt", m.kind, m.quantity::text as quantity, m.unit_cost::text as "unitCost", m.note, p.name as "productName", w.name as "warehouseName"
      from stock_movements m join products p on p.id = m.product_id join warehouses w on w.id = m.warehouse_id
      where m.workspace_id = ${ctx.workspaceId} and (${pid}::uuid is null or m.product_id = ${pid}::uuid)
      order by m.created_at desc limit 200`);
    return { items: res.rows };
  }),

  r("POST", "/inventory/adjust", { perm: "inventory:write" }, async ({ ctx, json, idemKey }) => {
    const b = await json(z.object({
      productId: uuid, direction: z.enum(["in", "out"]), quantity: qtyS, reason: z.enum(["opening", "adjustment"]).default("adjustment"),
      unitCost: money.optional(), note: z.string().trim().max(300).optional().nullable(),
    }));
    const biz = await getBusiness(db, ctx);
    return db.transaction((tx) => idempotent(tx, ctx, idemKey, async () => {
      const [p] = await tx.select().from(products).where(and(eq(products.id, b.productId), eq(products.workspaceId, ctx.workspaceId))).for("update");
      if (!p) throw new HttpError(404, "Produk tidak ditemukan", "not_found");
      if (!p.trackStock || p.kind !== "product") throw new HttpError(422, "Produk ini tidak melacak stok.", "not_tracked");
      const wh = await defaultWarehouse(tx, ctx);
      const q = toMilli(b.quantity);
      const have = await onHand(tx, ctx.workspaceId, p.id, wh.id);
      const haveAll = await onHandAll(tx, ctx.workspaceId, p.id);
      let cost = toCents(p.avgCost);
      if (b.direction === "out") {
        if (have < q) throw new HttpError(409, `Stok tidak cukup (tersedia ${fromMilli(have)}).`, "insufficient_stock");
      } else {
        if (b.unitCost) { assertCurrencyPrecision(b.unitCost, biz.currency); cost = toCents(b.unitCost); }
        if (cost <= 0n && b.reason === "opening") throw new HttpError(422, "Biaya satuan wajib diisi untuk stok awal.", "cost_required");
        const newAvg = weightedAvg(haveAll, toCents(p.avgCost), q, cost);
        await tx.update(products).set({ avgCost: fromCents(newAvg) }).where(eq(products.id, p.id));
      }
      await tx.insert(stockMovements).values({
        workspaceId: ctx.workspaceId, businessId: ctx.businessId, warehouseId: wh.id, productId: p.id,
        quantity: fromMilli(b.direction === "in" ? q : -q), unitCost: fromCents(cost), kind: b.reason === "opening" ? "opening" : "adjustment",
        refType: "adjustment", note: b.note ?? null, deviceId: ctx.deviceId,
      });
      const value = mulQty(fromMilli(q), fromCents(cost));
      if (value > 0n) {
        const inv = await accountBySubtype(tx, ctx.workspaceId, "inventory");
        const counter = b.direction === "in" && b.reason === "opening" ? await accountBySubtype(tx, ctx.workspaceId, "opening") : await accountBySubtype(tx, ctx.workspaceId, "variance");
        await postJournal(tx, ctx, {
          date: todayIn(biz.timezone), memo: `Penyesuaian stok ${p.sku}`, source: "adjustment", sourceId: p.id,
          lines: b.direction === "in" ? [{ accountId: inv, debit: fromCents(value) }, { accountId: counter, credit: fromCents(value) }] : [{ accountId: counter, debit: fromCents(value) }, { accountId: inv, credit: fromCents(value) }],
        });
      }
      await audit(tx, ctx, "stock.adjust", "product", p.id, { direction: b.direction, qty: b.quantity });
      return { ok: true };
    }));
  }),

  /* ───────── purchasing ───────── */
  r("GET", "/purchasing/orders", { perm: "purchasing:read" }, async ({ ctx }) => {
    const res = await db.execute(sql`
      select o.id, o.number, o.status, o.total::text as total, o.ordered_at as "orderedAt", s.name as "supplierName",
        (select json_agg(json_build_object('id', l.id, 'productName', p.name, 'quantity', l.quantity::text, 'receivedQty', l.received_qty::text, 'unitCost', l.unit_cost::text) order by p.name)
           from purchase_order_lines l join products p on p.id = l.product_id where l.po_id = o.id) as lines
      from purchase_orders o join suppliers s on s.id = o.supplier_id where o.workspace_id = ${ctx.workspaceId} order by o.ordered_at desc limit 100`);
    return { items: res.rows };
  }),

  r("POST", "/purchasing/orders", { perm: "purchasing:write" }, async ({ ctx, json }) => {
    const b = await json(z.object({
      supplierId: uuid, note: z.string().trim().max(300).optional().nullable(),
      lines: z.array(z.object({ productId: uuid, quantity: qtyS, unitCost: money })).min(1, "Tambahkan minimal satu barang").max(100),
    }));
    const biz = await getBusiness(db, ctx);
    for (const l of b.lines) assertCurrencyPrecision(l.unitCost, biz.currency);
    return db.transaction(async (tx) => {
      const [s] = await tx.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, b.supplierId), eq(suppliers.workspaceId, ctx.workspaceId), eq(suppliers.isActive, true)));
      if (!s) throw new HttpError(422, "Supplier tidak ditemukan.", "bad_supplier");
      const ids = [...new Set(b.lines.map((l) => l.productId))];
      const ps = await tx.select({ id: products.id }).from(products).where(and(inArray(products.id, ids), eq(products.workspaceId, ctx.workspaceId)));
      if (ps.length !== ids.length) throw new HttpError(422, "Ada produk yang tidak ditemukan.", "bad_product");
      let total = 0n;
      for (const l of b.lines) total += mulQty(l.quantity, l.unitCost);
      const number = await nextNumber(tx, ctx.workspaceId, "po", "PO");
      const [po] = await tx.insert(purchaseOrders).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, number, supplierId: b.supplierId, total: fromCents(total), note: b.note ?? null }).returning();
      await tx.insert(purchaseOrderLines).values(b.lines.map((l) => ({ workspaceId: ctx.workspaceId, poId: po.id, productId: l.productId, quantity: l.quantity, unitCost: l.unitCost })));
      await audit(tx, ctx, "po.create", "purchase_order", po.id, { number });
      return { id: po.id, number };
    });
  }),

  r("POST", "/purchasing/orders/:id/receive", { perm: "purchasing:write" }, async ({ ctx, params, json, idemKey }) => {
    const b = await json(z.object({ lines: z.array(z.object({ lineId: uuid, quantity: qtyS })).min(1).max(100) }));
    const biz = await getBusiness(db, ctx);
    return db.transaction((tx) => idempotent(tx, ctx, idemKey, async () => {
      if (!uuid.safeParse(params.id).success) throw new HttpError(404, "PO tidak ditemukan", "not_found");
      const [po] = await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, params.id), eq(purchaseOrders.workspaceId, ctx.workspaceId))).for("update");
      if (!po) throw new HttpError(404, "PO tidak ditemukan", "not_found");
      if (po.status === "received" || po.status === "cancelled") throw new HttpError(409, "PO tidak dapat menerima barang pada status ini.", "bad_status");
      const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, po.id));
      const wh = await defaultWarehouse(tx, ctx);
      const inventory = await accountBySubtype(tx, ctx.workspaceId, "inventory");
      let value = 0n;
      const merged = new Map<string, bigint>();
      for (const rl of b.lines) merged.set(rl.lineId, (merged.get(rl.lineId) ?? 0n) + toMilli(rl.quantity));
      const pids = lines.filter((l) => merged.has(l.id)).map((l) => l.productId).sort();
      if (pids.length !== merged.size) throw new HttpError(422, "Baris PO tidak valid.", "bad_line");
      const prods = await tx.select().from(products).where(and(inArray(products.id, [...new Set(pids)]), eq(products.workspaceId, ctx.workspaceId))).orderBy(products.id).for("update");
      const pmap = new Map(prods.map((p) => [p.id, p]));
      for (const l of lines) {
        const q = merged.get(l.id);
        if (!q) continue;
        const remaining = toMilli(l.quantity) - toMilli(l.receivedQty);
        if (q > remaining) throw new HttpError(422, `Penerimaan melebihi sisa pesanan (${fromMilli(remaining)}).`, "over_receive");
        const p = pmap.get(l.productId)!;
        const lineValue = mulQty(fromMilli(q), l.unitCost);
        value += lineValue;
        if (p.trackStock && p.kind === "product") {
          const haveAll = await onHandAll(tx, ctx.workspaceId, p.id);
          await tx.update(products).set({ avgCost: fromCents(weightedAvg(haveAll, toCents(p.avgCost), q, toCents(l.unitCost))) }).where(eq(products.id, p.id));
          await tx.insert(stockMovements).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, warehouseId: wh.id, productId: p.id, quantity: fromMilli(q), unitCost: l.unitCost, kind: "purchase_receipt", refType: "purchase_order", refId: po.id, deviceId: ctx.deviceId });
        }
        await tx.update(purchaseOrderLines).set({ receivedQty: fromMilli(toMilli(l.receivedQty) + q) }).where(eq(purchaseOrderLines.id, l.id));
      }
      // Pembelian tak berstok dicatat sebagai beban operasional.
      let stockValue = 0n;
      for (const l of lines) { const q = merged.get(l.id); if (!q) continue; const p = pmap.get(l.productId)!; if (p.trackStock && p.kind === "product") stockValue += mulQty(fromMilli(q), l.unitCost); }
      const nonStock = value - stockValue;
      const jl: JLine[] = [];
      if (stockValue > 0n) jl.push({ accountId: inventory, debit: fromCents(stockValue) });
      if (nonStock > 0n) jl.push({ accountId: await codeAccount(tx, ctx.workspaceId, "6101"), debit: fromCents(nonStock) });
      jl.push({ accountId: await accountBySubtype(tx, ctx.workspaceId, "payable"), credit: fromCents(value) });
      const jid = await postJournal(tx, ctx, { date: todayIn(biz.timezone), memo: `Penerimaan ${po.number}`, source: "purchase", sourceId: po.id, lines: jl });
      const billNo = await nextNumber(tx, ctx.workspaceId, "bill", "BILL");
      await tx.insert(supplierBills).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, number: billNo, supplierId: po.supplierId, poId: po.id, total: fromCents(value), journalId: jid });
      const after = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, po.id));
      const done = after.every((l) => toMilli(l.receivedQty) >= toMilli(l.quantity));
      await tx.update(purchaseOrders).set({ status: done ? "received" : "partial" }).where(eq(purchaseOrders.id, po.id));
      await audit(tx, ctx, "po.receive", "purchase_order", po.id, { bill: billNo, value: fromCents(value) });
      return { ok: true, bill: billNo, status: done ? "received" : "partial" };
    }));
  }),

  r("POST", "/purchasing/orders/:id/cancel", { perm: "purchasing:write" }, async ({ ctx, params }) => {
    await db.transaction(async (tx) => {
      const [po] = await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, params.id), eq(purchaseOrders.workspaceId, ctx.workspaceId))).for("update");
      if (!po) throw new HttpError(404, "PO tidak ditemukan", "not_found");
      if (po.status !== "ordered") throw new HttpError(409, "Hanya PO yang belum menerima barang yang dapat dibatalkan.", "bad_status");
      await tx.update(purchaseOrders).set({ status: "cancelled" }).where(eq(purchaseOrders.id, po.id));
      await audit(tx, ctx, "po.cancel", "purchase_order", po.id);
    });
    return { ok: true };
  }),

  r("GET", "/purchasing/bills", { perm: "purchasing:read" }, async ({ ctx }) => {
    const res = await db.execute(sql`
      select b.id, b.number, b.status, b.total::text as total, b.paid::text as paid, b.created_at as "createdAt", s.name as "supplierName"
      from supplier_bills b join suppliers s on s.id = b.supplier_id where b.workspace_id = ${ctx.workspaceId} order by b.created_at desc limit 100`);
    return { items: res.rows };
  }),

  // Pembayaran tagihan supplier mengurangi Utang Usaha (bukan beban lagi).
  r("POST", "/purchasing/bills/:id/payments", { perm: "purchasing:write" }, async ({ ctx, params, json, idemKey }) => {
    const b = await json(z.object({ accountId: uuid, amount: money }));
    const biz = await getBusiness(db, ctx);
    assertCurrencyPrecision(b.amount, biz.currency);
    return db.transaction((tx) => idempotent(tx, ctx, idemKey, async () => {
      if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Tagihan tidak ditemukan", "not_found");
      const [bill] = await tx.select().from(supplierBills).where(and(eq(supplierBills.id, params.id), eq(supplierBills.workspaceId, ctx.workspaceId))).for("update");
      if (!bill) throw new HttpError(404, "Tagihan tidak ditemukan", "not_found");
      const acc = (await cashAccountsMap(tx, ctx, [b.accountId])).get(b.accountId);
      if (!acc) throw new HttpError(422, "Akun pembayaran tidak valid.", "bad_account");
      const amt = toCents(b.amount), out = toCents(bill.total) - toCents(bill.paid);
      if (amt <= 0n) throw new HttpError(422, "Nominal harus lebih dari nol.");
      if (amt > out) throw new HttpError(422, `Pembayaran melebihi sisa tagihan (${fromCents(out)}).`, "overpay");
      const jid = await postJournal(tx, ctx, {
        date: todayIn(biz.timezone), memo: `Bayar ${bill.number}`, source: "bill_payment", sourceId: bill.id,
        lines: [{ accountId: await accountBySubtype(tx, ctx.workspaceId, "payable"), debit: fromCents(amt) }, { accountId: acc.coaAccountId, credit: fromCents(amt) }],
      });
      const np = toCents(bill.paid) + amt;
      await tx.update(supplierBills).set({ paid: fromCents(np), status: np === toCents(bill.total) ? "paid" : "partial" }).where(eq(supplierBills.id, bill.id));
      await tx.insert(payments).values({ workspaceId: ctx.workspaceId, businessId: ctx.businessId, billId: bill.id, accountId: acc.id, amount: fromCents(amt), journalId: jid, deviceId: ctx.deviceId });
      await audit(tx, ctx, "bill.payment", "supplier_bill", bill.id, { amount: fromCents(amt) });
      return { ok: true };
    }));
  }),
];

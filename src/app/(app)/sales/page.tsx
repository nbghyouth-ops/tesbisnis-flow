"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, Modal, PageHeader, SelectField, Tabs, TextField } from "@/components/ui";
import { api, fmtDateTime, newKey, toast, useApi } from "@/lib/client";
import { formatMoney, fromCents, mulQty, percentOf, toCents } from "@/lib/money";

export default function Sales() {
  const biz = useBiz();
  const [tab, setTab] = useState(biz.can("sales:write") ? "pos" : "inv");
  const tabs = [...(biz.can("sales:write") ? [{ key: "pos", label: "Kasir (POS)" }] : []), { key: "inv", label: "Faktur & Pembayaran" }];
  return (
    <>
      <PageHeader label="Business Operations" title="Penjualan & POS" desc="Checkout divalidasi server: stok, jurnal, piutang, dan HPP dibuat dalam satu transaksi database." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "pos" ? <Pos /> : <Invoices />}
    </>
  );
}

function Pos() {
  const biz = useBiz();
  const cur = biz.currency;
  const meta = useApi<any>("/sales/pos-meta");
  const prods = useApi<any>("/r/products?limit=500");
  const stock = useApi<any>(biz.can("inventory:read") ? "/inventory/stock" : null);
  const clients = useApi<any>(biz.can("crm:read") ? "/r/clients?limit=300" : null);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, string>>({});
  const [client, setClient] = useState(""); const [disc, setDisc] = useState(""); const [acc, setAcc] = useState(""); const [paid, setPaid] = useState<string | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [key, setKey] = useState(newKey());
  const [receipt, setReceipt] = useState<any>(null);

  const stockMap = useMemo(() => new Map<string, number>((stock.data?.items ?? []).map((s: any) => [s.id, Number(s.onHand)])), [stock.data]);
  const list: any[] = (prods.data?.items ?? []).filter((p: any) => p.isActive && (!q || `${p.name} ${p.sku} ${p.barcode ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const byId = new Map<string, any>((prods.data?.items ?? []).map((p: any) => [p.id, p]));
  const lines = Object.entries(cart).filter(([, v]) => Number(v) > 0);

  // pratinjau (server menghitung final)
  let subtotal = 0n;
  try { for (const [id, v] of lines) subtotal += mulQty(v, byId.get(id).price); } catch { /* input belum valid */ }
  let d = 0n; try { d = disc ? toCents(disc) : 0n; } catch { /* abaikan */ }
  const taxable = subtotal > d ? subtotal - d : 0n;
  const tax = percentOf(taxable, meta.data?.taxRate ?? "0");
  const total = taxable + tax;
  const payAmt = paid ?? fromCents(total).replace(/\.00$/, "");

  const add = (p: any) => setCart((c) => ({ ...c, [p.id]: String(Number(c[p.id] ?? 0) + 1) }));
  async function checkout() {
    setErr("");
    if (!lines.length) return setErr("Keranjang kosong.");
    const accountId = acc || meta.data?.accounts?.[0]?.id;
    const amt = Number(payAmt || 0);
    setBusy(true);
    try {
      const r = await api<any>("/sales/checkout", { idem: key, body: {
        clientId: client || undefined, discount: disc || undefined,
        lines: lines.map(([productId, quantity]) => ({ productId, quantity })),
        payments: amt > 0 ? [{ accountId, amount: payAmt }] : [],
      } });
      setReceipt(r); setCart({}); setDisc(""); setPaid(null); setClient(""); setKey(newKey()); stock.reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (prods.error) return <ErrorBox message={prods.error} onRetry={prods.reload} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card title="Pilih produk">
        <div className="mb-3"><label className="sr-only" htmlFor="pq">Cari produk</label><input id="pq" className="field-input" placeholder="Cari nama, SKU, atau scan barcode…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></div>
        {prods.loading && !prods.data ? <Loading /> : list.length === 0 ? <Empty title="Belum ada produk" hint="Tambahkan produk di menu Produk & Stok terlebih dahulu." /> : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{list.map((p) => {
            const oh = p.trackStock && p.kind === "product" ? stockMap.get(p.id) : undefined;
            const out = oh !== undefined && oh <= 0;
            return <li key={p.id}><button disabled={out} onClick={() => add(p)} className="flex h-full w-full flex-col items-start rounded-xl border border-line bg-white p-3 text-left hover:bg-primary-bg disabled:cursor-not-allowed disabled:opacity-50">
              <span className="text-sm font-semibold">{p.name}</span><span className="text-xs text-ink-2">{p.sku}{oh !== undefined ? ` · stok ${oh}` : ""}</span><span className="mt-1 text-sm font-bold tnum">{formatMoney(p.price, cur)}</span></button></li>;
          })}</ul>)}
      </Card>
      <Card title="Keranjang">
        {lines.length === 0 ? <p className="py-4 text-center text-sm text-ink-2">Ketuk produk untuk menambahkan.</p> : (
          <ul className="mb-3 grid gap-2">{lines.map(([id, v]) => (
            <li key={id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{byId.get(id)?.name}</span>
              <input aria-label={`Jumlah ${byId.get(id)?.name}`} className="field-input !min-h-[34px] !w-20 text-right" inputMode="decimal" value={v} onChange={(e) => setCart({ ...cart, [id]: e.target.value.replace(/[^\d.]/g, "") })} />
              <button aria-label="Hapus dari keranjang" className="px-2 text-lg text-ink-2 hover:text-[#A12A1F]" onClick={() => setCart((c) => { const n = { ...c }; delete n[id]; return n; })}>×</button></li>))}</ul>)}
        <div className="grid gap-3 border-t border-divider pt-3">
          {clients.data && <SelectField label="Pelanggan (wajib bila belum lunas)" value={client} onChange={setClient} placeholder="Tanpa pelanggan" options={clients.data.items.map((c: any) => ({ value: c.id, label: c.name }))} />}
          <TextField label="Diskon" inputMode="decimal" value={disc} onChange={(v) => setDisc(v.replace(/[^\d.]/g, ""))} />
          <dl className="grid grid-cols-2 gap-y-1 text-sm"><dt>Subtotal</dt><dd className="text-right tnum">{formatMoney(fromCents(subtotal), cur)}</dd><dt>Pajak ({meta.data?.taxRate ?? 0}%)</dt><dd className="text-right tnum">{formatMoney(fromCents(tax), cur)}</dd><dt className="font-bold">Total</dt><dd className="text-right text-lg font-bold tnum">{formatMoney(fromCents(total), cur)}</dd></dl>
          <SelectField label="Akun pembayaran" value={acc || meta.data?.accounts?.[0]?.id || ""} onChange={setAcc} options={(meta.data?.accounts ?? []).map((a: any) => ({ value: a.id, label: a.name }))} />
          <TextField label="Dibayar sekarang" inputMode="decimal" value={payAmt} onChange={(v) => setPaid(v.replace(/[^\d.]/g, ""))} help="Kurangi/kosongkan untuk mencatat sisa sebagai piutang (butuh pelanggan)." />
          {err && <p role="alert" className="rounded-lg bg-[#FDEDEB] px-3 py-2 text-sm text-[#7F1D14]">{err}</p>}
          <Button loading={busy} disabled={!lines.length} onClick={checkout} className="!min-h-[48px]">Proses pembayaran</Button>
          <p className="text-xs text-ink-2">Angka di atas pratinjau; server menghitung ulang final.</p>
        </div>
      </Card>
      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Transaksi berhasil">
        {receipt && <div className="grid gap-2 text-sm"><p className="text-lg font-bold">{receipt.number}</p><p>Total {formatMoney(receipt.total, cur)} · Dibayar {formatMoney(receipt.paid, cur)}</p><p>Status: <Badge status={receipt.status} /></p><div className="mt-3 flex justify-end"><Button onClick={() => setReceipt(null)}>Transaksi baru</Button></div></div>}
      </Modal>
    </div>
  );
}

function Invoices() {
  const biz = useBiz();
  const [status, setStatus] = useState("");
  const { data, error, loading, reload } = useApi<any>(`/sales/invoices${status ? `?status=${status}` : ""}`);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <Card title="Faktur">
      <div className="mb-4 max-w-xs"><SelectField label="Status" value={status} onChange={setStatus} placeholder="Semua" options={["unpaid", "partial", "paid", "reversed"].map((s) => ({ value: s, label: s }))} /></div>
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <DataTable rows={data.items} caption="Faktur" empty={<Empty title="Belum ada faktur" hint="Faktur dibuat otomatis saat checkout POS." />}
          columns={[{ key: "number", label: "No." }, { key: "issuedAt", label: "Waktu", render: (r: any) => fmtDateTime(r.issuedAt) }, { key: "clientName", label: "Pelanggan", render: (r: any) => r.clientName ?? "Umum" }, { key: "total", label: "Total", right: true, render: (r: any) => formatMoney(r.total, biz.currency) }, { key: "paid", label: "Dibayar", right: true, render: (r: any) => formatMoney(r.paid, biz.currency) }, { key: "status", label: "Status", render: (r: any) => <Badge status={r.status} /> }, { key: "a", label: "", render: (r: any) => <Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => setSel(r.id)}>Detail</Button> }]} />)}
      <InvoiceModal id={sel} onClose={() => setSel(null)} onChange={reload} />
    </Card>
  );
}

function InvoiceModal({ id, onClose, onChange }: { id: string | null; onClose: () => void; onChange: () => void }) {
  const biz = useBiz();
  const d = useApi<any>(id ? `/sales/invoices/${id}` : null);
  const accs = useApi<any>(id && biz.can("sales:write") ? "/sales/pos-meta" : null);
  const [acc, setAcc] = useState(""); const [amt, setAmt] = useState(""); const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  const inv = d.data?.invoice;
  const out = inv ? Number(inv.total) - Number(inv.paid) : 0;
  async function pay() { setErr(""); try { await api(`/sales/invoices/${id}/payments`, { idem: newKey(), body: { accountId: acc || accs.data?.accounts?.[0]?.id, amount: amt || String(out) } }); toast("Pembayaran dicatat"); setAmt(""); d.reload(); onChange(); } catch (e) { setErr((e as Error).message); } }
  async function reverse() { setErr(""); try { await api(`/sales/invoices/${id}/reverse`, { body: { reason } }); toast("Faktur dibalik (retur/refund penuh)"); setReason(""); d.reload(); onChange(); } catch (e) { setErr((e as Error).message); } }
  return (
    <Modal open={!!id} onClose={onClose} title={inv ? `Faktur ${inv.number}` : "Faktur"} wide>
      {!inv ? <Loading /> : (
        <div className="grid gap-4">
          <DataTable rows={d.data.lines} caption="Baris faktur" columns={[{ key: "description", label: "Item" }, { key: "quantity", label: "Qty", right: true, render: (l: any) => Number(l.quantity) }, { key: "unitPrice", label: "Harga", right: true, render: (l: any) => formatMoney(l.unitPrice, biz.currency) }, { key: "lineTotal", label: "Jumlah", right: true, render: (l: any) => formatMoney(l.lineTotal, biz.currency) }]} />
          <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-6 text-sm"><dt>Subtotal</dt><dd className="text-right tnum">{formatMoney(inv.subtotal, biz.currency)}</dd><dt>Diskon</dt><dd className="text-right tnum">{formatMoney(inv.discount, biz.currency)}</dd><dt>Pajak</dt><dd className="text-right tnum">{formatMoney(inv.tax, biz.currency)}</dd><dt className="font-bold">Total</dt><dd className="text-right font-bold tnum">{formatMoney(inv.total, biz.currency)}</dd><dt>Dibayar</dt><dd className="text-right tnum">{formatMoney(inv.paid, biz.currency)}</dd></dl>
          <p className="text-sm">Status: <Badge status={inv.status} /> · {inv.operator ? `oleh ${inv.operator}` : ""}</p>
          {err && <p role="alert" className="rounded-lg bg-[#FDEDEB] px-3 py-2 text-sm text-[#7F1D14]">{err}</p>}
          {(inv.status === "unpaid" || inv.status === "partial") && biz.can("sales:write") && (
            <div className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_auto]"><SelectField label="Akun" value={acc || accs.data?.accounts?.[0]?.id || ""} onChange={setAcc} options={(accs.data?.accounts ?? []).map((a: any) => ({ value: a.id, label: a.name }))} /><TextField label="Nominal" inputMode="decimal" value={amt || String(out)} onChange={(v) => setAmt(v.replace(/[^\d.]/g, ""))} /><div className="self-end"><Button onClick={pay}>Catat pembayaran</Button></div></div>)}
          {inv.status !== "reversed" && biz.can("finance:approve") && (
            <div className="grid gap-2 rounded-xl border border-[#E9B7B2] p-3 sm:grid-cols-[1fr_auto]"><TextField label="Retur/refund penuh — alasan" value={reason} onChange={setReason} help="Membalik jurnal penjualan & pembayaran dan mengembalikan stok." /><div className="self-end"><Button variant="danger" disabled={reason.trim().length < 3} onClick={reverse}>Balik faktur</Button></div></div>)}
        </div>)}
    </Modal>
  );
}

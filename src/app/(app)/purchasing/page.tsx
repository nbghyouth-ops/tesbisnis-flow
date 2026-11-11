"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { ResourcePage } from "@/components/resource-page";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, Modal, PageHeader, SelectField, Tabs, TextField } from "@/components/ui";
import { api, fmtDateTime, newKey, toast, useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";

export default function Purchasing() {
  const [tab, setTab] = useState("po");
  return (
    <>
      <PageHeader label="Business Operations" title="Pembelian & Supplier" desc="Penerimaan barang menambah stok (dengan biaya), mencatat Utang Usaha, dan membuat tagihan supplier." />
      <Tabs tabs={[{ key: "po", label: "Pesanan Pembelian" }, { key: "bills", label: "Tagihan Supplier" }, { key: "sup", label: "Direktori Supplier" }]} value={tab} onChange={setTab} />
      {tab === "po" && <Orders />}
      {tab === "bills" && <Bills />}
      {tab === "sup" && <ResourcePage resource="suppliers" />}
    </>
  );
}

function Orders() {
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>("/purchasing/orders");
  const sups = useApi<any>("/r/suppliers?limit=300"); const prods = useApi<any>("/r/products?limit=500");
  const [open, setOpen] = useState(false);
  const [sup, setSup] = useState(""); const [lines, setLines] = useState([{ productId: "", quantity: "", unitCost: "" }]); const [err, setErr] = useState("");
  const [rcv, setRcv] = useState<any | null>(null); const [rq, setRq] = useState<Record<string, string>>({}); const [key, setKey] = useState(newKey());
  const setLine = (i: number, k: string, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  async function create() {
    setErr("");
    try { await api("/purchasing/orders", { body: { supplierId: sup, lines: lines.filter((l) => l.productId) } }); toast("PO dibuat"); setOpen(false); setLines([{ productId: "", quantity: "", unitCost: "" }]); reload(); } catch (e) { setErr((e as Error).message); }
  }
  async function receive() {
    setErr("");
    const ls = Object.entries(rq).filter(([, v]) => Number(v) > 0).map(([lineId, quantity]) => ({ lineId, quantity }));
    try { const r = await api<any>(`/purchasing/orders/${rcv.id}/receive`, { idem: key, body: { lines: ls } }); toast(`Diterima — tagihan ${r.bill}`); setRcv(null); setRq({}); setKey(newKey()); reload(); } catch (e) { setErr((e as Error).message); }
  }
  async function cancel(id: string) { if (!confirm("Batalkan PO ini?")) return; try { await api(`/purchasing/orders/${id}/cancel`, { body: {} }); reload(); } catch (e) { toast((e as Error).message, "err"); } }
  return (
    <Card title="Pesanan Pembelian" actions={biz.can("purchasing:write") ? <Button onClick={() => { setOpen(true); setErr(""); }}>+ Buat PO</Button> : undefined}>
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <DataTable rows={data.items} caption="PO" empty={<Empty title="Belum ada pesanan pembelian" hint="Tambahkan supplier dan produk, lalu buat PO pertama." />} columns={[{ key: "number", label: "No." }, { key: "orderedAt", label: "Tanggal", render: (o: any) => fmtDateTime(o.orderedAt) }, { key: "supplierName", label: "Supplier" }, { key: "lines", label: "Item", render: (o: any) => <ul className="text-xs">{(o.lines ?? []).map((l: any) => <li key={l.id}>{l.productName}: {Number(l.receivedQty)}/{Number(l.quantity)}</li>)}</ul> }, { key: "total", label: "Total", right: true, render: (o: any) => formatMoney(o.total, biz.currency) }, { key: "status", label: "Status", render: (o: any) => <Badge status={o.status} /> }, { key: "a", label: "", render: (o: any) => biz.can("purchasing:write") && (o.status === "ordered" || o.status === "partial") ? <div className="flex gap-1.5"><Button variant="secondary" className="!min-h-[32px] !px-2" onClick={() => { setRcv(o); setRq({}); setErr(""); }}>Terima barang</Button>{o.status === "ordered" && <Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => cancel(o.id)}>Batal</Button>}</div> : null }]} />)}
      <Modal open={open} onClose={() => setOpen(false)} title="Buat Pesanan Pembelian" wide>
        <div className="grid gap-3">
          <SelectField label="Supplier" value={sup} onChange={setSup} placeholder="Pilih supplier" options={(sups.data?.items ?? []).filter((s: any) => s.isActive).map((s: any) => ({ value: s.id, label: s.name }))} />
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <SelectField label="Produk" value={l.productId} onChange={(v) => setLine(i, "productId", v)} placeholder="Pilih produk" options={(prods.data?.items ?? []).filter((p: any) => p.isActive).map((p: any) => ({ value: p.id, label: `${p.name} (${p.sku})` }))} />
              <TextField label="Qty" inputMode="decimal" value={l.quantity} onChange={(v) => setLine(i, "quantity", v.replace(/[^\d.]/g, ""))} /><TextField label="Biaya satuan" inputMode="decimal" value={l.unitCost} onChange={(v) => setLine(i, "unitCost", v.replace(/[^\d.]/g, ""))} />
              <div className="self-end">{lines.length > 1 && <Button variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Hapus</Button>}</div>
            </div>))}
          <div><Button variant="secondary" onClick={() => setLines([...lines, { productId: "", quantity: "", unitCost: "" }])}>+ Tambah baris</Button></div>
          {err && <p role="alert" className="text-sm text-[#A12A1F]">{err}</p>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button><Button onClick={create} disabled={!sup}>Simpan PO</Button></div>
        </div>
      </Modal>
      <Modal open={!!rcv} onClose={() => setRcv(null)} title={`Terima barang — ${rcv?.number ?? ""}`}>
        {rcv && <div className="grid gap-3">
          <p className="text-sm text-ink-2">Penerimaan parsial didukung. Isi jumlah yang diterima sekarang.</p>
          {rcv.lines.map((l: any) => <TextField key={l.id} label={`${l.productName} (sisa ${Number(l.quantity) - Number(l.receivedQty)})`} inputMode="decimal" value={rq[l.id] ?? ""} onChange={(v) => setRq({ ...rq, [l.id]: v.replace(/[^\d.]/g, "") })} />)}
          {err && <p role="alert" className="text-sm text-[#A12A1F]">{err}</p>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRcv(null)}>Batal</Button><Button onClick={receive}>Catat penerimaan</Button></div>
        </div>}
      </Modal>
    </Card>
  );
}

function Bills() {
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>("/purchasing/bills");
  const accs = useApi<any>("/finance/cash-accounts");
  const [pay, setPay] = useState<any | null>(null); const [acc, setAcc] = useState(""); const [amt, setAmt] = useState(""); const [err, setErr] = useState("");
  const list: any[] = (accs.data?.items ?? []).filter((a: any) => a.isActive);
  async function go() {
    setErr(""); const out = Number(pay.total) - Number(pay.paid);
    try { await api(`/purchasing/bills/${pay.id}/payments`, { idem: newKey(), body: { accountId: acc || list[0]?.id, amount: amt || String(out) } }); toast("Pembayaran dicatat"); setPay(null); setAmt(""); reload(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Card title="Tagihan Supplier">
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <DataTable rows={data.items} caption="Tagihan" empty={<Empty title="Belum ada tagihan" hint="Tagihan dibuat otomatis saat barang diterima dari PO." />} columns={[{ key: "number", label: "No." }, { key: "createdAt", label: "Tanggal", render: (b: any) => fmtDateTime(b.createdAt) }, { key: "supplierName", label: "Supplier" }, { key: "total", label: "Total", right: true, render: (b: any) => formatMoney(b.total, biz.currency) }, { key: "paid", label: "Dibayar", right: true, render: (b: any) => formatMoney(b.paid, biz.currency) }, { key: "status", label: "Status", render: (b: any) => <Badge status={b.status} /> }, { key: "a", label: "", render: (b: any) => b.status !== "paid" && biz.can("purchasing:write") ? <Button variant="secondary" className="!min-h-[32px] !px-2" onClick={() => { setPay(b); setErr(""); }}>Bayar</Button> : null }]} />)}
      <Modal open={!!pay} onClose={() => setPay(null)} title={`Bayar ${pay?.number ?? ""}`}>
        {pay && <div className="grid gap-3"><SelectField label="Akun pembayaran" value={acc || list[0]?.id || ""} onChange={setAcc} options={list.map((a) => ({ value: a.id, label: a.name }))} /><TextField label="Nominal" inputMode="decimal" value={amt || String(Number(pay.total) - Number(pay.paid))} onChange={(v) => setAmt(v.replace(/[^\d.]/g, ""))} help="Mengurangi Utang Usaha, bukan mencatat beban lagi." />{err && <p role="alert" className="text-sm text-[#A12A1F]">{err}</p>}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPay(null)}>Batal</Button><Button onClick={go}>Catat pembayaran</Button></div></div>}
      </Modal>
    </Card>
  );
}

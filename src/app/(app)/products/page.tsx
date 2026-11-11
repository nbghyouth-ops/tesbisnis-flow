"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { ResourcePage } from "@/components/resource-page";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, Modal, PageHeader, SelectField, Tabs, TextField } from "@/components/ui";
import { api, fmtDateTime, newKey, toast, useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";

export default function Products() {
  const [tab, setTab] = useState("catalog");
  return (
    <>
      <PageHeader label="Business Operations" title="Produk & Stok" desc="Stok berasal dari ledger pergerakan append-only; biaya memakai rata-rata bergerak." />
      <Tabs tabs={[{ key: "catalog", label: "Katalog" }, { key: "stock", label: "Stok & Nilai" }, { key: "moves", label: "Ledger Pergerakan" }]} value={tab} onChange={setTab} />
      {tab === "catalog" && <ResourcePage resource="products" hint="Layanan tidak melacak stok. Varian (ukuran/warna) dicatat sebagai SKU terpisah." />}
      {tab === "stock" && <Stock />}
      {tab === "moves" && <Moves />}
    </>
  );
}

function Stock() {
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>("/inventory/stock");
  const [adj, setAdj] = useState<any | null>(null);
  const [f, setF] = useState({ direction: "in", quantity: "", reason: "adjustment", unitCost: "", note: "" });
  const [err, setErr] = useState(""); const [key, setKey] = useState(newKey());
  async function save() {
    setErr("");
    try { await api("/inventory/adjust", { idem: key, body: { productId: adj.id, direction: f.direction, quantity: f.quantity, reason: f.direction === "out" ? "adjustment" : f.reason, unitCost: f.unitCost || undefined, note: f.note || undefined } }); toast("Stok disesuaikan"); setAdj(null); setKey(newKey()); reload(); }
    catch (e) { setErr((e as Error).message); }
  }
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const total = data.items.reduce((s: number, i: any) => s + Number(i.value), 0);
  return (
    <Card title="Stok & Nilai Persediaan" desc="Hanya produk yang melacak stok.">
      <DataTable rows={data.items} caption="Stok" empty={<Empty title="Belum ada produk berstok" hint="Tambahkan produk di tab Katalog, lalu catat stok awal di sini atau lewat Pembelian." />}
        columns={[{ key: "sku", label: "SKU" }, { key: "name", label: "Produk" }, { key: "onHand", label: "Stok", right: true, render: (i: any) => <span>{Number(i.onHand)} {i.unit} {Number(i.reorderLevel) > 0 && Number(i.onHand) <= Number(i.reorderLevel) && <Badge tone="warn">Reorder</Badge>}</span> }, { key: "avgCost", label: "Biaya rata-rata", right: true, render: (i: any) => formatMoney(i.avgCost, biz.currency) }, { key: "value", label: "Nilai", right: true, render: (i: any) => formatMoney(i.value, biz.currency) }, { key: "a", label: "", render: (i: any) => biz.can("inventory:write") ? <Button variant="secondary" className="!min-h-[32px] !px-2" onClick={() => { setAdj(i); setErr(""); setF({ direction: "in", quantity: "", reason: Number(i.onHand) === 0 ? "opening" : "adjustment", unitCost: "", note: "" }); }}>Sesuaikan</Button> : null }]} />
      {data.items.length > 0 && <p className="mt-3 text-right text-sm font-semibold">Total nilai persediaan: {formatMoney(total, biz.currency)}</p>}
      <Modal open={!!adj} onClose={() => setAdj(null)} title={`Penyesuaian stok — ${adj?.name ?? ""}`}>
        <div className="grid gap-3">
          <SelectField label="Arah" value={f.direction} onChange={(v) => setF({ ...f, direction: v })} options={[{ value: "in", label: "Tambah stok" }, { value: "out", label: "Kurangi stok (rusak/hilang/limbah)" }]} />
          {f.direction === "in" && <SelectField label="Alasan" value={f.reason} onChange={(v) => setF({ ...f, reason: v })} options={[{ value: "opening", label: "Stok awal" }, { value: "adjustment", label: "Koreksi hasil hitung" }]} />}
          <TextField label="Kuantitas" inputMode="decimal" value={f.quantity} onChange={(v) => setF({ ...f, quantity: v.replace(/[^\d.]/g, "") })} />
          {f.direction === "in" && <TextField label="Biaya per satuan" inputMode="decimal" value={f.unitCost} onChange={(v) => setF({ ...f, unitCost: v.replace(/[^\d.]/g, "") })} help="Wajib untuk stok awal. Hanya isi bila nilainya diketahui." />}
          <TextField label="Catatan" value={f.note} onChange={(v) => setF({ ...f, note: v })} />
          {err && <p role="alert" className="text-sm text-[#A12A1F]">{err}</p>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAdj(null)}>Batal</Button><Button onClick={save} disabled={!f.quantity}>Simpan</Button></div>
        </div>
      </Modal>
    </Card>
  );
}

function Moves() {
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>("/inventory/movements");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const L: Record<string, string> = { purchase_receipt: "Penerimaan pembelian", sale: "Penjualan", sale_reversal: "Retur penjualan", adjustment: "Penyesuaian", opening: "Stok awal" };
  return (
    <Card title="Ledger Pergerakan Stok" desc="200 pergerakan terakhir. Tidak dapat diubah atau dihapus.">
      <DataTable rows={data.items} caption="Pergerakan stok" empty={<Empty title="Belum ada pergerakan stok" />} columns={[{ key: "createdAt", label: "Waktu", render: (m: any) => fmtDateTime(m.createdAt) }, { key: "productName", label: "Produk" }, { key: "kind", label: "Jenis", render: (m: any) => L[m.kind] ?? m.kind }, { key: "quantity", label: "Qty", right: true, render: (m: any) => <span className={Number(m.quantity) < 0 ? "text-[#A12A1F]" : ""}>{Number(m.quantity)}</span> }, { key: "unitCost", label: "Biaya satuan", right: true, render: (m: any) => formatMoney(m.unitCost, biz.currency) }, { key: "warehouseName", label: "Gudang" }]} />
    </Card>
  );
}

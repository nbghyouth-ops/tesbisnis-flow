"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, PageHeader, TextArea, TextField } from "@/components/ui";
import { api, toast } from "@/lib/client";

export default function Settings() {
  const biz = useBiz();
  const b = biz.business; const s = b.settings ?? {};
  const [f, setF] = useState({ name: b.name, legalName: b.legalName ?? "", tradeName: b.tradeName ?? "", slogan: b.slogan ?? "", description: b.description ?? "", address: b.address ?? "", taxRate: String(s.taxRate ?? "0"), approvalThreshold: String(s.approvalThreshold ?? "0") });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [br, setBr] = useState(""); const [wh, setWh] = useState("");
  useEffect(() => setErr(""), [f]);
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    try { await api("/business", { method: "PATCH", body: { ...f, legalName: f.legalName || null, tradeName: f.tradeName || null, slogan: f.slogan || null, description: f.description || null, address: f.address || null } }); toast("Pengaturan disimpan"); biz.reload(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function add(path: string, body: any, reset: () => void) { try { await api(path, { body }); toast("Ditambahkan"); reset(); biz.reload(); } catch (e) { toast((e as Error).message, "err"); } }
  return (
    <>
      <PageHeader label="Configuration" title="Pengaturan & Data Master" desc="Profil bisnis, aturan bisnis (tarif pajak, ambang persetujuan), cabang, dan gudang." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profil bisnis">
          <div className="grid gap-3"><TextField label="Nama bisnis" value={f.name} onChange={set("name")} /><TextField label="Nama badan hukum" value={f.legalName} onChange={set("legalName")} /><TextField label="Nama dagang" value={f.tradeName} onChange={set("tradeName")} /><TextField label="Slogan" value={f.slogan} onChange={set("slogan")} /><TextArea label="Deskripsi" value={f.description} onChange={set("description")} /><TextArea label="Alamat" value={f.address} onChange={set("address")} />
            <p className="text-xs text-ink-2">Mata uang ({b.currency}), zona waktu ({b.timezone}), dan format tanggal ditetapkan saat onboarding dan tidak diubah di sini agar riwayat transaksi konsisten.</p></div>
        </Card>
        <div className="grid content-start gap-6">
          <Card title="Aturan bisnis" desc="Presedensi: Platform → Workspace → Bisnis → Cabang → Modul. Saat ini aturan tingkat Bisnis berikut tersedia.">
            <div className="grid gap-3"><TextField label="Tarif pajak penjualan (%)" inputMode="decimal" value={f.taxRate} onChange={(v) => set("taxRate")(v.replace(/[^\d.]/g, ""))} help="Diterapkan pada checkout POS. Isi 0 bila tidak memungut pajak." /><TextField label={`Ambang persetujuan pengeluaran (${b.currency})`} inputMode="numeric" value={f.approvalThreshold} onChange={(v) => set("approvalThreshold")(v.replace(/\D/g, ""))} help="Pengeluaran ≥ nilai ini menunggu persetujuan. 0 = tanpa persetujuan." /></div>
          </Card>
          {err && <p role="alert" className="rounded-lg bg-[#FDEDEB] px-3 py-2 text-sm text-[#7F1D14]">{err}</p>}
          <div><Button loading={busy} onClick={save}>Simpan pengaturan</Button></div>
        </div>
        <Card title="Cabang">
          <DataTable rows={biz.branches} caption="Cabang" columns={[{ key: "name", label: "Nama" }, { key: "code", label: "Kode" }, { key: "isMain", label: "", render: (r: any) => r.isMain ? <Badge tone="info">Utama</Badge> : null }]} />
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void add("/branches", { name: br }, () => setBr("")); }}><input aria-label="Nama cabang baru" className="field-input" placeholder="Nama cabang baru" value={br} onChange={(e) => setBr(e.target.value)} /><Button type="submit" disabled={!br.trim()}>Tambah</Button></form>
        </Card>
        <Card title="Gudang">
          <DataTable rows={biz.warehouses} caption="Gudang" columns={[{ key: "name", label: "Nama" }, { key: "isDefault", label: "", render: (r: any) => r.isDefault ? <Badge tone="info">Utama</Badge> : null }]} />
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void add("/warehouses", { name: wh }, () => setWh("")); }}><input aria-label="Nama gudang baru" className="field-input" placeholder="Nama gudang baru" value={wh} onChange={(e) => setWh(e.target.value)} /><Button type="submit" disabled={!wh.trim()}>Tambah</Button></form>
          <p className="mt-2 text-xs text-ink-2">Transfer stok antar gudang belum tersedia; penjualan dan penerimaan memakai gudang utama.</p>
        </Card>
      </div>
    </>
  );
}

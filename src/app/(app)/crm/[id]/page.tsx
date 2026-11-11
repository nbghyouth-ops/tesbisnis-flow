"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ResourcePage } from "@/components/resource-page";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Kpi, Loading, PageHeader, SelectField, Tabs } from "@/components/ui";
import { api, fmtDate, fmtDateTime, toast, useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>(`/crm/clients/${id}`);
  const [tab, setTab] = useState("profile");
  const [status, setStatus] = useState("");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const c = data.client; const m = (v: string) => formatMoney(v, biz.currency);
  const tabs = [["profile", "Profil"], ["contacts", "Kontak"], ["activities", "Aktivitas & Catatan"], ["invoices", "Faktur & Pembayaran"], ["bookings", "Booking"], ["projects", "Proyek"], ["docs", "Dokumen"], ...(biz.can("audit:read") ? [["audit", "Audit"]] : []), ["privacy", "Privasi & Siklus Data"]].map(([key, label]) => ({ key, label }));

  async function lifecycle() {
    try { await api(`/r/clients/${id}`, { method: "PATCH", body: { status } }); toast("Status diperbarui"); reload(); } catch (e) { toast((e as Error).message, "err"); }
  }
  return (
    <>
      <PageHeader label="CRM / Klien" title={c.name} desc={`${c.code} · ${c.type === "organization" ? "Organisasi" : "Perorangan"}`} actions={<Link href="/crm" className="text-sm font-semibold text-primary-deep">← Direktori</Link>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi label="Total ditagih" value={m(data.financial.billed)} /><Kpi label="Total dibayar" value={m(data.financial.paid)} /><Kpi label="Piutang" value={m(data.financial.outstanding)} tone={Number(data.financial.outstanding) > 0 ? "bad" : undefined} />
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "profile" && (
        <Card title="Profil"><dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {[["Nama badan hukum", c.legalName], ["Telepon", c.phone], ["Email", c.email], ["Industri", c.industry], ["Sumber", c.source], ["Status", c.status], ["Aktivitas terakhir", c.lastActivityAt && fmtDateTime(c.lastActivityAt)], ["Alamat", c.address], ["Catatan", c.notes]].map(([k, v]) => <div key={k as string}><dt className="text-xs text-ink-2">{k}</dt><dd className="font-medium">{(v as string) || "—"}</dd></div>)}
        </dl>{biz.can("crm:write") && <p className="mt-4 text-xs text-ink-2">Ubah data profil lewat Direktori Klien → Ubah.</p>}</Card>)}
      {tab === "contacts" && <ResourcePage resource="client-contacts" fixed={{ clientId: id }} hint="Satu organisasi dapat memiliki banyak kontak." />}
      {tab === "activities" && <ResourcePage resource="client-activities" fixed={{ clientId: id }} hint="Catatan internal hanya terlihat oleh perangkat dengan izin tulis CRM." />}
      {tab === "invoices" && (
        <div className="grid gap-4">
          <Card title="Faktur"><DataTable rows={data.invoices} caption="Faktur klien" empty={<Empty title="Belum ada faktur" />} columns={[{ key: "number", label: "No." }, { key: "issuedAt", label: "Tanggal", render: (i: any) => fmtDate(i.issuedAt) }, { key: "total", label: "Total", right: true, render: (i: any) => m(i.total) }, { key: "paid", label: "Dibayar", right: true, render: (i: any) => m(i.paid) }, { key: "status", label: "Status", render: (i: any) => <Badge status={i.status} /> }]} /></Card>
          <Card title="Pembayaran"><DataTable rows={data.payments} caption="Pembayaran klien" empty={<Empty title="Belum ada pembayaran" />} columns={[{ key: "paidAt", label: "Tanggal", render: (p: any) => fmtDateTime(p.paidAt) }, { key: "number", label: "Faktur" }, { key: "accountName", label: "Akun" }, { key: "amount", label: "Nominal", right: true, render: (p: any) => m(p.amount) }, { key: "reversed", label: "", render: (p: any) => p.reversed ? <Badge tone="bad">dibalik</Badge> : null }]} /></Card>
        </div>)}
      {tab === "bookings" && <Card title="Booking"><DataTable rows={data.bookings} caption="Booking klien" empty={<Empty title="Belum ada booking" />} columns={[{ key: "startsAt", label: "Mulai", render: (b: any) => fmtDateTime(b.startsAt) }, { key: "service", label: "Layanan" }, { key: "status", label: "Status", render: (b: any) => <Badge status={b.status} /> }]} /></Card>}
      {tab === "projects" && <Card title="Proyek"><DataTable rows={data.projects} caption="Proyek klien" empty={<Empty title="Belum ada proyek" />} columns={[{ key: "name", label: "Proyek" }, { key: "status", label: "Status", render: (p: any) => <Badge status={p.status} /> }, { key: "progress", label: "Progres", right: true, render: (p: any) => `${p.progress}%` }]} /></Card>}
      {tab === "docs" && <Empty title="Dokumen klien belum tersedia" hint="Penyimpanan file memerlukan Neon Object Storage privat dan Neon Functions yang harus dikonfigurasi pemilik. Lihat docs/deployment/OBJECT_STORAGE_SETUP.md. Sampai saat itu tidak ada tombol unggah agar tidak menyesatkan." />}
      {tab === "audit" && <Card title="Riwayat Audit"><DataTable rows={data.audit} caption="Audit klien" empty={<Empty title="Belum ada riwayat" />} columns={[{ key: "createdAt", label: "Waktu", render: (a: any) => fmtDateTime(a.createdAt) }, { key: "action", label: "Aksi" }, { key: "operator", label: "Operator (pilihan perangkat)", render: (a: any) => a.operator ?? "—" }]} /></Card>}
      {tab === "privacy" && (
        <Card title="Privasi & Siklus Data" desc="Penghapusan tidak boleh merusak jurnal, faktur, dan transaksi historis; gunakan arsip/pembatasan.">
          {biz.can("crm:write") ? (
            <div className="grid max-w-md gap-3"><SelectField label="Status data klien" value={status || c.status} onChange={setStatus} options={[{ value: "active", label: "Aktif" }, { value: "inactive", label: "Tidak aktif" }, { value: "restricted", label: "Dibatasi (pemrosesan dibatasi)" }, { value: "archived", label: "Diarsipkan" }, { value: "pending_deletion", label: "Menunggu penghapusan (permintaan subjek data)" }]} /><div><Button onClick={lifecycle} disabled={!status || status === c.status}>Simpan status</Button></div></div>
          ) : <p className="text-sm">Status: <Badge status={c.status} /></p>}
          <p className="mt-4 text-xs text-ink-2">Pencatatan permintaan subjek data lengkap (consent, withdrawal) belum tersedia sebagai modul tersendiri; gunakan catatan internal dan status di atas, lalu konsultasikan kewajiban UU PDP dengan penasihat hukum.</p>
        </Card>)}
    </>
  );
}

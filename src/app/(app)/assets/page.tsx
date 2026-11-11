"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourcePage } from "@/components/resource-page";
import { useBiz } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/money";

export default function Assets() {
  const biz = useBiz();
  const extra = [{ key: "dep", label: "Penyusutan/bulan (garis lurus)", right: true, render: (r: any) => Number(r.cost) > 0 && r.usefulLifeMonths ? formatMoney(Math.round(Number(r.cost) / r.usefulLifeMonths), biz.currency) : "—" }];
  return (
    <>
      <PageHeader label="Management" title="Aset & Dokumen" desc="Register aset dengan perhitungan penyusutan garis lurus sebagai informasi. Jurnal penyusutan otomatis belum tersedia." />
      <ResourcePage resource="assets" extraColumns={extra} />
      <Card title="Dokumen" className="mt-6"><p className="text-sm text-ink-2">Manajemen dokumen (unggah, versi, retensi) memerlukan Neon Object Storage privat dan Neon Functions yang harus dikonfigurasi pemilik. Fitur ini belum aktif, sehingga tidak ada tombol unggah. Lihat <code>docs/deployment/OBJECT_STORAGE_SETUP.md</code>.</p></Card>
    </>
  );
}

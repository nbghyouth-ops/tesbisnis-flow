"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useState } from "react";
import { DualBarChart } from "@/components/charts";
import { QuickTx } from "@/components/quick-tx";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, Empty, ErrorBox, Kpi, Loading, PageHeader, TextField } from "@/components/ui";
import { downloadCsv, fmtDateTime, toInputDate, useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";

const ACTION_LABEL: Record<string, string> = { "transaction.posted": "Transaksi diposting", "transaction.draft": "Draf transaksi", "transaction.pending_approval": "Menunggu persetujuan", "transaction.reversed": "Transaksi dibalik", "sale.checkout": "Penjualan", create: "Data dibuat", update: "Data diubah", "invoice.payment": "Pembayaran faktur", "po.receive": "Penerimaan barang", "stock.adjust": "Penyesuaian stok", "workspace.create": "Bisnis dibuat" };

export default function Dashboard() {
  const biz = useBiz();
  const d0 = new Date(); const f0 = new Date(); f0.setDate(f0.getDate() - 29);
  const [from, setFrom] = useState(toInputDate(f0));
  const [to, setTo] = useState(toInputDate(d0));
  const { data, error, loading, reload } = useApi<any>(`/dashboard?from=${from}&to=${to}`);
  const [qt, setQt] = useState(false);
  const cur = biz.currency;
  const fin = data?.finance;
  const series: any[] = fin?.series ?? [];
  const m = (v: string) => formatMoney(v, cur);

  const exportCsv = () => {
    if (!fin) return;
    downloadCsv(`ringkasan-${from}_${to}.csv`, [{ key: "day", label: "Tanggal" }, { key: "income", label: "Pendapatan" }, { key: "expense", label: "Beban" }], series);
  };

  return (
    <>
      <PageHeader label="Overview" title="Dashboard Bisnis" desc={`${biz.business.name} — angka dihitung dari jurnal & transaksi nyata untuk rentang tanggal terpilih.`}
        actions={<>
          <TextField label="Dari" type="date" value={from} onChange={setFrom} max={to} />
          <TextField label="Sampai" type="date" value={to} onChange={setTo} min={from} />
          {fin && <Button variant="secondary" onClick={exportCsv} disabled={!series.length}>Ekspor CSV</Button>}
        </>} />

      <div data-tour="quick" className="mb-6 flex flex-wrap gap-2">
        {biz.can("finance:write") && <Button onClick={() => setQt(true)}>+ Transaksi Cepat</Button>}
        {biz.can("sales:write") && <Link href="/sales" className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold hover:bg-primary-bg">Penjualan baru (POS)</Link>}
        {biz.can("crm:write") && <Link href="/crm" className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold hover:bg-primary-bg">Tambah klien</Link>}
        {biz.can("tasks:write") && <Link href="/tasks" className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold hover:bg-primary-bg">Buat tugas</Link>}
      </div>

      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : data && (
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="grid content-start gap-6">
            {fin && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label="Saldo Kas & Bank" value={m(fin.cashTotal)} hint="Semua akun kas/bank (jurnal posted)" />
                <Kpi label="Pendapatan" value={m(fin.income)} hint="Periode terpilih" />
                <Kpi label="Beban" value={m(fin.expense)} hint="Periode terpilih (termasuk HPP)" />
                <Kpi label="Arus Kas Bersih" value={m(fin.netCashflow)} tone={Number(fin.netCashflow) < 0 ? "bad" : undefined} hint="Perubahan saldo kas/bank; transfer antar akun netral" />
              </div>
            )}
            {fin && (
              <Card title="Pendapatan vs Beban" desc={`Per hari, ${from} s.d. ${to}. Sumber data: jurnal akuntansi.`}>
                {series.length === 0 ? <Empty title="Belum ada transaksi pada periode ini" hint="Catat pemasukan atau penjualan pertama Anda agar grafik muncul." action={biz.can("finance:write") ? <Button onClick={() => setQt(true)}>+ Transaksi Cepat</Button> : undefined} /> :
                  <DualBarChart currency={cur} aLabel="Pendapatan" bLabel="Beban" data={series.map((s) => ({ label: s.day, a: Number(s.income), b: Number(s.expense) }))}
                    summary={`Grafik batang pendapatan dan beban harian. Total pendapatan ${m(fin.income)}, total beban ${m(fin.expense)}.`} />}
              </Card>
            )}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {fin && <Kpi label="Piutang Usaha" value={m(fin.receivables.v)} hint={`${fin.receivables.n} faktur belum lunas`} />}
              {fin && <Kpi label="Utang Usaha" value={m(fin.payables.v)} hint={`${fin.payables.n} tagihan supplier`} />}
              {data.sales && <Kpi label="Penjualan (periode)" value={m(data.sales.v)} hint={`${data.sales.n} faktur`} />}
              {data.tasks && <Kpi label="Tugas terbuka" value={String(data.tasks.open)} hint={`${data.tasks.overdue} lewat tenggat`} tone={data.tasks.overdue > 0 ? "bad" : undefined} />}
              {data.bookingsToday !== undefined && <Kpi label="Booking hari ini" value={String(data.bookingsToday)} />}
            </div>
            {fin && series.length === 0 && Number(data.sales?.n ?? 0) === 0 && (
              <Card title={`Langkah awal untuk ${biz.template.name}`} desc="Dari konfigurasi template bisnis Anda.">
                <ol className="grid gap-2">{biz.template.workflow.map((w: any, i: number) => <li key={i}><Link href={w.href} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm font-medium hover:bg-primary-bg"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary-bg text-xs font-bold text-primary-deep">{i + 1}</span>{w.text}</Link></li>)}</ol>
              </Card>
            )}
          </div>

          <aside aria-label="Insight" className="grid content-start gap-4">
            {fin && fin.pendingApprovals > 0 && <Card title="Menunggu persetujuan"><p className="text-sm">{fin.pendingApprovals} pengeluaran menunggu persetujuan.</p><Link href="/finance" className="mt-2 inline-block text-sm font-semibold text-primary-deep">Buka Keuangan →</Link></Card>}
            {fin && Number(fin.budget.budget) > 0 && (
              <Card title="Penggunaan anggaran bulan ini">
                <p className="kpi-value text-xl font-bold">{Math.round((Number(fin.budget.actual) / Number(fin.budget.budget)) * 100)}%</p>
                <p className="text-xs text-ink-2">{m(fin.budget.actual)} dari {m(fin.budget.budget)}</p>
                <div className="mt-2 h-2 rounded-full bg-line"><div className={`h-2 rounded-full ${Number(fin.budget.actual) > Number(fin.budget.budget) ? "bg-coral" : "bg-primary"}`} style={{ width: `${Math.min(100, (Number(fin.budget.actual) / Number(fin.budget.budget)) * 100)}%` }} /></div>
              </Card>)}
            {data.lowStock?.length > 0 && (
              <Card title="Stok menipis"><ul className="grid gap-1.5 text-sm">{data.lowStock.map((p: any) => <li key={p.id} className="flex justify-between gap-2"><span>{p.name}</span><Badge tone="warn">{Number(p.on_hand)} / {Number(p.reorder)}</Badge></li>)}</ul></Card>)}
            {data.recent && (
              <Card title="Aktivitas terbaru">
                {data.recent.length === 0 ? <p className="text-sm text-ink-2">Belum ada aktivitas.</p> :
                  <ul className="grid gap-2.5">{data.recent.map((a: any, i: number) => <li key={i} className="border-b border-divider pb-2 text-sm last:border-0"><p className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</p><p className="text-xs text-ink-2">{a.operator ?? a.deviceName ?? "Perangkat"} · {fmtDateTime(a.createdAt)}</p></li>)}</ul>}
              </Card>)}
            {!fin && !data.sales && <Card title="Selamat datang"><p className="text-sm text-ink-2">Gunakan menu di sidebar sesuai peran perangkat ini.</p></Card>}
          </aside>
        </div>
      )}
      <QuickTx open={qt} onClose={() => setQt(false)} onDone={reload} />
    </>
  );
}

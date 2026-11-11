"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { ResourcePage } from "@/components/resource-page";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, Modal, PageHeader, SelectField, Tabs, TextField } from "@/components/ui";
import { api, fmtDateTime, toast, useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";

export default function Operations() {
  const [tab, setTab] = useState("logs");
  return (
    <>
      <PageHeader label="Management" title="Operasional & Kendali Kas" desc="Checklist buka/tutup, SOP, serah terima shift, insiden, dan sesi kas dengan saldo diharapkan vs fisik." />
      <Tabs tabs={[{ key: "logs", label: "Catatan Operasional" }, { key: "cash", label: "Sesi Kas" }]} value={tab} onChange={setTab} />
      {tab === "logs" ? <ResourcePage resource="ops-logs" /> : <Cash />}
    </>
  );
}

function Cash() {
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>("/cash/sessions");
  const accs = useApi<any>(biz.can("finance:read") ? "/finance/cash-accounts" : biz.can("sales:write") ? "/sales/pos-meta" : null);
  const list: any[] = (accs.data?.items ?? accs.data?.accounts ?? []).filter((a: any) => a.kind === "cash");
  const [open, setOpen] = useState(false); const [acc, setAcc] = useState(""); const [amt, setAmt] = useState(""); const [err, setErr] = useState("");
  const [close, setClose] = useState<any | null>(null); const [counted, setCounted] = useState(""); const [note, setNote] = useState(""); const [res, setRes] = useState<any>(null);
  async function openS() { setErr(""); try { await api("/cash/open", { body: { accountId: acc || list[0]?.id, openingAmount: amt || "0" } }); toast("Sesi kas dibuka"); setOpen(false); setAmt(""); reload(); } catch (e) { setErr((e as Error).message); } }
  async function closeS() { setErr(""); try { const r = await api<any>(`/cash/${close.id}/close`, { body: { countedAmount: counted, note: note || undefined } }); setRes(r); setClose(null); setCounted(""); setNote(""); reload(); } catch (e) { setErr((e as Error).message); } }
  return (
    <Card title="Sesi Kas" desc="Saldo diharapkan = saldo awal + mutasi akun kas sejak dibuka. Selisih dicatat; tidak ada jurnal otomatis untuk selisih." actions={biz.can("ops:write") ? <Button onClick={() => { setOpen(true); setErr(""); }}>+ Buka sesi kas</Button> : undefined}>
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <DataTable rows={data.items} caption="Sesi kas" empty={<Empty title="Belum ada sesi kas" hint="Buka sesi kas di awal shift untuk membandingkan saldo diharapkan dan fisik saat tutup." />} columns={[{ key: "openedAt", label: "Dibuka", render: (s: any) => fmtDateTime(s.openedAt) }, { key: "accountName", label: "Akun" }, { key: "openingAmount", label: "Saldo awal", right: true, render: (s: any) => formatMoney(s.openingAmount, biz.currency) }, { key: "expectedAmount", label: "Diharapkan", right: true, render: (s: any) => s.expectedAmount ? formatMoney(s.expectedAmount, biz.currency) : "—" }, { key: "countedAmount", label: "Fisik", right: true, render: (s: any) => s.countedAmount ? formatMoney(s.countedAmount, biz.currency) : "—" }, { key: "variance", label: "Selisih", right: true, render: (s: any) => s.variance ? <Badge tone={Number(s.variance) === 0 ? "good" : "bad"}>{formatMoney(s.variance, biz.currency)}</Badge> : "—" }, { key: "status", label: "Status", render: (s: any) => <Badge status={s.status} /> }, { key: "a", label: "", render: (s: any) => s.status === "open" && biz.can("ops:write") ? <Button variant="secondary" className="!min-h-[32px] !px-2" onClick={() => { setClose(s); setErr(""); }}>Tutup kas</Button> : null }]} />)}
      <Modal open={open} onClose={() => setOpen(false)} title="Buka sesi kas">
        <div className="grid gap-3"><SelectField label="Akun kas" value={acc || list[0]?.id || ""} onChange={setAcc} options={list.map((a) => ({ value: a.id, label: a.name }))} /><TextField label="Saldo awal laci (hasil hitung fisik)" inputMode="decimal" value={amt} onChange={(v) => setAmt(v.replace(/[^\d.]/g, ""))} />{err && <p role="alert" className="text-sm text-[#A12A1F]">{err}</p>}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button><Button onClick={openS}>Buka</Button></div></div>
      </Modal>
      <Modal open={!!close} onClose={() => setClose(null)} title="Tutup sesi kas">
        <div className="grid gap-3"><TextField label="Jumlah uang fisik" inputMode="decimal" value={counted} onChange={(v) => setCounted(v.replace(/[^\d.]/g, ""))} /><TextField label="Catatan" value={note} onChange={setNote} />{err && <p role="alert" className="text-sm text-[#A12A1F]">{err}</p>}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setClose(null)}>Batal</Button><Button onClick={closeS} disabled={!counted}>Tutup & hitung selisih</Button></div></div>
      </Modal>
      <Modal open={!!res} onClose={() => setRes(null)} title="Hasil penutupan kas">
        {res && <div className="grid gap-1 text-sm"><p>Diharapkan: <strong>{formatMoney(res.expected, biz.currency)}</strong></p><p>Fisik: <strong>{formatMoney(res.counted, biz.currency)}</strong></p><p>Selisih: <strong className={Number(res.variance) === 0 ? "" : "text-[#A12A1F]"}>{formatMoney(res.variance, biz.currency)}</strong></p><div className="mt-3 flex justify-end"><Button onClick={() => setRes(null)}>Tutup</Button></div></div>}
      </Modal>
    </Card>
  );
}

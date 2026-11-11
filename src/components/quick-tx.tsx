"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { api, newKey, toast, toInputDate, useApi } from "@/lib/client";
import { decimalsOf, formatMoney, groupDigits } from "@/lib/money";
import { Keypad } from "./keypad";
import { Button, Modal, SelectField, TextField } from "./ui";
import { useBiz } from "./shell";

type Kind = "income" | "expense" | "transfer";
const KINDS: { k: Kind; label: string }[] = [{ k: "income", label: "Pemasukan" }, { k: "expense", label: "Pengeluaran" }, { k: "transfer", label: "Transfer" }];

export function QuickTx({ open, onClose, onDone, initial = "income" }: { open: boolean; onClose: () => void; onDone: () => void; initial?: Kind }) {
  const biz = useBiz();
  const dec = decimalsOf(biz.currency);
  const [kind, setKind] = useState<Kind>(initial);
  const [amt, setAmt] = useState("");
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newKey());
  const accounts = useApi<any>(open ? "/finance/cash-accounts" : null);
  const cats = useApi<any>(open ? "/finance/categories" : null);
  const clients = useApi<any>(open && kind === "income" && biz.can("crm:read") ? "/r/clients?limit=300" : null);
  const projects = useApi<any>(open && kind === "expense" && biz.can("projects:read") ? "/r/projects?limit=200" : null);
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (open) { setKind(initial); setAmt(""); setErr(""); setKey(newKey()); setF({ date: toInputDate(), time: new Date().toTimeString().slice(0, 5) }); }
  }, [open, initial]);

  const digit = useCallback((d: string) => setAmt((cur) => {
    const [i, fr] = cur.split(".");
    if (fr !== undefined) return fr.length >= dec ? cur : cur + d;
    if (cur === "0") return d === "0" ? cur : d;
    return i.length >= 13 ? cur : cur + d;
  }), [dec]);
  const back = useCallback(() => setAmt((c) => c.slice(0, -1)), []);
  const dot = useCallback(() => setAmt((c) => (dec > 0 && !c.includes(".") ? (c || "0") + "." : c)), [dec]);

  const accs: any[] = (accounts.data?.items ?? []).filter((a: any) => a.isActive);
  const cs: any[] = (cats.data?.items ?? []).filter((c: any) => c.isActive && c.kind === kind);
  const [i, fr] = amt.split(".");
  const shown = (groupDigits(i || "0")) + (fr !== undefined ? "," + fr : "");

  async function submit() {
    setErr("");
    if (!amt || Number(amt) <= 0) return setErr("Nominal harus lebih dari nol.");
    const accountId = f.accountId || accs[0]?.id;
    if (!accountId) return setErr("Belum ada Akun Kas & Bank.");
    if (kind === "transfer") {
      if (!f.toAccountId) return setErr("Pilih akun tujuan.");
      if (f.toAccountId === accountId) return setErr("Akun asal dan tujuan tidak boleh sama.");
    } else if (!f.categoryId) return setErr("Pilih kategori.");
    setBusy(true);
    try {
      const r = await api<any>("/finance/transactions", { idem: key, body: {
        type: kind, amount: amt.replace(/\.$/, ""), accountId, toAccountId: kind === "transfer" ? f.toAccountId : undefined,
        categoryId: kind === "transfer" ? undefined : f.categoryId, date: f.date, time: f.time || undefined,
        note: f.note || undefined, reference: f.reference || undefined, clientId: f.clientId || undefined,
        supplierName: f.supplierName || undefined, projectId: f.projectId || undefined,
      } });
      toast(r.state === "pending_approval" ? `${r.number} menunggu persetujuan` : `${r.number} berhasil diposting`);
      onDone(); onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Transaksi Cepat" wide>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-surface p-1" role="tablist">
        {KINDS.map((x) => <button key={x.k} role="tab" aria-selected={kind === x.k} onClick={() => { setKind(x.k); setF((v) => ({ ...v, categoryId: "" })); }}
          className={`min-h-[40px] rounded-lg text-sm font-semibold ${kind === x.k ? "bg-white text-primary-deep shadow-card" : "text-ink-2"}`}>{x.label}</button>)}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="text-center text-xs font-semibold text-ink-2">Nominal ({biz.currency})</p>
          <p aria-live="polite" className="kpi-value mb-3 text-center text-[34px] font-bold text-ink">{shown}</p>
          <Keypad onDigit={digit} onBack={back} onClear={() => setAmt("")} extraKey={dec > 0 ? "," : undefined} onExtra={dec > 0 ? dot : undefined} compact />
          {amt && Number(amt) > 0 && <p className="mt-2 text-center text-xs text-ink-2">{formatMoney(amt, biz.currency)}</p>}
        </div>
        <div className="grid content-start gap-3">
          <SelectField label={kind === "transfer" ? "Dari akun" : "Akun kas/bank"} value={f.accountId ?? accs[0]?.id ?? ""} onChange={set("accountId")} options={accs.map((a) => ({ value: a.id, label: `${a.name} — ${formatMoney(a.balance, biz.currency)}` }))} />
          {kind === "transfer"
            ? <SelectField label="Ke akun" value={f.toAccountId ?? ""} onChange={set("toAccountId")} placeholder="Pilih akun tujuan" options={accs.map((a) => ({ value: a.id, label: a.name }))} />
            : <SelectField label="Kategori" value={f.categoryId ?? ""} onChange={set("categoryId")} placeholder="Pilih kategori" options={cs.map((c) => ({ value: c.id, label: c.name }))} />}
          <div className="grid grid-cols-2 gap-3"><TextField label="Tanggal" type="date" value={f.date ?? ""} onChange={set("date")} /><TextField label="Jam" type="time" value={f.time ?? ""} onChange={set("time")} /></div>
          {kind === "income" && clients.data && <SelectField label="Klien (opsional)" value={f.clientId ?? ""} onChange={set("clientId")} placeholder="—" options={clients.data.items.map((c: any) => ({ value: c.id, label: c.name }))} />}
          {kind === "expense" && <TextField label="Supplier/penerima (opsional)" value={f.supplierName ?? ""} onChange={set("supplierName")} />}
          {kind === "expense" && projects.data && <SelectField label="Proyek (opsional)" value={f.projectId ?? ""} onChange={set("projectId")} placeholder="—" options={projects.data.items.map((p: any) => ({ value: p.id, label: p.name }))} />}
          {kind !== "transfer" && <TextField label="Referensi (opsional)" value={f.reference ?? ""} onChange={set("reference")} />}
          <TextField label="Catatan" value={f.note ?? ""} onChange={set("note")} help={kind === "transfer" ? "Transfer antar akun tidak dihitung sebagai pemasukan/pengeluaran." : undefined} />
        </div>
      </div>
      {err && <p role="alert" className="mt-3 rounded-lg bg-[#FDEDEB] px-3 py-2 text-sm text-[#7F1D14]">{err}</p>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Batal</Button><Button loading={busy} onClick={submit}>Simpan transaksi</Button></div>
    </Modal>
  );
}

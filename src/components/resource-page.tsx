"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, fmtDate, toast, useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import { RESOURCES, type Field } from "@/lib/resource-meta";
import { Badge, Button, Check, DataTable, Empty, ErrorBox, Loading, Modal, SelectField, TextArea, TextField, type Col } from "./ui";
import { useBiz } from "./shell";

type Props = {
  resource: string; title?: string; hint?: string;
  fixed?: Record<string, string>;               // filter & nilai default (mis. clientId)
  extraColumns?: Col[]; rowLink?: (row: any) => ReactNode;
  actions?: (row: any, reload: () => void) => ReactNode;
  hideFields?: string[]; toolbar?: ReactNode;
};

export function ResourcePage({ resource, title, hint, fixed = {}, extraColumns = [], rowLink, actions, hideFields = [], toolbar }: Props) {
  const meta = RESOURCES[resource];
  const biz = useBiz();
  const canWrite = biz.can(`${meta.perm}:write` as any);
  const [q, setQ] = useState("");
  const qs = new URLSearchParams({ ...fixed, ...(q ? { q } : {}) }).toString();
  const list = useApi<any>(`/r/${resource}${qs ? "?" + qs : ""}`);
  const refs = meta.fields.filter((f) => f.type === "ref" && f.ref);
  const refKey = refs.map((r) => r.ref).join(",");
  const [refData, setRefData] = useState<Record<string, { id: string; label: string }[]>>({});
  useEffect(() => {
    refs.forEach((f) => {
      const rm = RESOURCES[f.ref!];
      if (!biz.can(`${rm.perm}:read` as any)) return;
      api<any>(`/r/${f.ref}?limit=500`).then((d) => setRefData((x) => ({ ...x, [f.ref!]: d.items.map((i: any) => ({ id: i.id, label: i[rm.titleField] })) }))).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey]);

  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);

  function openForm(row?: any) {
    const init: Record<string, any> = {};
    for (const f of meta.fields) init[f.name] = row ? (row[f.name] ?? (f.type === "bool" ? false : "")) : (fixed[f.name] ?? f.def ?? (f.type === "bool" ? false : ""));
    setForm(init); setEditing(row ?? null); setErrs({}); setFormErr(""); setOpen(true);
  }

  async function save() {
    setBusy(true); setErrs({}); setFormErr("");
    try {
      const body: Record<string, any> = {};
      for (const f of meta.fields) {
        if (hideFields.includes(f.name)) continue;
        const v = form[f.name];
        body[f.name] = f.type === "bool" ? !!v : f.type === "int" ? (v === "" ? "" : Number(v)) : v;
      }
      if (editing) await api(`/r/${resource}/${editing.id}`, { method: "PATCH", body });
      else await api(`/r/${resource}`, { body });
      toast(editing ? "Perubahan disimpan" : `${meta.label} ditambahkan`);
      setOpen(false); list.reload();
    } catch (e) {
      const er = e as ApiError;
      const m: Record<string, string> = {};
      er.errors?.forEach((x) => { m[x.path] = x.message; });
      setErrs(m); setFormErr(er.message);
    } finally { setBusy(false); }
  }

  async function remove(row: any) {
    const label = meta.archive?.label ?? "Hapus";
    if (!confirm(`${label} "${row[meta.titleField]}"?`)) return;
    try { await api(`/r/${resource}/${row.id}`, { method: "DELETE" }); toast("Berhasil"); list.reload(); }
    catch (e) { toast((e as Error).message, "err"); }
  }

  const cell = (f: Field, row: any): ReactNode => {
    const v = row[f.name];
    if (v === null || v === undefined || v === "") return "—";
    switch (f.type) {
      case "money": return <span className="tnum">{formatMoney(v, biz.currency)}</span>;
      case "bool": return v ? "Ya" : "Tidak";
      case "date": return fmtDate(v);
      case "select": return f.name === "status" || f.name === "priority" ? <Badge status={v} /> : (f.options?.find((o) => o.value === v)?.label ?? v);
      case "ref": return refData[f.ref!]?.find((r) => r.id === v)?.label ?? "…";
      default: return <span className="line-clamp-2">{String(v)}</span>;
    }
  };

  const cols: Col[] = useMemo(() => [
    ...meta.fields.filter((f) => !f.hideInTable && !hideFields.includes(f.name) && !(f.name in fixed) && f.type !== "textarea").map((f) => ({ key: f.name, label: f.label, right: f.type === "money", render: (row: any) => cell(f, row) })),
    ...extraColumns,
    { key: "_a", label: "", render: (row: any) => (
      <div className="flex flex-wrap justify-end gap-1.5">
        {rowLink?.(row)}{actions?.(row, list.reload)}
        {canWrite && !meta.noEdit && <Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => openForm(row)}>Ubah</Button>}
        {canWrite && (meta.archive || meta.remove) && <Button variant="ghost" className="!min-h-[32px] !px-2 !text-[#A12A1F]" onClick={() => remove(row)}>{meta.archive?.label ?? "Hapus"}</Button>}
      </div>) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [meta, refData, extraColumns, canWrite, biz.currency]);

  const rows: any[] = list.data?.items ?? [];
  const fieldInput = (f: Field) => {
    if (hideFields.includes(f.name) || (f.name in fixed && !editing)) return null;
    const v = form[f.name];
    const set = (x: any) => setForm((s) => ({ ...s, [f.name]: x }));
    const er = errs[f.name];
    const label = f.required ? `${f.label} *` : f.label;
    switch (f.type) {
      case "textarea": return <TextArea key={f.name} label={label} value={v ?? ""} onChange={set} error={er} />;
      case "bool": return <Check key={f.name} label={f.label} checked={!!v} onChange={set} help={f.help} />;
      case "select": return <SelectField key={f.name} label={label} value={v ?? ""} onChange={set} options={f.options ?? []} error={er} />;
      case "ref": return <SelectField key={f.name} label={label} value={v ?? ""} onChange={set} options={(refData[f.ref!] ?? []).map((o) => ({ value: o.id, label: o.label }))} placeholder="Pilih…" error={er} />;
      case "date": return <TextField key={f.name} label={label} type="date" value={v ?? ""} onChange={set} error={er} />;
      case "time": return <TextField key={f.name} label={label} type="time" value={v ?? ""} onChange={set} error={er} />;
      case "money": case "qty": return <TextField key={f.name} label={label} inputMode="decimal" value={v ?? ""} onChange={(x) => set(x.replace(/[^\d.]/g, ""))} error={er} help={f.help} />;
      case "int": return <TextField key={f.name} label={label} inputMode="numeric" value={v ?? ""} onChange={(x) => set(x.replace(/\D/g, ""))} error={er} />;
      default: return <TextField key={f.name} label={label} value={v ?? ""} onChange={set} error={er} help={f.help} />;
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>{title && <h2 className="text-lg font-semibold">{title}</h2>}{hint && <p className="text-sm text-ink-2">{hint}</p>}</div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`q-${resource}`}>Cari {meta.label}</label>
          <input id={`q-${resource}`} className="field-input !min-h-[38px] !w-48" placeholder="Cari…" value={q} onChange={(e) => setQ(e.target.value)} />
          {toolbar}
          {canWrite && <Button onClick={() => openForm()}>+ Tambah {meta.label}</Button>}
        </div>
      </div>
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <Loading /> : (
        <DataTable columns={cols} rows={rows} caption={meta.label}
          empty={<Empty title={q ? "Tidak ada hasil pencarian" : `Belum ada ${meta.label.toLowerCase()}`} hint={q ? "Coba kata kunci lain." : canWrite ? `Tambahkan ${meta.label.toLowerCase()} pertama Anda untuk mulai.` : "Perangkat ini hanya memiliki akses lihat."} action={canWrite && !q ? <Button onClick={() => openForm()}>+ Tambah {meta.label}</Button> : undefined} />} />
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Ubah ${meta.label}` : `Tambah ${meta.label}`} wide>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="grid gap-3 sm:grid-cols-2">{meta.fields.map((f) => <div key={f.name} className={f.type === "textarea" || f.type === "bool" ? "sm:col-span-2" : ""}>{fieldInput(f)}</div>)}</div>
          {formErr && <p role="alert" className="mt-3 rounded-lg bg-[#FDEDEB] px-3 py-2 text-sm text-[#7F1D14]">{formErr}</p>}
          <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" loading={busy}>Simpan</Button></div>
        </form>
      </Modal>
    </div>
  );
}

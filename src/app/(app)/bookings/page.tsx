"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { ResourcePage } from "@/components/resource-page";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, Modal, PageHeader, SelectField, Tabs, TextField } from "@/components/ui";
import { api, fmtDateTime, toast, toInputDate, useApi } from "@/lib/client";

const toLocalInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export default function Bookings() {
  const biz = useBiz();
  const [tab, setTab] = useState("sched");
  const label = biz.template.terms.booking;
  return (
    <>
      <PageHeader label="Business Operations" title="Pesanan & Booking" desc={`Jadwal pada satu ${label.toLowerCase()} tidak boleh bentrok — dijamin server lewat transaksi atomik.`} />
      <Tabs tabs={[{ key: "sched", label: "Jadwal" }, { key: "res", label: label }]} value={tab} onChange={setTab} />
      {tab === "sched" ? <Schedule label={label} /> : <ResourcePage resource="booking-resources" title={`Daftar ${label}`} />}
    </>
  );
}

function Schedule({ label }: { label: string }) {
  const biz = useBiz();
  const [from, setFrom] = useState(toInputDate()); 
  const [to, setTo] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 30); return toInputDate(d); });
  const { data, error, loading, reload } = useApi<any>(`/bookings?from=${from}&to=${to}`);
  const res = useApi<any>("/r/booking-resources?limit=300");
  const clients = useApi<any>(biz.can("crm:read") ? "/r/clients?limit=300" : null);
  const [open, setOpen] = useState(false); const [f, setF] = useState<Record<string, string>>({}); const [err, setErr] = useState("");
  const [rs, setRs] = useState<any | null>(null); const [rsf, setRsf] = useState({ startsAt: "", endsAt: "" });
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  async function create() {
    setErr("");
    try { await api("/bookings", { body: { resourceId: f.resourceId, customerName: f.customerName, clientId: f.clientId || undefined, service: f.service || undefined, notes: f.notes || undefined, startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString() } }); toast("Booking dibuat"); setOpen(false); setF({}); reload(); } catch (e) { setErr((e as Error).message); }
  }
  async function status(id: string, body: any) { try { await api(`/bookings/${id}/status`, { body }); reload(); } catch (e) { toast((e as Error).message, "err"); } }
  async function resched() {
    setErr("");
    try { await api(`/bookings/${rs.id}/reschedule`, { body: { startsAt: new Date(rsf.startsAt).toISOString(), endsAt: new Date(rsf.endsAt).toISOString() } }); toast("Dijadwalkan ulang"); setRs(null); reload(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Card title="Jadwal Booking" actions={biz.can("booking:write") ? <Button onClick={() => { setOpen(true); setErr(""); }}>+ Booking baru</Button> : undefined}>
      <div className="mb-4 grid max-w-md grid-cols-2 gap-3"><TextField label="Dari" type="date" value={from} onChange={setFrom} /><TextField label="Sampai" type="date" value={to} onChange={setTo} /></div>
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <DataTable rows={data.items} caption="Booking" empty={<Empty title="Belum ada booking pada rentang ini" hint={`Daftarkan ${label.toLowerCase()} di tab sebelah, lalu buat booking.`} />}
          columns={[{ key: "startsAt", label: "Waktu", render: (b: any) => <span>{fmtDateTime(b.startsAt)}<span className="block text-xs text-ink-2">s.d. {fmtDateTime(b.endsAt)}</span></span> }, { key: "resourceName", label: label }, { key: "customerName", label: "Pelanggan" }, { key: "service", label: "Layanan", render: (b: any) => b.service ?? "—" }, { key: "status", label: "Status", render: (b: any) => <Badge status={b.status} /> }, { key: "paymentStatus", label: "Pembayaran", render: (b: any) => <Badge status={b.paymentStatus} /> },
            { key: "a", label: "", render: (b: any) => biz.can("booking:write") && b.status === "confirmed" ? (
              <div className="flex flex-wrap justify-end gap-1.5"><Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => { setRs(b); setRsf({ startsAt: toLocalInput(b.startsAt), endsAt: toLocalInput(b.endsAt) }); setErr(""); }}>Jadwal ulang</Button><Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => status(b.id, { status: "completed" })}>Selesai</Button><Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => status(b.id, { paymentStatus: b.paymentStatus === "paid" ? "unpaid" : "paid" })}>{b.paymentStatus === "paid" ? "Tandai belum bayar" : "Tandai lunas"}</Button><Button variant="ghost" className="!min-h-[32px] !px-2 !text-[#A12A1F]" onClick={() => confirm("Batalkan booking?") && status(b.id, { status: "cancelled" })}>Batalkan</Button></div>) : null }]} />)}
      <Modal open={open} onClose={() => setOpen(false)} title="Booking baru" wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={label} value={f.resourceId ?? ""} onChange={set("resourceId")} placeholder="Pilih" options={(res.data?.items ?? []).filter((r: any) => r.isActive).map((r: any) => ({ value: r.id, label: r.name }))} />
          <TextField label="Nama pelanggan *" value={f.customerName ?? ""} onChange={set("customerName")} />
          <TextField label="Mulai *" type="datetime-local" value={f.startsAt ?? ""} onChange={set("startsAt")} /><TextField label="Selesai *" type="datetime-local" value={f.endsAt ?? ""} onChange={set("endsAt")} />
          {clients.data && <SelectField label="Klien (opsional)" value={f.clientId ?? ""} onChange={set("clientId")} placeholder="—" options={clients.data.items.map((c: any) => ({ value: c.id, label: c.name }))} />}
          <TextField label="Layanan" value={f.service ?? ""} onChange={set("service")} /><div className="sm:col-span-2"><TextField label="Catatan" value={f.notes ?? ""} onChange={set("notes")} /></div>
        </div>
        {err && <p role="alert" className="mt-3 rounded-lg bg-[#FDEDEB] px-3 py-2 text-sm text-[#7F1D14]">{err}</p>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button><Button onClick={create} disabled={!f.resourceId || !f.customerName || !f.startsAt || !f.endsAt}>Simpan booking</Button></div>
      </Modal>
      <Modal open={!!rs} onClose={() => setRs(null)} title="Jadwal ulang">
        <div className="grid gap-3"><TextField label="Mulai" type="datetime-local" value={rsf.startsAt} onChange={(v) => setRsf({ ...rsf, startsAt: v })} /><TextField label="Selesai" type="datetime-local" value={rsf.endsAt} onChange={(v) => setRsf({ ...rsf, endsAt: v })} />{err && <p role="alert" className="text-sm text-[#A12A1F]">{err}</p>}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRs(null)}>Batal</Button><Button onClick={resched}>Simpan</Button></div></div>
      </Modal>
    </Card>
  );
}

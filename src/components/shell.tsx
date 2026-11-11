"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { api, fmtDateTime, useApi } from "@/lib/client";
import { can, type Permission } from "@/lib/permissions";
import { useLock } from "./lock-provider";
import { Button, ErrorBox, Loading, Logo, Modal, Toaster } from "./ui";

export type BizCtx = { business: any; branches: any[]; warehouses: any[]; template: any; role: string; currency: string; reload: () => void; mode: "simple" | "advanced"; setMode: (m: "simple" | "advanced") => void; can: (p: Permission) => boolean };
const Ctx = createContext<BizCtx | null>(null);
export const useBiz = () => useContext(Ctx)!;

type Item = { href: string; label: string; perm?: Permission; key: string; advanced?: boolean };
const GROUPS: { title: string; items: Item[] }[] = [
  { title: "Overview", items: [{ href: "/dashboard", label: "Dashboard", key: "dashboard" }] },
  { title: "Business Operations", items: [
    { href: "/finance", label: "Keuangan", perm: "finance:read", key: "finance" },
    { href: "/sales", label: "Penjualan & POS", perm: "sales:read", key: "sales" },
    { href: "/bookings", label: "Pesanan & Booking", perm: "booking:read", key: "bookings" },
    { href: "/products", label: "Produk & Stok", perm: "inventory:read", key: "products" },
    { href: "/purchasing", label: "Pembelian & Supplier", perm: "purchasing:read", key: "purchasing" },
    { href: "/crm", label: "CRM / Klien", perm: "crm:read", key: "crm" },
  ] },
  { title: "Management", items: [
    { href: "/hr", label: "Karyawan & HR", perm: "hr:read", key: "hr", advanced: true },
    { href: "/tasks", label: "Tugas & Tim", perm: "tasks:read", key: "tasks" },
    { href: "/operations", label: "Operasional & Kas", perm: "ops:read", key: "operations", advanced: true },
    { href: "/marketing", label: "Pemasaran", perm: "marketing:read", key: "marketing", advanced: true },
    { href: "/projects", label: "Proyek", perm: "projects:read", key: "projects", advanced: true },
    { href: "/assets", label: "Aset & Dokumen", perm: "assets:read", key: "assets", advanced: true },
  ] },
  { title: "Reports", items: [{ href: "/reports", label: "Laporan & Analitik", perm: "reports:read", key: "reports" }] },
  { title: "Configuration", items: [
    { href: "/settings", label: "Pengaturan & Data Master", perm: "settings:write", key: "settings" },
    { href: "/templates", label: "Template Bisnis", key: "templates", advanced: true },
    { href: "/devices", label: "Perangkat & Keamanan", perm: "devices:read", key: "devices" },
    { href: "/legal", label: "Syarat & Privasi", key: "legal" },
    { href: "/help", label: "Pusat Bantuan", key: "help" },
  ] },
];

const TOUR = [
  { sel: "[data-tour=sidebar]", title: "Sidebar", text: "Semua modul ada di sini, dikelompokkan sesuai alur kerja. Titik teal menandai modul prioritas untuk template bisnis Anda." },
  { sel: "[data-tour=topbar]", title: "Topbar", text: "Cari klien/produk/faktur, lihat notifikasi, bantuan, status perangkat, dan tombol Kunci." },
  { sel: "[data-tour=biz]", title: "Bisnis & cabang", text: "Menampilkan bisnis dan cakupan cabang perangkat ini. Kelola cabang di Pengaturan." },
  { sel: "[data-tour=page-header]", title: "Ringkasan", text: "Setiap halaman diawali judul dan rentang tanggal/aksi utama." },
  { sel: "[data-tour=quick]", title: "Aksi cepat", text: "Catat pemasukan, pengeluaran, atau transfer dengan keypad angka dari sini." },
  { sel: "[data-tour=nav-finance]", title: "Keuangan", text: "Akun kas & bank, transaksi, jurnal, piutang/utang, anggaran, dan penutupan periode." },
  { sel: "[data-tour=nav-crm]", title: "CRM / Klien", text: "Pusat data klien: kontak, aktivitas, faktur, dan riwayat." },
  { sel: "[data-tour=nav-products]", title: "Produk & Stok", text: "Katalog, ledger stok, dan penyesuaian stok." },
  { sel: "[data-tour=nav-reports]", title: "Laporan", text: "Neraca saldo, laba rugi, neraca, arus kas, buku besar. Ekspor CSV tersedia." },
  { sel: "[data-tour=nav-devices]", title: "Perangkat & Keamanan", text: "Tambah perangkat dengan kode pairing, atur peran, cabut akses, dan lihat audit." },
  { sel: "[data-tour=nav-help]", title: "Pusat Bantuan", text: "Panduan, FAQ, glosarium, dan mulai ulang tur ini kapan saja." },
];

export function Shell({ children }: { children: ReactNode }) {
  const { data, error, reload } = useApi<any>("/business");
  const [mode, setModeState] = useState<"simple" | "advanced">("simple");
  useLayoutEffect(() => {
    const saved = localStorage.getItem("bf_mode") as "simple" | "advanced" | null;
    if (saved) setModeState(saved); else if (data?.business?.settings?.mode) setModeState(data.business.settings.mode);
  }, [data]);
  const setMode = (m: "simple" | "advanced") => { localStorage.setItem("bf_mode", m); setModeState(m); };

  const value = useMemo<BizCtx | null>(() => data ? ({ ...data, currency: data.business.currency, reload, mode, setMode, can: (p: Permission) => can(data.role, p) }) : null, [data, mode, reload]);
  if (error) return <div className="p-8"><ErrorBox message={error} onRetry={reload} /></div>;
  if (!value) return <Loading text="Menyiapkan dashboard…" />;
  return <Ctx.Provider value={value}><Frame>{children}</Frame><Toaster /></Ctx.Provider>;
}

function Frame({ children }: { children: ReactNode }) {
  const biz = useBiz();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { lock } = useLock();
  useEffect(() => setOpen(false), [path]);
  const recommended = new Set<string>(biz.template.modules);
  const visible = (i: Item) => (!i.perm || biz.can(i.perm) || (i.key === "settings" && false)) && (biz.mode === "advanced" || !i.advanced || recommended.has(i.key));
  const current = GROUPS.flatMap((g) => g.items).find((i) => path === i.href || path.startsWith(i.href + "/"));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_1fr]">
      <a href="#konten" className="skip-link">Lewati ke konten utama</a>
      {open && <div className="fixed inset-0 z-30 bg-[rgba(32,51,50,0.4)] lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside data-tour="sidebar" aria-label="Navigasi utama" className={`fixed inset-y-0 left-0 z-40 w-[272px] overflow-y-auto border-r border-line bg-white p-4 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-5 px-2 pt-1"><Logo /></div>
        <nav>
          {GROUPS.map((g) => {
            const items = g.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={g.title} className="mb-4">
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-2">{g.title}</p>
                <ul>{items.map((i) => {
                  const active = path === i.href || path.startsWith(i.href + "/");
                  return (
                    <li key={i.href}>
                      <Link href={i.href} data-tour={`nav-${i.key}`} aria-current={active ? "page" : undefined}
                        className={`relative flex min-h-[40px] items-center justify-between rounded-xl px-3 text-sm font-medium ${active ? "bg-primary-bg text-primary-deep before:absolute before:left-0 before:top-2 before:h-[calc(100%-16px)] before:w-1 before:rounded-full before:bg-primary-deep" : "text-ink hover:bg-surface"}`}>
                        <span>{i.label}</span>
                        {recommended.has(i.key) && <span title="Prioritas untuk template bisnis Anda" aria-label="Prioritas template" className="h-2 w-2 rounded-full bg-primary" />}
                      </Link>
                    </li>
                  );
                })}</ul>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        <header data-tour="topbar" className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-line bg-white/95 px-4 py-2.5 backdrop-blur lg:px-8">
          <button aria-label="Buka menu" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg border border-line text-lg lg:hidden">☰</button>
          <nav aria-label="Breadcrumb" className="hidden text-sm text-ink-2 md:block"><span>Business Flow</span> <span aria-hidden>/</span> <span className="font-semibold text-ink">{current?.label ?? "Halaman"}</span></nav>
          <GlobalSearch />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div data-tour="biz" className="hidden rounded-lg border border-line px-3 py-1.5 text-xs leading-tight sm:block">
              <span className="block font-semibold text-ink">{biz.business.name}</span>
              <span className="text-ink-2">Cabang: {biz.branches.find((b: any) => b.isMain)?.name ?? "—"}{biz.branches.length > 1 ? ` (+${biz.branches.length - 1})` : ""}</span>
            </div>
            <button onClick={() => biz.setMode(biz.mode === "simple" ? "advanced" : "simple")} className="min-h-[36px] rounded-lg border border-line px-3 text-xs font-semibold text-ink hover:bg-primary-bg" title="Ubah tampilan menu">
              Mode {biz.mode === "simple" ? "Sederhana" : "Lanjutan"}
            </button>
            <Bell />
            <Link href="/help" className="grid h-9 w-9 place-items-center rounded-lg border border-line text-sm font-bold text-primary-deep hover:bg-primary-bg" aria-label="Bantuan">?</Link>
            <DeviceChip />
            <Button variant="secondary" onClick={lock} className="!min-h-[36px] !px-3 text-xs">Kunci</Button>
          </div>
        </header>
        <main id="konten" className="px-4 py-6 lg:px-8"><div className="mx-auto max-w-[1280px]">{children}</div></main>
      </div>
      <Tour />
    </div>
  );
}

function DeviceChip() {
  const { data } = useApi<any>("/device/me");
  return <span className="hidden rounded-lg bg-primary-bg px-3 py-1.5 text-xs font-semibold text-primary-deep xl:inline" title="Akses berdasarkan perangkat, bukan akun pengguna">{data?.deviceName ?? "Perangkat"} · {data?.role ?? ""}</span>;
}

function Bell() {
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi<any>(open ? "/notifications" : null);
  const items: any[] = data?.items ?? [];
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="relative">
      <button aria-label="Notifikasi" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="relative grid h-9 w-9 place-items-center rounded-lg border border-line hover:bg-primary-bg">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0" /></svg>
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-line bg-white p-3 shadow-pop">
          <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Notifikasi</p>
            {unread > 0 && <button className="text-xs font-semibold text-primary-deep" onClick={async () => { await api("/notifications/read", { body: {} }); reload(); }}>Tandai dibaca</button>}</div>
          {items.length === 0 ? <p className="py-4 text-center text-sm text-ink-2">Belum ada notifikasi.</p> :
            <ul className="max-h-72 overflow-y-auto">{items.map((n) => <li key={n.id} className="border-t border-divider py-2 text-sm"><p className={n.readAt ? "text-ink-2" : "font-semibold"}>{n.title}</p>{n.body && <p className="text-xs text-ink-2">{n.body}</p>}<p className="text-[11px] text-ink-2">{fmtDateTime(n.createdAt)}</p></li>)}</ul>}
        </div>
      )}
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any[]>([]);
  const router = useRouter();
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(() => { api<any>(`/search?q=${encodeURIComponent(q.trim())}`).then((d) => setRes(d.items)).catch(() => setRes([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative min-w-[160px] flex-1 md:max-w-sm">
      <label className="sr-only" htmlFor="gsearch">Cari klien, produk, atau faktur</label>
      <input id="gsearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari klien, produk, faktur…" className="field-input !min-h-[38px] !py-1.5 text-sm" autoComplete="off" />
      {q.trim().length >= 2 && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-pop">
          {res.length === 0 ? <li className="px-3 py-2 text-sm text-ink-2">Tidak ada hasil.</li> : res.map((r) => (
            <li key={r.type + r.id}><button className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-primary-bg" onClick={() => { setQ(""); router.push(r.href); }}><span className="truncate">{r.label}</span><span className="shrink-0 text-xs text-ink-2">{r.type}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────── Guided tour (dapat dihentikan & dilanjutkan) ───────── */
export function startTour() { localStorage.setItem("bf_tour", "running"); localStorage.setItem("bf_tour_step", "0"); window.dispatchEvent(new Event("bf-tour")); }

function Tour() {
  const [state, setState] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const sync = useCallback(() => { setState(localStorage.getItem("bf_tour")); setStep(Number(localStorage.getItem("bf_tour_step") ?? 0)); }, []);
  useEffect(() => { sync(); window.addEventListener("bf-tour", sync); return () => window.removeEventListener("bf-tour", sync); }, [sync]);
  useEffect(() => {
    if (state !== "running") return;
    const el = document.querySelector(TOUR[step]?.sel);
    el?.scrollIntoView({ block: "nearest" });
    setRect(el ? el.getBoundingClientRect() : null);
  }, [state, step]);
  const set = (s: string | null, n = step) => { if (s) localStorage.setItem("bf_tour", s); localStorage.setItem("bf_tour_step", String(n)); sync(); };

  if (state === "pending") {
    return (
      <Modal open onClose={() => set("dismissed")} title="Ingin tur singkat Business Flow?">
        <p className="mb-4 text-sm text-ink-2">Tur ini mengenalkan sidebar, topbar, aksi cepat, dan modul utama. Anda dapat menghentikannya kapan saja dan melanjutkannya dari Pusat Bantuan.</p>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => set("dismissed")}>Nanti saja</Button><Button onClick={() => set("running", 0)}>Mulai tur</Button></div>
      </Modal>
    );
  }
  if (state !== "running") return null;
  const s = TOUR[step];
  return (
    <>
      {rect && <div aria-hidden className="pointer-events-none fixed z-[55] rounded-xl ring-4 ring-gold" style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} />}
      <div role="dialog" aria-label={`Tur: ${s.title}`} className="fixed bottom-4 left-1/2 z-[56] w-[min(94vw,420px)] -translate-x-1/2 rounded-2xl border border-line bg-white p-4 shadow-pop">
        <p className="text-xs font-semibold text-primary-deep">Langkah {step + 1} dari {TOUR.length}</p>
        <h2 className="text-base font-bold">{s.title}</h2>
        <p className="mt-1 text-sm text-ink-2">{s.text}</p>
        <div className="mt-3 flex justify-between gap-2">
          <Button variant="ghost" onClick={() => set("paused")}>Hentikan</Button>
          <div className="flex gap-2">
            {step > 0 && <Button variant="secondary" onClick={() => set("running", step - 1)}>Kembali</Button>}
            {step < TOUR.length - 1 ? <Button onClick={() => set("running", step + 1)}>Lanjut</Button> : <Button onClick={() => set("done", 0)}>Selesai</Button>}
          </div>
        </div>
      </div>
    </>
  );
}

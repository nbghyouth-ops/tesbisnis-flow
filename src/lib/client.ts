"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* Token sesi tab hanya hidup di memori modul (per dokumen/tab). Tidak pernah ke storage. */
let tabToken: string | null = null;
let onLocked: (() => void) | null = null;
export const getTab = () => tabToken;
export const setTab = (t: string | null) => { tabToken = t; };
export const registerLockHandler = (fn: (() => void) | null) => { onLocked = fn; };

export class ApiError extends Error {
  constructor(public status: number, message: string, public code: string, public errors?: { path: string; message: string }[]) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; idem?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "x-requested-with": "bf" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (tabToken) headers["x-tab-session"] = tabToken;
  if (opts.idem) headers["idempotency-key"] = opts.idem;
  const res = await fetch(`/api/v1${path}`, { method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, cache: "no-store", credentials: "same-origin" });
  let data: any = null;
  try { data = await res.json(); } catch { /* kosong */ }
  if (!res.ok) {
    if (res.status === 401 && data?.code === "locked") onLocked?.();
    throw new ApiError(res.status, data?.detail ?? data?.title ?? "Terjadi kesalahan", data?.code ?? "error", data?.errors);
  }
  return data as T;
}

export const newKey = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const my = ++seq.current;
    setLoading(true);
    try { const d = await api<T>(path); if (my === seq.current) { setData(d); setError(null); } }
    catch (e) { if (my === seq.current) setError((e as Error).message); }
    finally { if (my === seq.current) setLoading(false); }
  }, [path]);
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load };
}

/* CSV dengan perlindungan formula injection. */
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, any>[]) {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(","))].join("\r\n");
}
export function downloadCsv(name: string, columns: { key: string; label: string }[], rows: Record<string, any>[]) {
  const blob = new Blob(["\uFEFF" + toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* Toast sederhana. */
type ToastMsg = { id: number; text: string; tone: "ok" | "err" };
const listeners = new Set<(t: ToastMsg) => void>();
let tid = 0;
export const toast = (text: string, tone: "ok" | "err" = "ok") => listeners.forEach((l) => l({ id: ++tid, text, tone }));
export function useToasts() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const l = (t: ToastMsg) => { setItems((x) => [...x, t]); setTimeout(() => setItems((x) => x.filter((y) => y.id !== t.id)), 4500); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return items;
}

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  return x.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};
export const fmtDateTime = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
export const toInputDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

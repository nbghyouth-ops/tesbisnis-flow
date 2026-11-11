"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useToasts } from "@/lib/client";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const V: Record<Variant, string> = {
  primary: "bg-primary-deep text-white hover:bg-[#136560] disabled:bg-ink-2",
  secondary: "bg-white text-ink border border-line hover:bg-primary-bg disabled:text-ink-2",
  ghost: "text-primary-deep hover:bg-primary-bg",
  danger: "bg-white text-[#B3261E] border border-[#E9B7B2] hover:bg-[#FDEDEB]",
};

export function Button({ variant = "primary", loading, className = "", children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button {...p} disabled={p.disabled || loading} type={p.type ?? "button"}
      className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${V[variant]} ${className}`}>
      {loading && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ title, desc, actions, children, className = "" }: { title?: string; desc?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[18px] border border-line bg-white p-5 shadow-card ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>{title && <h2 className="text-[17px] font-semibold text-ink">{title}</h2>}{desc && <p className="mt-0.5 text-[13px] text-ink-2">{desc}</p>}</div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ label, title, desc, actions }: { label: string; title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4" data-tour="page-header">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary-deep">{label}</p>
        <h1 className="mt-1 text-[26px] font-bold leading-tight text-ink md:text-[30px]">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-sm text-ink-2">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
      <p className="text-[13px] font-medium text-ink-2">{label}</p>
      <p className={`kpi-value mt-1 text-[26px] font-bold leading-tight ${tone === "bad" ? "text-[#B3261E]" : "text-ink"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-2">{hint}</p>}
    </div>
  );
}

const TONES: Record<string, string> = {
  good: "bg-[#E3F5EA] text-[#17653A]", warn: "bg-cream text-[#7A5B00]", bad: "bg-[#FDEDEB] text-[#A12A1F]", info: "bg-[#E6F2FB] text-[#1D5F8E]", neutral: "bg-surface text-ink-2",
};
const STATUS_TONE: Record<string, string> = {
  paid: "good", posted: "good", active: "good", done: "good", completed: "good", received: "good", confirmed: "info", approved: "good", closed: "neutral",
  partial: "warn", pending_approval: "warn", ordered: "info", open: "info", in_progress: "info", draft: "neutral", todo: "neutral", planning: "neutral",
  unpaid: "warn", rejected: "bad", reversed: "bad", cancelled: "bad", revoked: "bad", blocked: "bad", urgent: "bad", high: "warn", restricted: "warn", archived: "neutral", inactive: "neutral",
};
export function Badge({ children, tone, status }: { children?: ReactNode; tone?: keyof typeof TONES; status?: string }) {
  const t = tone ?? (status ? STATUS_TONE[status] : undefined) ?? "neutral";
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${TONES[t]}`}>{children ?? status?.replace(/_/g, " ")}</span>;
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Loading({ text = "Memuat data…" }: { text?: string }) {
  return <p role="status" className="py-8 text-center text-sm text-ink-2">{text}</p>;
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E9B7B2] bg-[#FDEDEB] px-4 py-3 text-sm text-[#7F1D14]">
      <span>{message}</span>{onRetry && <Button variant="secondary" onClick={onRetry}>Coba lagi</Button>}
    </div>
  );
}

export function Field({ label, error, help, children, className = "" }: { label: string; error?: string; help?: string; children: (id: string, describedBy?: string) => ReactNode; className?: string }) {
  const id = useId();
  const d = error ? `${id}-e` : help ? `${id}-h` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[13px] font-semibold text-ink">{label}</label>
      {children(id, d)}
      {error ? <p id={`${id}-e`} role="alert" className="mt-1 text-xs text-[#A12A1F]">{error}</p> : help ? <p id={`${id}-h`} className="mt-1 text-xs text-ink-2">{help}</p> : null}
    </div>
  );
}
export function TextField({ label, value, onChange, type = "text", error, help, ...rest }: { label: string; value: string; onChange: (v: string) => void; type?: string; error?: string; help?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return <Field label={label} error={error} help={help}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!error} className="field-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />}</Field>;
}
export function SelectField({ label, value, onChange, options, error, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; error?: string; placeholder?: string }) {
  return (
    <Field label={label} error={error}>{(id, d) => (
      <select id={id} aria-describedby={d} className="field-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>)}
    </Field>
  );
}
export function TextArea({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return <Field label={label} error={error}>{(id, d) => <textarea id={id} aria-describedby={d} rows={3} className="field-input" value={value} onChange={(e) => onChange(e.target.value)} />}</Field>;
}
export function Check({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <label className="flex min-h-[40px] cursor-pointer items-start gap-3 rounded-xl border border-line bg-white px-3 py-2 text-sm hover:bg-primary-bg">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[#187a75]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="font-medium text-ink">{label}</span>{help && <span className="block text-xs text-ink-2">{help}</span>}</span>
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    prev.current = document.activeElement;
    const el = ref.current;
    el?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const f = [...el.querySelectorAll<HTMLElement>("a[href],button:not(:disabled),input:not(:disabled),select,textarea")];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); (prev.current as HTMLElement | null)?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(32,51,50,0.45)] p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-[22px] bg-white p-5 shadow-pop sm:rounded-[22px] ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button aria-label="Tutup" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-xl text-ink-2 hover:bg-primary-bg">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${value === t.key ? "border-primary-deep text-primary-deep" : "border-transparent text-ink-2 hover:text-ink"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export type Col<T = any> = { key: string; label: string; right?: boolean; render?: (row: T) => ReactNode };
export function DataTable<T extends Record<string, any>>({ columns, rows, empty, caption }: { columns: Col<T>[]; rows: T[]; empty?: ReactNode; caption?: string }) {
  if (!rows.length) return <>{empty ?? <Empty title="Belum ada data" />}</>;
  return (
    <div className="table-wrap">
      <table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.right ? "r" : ""}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={(r.id as string) ?? i}>{columns.map((c) => <td key={c.key} className={c.right ? "r" : ""}>{c.render ? c.render(r) : (r[c.key] ?? "—")}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Toaster() {
  const items = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} role="status" className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-pop ${t.tone === "ok" ? "bg-primary-deep text-white" : "bg-[#7F1D14] text-white"}`}>{t.text}</div>
      ))}
    </div>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        <rect width="40" height="40" rx="11" fill="#187a75" />
        <path d="M10 27l7-8 5 4 8-11" stroke="#FFD23F" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="30" cy="12" r="2.6" fill="#EF6C4A" />
      </svg>
      <span className="text-[17px] font-bold tracking-tight text-ink">Business Flow</span>
    </span>
  );
}

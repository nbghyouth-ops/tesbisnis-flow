"use client";
import { useEffect } from "react";

/** Keypad numerik: sentuh mobile + keyboard desktop (termasuk numpad). */
export function Keypad({ onDigit, onBack, onClear, extraKey, onExtra, compact }: {
  onDigit: (d: string) => void; onBack: () => void; onClear?: () => void; extraKey?: string; onExtra?: () => void; compact?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); onDigit(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); onBack(); }
      else if (e.key === "Escape" && onClear) onClear();
      else if ((e.key === "." || e.key === ",") && onExtra) onExtra();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onDigit, onBack, onClear, onExtra]);
  const cls = `grid place-items-center rounded-2xl border border-line bg-white text-xl font-semibold text-ink hover:bg-primary-bg active:bg-primary-bg ${compact ? "h-12" : "h-14 sm:h-16"}`;
  return (
    <div role="group" aria-label="Keypad angka" className="mx-auto grid max-w-[300px] grid-cols-3 gap-2.5">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" className={cls} onClick={() => onDigit(d)}>{d}</button>)}
      {extraKey ? <button type="button" className={cls} onClick={onExtra}>{extraKey}</button> : onClear ? <button type="button" className={`${cls} text-sm`} onClick={onClear}>Hapus semua</button> : <span />}
      <button type="button" className={cls} onClick={() => onDigit("0")}>0</button>
      <button type="button" aria-label="Hapus satu angka" className={cls} onClick={onBack}>⌫</button>
    </div>
  );
}

export function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <div role="img" aria-label={`${filled} dari ${length} angka PIN terisi`} className="flex justify-center gap-3">
      {Array.from({ length }, (_, i) => <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 ${i < filled ? "border-primary-deep bg-primary-deep" : "border-line bg-white"}`} />)}
    </div>
  );
}

"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, registerLockHandler, setTab, getTab } from "@/lib/client";
import { Keypad, PinDots } from "./keypad";
import { Logo } from "./ui";

export type LockInit = { businessName: string; deviceName: string; operatorName: string | null; pinLength: number };
const LockCtx = createContext<{ lock: () => void }>({ lock: () => {} });
export const useLock = () => useContext(LockCtx);

/**
 * Automatic PIN lock (Bab 12). Status unlocked HANYA di memori React (per dokumen/tab):
 * setiap document load, refresh, tab baru, BFCache restore → mulai terkunci.
 * Saat tab hidden/blur/pagehide/freeze atau app Android masuk background → kunci seketika,
 * children di-unmount (state sensitif hilang) dan sesi tab dicabut di server (keepalive).
 */
export function LockProvider({ init, children }: { init: LockInit; children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);

  const lock = useCallback(() => {
    const t = getTab();
    setTab(null);
    setUnlocked(false);
    if (t) {
      try {
        void fetch("/api/v1/device/lock", { method: "POST", keepalive: true, credentials: "same-origin", headers: { "x-requested-with": "bf", "x-tab-session": t, "content-type": "application/json" }, body: "{}" }).catch(() => {});
      } catch { /* abaikan */ }
    }
  }, []);

  useEffect(() => {
    registerLockHandler(() => { setTab(null); setUnlocked(false); });
    const onVis = () => { if (document.visibilityState === "hidden") lock(); };
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) lock(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", lock);
    window.addEventListener("pagehide", lock);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("freeze", lock);
    let removeNative: (() => void) | undefined;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("appStateChange", (s) => { if (!s.isActive) lock(); });
        removeNative = () => { void h.remove(); };
      } catch { /* bukan platform native */ }
    })();
    return () => {
      registerLockHandler(null);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", lock);
      window.removeEventListener("pagehide", lock);
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("freeze", lock);
      removeNative?.();
    };
  }, [lock]);

  // Heartbeat terbatas, hanya saat tab terlihat. Bukan scheduler/job worker.
  useEffect(() => {
    if (!unlocked) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") api("/device/heartbeat", { method: "POST", body: {} }).catch(() => {});
    }, 30_000);
    return () => window.clearInterval(id);
  }, [unlocked]);

  return (
    <LockCtx.Provider value={{ lock }}>
      {unlocked ? children : <PinScreen init={init} onUnlock={(tab) => { setTab(tab); setUnlocked(true); }} />}
    </LockCtx.Provider>
  );
}

function PinScreen({ init, onUnlock }: { init: LockInit; onUnlock: (tab: string) => void }) {
  const [mode, setMode] = useState<"enter" | "new" | "confirm">("enter");
  const [digits, setDigits] = useState("");
  const [first, setFirst] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [len, setLen] = useState(init.pinLength || 6);

  useEffect(() => {
    api<{ pinLength?: number }>("/device/status").then((s) => { if (s.pinLength) setLen(s.pinLength); }).catch(() => {});
  }, []);

  const max = mode === "enter" ? len : 6;
  const reset = () => { setDigits(""); };

  const submitEnter = useCallback(async (pin: string) => {
    setBusy(true); setErr("");
    try { const r = await api<{ tab: string }>("/device/unlock", { body: { pin } }); onUnlock(r.tab); }
    catch (e) { setErr((e as ApiError).message); reset(); }
    finally { setBusy(false); }
  }, [onUnlock]);

  const onDigit = (d: string) => {
    if (busy) return;
    setErr("");
    setDigits((cur) => {
      if (cur.length >= max) return cur;
      const next = cur + d;
      if (mode === "enter" && next.length === len) setTimeout(() => void submitEnter(next), 0);
      return next;
    });
  };

  async function next() {
    setErr("");
    if (mode === "enter") { if (digits.length >= 4) await submitEnter(digits); return; }
    if (mode === "new") {
      if (!/^\d{4,6}$/.test(digits)) { setErr("PIN harus 4–6 angka."); return; }
      setFirst(digits); setDigits(""); setMode("confirm"); return;
    }
    if (digits !== first) { setErr("Konfirmasi PIN tidak sama."); setDigits(""); return; }
    setBusy(true);
    try { const r = await api<{ tab: string }>("/device/change-pin", { body: { pin: first, confirm: digits } }); onUnlock(r.tab); }
    catch (e) { setErr((e as ApiError).message); setDigits(""); setMode("new"); setFirst(""); }
    finally { setBusy(false); }
  }

  const title = mode === "enter" ? "Masukkan PIN" : mode === "new" ? "Masukkan PIN baru" : "Konfirmasi PIN baru";
  return (
    <main className="relative grid min-h-screen place-items-center bg-surface px-4 py-8" aria-label="Layar PIN">
      <div className="w-full max-w-sm rounded-[24px] border border-line bg-white p-6 text-center shadow-pop">
        <div className="mb-5 flex justify-center"><Logo /></div>
        <p className="text-sm text-ink-2">{init.operatorName ? `Halo, ${init.operatorName}` : "Selamat datang kembali"}</p>
        <h1 className="mt-0.5 text-xl font-bold text-ink">{init.businessName}</h1>
        <p className="mb-5 text-xs text-ink-2">{init.deviceName}</p>
        <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
        <PinDots length={mode === "enter" ? len : Math.max(digits.length, 4)} filled={digits.length} />
        <p role="alert" className="mt-3 min-h-[20px] text-sm font-medium text-[#A12A1F]">{err}</p>
        <div className="mt-2">
          <Keypad onDigit={onDigit} onBack={() => setDigits((d) => d.slice(0, -1))} onClear={reset} compact />
        </div>
        {(mode !== "enter" || digits.length >= 4) && (
          <button type="button" disabled={busy} onClick={() => void next()} className="mt-4 min-h-[44px] w-full rounded-xl bg-primary-deep px-4 text-sm font-semibold text-white disabled:bg-ink-2">
            {mode === "enter" ? "Buka" : mode === "new" ? "Lanjut" : "Simpan PIN & Buka Dashboard"}
          </button>
        )}
        <div className="mt-6 flex justify-end">
          {mode === "enter"
            ? <button type="button" onClick={() => { setMode("new"); reset(); setErr(""); }} className="text-xs font-medium text-primary-deep underline underline-offset-2">Ubah PIN</button>
            : <button type="button" onClick={() => { setMode("enter"); reset(); setFirst(""); setErr(""); }} className="text-xs font-medium text-ink-2 underline underline-offset-2">Batal</button>}
        </div>
      </div>
    </main>
  );
}

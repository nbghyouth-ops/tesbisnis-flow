"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Keypad, PinDots } from "@/components/keypad";
import { Button, Logo, TextField } from "@/components/ui";
import { api } from "@/lib/client";

export default function PairPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<"code" | "pin" | "confirm">("code");
  const [pin, setPin] = useState("");
  const [conf, setConf] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const cur = step === "pin" ? pin : conf;
  const setCur = step === "pin" ? setPin : setConf;
  const digit = useCallback((d: string) => setCur((c) => (c.length < 6 ? c + d : c)), [setCur]);

  async function finish() {
    setBusy(true); setErr("");
    try { await api("/device/pair", { body: { code: code.trim().toUpperCase(), pin, confirm: conf, deviceName: name.trim() || "Perangkat baru" } }); router.push("/dashboard"); }
    catch (e) { setErr((e as Error).message); setStep("code"); setPin(""); setConf(""); }
    finally { setBusy(false); }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-[24px] border border-line bg-white p-7 shadow-pop">
        <Logo />
        <h1 className="mt-6 text-2xl font-bold">Sambungkan Perangkat</h1>
        <p className="mt-1 text-sm text-ink-2">Minta Owner membuat kode pairing di menu Perangkat & Keamanan. Kode berlaku 10 menit dan hanya bisa dipakai sekali.</p>
        {err && <p role="alert" className="mt-4 rounded-lg bg-[#FDEDEB] px-3 py-2 text-sm text-[#7F1D14]">{err}</p>}
        {step === "code" ? (
          <form className="mt-5 grid gap-3" onSubmit={(e) => { e.preventDefault(); if (!/^[A-Za-z2-9]{8}$/.test(code.trim())) return setErr("Kode terdiri dari 8 karakter."); setErr(""); setStep("pin"); }}>
            <TextField label="Kode pairing" value={code} onChange={(v) => setCode(v.toUpperCase())} maxLength={8} autoComplete="off" autoCapitalize="characters" />
            <TextField label="Nama perangkat ini" value={name} onChange={setName} placeholder="mis. Tablet Kasir" />
            <Button type="submit">Lanjut: buat PIN</Button>
          </form>
        ) : (
          <div className="mt-5 text-center">
            <h2 className="mb-3 text-sm font-semibold">{step === "pin" ? "Buat PIN (4–6 angka)" : "Konfirmasi PIN"}</h2>
            <PinDots length={Math.max(cur.length, 4)} filled={cur.length} />
            <div className="mt-4"><Keypad onDigit={digit} onBack={() => setCur((c) => c.slice(0, -1))} onClear={() => setCur("")} compact /></div>
            <Button className="mt-4 w-full" loading={busy} disabled={cur.length < 4} onClick={() => step === "pin" ? setStep("confirm") : void finish()}>{step === "pin" ? "Lanjut" : "Aktifkan perangkat"}</Button>
          </div>
        )}
        <p className="mt-6 text-center text-sm"><Link href="/" className="font-semibold text-primary-deep">← Kembali</Link></p>
      </div>
    </main>
  );
}

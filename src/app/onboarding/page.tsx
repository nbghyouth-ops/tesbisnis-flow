"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Keypad, PinDots } from "@/components/keypad";
import { Button, Check, Logo, SelectField, TextArea, TextField } from "@/components/ui";
import { api } from "@/lib/client";
import { LEGAL_DOCS } from "@/lib/legal";
import { TEMPLATES, templateByKey } from "@/lib/templates";

const NEEDS = ["Keuangan", "Penjualan", "POS/Kasir", "Persediaan", "Pembelian", "CRM/Klien", "Pesanan", "Booking", "Karyawan", "Tim", "Operasional", "Proyek", "Pemasaran", "Laporan", "Seluruh pengelolaan bisnis"];
const PROBLEMS = ["Pencatatan manual", "Data tersebar", "Pelacakan keuangan", "Kontrol stok", "Pelacakan penjualan", "Pengelolaan pelanggan", "Pengelolaan pesanan", "Pengelolaan staf", "Pengelolaan cabang", "Laporan"];
const SOLUTIONS = ["Sistem keuangan", "POS", "Manajemen persediaan", "Manajemen klien", "Pesanan", "Karyawan", "Dashboard terpadu", "Multi-cabang", "Laporan bisnis"];
const MODELS = ["Menjual produk ke konsumen (B2C)", "Menjual ke bisnis lain (B2B)", "Jasa/layanan", "Produksi dan penjualan", "Campuran"];
const SCALES = ["Mikro (1–4 orang)", "Kecil (5–19 orang)", "Menengah (20–99 orang)", "Besar (100+ orang)"];
const CHANNELS = ["Toko/kios", "Online/marketplace", "Media sosial", "Pesanan telepon/WA", "Reseller/agen"];
const NAV = [["finance", "Keuangan"], ["sales", "Penjualan & POS"], ["bookings", "Pesanan & Booking"], ["products", "Produk & Stok"], ["purchasing", "Pembelian"], ["crm", "CRM/Klien"], ["hr", "Karyawan & HR"], ["tasks", "Tugas"], ["operations", "Operasional"], ["marketing", "Pemasaran"], ["projects", "Proyek"], ["assets", "Aset"], ["reports", "Laporan"]];
const TZ = [["Asia/Jakarta", "WIB — Asia/Jakarta"], ["Asia/Makassar", "WITA — Asia/Makassar"], ["Asia/Jayapura", "WIT — Asia/Jayapura"], ["Asia/Singapore", "Singapura"], ["Asia/Kuala_Lumpur", "Kuala Lumpur"], ["UTC", "UTC"]];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const STEPS = ["needs", "problems", "solutions", "type", "model", "name", "pin", "pinConfirm", "profile", "owner", "regional", "finance", "branch", "modules", "mode", "review", "legal"] as const;
const TITLES: Record<(typeof STEPS)[number], string> = {
  needs: "Apa yang Anda butuhkan?", problems: "Masalah apa yang ingin diselesaikan?", solutions: "Solusi apa yang Anda inginkan?", type: "Pilih jenis usaha", model: "Model bisnis",
  name: "Nama bisnis", pin: "Buat PIN", pinConfirm: "Konfirmasi PIN", profile: "Profil bisnis", owner: "Pemilik / manajer", regional: "Lokasi & pengaturan regional",
  finance: "Pengaturan keuangan awal", branch: "Cabang", modules: "Konfigurasi modul", mode: "Mode tampilan", review: "Tinjau semua informasi", legal: "Syarat & Privasi",
};

const DEFAULTS: Record<string, any> = {
  needs: [], problems: [], solutions: [], templateKey: "", businessModel: "", name: "", legalName: "", tradeName: "", slogan: "", description: "",
  industry: "", productsServices: "", scale: "", employeeEstimate: "", branchCount: "1", salesChannels: [], operatingHours: "",
  ownerName: "", ownerPosition: "Pemilik", deviceName: "", country: "Indonesia", province: "", city: "", address: "", timezone: "Asia/Jakarta",
  language: "id", dateFormat: "DD/MM/YYYY", currency: "IDR",
  cashAccounts: [{ name: "Kas Utama", kind: "cash", openingBalance: "" }, { name: "Kas Kecil", kind: "cash", openingBalance: "" }],
  incomeCategories: ["Pendapatan Penjualan", "Pendapatan Jasa", "Pendapatan Lain"], expenseCategories: ["Beban Operasional", "Beban Gaji", "Beban Sewa", "Beban Utilitas", "Beban Pemasaran"],
  fiscalStartMonth: 1, mainBranchName: "Pusat", extraBranches: [], modules: [], mode: "simple", acceptTerms: false, acceptPrivacy: false,
};

function toggle(list: string[], v: string) { return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]; }

export default function Onboarding() {
  const router = useRouter();
  const [d, setD] = useState<Record<string, any>>(DEFAULTS);
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: string) => (v: any) => setD((x) => ({ ...x, [k]: v }));
  const id = STEPS[step];

  useEffect(() => {
    api<any>("/onboarding/draft").then((r) => {
      if (r.completed) { router.replace("/dashboard"); return; }
      if (r.draft) setD((x) => ({ ...x, ...r.draft }));
      let s = Math.min(r.step ?? 0, STEPS.length - 1);
      const pinIdx = STEPS.indexOf("pin");
      if (s > pinIdx && !r.pinSet) s = pinIdx; else if (s <= STEPS.indexOf("pinConfirm") && s >= pinIdx && r.pinSet) s = STEPS.indexOf("profile");
      setStep(s);
    }).catch(() => {}).finally(() => setReady(true));
  }, [router]);

  const save = useCallback((s: number, data: Record<string, any>) => api("/onboarding/draft", { body: { step: s, data } }).catch(() => {}), []);

  function validate(): string {
    switch (id) {
      case "type": return d.templateKey ? "" : "Pilih satu jenis usaha.";
      case "name": return d.name.trim().length >= 2 ? "" : "Nama bisnis minimal 2 karakter.";
      case "owner": return !d.ownerName.trim() ? "Nama pemilik/manajer wajib diisi." : !d.deviceName.trim() ? "Nama perangkat wajib diisi." : "";
      case "finance": return d.cashAccounts.some((a: any) => a.name.trim()) ? (d.incomeCategories.length && d.expenseCategories.length ? "" : "Pilih minimal satu kategori pemasukan dan pengeluaran.") : "Minimal satu akun kas/bank.";
      case "branch": return d.mainBranchName.trim() ? "" : "Nama cabang utama wajib diisi.";
      case "legal": return d.acceptTerms && d.acceptPrivacy ? "" : "Anda perlu menyetujui Syarat & Ketentuan serta Kebijakan Privasi.";
      default: return "";
    }
  }

  async function next() {
    setErr("");
    const v = validate(); if (v) return setErr(v);
    if (id === "pin") { if (!/^\d{4,6}$/.test(pin)) return setErr("PIN harus 4–6 angka."); setStep(step + 1); return; }
    if (id === "pinConfirm") {
      if (pin !== pin2) { setErr("Konfirmasi PIN tidak sama."); setPin2(""); return; }
      setBusy(true);
      try { await api("/onboarding/pin", { body: { pin, confirm: pin2 } }); setPin(""); setPin2(""); await save(step + 1, d); setStep(step + 1); }
      catch (e) { setErr((e as Error).message); setPin(""); setPin2(""); setStep(step - 1); }
      finally { setBusy(false); }
      return;
    }
    if (id === "legal") { await complete(); return; }
    const ns = step + 1;
    await save(ns, d);
    setStep(ns);
  }

  async function complete() {
    setBusy(true); setErr("");
    try {
      const body = { ...d, fiscalStartMonth: Number(d.fiscalStartMonth), cashAccounts: d.cashAccounts.filter((a: any) => a.name.trim()), acceptTerms: true, acceptPrivacy: true };
      await api("/onboarding/complete", { body });
      localStorage.setItem("bf_tour", "pending"); localStorage.removeItem("bf_mode");
      setDone(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const pinTarget = id === "pin" ? pin : pin2;
  const setPinTarget = id === "pin" ? setPin : setPin2;
  const digit = useCallback((x: string) => setPinTarget((c) => (c.length < 6 ? c + x : c)), [setPinTarget]);

  if (!ready) return <p role="status" className="p-10 text-center text-ink-2">Memuat…</p>;
  if (done) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface px-4">
        <div className="w-full max-w-md rounded-[24px] border border-line bg-white p-8 text-center shadow-pop">
          <div className="mb-4 flex justify-center"><Logo size={44} /></div>
          <h1 className="text-[28px] font-bold text-ink">Bisnis Anda Sudah Siap!</h1>
          <p className="mt-2 text-sm text-ink-2">Perangkat ini kini menjadi Owner Device untuk <strong>{d.name}</strong>. Anda akan diminta PIN saat membuka dashboard.</p>
          <Button className="mt-6 w-full !min-h-[48px]" onClick={() => router.push("/dashboard")}>Buka Dashboard Bisnis</Button>
        </div>
      </main>
    );
  }

  const tpl = d.templateKey ? templateByKey(d.templateKey) : null;
  const chk = (opts: string[], key: string) => <div className="grid gap-2 sm:grid-cols-2">{opts.map((o) => <Check key={o} label={o} checked={d[key].includes(o)} onChange={() => set(key)(toggle(d[key], o))} />)}</div>;

  const body = (() => {
    switch (id) {
      case "needs": return chk(NEEDS, "needs");
      case "problems": return chk(PROBLEMS, "problems");
      case "solutions": return chk(SOLUTIONS, "solutions");
      case "type": return (
        <div role="radiogroup" aria-label="Jenis usaha" className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <button key={t.key} role="radio" aria-checked={d.templateKey === t.key} type="button"
              onClick={() => setD((x) => ({ ...x, templateKey: t.key, incomeCategories: t.incomeCategories, expenseCategories: t.expenseCategories, modules: t.modules.filter((m) => m !== "dashboard") }))}
              className={`rounded-2xl border p-3 text-left ${d.templateKey === t.key ? "border-primary-deep bg-primary-bg" : "border-line bg-white hover:bg-surface"}`}>
              <span className="block text-sm font-semibold text-ink">{t.name}</span><span className="block text-xs text-ink-2">{t.summary}</span>
            </button>))}
        </div>);
      case "model": return <div className="grid gap-3"><SelectField label="Model bisnis" value={d.businessModel} onChange={set("businessModel")} placeholder="Pilih (opsional)" options={MODELS.map((m) => ({ value: m, label: m }))} />{tpl?.scope && <p className="rounded-xl bg-cream px-3 py-2 text-sm text-ink">Catatan template: {tpl.scope}</p>}</div>;
      case "name": return (
        <div className="grid gap-3">
          <TextField label="Nama bisnis *" value={d.name} onChange={set("name")} autoFocus />
          <div className="grid gap-3 sm:grid-cols-2"><TextField label="Nama badan hukum" value={d.legalName} onChange={set("legalName")} /><TextField label="Nama dagang" value={d.tradeName} onChange={set("tradeName")} /></div>
          <TextField label="Slogan (opsional)" value={d.slogan} onChange={set("slogan")} />
          <TextArea label="Deskripsi" value={d.description} onChange={set("description")} />
          <p className="text-xs text-ink-2">Logo dapat ditambahkan nanti setelah penyimpanan file (Neon Object Storage) dikonfigurasi.</p>
        </div>);
      case "pin": case "pinConfirm": return (
        <div className="mx-auto max-w-xs text-center">
          <p className="mb-4 text-sm text-ink-2">{id === "pin" ? "PIN 4–6 angka untuk mengunci perangkat ini. Disimpan sebagai hash Argon2id, tanpa email atau OTP." : "Masukkan PIN yang sama sekali lagi."}</p>
          <PinDots length={Math.max(pinTarget.length, 4)} filled={pinTarget.length} />
          <div className="mt-5"><Keypad onDigit={digit} onBack={() => setPinTarget((c) => c.slice(0, -1))} onClear={() => setPinTarget("")} compact /></div>
        </div>);
      case "profile": return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Industri" value={d.industry} onChange={set("industry")} /><SelectField label="Skala usaha" value={d.scale} onChange={set("scale")} placeholder="Pilih" options={SCALES.map((s) => ({ value: s, label: s }))} />
          <TextField label="Perkiraan jumlah karyawan" value={d.employeeEstimate} onChange={set("employeeEstimate")} inputMode="numeric" /><TextField label="Jumlah cabang" value={d.branchCount} onChange={set("branchCount")} inputMode="numeric" />
          <div className="sm:col-span-2"><TextArea label="Produk/layanan utama" value={d.productsServices} onChange={set("productsServices")} /></div>
          <div className="sm:col-span-2"><p className="mb-1 text-[13px] font-semibold">Saluran penjualan</p>{chk(CHANNELS, "salesChannels")}</div>
          <div className="sm:col-span-2"><TextField label="Jam operasional" value={d.operatingHours} onChange={set("operatingHours")} placeholder="mis. Senin–Sabtu 08.00–21.00" /></div>
        </div>);
      case "owner": return (
        <div className="grid gap-3">
          <TextField label="Nama pemilik/manajer *" value={d.ownerName} onChange={set("ownerName")} /><TextField label="Jabatan" value={d.ownerPosition} onChange={set("ownerPosition")} />
          <TextField label="Nama perangkat utama *" value={d.deviceName} onChange={set("deviceName")} placeholder="mis. Laptop Toko" />
          <p className="text-xs text-ink-2">Tidak ada email login. Nama ini hanya dipakai untuk atribusi aktivitas pada perangkat; ini bukan verifikasi identitas.</p>
        </div>);
      case "regional": return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Negara" value={d.country} onChange={set("country")} /><TextField label="Provinsi" value={d.province} onChange={set("province")} />
          <TextField label="Kota" value={d.city} onChange={set("city")} /><SelectField label="Zona waktu" value={d.timezone} onChange={set("timezone")} options={TZ.map(([v, l]) => ({ value: v, label: l }))} />
          <div className="sm:col-span-2"><TextArea label="Alamat" value={d.address} onChange={set("address")} /></div>
          <SelectField label="Bahasa" value={d.language} onChange={set("language")} options={[{ value: "id", label: "Indonesia" }, { value: "en", label: "English" }]} />
          <SelectField label="Format tanggal" value={d.dateFormat} onChange={set("dateFormat")} options={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].map((x) => ({ value: x, label: x }))} />
          <SelectField label="Mata uang" value={d.currency} onChange={set("currency")} options={["IDR", "USD", "EUR", "SGD", "MYR", "JPY"].map((x) => ({ value: x, label: x }))} />
        </div>);
      case "finance": return (
        <div className="grid gap-5">
          <div>
            <h3 className="text-sm font-semibold">Akun Kas & Bank</h3>
            <p className="mb-2 text-xs text-ink-2">Saldo awal hanya diisi jika Anda mengetahui nilainya. Kosongkan jika tidak yakin.</p>
            {d.cashAccounts.map((a: any, i: number) => (
              <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1fr_130px_1fr_auto]">
                <TextField label="Nama akun" value={a.name} onChange={(v) => set("cashAccounts")(d.cashAccounts.map((x: any, j: number) => (j === i ? { ...x, name: v } : x)))} />
                <SelectField label="Jenis" value={a.kind} onChange={(v) => set("cashAccounts")(d.cashAccounts.map((x: any, j: number) => (j === i ? { ...x, kind: v } : x)))} options={[{ value: "cash", label: "Kas" }, { value: "bank", label: "Bank" }, { value: "ewallet", label: "E-wallet usaha" }]} />
                <TextField label={`Saldo awal (${d.currency})`} inputMode="decimal" value={a.openingBalance} onChange={(v) => set("cashAccounts")(d.cashAccounts.map((x: any, j: number) => (j === i ? { ...x, openingBalance: v.replace(/[^\d.]/g, "") } : x)))} />
                <div className="self-end"><Button variant="ghost" onClick={() => set("cashAccounts")(d.cashAccounts.filter((_: any, j: number) => j !== i))}>Hapus</Button></div>
              </div>))}
            <Button variant="secondary" onClick={() => set("cashAccounts")([...d.cashAccounts, { name: "", kind: "bank", openingBalance: "" }])}>+ Tambah akun bank/kas</Button>
          </div>
          {([["incomeCategories", "Kategori pemasukan"], ["expenseCategories", "Kategori pengeluaran"]] as const).map(([k, label]) => (
            <div key={k}><h3 className="mb-2 text-sm font-semibold">{label}</h3>
              <div className="grid gap-2 sm:grid-cols-2">{d[k].map((c: string) => <Check key={c} label={c} checked onChange={() => set(k)(d[k].filter((x: string) => x !== c))} />)}</div>
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem(`c-${k}`) as HTMLInputElement); if (v.value.trim()) { set(k)([...d[k], v.value.trim()]); v.value = ""; } }}>
                <input name={`c-${k}`} aria-label={`Tambah ${label}`} className="field-input" placeholder="Tambah kategori…" /><Button type="submit" variant="secondary">Tambah</Button></form>
            </div>))}
          <SelectField label="Tahun fiskal dimulai bulan" value={String(d.fiscalStartMonth)} onChange={(v) => set("fiscalStartMonth")(Number(v))} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
        </div>);
      case "branch": return (
        <div className="grid gap-3">
          <TextField label="Nama cabang utama *" value={d.mainBranchName} onChange={set("mainBranchName")} />
          <div><p className="mb-1 text-[13px] font-semibold">Cabang tambahan</p>
            {d.extraBranches.map((b: string, i: number) => <div key={i} className="mb-2 flex gap-2"><input aria-label={`Cabang tambahan ${i + 1}`} className="field-input" value={b} onChange={(e) => set("extraBranches")(d.extraBranches.map((x: string, j: number) => (j === i ? e.target.value : x)))} /><Button variant="ghost" onClick={() => set("extraBranches")(d.extraBranches.filter((_: string, j: number) => j !== i))}>Hapus</Button></div>)}
            <Button variant="secondary" onClick={() => set("extraBranches")([...d.extraBranches, ""])}>+ Tambah cabang</Button></div>
          <p className="text-xs text-ink-2">Setiap bisnis mendapat satu gudang utama otomatis. Gudang tambahan dapat dibuat di Pengaturan.</p>
        </div>);
      case "modules": return (
        <div><p className="mb-3 text-sm text-ink-2">Rekomendasi untuk template <strong>{tpl?.name}</strong> sudah dipilih. Semua modul tetap tersedia; pilihan ini hanya menentukan prioritas navigasi awal.</p>
          <div className="grid gap-2 sm:grid-cols-2">{NAV.map(([k, l]) => <Check key={k} label={l} checked={d.modules.includes(k)} onChange={() => set("modules")(toggle(d.modules, k))} />)}</div></div>);
      case "mode": return (
        <div role="radiogroup" aria-label="Mode tampilan" className="grid gap-3 sm:grid-cols-2">
          {[["simple", "Mode Sederhana", "Menu inti saja, istilah mudah. Cocok untuk pemula."], ["advanced", "Mode Lanjutan", "Semua modul dan kontrol terlihat (HR, proyek, aset, template, dsb.)."]].map(([k, t, desc]) => (
            <button key={k} role="radio" aria-checked={d.mode === k} type="button" onClick={() => set("mode")(k)} className={`rounded-2xl border p-4 text-left ${d.mode === k ? "border-primary-deep bg-primary-bg" : "border-line bg-white"}`}><span className="block font-semibold">{t}</span><span className="text-sm text-ink-2">{desc}</span></button>))}
          <p className="text-xs text-ink-2 sm:col-span-2">Dapat diubah kapan saja lewat tombol Mode di topbar.</p>
        </div>);
      case "review": {
        const row = (label: string, value: string, to: (typeof STEPS)[number]) => (
          <div key={label} className="flex items-start justify-between gap-3 border-t border-divider py-2.5 text-sm"><div><p className="text-xs text-ink-2">{label}</p><p className="font-medium">{value || "—"}</p></div><Button variant="ghost" onClick={() => setStep(STEPS.indexOf(to))}>Ubah</Button></div>);
        return (
          <div>
            {row("Jenis usaha", tpl?.name ?? "", "type")}{row("Model", d.businessModel, "model")}{row("Nama bisnis", d.name, "name")}
            {row("Kebutuhan", d.needs.join(", "), "needs")}{row("Profil", [d.industry, d.scale, d.operatingHours].filter(Boolean).join(" • "), "profile")}
            {row("Pemilik/manajer & perangkat", `${d.ownerName} (${d.ownerPosition}) — ${d.deviceName}`, "owner")}
            {row("Lokasi", [d.city, d.province, d.country].filter(Boolean).join(", ") + ` • ${d.timezone} • ${d.currency}`, "regional")}
            {row("Akun kas & bank", d.cashAccounts.filter((a: any) => a.name).map((a: any) => `${a.name}${a.openingBalance ? ` (saldo awal ${a.openingBalance})` : ""}`).join(", "), "finance")}
            {row("Kategori", `${d.incomeCategories.length} pemasukan, ${d.expenseCategories.length} pengeluaran`, "finance")}
            {row("Cabang", [d.mainBranchName, ...d.extraBranches].filter(Boolean).join(", "), "branch")}
            {row("Modul prioritas", d.modules.map((m: string) => NAV.find((n) => n[0] === m)?.[1]).join(", "), "modules")}{row("Mode", d.mode === "simple" ? "Sederhana" : "Lanjutan", "mode")}
            <p className="border-t border-divider pt-3 text-xs text-ink-2">PIN sudah dibuat dan tidak ditampilkan.</p>
          </div>);
      }
      case "legal": return (
        <div className="grid gap-4">
          {(["terms", "privacy"] as const).map((k) => (
            <details key={k} className="rounded-xl border border-line bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">{LEGAL_DOCS[k].title} (versi 1.0)</summary>
              <div className="mt-2 space-y-2 text-sm text-ink-2">{LEGAL_DOCS[k].body.map((p) => <p key={p}>{p}</p>)}</div></details>))}
          <Check label="Saya menyetujui Syarat & Ketentuan (versi 1.0)" checked={d.acceptTerms} onChange={set("acceptTerms")} />
          <Check label="Saya menyetujui Kebijakan Privasi (versi 1.0)" checked={d.acceptPrivacy} onChange={set("acceptPrivacy")} />
          <p className="text-xs text-ink-2">Persetujuan dicatat dengan versi dokumen, waktu, dan perangkat. Dokumen ini templat awal, bukan nasihat hukum.</p>
        </div>);
    }
  })();

  return (
    <main className="min-h-screen bg-surface px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 flex items-center justify-between"><Logo /><Link href="/" className="text-sm font-semibold text-primary-deep">Keluar (draft tersimpan)</Link></div>
        <div className="mb-5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="Kemajuan onboarding">
          <p className="mb-1 text-xs font-semibold text-ink-2">Langkah {step + 1} dari {STEPS.length}</p>
          <div className="h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-primary-deep transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        </div>
        <section className="rounded-[22px] border border-line bg-white p-6 shadow-card sm:p-8">
          <h1 className="mb-5 text-2xl font-bold text-ink">{TITLES[id]}</h1>
          {body}
          {err && <p role="alert" className="mt-4 rounded-lg bg-[#FDEDEB] px-3 py-2 text-sm text-[#7F1D14]">{err}</p>}
          <div className="mt-6 flex items-center justify-between gap-2">
            <Button variant="secondary" disabled={step === 0 || id === "profile" || id === "pinConfirm"} onClick={() => { setErr(""); setStep(step - 1); }}>Kembali</Button>
            <Button loading={busy} onClick={() => void next()}>{id === "legal" ? "Buat Workspace" : id === "review" ? "Lanjut ke Persetujuan" : "Lanjut"}</Button>
          </div>
        </section>
      </div>
    </main>
  );
}


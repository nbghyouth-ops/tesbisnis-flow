# Acceptance Matrix (status: PASS / FAIL / BLOCKED / NOT TESTED / NOT APPLICABLE)

Bukti PASS = `scripts/smoke-api.mjs` (68 pengecekan, DB PostgreSQL lokal), `npx vitest run` (16 tes), `next build`, render SSR rute.

| Release gate | Status | Catatan |
|---|---|---|
| Tidak ada login akun/OTP/email | PASS | tidak ada endpoint/halaman tsb |
| Device principal + cookie HttpOnly + hash token | PASS | smoke |
| PIN Argon2id, lemah ditolak, ubah PIN tanpa PIN lama | PASS | smoke + unit |
| Auto-lock event browser | NOT TESTED (di browser) | kode ada; verifikasi server PASS |
| Per-tab isolation | PASS (server) / NOT TESTED (browser) | smoke |
| Android lifecycle lock | NOT TESTED | kode memakai `@capacitor/app`; APK belum dibuat |
| Device revoke seketika | PASS | smoke |
| Pairing sekali pakai | PASS | smoke |
| RBAC server | PASS | smoke |
| RLS fail-closed | **FAIL / tidak diimplementasikan** | lihat TENANT_ISOLATION.md |
| Composite FK tenant | tidak diimplementasikan | |
| Double-entry seimbang, reversal, period lock | PASS | unit + smoke (reversal; period lock tidak diuji otomatis) |
| Transfer bukan pendapatan | PASS | smoke (laba bersih) |
| AR/AP payment tidak double count | PASS | smoke |
| Idempotency | PASS | smoke (transaksi) |
| Konkurensi checkout / booking | PASS | smoke |
| Konkurensi cash close, approval, import, nomor dokumen | NOT TESTED (nomor dokumen memakai upsert atomik) | |
| Object Storage / upload / signed URL | BLOCKED / tidak diimplementasikan | |
| Neon Function + Trigger | BLOCKED (kode ada, belum diuji) | |
| Vercel cron dihapus | PASS | `vercel.json` tanpa crons |
| Single `DATABASE_URL` | PASS | tidak ada ENV lain dibaca aplikasi |
| Migrasi terversi | PARTIAL | baseline `0000_baseline.sql` + SQL integritas; belum diuji di Neon |
| Import/Migration Center | tidak diimplementasikan | |
| T&C/Privacy management lanjutan | PARTIAL | dokumen v1.0 + riwayat persetujuan; tanpa draft/review/DSR |
| Business rules center | PARTIAL | tarif pajak & ambang persetujuan saja |
| Template 16 | PARTIAL | konfigurasi prioritas/istilah/kategori/langkah; bukan workflow khusus per jenis |
| XLSX/PDF export | tidak diimplementasikan (tidak ada tombol) | CSV PASS |
| Playwright E2E, visual regression, Android build | NOT TESTED | |
| WCAG 2.2 AA | NOT TESTED | lihat UI_DESIGN_REVIEW |

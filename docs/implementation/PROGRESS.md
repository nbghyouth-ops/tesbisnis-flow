# PROGRESS — Business Flow

Terakhir diperbarui: sesi implementasi pertama. Semua status berdasarkan bukti yang dijalankan di sandbox (PostgreSQL **lokal**, bukan Neon).

## Audit awal (Phase 1)
- Repo awal = template starter Next.js 16 + Drizzle + `pg` tanpa tabel, tanpa auth, tanpa migrasi.
- Ditemukan: `drizzle.config.json` memuat URL database yang di-hardcode (`127.0.0.1`) → dihapus, diganti `drizzle.config.ts` yang hanya membaca `DATABASE_URL`.
- Item audit legacy Bab 31: tidak ada login/OTP lama, tidak ada file di bytea, tidak ada endpoint worker publik, tidak ada bootstrap role/policy runtime, tidak ada vercel cron. Lockfile ada (`package-lock.json`).

## Selesai & teruji
| Area | Status | Bukti |
|---|---|---|
| Skema database (≈45 tabel) + baseline migrasi `drizzle/migrations/0000_baseline.sql` | PASS (diterapkan ke DB lokal) | `drizzle-kit push`, `generate` |
| Trigger integritas (jurnal & ledger stok append-only) `scripts/sql/001_integrity.sql` | Diterapkan lokal; belum ada tes otomatis khusus | psql |
| Device principal, cookie HttpOnly, PIN Argon2id, sesi tab per-tab, lock/unlock, ubah PIN, pairing, revoke, brute-force lock | PASS | `scripts/smoke-api.mjs` |
| Onboarding 17 langkah + draft di DB + pembuatan workspace atomik | PASS (API); UI wizard dikompilasi & dirender, belum diuji E2E browser | smoke + `build` |
| Keuangan: income/expense/transfer, state machine, approval, reversal, jurnal seimbang, periode, anggaran | PASS | smoke + unit |
| Penjualan/POS atomik, piutang, retur penuh, stok ledger, rata-rata bergerak, pembelian parsial, utang | PASS | smoke (termasuk 5 checkout paralel) |
| Booking anti double-booking (advisory lock) | PASS (4 paralel → 1 berhasil) | smoke |
| Sesi kas | PASS | smoke |
| RBAC server per peran | PASS | smoke + unit |
| Laporan (neraca saldo, laba rugi, neraca, arus kas, buku besar, penjualan, persediaan, klien) + CSV | API PASS (seimbang); CSV unit PASS | smoke + unit |
| UI: design system teal/mint, shell responsif, semua halaman modul | Build PASS; render SSR PASS (`/uicheck`); **belum diuji visual di browser** | next build |

## Belum selesai / tidak diimplementasikan (jujur)
Lihat `FINAL_REPORT.md` §16–17. Ringkas: RLS, Object Storage/dokumen, impor data, XLSX/PDF, quotation/sales order, stock transfer/count/FIFO/BOM, payroll/cuti, manajemen versi T&C/privasi lanjutan, OpenAPI, Playwright, build Android, deploy Neon Functions.

## Bug ditemukan & diperbaiki (lihat BUG_REGISTER.md)
BF-001 … BF-004.

## Blocker aktual
- Tidak ada akses Neon (project/branch/Object Storage/Functions) di sandbox → semua yang membutuhkan Neon = BLOCKED.
- Tidak ada browser/Android SDK di sandbox → E2E, visual regression, build APK = NOT TESTED.

## Langkah lanjutan yang disarankan
1. Pemilik: ikuti `docs/deployment/NEON_SETUP.md`, jalankan migrasi + `scripts/sql/001_integrity.sql`, jalankan `node scripts/smoke-api.mjs` terhadap preview.
2. Implementasikan RLS + role runtime non-superuser (lihat `docs/database/TENANT_ISOLATION.md`).
3. Tambah Playwright E2E untuk onboarding, lock per-tab, kasir.
4. Object Storage pipeline lewat Neon Functions.

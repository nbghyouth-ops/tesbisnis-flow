# Neon Setup (manual oleh pemilik)

> Dokumen ini panduan. Tidak ada langkah di bawah yang sudah dilakukan atau diverifikasi dari sandbox pengembangan.

1. Buat Neon project. Pilih region. Neon Functions tersedia di sejumlah region AWS (mis. `aws-ap-southeast-1` Singapura) — periksa daftar terbaru di dokumentasi Neon sebelum memilih. Region di luar Indonesia memerlukan kajian transfer data lintas negara (UU PDP).
2. Buat branch `production` (default) dan branch `development`/`staging`. Production dan non-production **harus** memakai `DATABASE_URL` berbeda.
3. Ambil connection string tiap branch (Connect → pooled).
4. Jalankan migrasi pada branch target, berurutan:
   1. Neon SQL Editor → tempel isi `drizzle/migrations/0000_baseline.sql` (atau `DATABASE_URL=… npx drizzle-kit migrate`).
   2. Tempel isi `scripts/sql/001_integrity.sql` (trigger: jurnal & ledger stok append-only). Idempoten.
5. Sebelum production: ambil backup/branch snapshot (lihat `docs/database/BACKUP_RESTORE.md`).
6. Isi `DATABASE_URL` di hosting (lihat `ENVIRONMENT_VARIABLES.md`).
7. Verifikasi: `curl https://<host>/api/v1/health` → `{"ok":true}`.
8. Uji integrasi pada **branch non-production**: `BASE_URL=https://<preview> node scripts/smoke-api.mjs` (membuat bisnis uji; jangan jalankan di production).
9. Object Storage, Functions, Triggers: lihat `NEON_FUNCTIONS_SETUP.md` dan `OBJECT_STORAGE_SETUP.md`.
10. Uji restore (drill) pada branch terisolasi.

Migrasi tidak pernah dijalankan otomatis saat aplikasi start atau dari health endpoint.

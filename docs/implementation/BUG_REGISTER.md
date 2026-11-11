# BUG REGISTER

| ID | Ditemukan oleh | Deskripsi | Dampak | Status |
|---|---|---|---|---|
| BF-001 | Smoke test API | `assertCurrencyPrecision` melempar `Error` biasa → respons 500 untuk nominal pecahan pada IDR | Pesan error buruk, bukan 422 | DIPERBAIKI (`MoneyError` → 422) |
| BF-002 | Smoke test API | Error unik Postgres terbungkus `DrizzleQueryError` (`cause`) sehingga SKU duplikat tidak menjadi 409 | 500 alih-alih 409 | DIPERBAIKI (baca `error.cause`) |
| BF-003 | Unit test | Validasi PIN meloloskan pola berulang periode 2 (mis. `121212`) | PIN lemah diterima | DIPERBAIKI (cek periode berulang umum) |
| BF-004 | Review | `drizzle.config.json` menyimpan connection string lokal hardcoded | Melanggar aturan satu `DATABASE_URL` | DIPERBAIKI (dihapus; `drizzle.config.ts`) |
| KI-001 | Desain | Isolasi tenant memakai filter `workspace_id` di aplikasi + cek referensi, **tanpa RLS** | Bug query dapat membocorkan data antar tenant | TERBUKA — lihat TENANT_ISOLATION.md |
| KI-002 | Desain | Rate limit in-memory per instance serverless | Bukan global | TERBUKA |
| KI-003 | Desain | Selisih sesi kas tidak dijurnal otomatis | Selisih hanya dicatat | By design, terdokumentasi |
| KI-004 | Desain | PIN adalah tindakan kognitif (WCAG 3.3.8) | Risiko aksesibilitas untuk pengguna dengan kesulitan mengingat | TERBUKA — perangkat tetap tepercaya; perlu kajian |

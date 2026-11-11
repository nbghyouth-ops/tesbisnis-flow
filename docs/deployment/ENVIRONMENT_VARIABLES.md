# Environment Variables

**Satu-satunya ENV aplikasi yang diperlukan secara manual adalah `DATABASE_URL`.**

| Item | Nilai |
|---|---|
| Tujuan | Koneksi ke Neon PostgreSQL (satu-satunya database otoritatif) untuk runtime Next.js, Drizzle ORM, dan Drizzle Kit |
| Format | `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require` |
| Cara memperoleh | Neon Console → project → Connect → salin connection string (gunakan *pooled* untuk Vercel serverless jika memakai driver yang kompatibel; lihat catatan di bawah) |
| Tempat mengisi | Vercel → Project → Settings → Environment Variables; atau `.env` lokal (jangan di-commit; lihat `.env.example`) |
| Environment | Production / Preview / Development diisi dengan **branch Neon yang berbeda** — Preview/Development jangan menunjuk database production |
| Cara memeriksa | `GET /api/v1/health` mengembalikan `{ "ok": true }` bila query `select 1` berhasil |
| Penyamaran log | Kode tidak pernah mencetak `DATABASE_URL`. Saat menyalin log/screenshot, ganti bagian `USER:PASSWORD@` dengan `***@` |

Tidak ada `AUTH_SECRET`, `CRON_SECRET`, `JWT_SECRET`, `DIRECT_URL`, kunci S3, dll. PIN di-hash Argon2id dengan salt unik; token perangkat/tab dibuat acak (256 bit) dan hanya hash SHA-256 yang disimpan.

## Catatan teknis jujur
- Driver yang dipakai saat ini: `pg` (node-postgres) Pool + Drizzle `node-postgres`, **bukan** `@neondatabase/serverless`. Ini berfungsi dengan transaksi interaktif (checkout, jurnal). Dengan pooled connection Neon (PgBouncer mode transaksi), transaksi `BEGIN…COMMIT` aman, dan aplikasi **tidak memakai** session-level setting/`SET` maupun advisory lock sesi. Aplikasi memakai `pg_advisory_xact_lock` (transaction-level) untuk booking — kompatibel dengan mode transaksi. **Belum diuji terhadap Neon pooled endpoint** (BLOCKED).
- `drizzle-kit` dapat berjalan dengan `DATABASE_URL` yang sama. Jika pooled URL bermasalah untuk migrasi, jalankan `drizzle/migrations/0000_baseline.sql` dan `scripts/sql/001_integrity.sql` lewat Neon SQL Editor; jangan menambah ENV `DIRECT_URL`.
- `CAP_SERVER_URL` pada `capacitor.config.ts` adalah variabel **waktu build Android**, bukan ENV aplikasi runtime; boleh juga diganti dengan mengedit file konfigurasi tersebut sebelum build.
- Neon Functions memperoleh `DATABASE_URL` dan kredensial Object Storage otomatis dari platform; tidak perlu diisi manual.

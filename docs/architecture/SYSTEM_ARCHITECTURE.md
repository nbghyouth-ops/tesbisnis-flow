# System Architecture (ringkas, sesuai kode)

```
Browser/Android(Capacitor) ──► Next.js App Router (RSC hanya untuk layar PIN & redirect)
        │  fetch /api/v1/*  (cookie bf_device HttpOnly + header x-tab-session + x-requested-with)
        ▼
src/app/api/v1/[...path]/route.ts → dispatch() (src/server/core.ts)
   rate limit → CSRF/Origin → device lookup (sha256 token) → grant → tab session → permission → handler
        ▼
src/server/routes/*  (Zod validation, transaksi Drizzle, audit, idempotency)
        ▼
PostgreSQL (DATABASE_URL) — pg Pool + drizzle-orm/node-postgres
```
- Data sensitif tidak di-render server: layout `(app)` hanya mengirim nama bisnis/perangkat; semua data dimuat klien setelah unlock dan di-unmount saat terkunci.
- Transaksi: `db.transaction`; kunci baris `FOR UPDATE` (produk, faktur, PO, tagihan, transaksi), `pg_advisory_xact_lock` (booking), unique index parsial (satu sesi kas terbuka per akun), penomoran atomik (`doc_counters` upsert).
- Idempotency: tabel `idempotency_keys` unik `(workspace_id, "<device>:<key>")`, respons disimpan dalam transaksi yang sama.
- Immutability: trigger DB (jurnal & ledger stok) + status machine di aplikasi.
- Background: tabel `jobs` + `functions/job-dispatcher` (Neon Function; belum diuji).

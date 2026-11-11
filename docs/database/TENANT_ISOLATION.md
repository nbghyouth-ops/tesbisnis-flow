# Tenant Isolation — status jujur

## Yang ada
- Setiap tabel tenant memiliki `workspace_id` (dan `business_id`). Semua query server menyertakan `workspace_id` dari **grant perangkat di server** (cookie perangkat → `device_grants`), bukan dari input browser.
- Referensi silang (klien, produk, akun kas, kategori, dst.) diverifikasi per-workspace sebelum dipakai (`checkRefs` di `src/server/routes/resources.ts`, pengecekan eksplisit di rute keuangan/penjualan/pembelian).
- Tes integrasi: `scripts/smoke-api.mjs` memverifikasi perangkat yang dicabut/tanpa izin ditolak. **Belum ada tes lintas-tenant khusus** (dua workspace saling menebak ID) — NOT TESTED.

## Yang BELUM ada (celah terhadap Bab 14)
- **Row Level Security (RLS) belum diimplementasikan.** Tidak ada `ENABLE ROW LEVEL SECURITY`, tidak ada `set_config(..., true)` per transaksi, tidak ada role runtime non-superuser, dan tidak ada composite foreign key `(workspace_id, id)`.
- Konsekuensi: satu bug query (lupa filter `workspace_id`) dapat membocorkan data antar tenant. Perlindungan saat ini hanya disiplin kode + review.

## Rencana implementasi RLS
1. Buat role `bf_app` (NOLOGIN→LOGIN, bukan superuser, tanpa BYPASSRLS) dan role `bf_migrator`.
2. `ALTER TABLE … ENABLE/FORCE ROW LEVEL SECURITY` + policy `USING (workspace_id = current_setting('app.workspace_id', true)::uuid)`; tanpa setting → deny.
3. Bungkus setiap permintaan terautentikasi dalam `db.transaction` yang memanggil `select set_config('app.workspace_id', $1, true)` sebagai langkah pertama (aman untuk PgBouncer mode transaksi).
4. Tambah composite FK dan tes: konteks hilang, kebocoran koneksi pool, lintas-tenant.
5. Karena `DATABASE_URL` tunggal, role `bf_app` dipakai runtime; migrasi memakai SQL Editor dengan role pemilik.

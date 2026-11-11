# Backup & Restore

**Tidak ada backup yang dikonfigurasi atau diverifikasi dari aplikasi ini.** Jangan mengklaim backup aktif sebelum pemilik memverifikasinya di Neon.

Yang harus dilakukan pemilik:
1. Periksa kapabilitas backup/PITR dan retensi pada plan Neon yang dipilih; catat RPO/RTO yang disanggupi.
2. Lakukan *restore drill*: restore ke branch terisolasi → jalankan `GET /api/v1/health` dan `scripts/smoke-api.mjs` (pada branch tersebut) → bandingkan neraca saldo (`/reports/trial-balance` harus seimbang).
3. Pemulihan satu tenant: jangan menimpa production. Restore ke branch, validasi relasi, ekstrak data tenant yang berwenang, impor dan rekonsiliasi, catat di audit.
4. Perlindungan Object Storage diperiksa terpisah (belum digunakan).

Integritas yang membantu verifikasi pasca-restore: neraca saldo dan neraca harus seimbang; saldo kas = jumlah jurnal; stok = jumlah ledger pergerakan.

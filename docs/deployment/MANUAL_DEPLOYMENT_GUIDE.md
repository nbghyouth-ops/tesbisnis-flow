# Manual Deployment, Kompatibilitas Vercel, dan Production Checklist

## Urutan
1. Persiapan repo: `npm ci`, `npx next typegen`, `npm exec tsc -- --noEmit`, `npm run build`, `npx vitest run`.
2. Neon: ikuti `NEON_SETUP.md` (migrasi pada branch target).
3. Hosting: buat project, isi **hanya** `DATABASE_URL`. Preview memakai branch Neon non-production.
4. Preview deployment → smoke test: `/api/v1/health`, jalankan `scripts/smoke-api.mjs` (branch non-production!), buka UI di ponsel & desktop.
5. Neon Functions + Trigger (`NEON_FUNCTIONS_SETUP.md`).
6. Production gate: semua item di bawah.
7. Rollback: redeploy build sebelumnya; skema tidak dihapus (expand/contract); restore tenant lewat branch terisolasi.

## Vercel
- Tidak ada `crons` di `vercel.json`. Tidak ada job background di Vercel.
- Hobby = personal/nonkomersial. **Jangan** memakai data klien nyata di Hobby; pilih plan/hosting yang mengizinkan penggunaan komersial. Aplikasi tidak bergantung fitur khusus Vercel dan dapat dipindah.
- API pendek, payload dibatasi 256 KB (JSON); tidak ada upload file di Vercel Function.

## Production checklist (centang oleh pemilik)
- [ ] `DATABASE_URL` production ≠ preview/dev
- [ ] Migrasi + trigger integritas diterapkan, backup diverifikasi
- [ ] Domain HTTPS (cookie `bf_device` menjadi `Secure` otomatis di HTTPS)
- [ ] RLS & role runtime non-superuser (BELUM ada di kode — keputusan risiko pemilik)
- [ ] Kajian hukum UU PDP / transfer lintas negara / PSE
- [ ] Neon Functions + Trigger production only
- [ ] Object Storage privat (bila fitur dokumen dibutuhkan)
- [ ] Uji perangkat hilang: revoke bekerja
- [ ] Uji Android nyata (belum dibuat/diuji)

## Troubleshooting singkat
- `/api/v1/health` 500 → `DATABASE_URL` salah/DB tidak dapat dijangkau.
- Layar PIN muncul terus saat pindah tab → perilaku keamanan yang disengaja.
- Perangkat terkunci sementara → 5× PIN salah; tunggu hitung mundur.

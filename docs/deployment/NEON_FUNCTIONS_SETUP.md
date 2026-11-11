# Neon Functions & Scheduler

**Status: kode ada, TIDAK DIDEPLOY, TIDAK DIUJI (BLOCKED — butuh akun Neon).**

- Sumber: `functions/job-dispatcher/index.ts`. Bentuk handler `export default { fetch(request) }` sesuai dokumentasi Neon Functions (diperiksa: https://neon.com/docs/compute/functions).
- Isi: lease recovery, `FOR UPDATE SKIP LOCKED`, retry eksponensial + jitter, dead-letter, allowlist job (`invoice.due_reminder`, `stock.low_alert`), pembersihan sesi tab & idempotency key lama, batas waktu 25 detik per invocation.
- **Belum ada producer**: aplikasi saat ini belum menulis baris ke tabel `jobs` (tabel & dispatcher siap). Jadi dispatcher hanya melakukan maintenance sampai producer ditambahkan.
- Catatan jujur: dokumentasi Neon menyebut Functions bukan job queue; durable queue kita ada di PostgreSQL (`jobs`), dispatcher hanya pemicu terjadwal.

## Langkah pemilik
1. Pasang Neon CLI sesuai dokumentasi, tautkan project, deploy folder `functions/job-dispatcher` (ikuti halaman *Deploy* di dokumentasi; konfigurasi file `neon.ts` mengikuti skema resmi saat itu — belum dibuat di repo karena skema tidak diverifikasi).
2. Buat Function Trigger terjadwal `*/5 * * * *` (UTC) pada branch **production** saja. Pastikan trigger tidak aktif di branch development dan child branch (periksa pewarisan trigger).
3. Verifikasi mekanisme autentikasi pemanggil Trigger (halaman *Authentication* Neon). Dispatcher tidak mempercayai payload sehingga pemanggilan tidak sah hanya memicu pemrosesan job jatuh tempo yang terbatas.
4. `DATABASE_URL` disuntikkan otomatis; jangan isi manual.
5. Uji: sisipkan job uji di branch staging, panggil fungsi, periksa status `succeeded`, uji lease expired & duplicate invocation.

Tidak ada Vercel Cron (`vercel.json` tidak memiliki `crons`).

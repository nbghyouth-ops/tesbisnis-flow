# Object Storage (dokumen/lampiran)

**Status: TIDAK DIIMPLEMENTASIKAN (BLOCKED).** Upload dokumen klien/aset, logo, dan lampiran transaksi memerlukan Neon Object Storage privat + Neon Functions yang hanya dapat dikonfigurasi pemilik. Karena itu UI tidak menampilkan tombol unggah (tidak ada fitur palsu), dan tidak ada file yang disimpan di PostgreSQL.

Rancangan yang harus dibangun setelah Neon siap (belum ada kodenya):
1. Upload intent di tabel PostgreSQL (workspace, resource, MIME allowlist, ukuran maks, kedaluwarsa).
2. File dikirim ke Neon Function (bukan Vercel Function; batas payload 4,5 MB) atau presigned URL jika CORS Object Storage terverifikasi.
3. Function memeriksa ukuran, checksum, magic bytes; metadata difinalisasi di PostgreSQL; status `upload_pending → uploaded → verified → active | failed | delete_pending → deleted`.
4. Unduhan via URL bertanda tangan berumur pendek + audit akses.
5. Rekonsiliasi orphan oleh dispatcher.
Tidak ada antivirus; jangan diklaim.

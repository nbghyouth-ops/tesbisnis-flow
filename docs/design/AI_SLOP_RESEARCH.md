# Riset Anti-AI-Slop & Aksesibilitas

Dilakukan dengan akses web (web_fetch) pada sesi implementasi. **Hanya dua sumber yang benar-benar dibaca**; sumber lain dalam brief (DOI 10.1145/3786777 dan sumber IA dashboard/visualisasi) **tidak dibaca**, sehingga tidak dikutip.

## Sumber 1 — InterfaceKit, "What is AI slop in UI design?"
URL: https://blog.interfacekit.io/what-is-ai-slop-ui-design — tanggal publikasi tidak ditampilkan pada konten yang diambil.

**Fakta dari sumber**
- "AI slop" dipakai sebagai label kerja untuk hasil UI generatif yang dipublikasikan tanpa maksud produk, verifikasi, revisi, atau tinjauan manusia yang bertanggung jawab; penggunaan AI sendiri tidak membuat UI menjadi slop.
- Empat kondisi yang muncul bersamaan: kecocokan produk lemah, materi penting tidak diverifikasi (metrik/testimoni karangan), pengalaman belum selesai (state loading/empty/error/permission/validation/overflow/responsive tidak ada), dan tidak ada pemilik penilaian akhir.
- Gejala: dashboard dengan metrik karangan, kontrol tanpa tugas jelas, tanpa pemulihan error, aturan komponen berubah antar halaman; layout mobile yang hanya menumpuk; settings tanpa validasi.
- "Review debt": output bertambah lebih cepat dari kemampuan menilai.

**Keputusan desain (penilaian kami, bukan klaim sumber)**
| Anti-pattern | Tindakan di Business Flow |
|---|---|
| Metrik/grafik karangan | Semua KPI berasal dari query jurnal/transaksi; jika kosong → *empty state* dengan arahan dari template (`dashboard/page.tsx`). Tidak ada data demo di kode produksi. |
| Kontrol tanpa fungsi | Fitur yang belum ada (upload dokumen, XLSX/PDF, impor) **tidak diberi tombol**; ditandai jelas sebagai belum tersedia. |
| State tidak lengkap | Komponen bersama `Loading`, `ErrorBox` (dengan Coba lagi), `Empty` (dengan aksi), validasi server → pesan per-field (`ResourcePage`). |
| Komponen berubah antar halaman | Satu set primitif `src/components/ui.tsx`; halaman modul memakai `ResourcePage`/`DataTable`/`Card` yang sama. |
| Mobile hanya menumpuk | Drawer sidebar <1024px, modal menjadi bottom sheet di mobile, keypad POS/PIN untuk sentuh. |
| Klaim tanpa verifikasi | Panduan/FAQ hanya mendeskripsikan fitur yang ada; dokumen keterbatasan (PIN, RLS, backup). |

## Sumber 2 — W3C WAI, "What's New in WCAG 2.2"
URL: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ — WCAG 2.2 menjadi W3C Recommendation 5 Oktober 2023 (sesuai halaman).

**Fakta dari sumber & penerapan**
- 2.5.8 Target Size (Minimum, AA): target pointer ≥ 24×24 CSS px. → tombol/input memakai `min-height` 36–48px; keypad 48–64px. Tombol aksi tabel kecil `min-h-32px`.
- 2.4.11 Focus Not Obscured (AA): fokus tidak boleh tertutup konten buatan penulis. → header sticky; `scroll-padding` belum ditambahkan (**risiko terbuka**, lihat UI_DESIGN_REVIEW).
- 3.2.6 Consistent Help (A): bantuan di posisi relatif sama. → tombol `?` dan menu Pusat Bantuan selalu di topbar/sidebar.
- 3.3.7 Redundant Entry (A): onboarding menyimpan draft dan memakai ulang data (mis. nama perangkat).
- 3.3.8 Accessible Authentication (AA): PIN merupakan uji kognitif tanpa alternatif → **belum dipenuhi** (dicatat KI-004).
- 2.5.7 Dragging Movements: tidak ada fungsi drag.

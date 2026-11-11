# Keputusan Desain

- **Token warna**: dari Bab 18.3 (`src/app/globals.css`). Dua penyesuaian terukur demi kontras AA, bukan warna baru: `primary-deep #187a75` (turunan lebih gelap `primary-dark`) untuk tombol/link karena teks putih pada `#1e8c86` hanya 4,08:1 dan pada `#2ba8a2` 2,91:1; `ink-2` dari `#687a78` menjadi `#5c6e6c` karena pada latar surface hanya 4,19:1 (kini ≥4,85:1). `muted #899694` (3,06:1) tidak dipakai untuk teks.
- **Tipografi**: stack sistem Inter-first tanpa mengunduh font (CSP ketat, tanpa jaringan eksternal). Angka memakai `tabular-nums`.
- **Layout**: sidebar kiri (5 grup), topbar (breadcrumb, pencarian global yang benar-benar menanyakan server, info bisnis/cabang, Mode, notifikasi tersimpan, bantuan, perangkat, Kunci), judul halaman besar + aksi, KPI, grafik utama, rel insight hanya di dashboard ≥ xl. Rel insight tidak dipaksakan di halaman lain.
- **Tidak ada avatar akun**; ada chip perangkat + peran.
- **Radius/bayangan**: kartu 18px, input 10px, tombol 12px, modal 22px; bayangan halus, tanpa glow/gradient.
- **Simple vs Advanced**: menu lanjutan (HR, Operasional, Pemasaran, Proyek, Aset, Template) disembunyikan di Mode Sederhana kecuali termasuk modul prioritas template. Preferensi disimpan di `localStorage` (bukan data sensitif).
- **Grafik**: SVG sendiri (tanpa dependensi) dengan `role=img` + ringkasan, tooltip `<title>`, legenda, sumber data, dan tabel alternatif (`<details>`).
- **Keypad** dipakai untuk PIN dan nominal; dukungan keyboard/numpad; nominal tidak pernah float.
- **Tur terpandu**: overlay ringan berbasis `data-tour`, dapat dihentikan/dilanjutkan (`localStorage`).

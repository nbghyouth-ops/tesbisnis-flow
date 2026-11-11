# UI Design Review (jujur)

**Bukti yang ada**: build produksi lulus; semua rute dirender SSR (200) dan menampilkan layar PIN tanpa data bisnis; kontras palet dihitung dengan skrip (lihat DESIGN_DECISIONS).
**Bukti yang TIDAK ada**: tangkapan layar, uji visual di browser nyata, Lighthouse/axe, uji pembaca layar, uji responsif lintas viewport. Semuanya **NOT TESTED** karena sandbox tidak memiliki browser. Dengan demikian kesesuaian visual dengan referensi dan klaim WCAG 2.2 AA **belum terverifikasi**.

## Pemeriksaan kode (bukan visual)
| Item | Status |
|---|---|
| Skip link, landmark (`aside`, `nav`, `main`, `header`), `aria-current`, `role=dialog` + fokus trap + Esc, label form, `aria-live` toast, `role=alert` error | Diimplementasikan di kode |
| Reduced motion | `prefers-reduced-motion` di CSS |
| Fokus terlihat | outline 3px `primary-deep` |
| Target ≥24px | Ya untuk kontrol utama; tombol tabel 32px |
| Fokus tidak tertutup header sticky (2.4.11) | `scroll-padding-top: 88px` ditambahkan; belum diverifikasi di browser |
| Reflow 320px / tabel | Tabel `overflow-x:auto` di dalam wrapper; halaman tidak overflow (belum diverifikasi visual) |
| Alternatif non-kognitif untuk PIN (3.3.8) | Tidak ada |

## Tindakan lanjutan
1. Jalankan Playwright + axe pada rute utama (onboarding, dashboard, finance, POS, PIN).
2. (selesai) scroll-padding-top untuk header sticky — verifikasi di browser.
3. Review visual manual pada 360/768/1024/1440 px, tangkap bukti.

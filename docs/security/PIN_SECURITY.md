# PIN, Device Credential, dan Threat Model Ringkas

## Mekanisme (terimplementasi)
- Tidak ada akun manusia. Setiap browser/perangkat memiliki *device principal*: token acak 256 bit di cookie `bf_device` (HttpOnly, SameSite=Strict, `Secure` bila HTTPS). Hanya SHA-256 token disimpan di tabel `devices`.
- PIN 4–6 angka, ditolak bila lemah (angka sama, urutan naik/turun, pola berulang, daftar umum). Disimpan sebagai Argon2id (`@node-rs/argon2`, salt acak unik). Tidak ada email/OTP/recovery key.
- Unlock menghasilkan **sesi tab** (token acak, hash di tabel `tab_sessions`, TTL 2 menit bergeser, dikirim lewat header `x-tab-session`, hanya di memori JavaScript). Setiap endpoint sensitif memverifikasi sesi tab + grant perangkat + izin peran.
- Lock otomatis (`src/components/lock-provider.tsx`): dokumen baru/refresh/BFCache → terkunci; `visibilitychange` hidden, `blur`, `pagehide`, `freeze`, `pageshow(persisted)`, dan `appStateChange` Capacitor → kunci seketika, UI sensitif di-unmount, sesi dicabut server (`fetch keepalive`). Heartbeat 30 dtk hanya saat tab terlihat. Setiap tab memiliki token sendiri (lintas-tab tidak berbagi status).
- Ubah PIN tanpa PIN lama (sesuai spesifikasi) → semua sesi tab lama perangkat dicabut, sesi baru dibuat.
- Brute force: 5 kegagalan → kunci sementara eksponensial (30 dtk … 1 jam), tercatat di audit.
- CSRF: mutasi wajib header `x-requested-with: bf`, cek Origin, cookie SameSite=Strict.
- Pencabutan perangkat: grant `revoked`, semua sesi tab dicabut; permintaan berikutnya langsung 401.

## Keterbatasan yang harus dipahami (tidak ditutup-tutupi)
- PIN hanyalah **kunci layar**, bukan autentikasi manusia. Siapa pun yang menguasai perangkat tepercaya dapat mengganti PIN tanpa PIN lama.
- Lock berbasis klien dapat dilewati oleh penyerang yang menguasai browser (mis. devtools) — namun API tetap menuntut sesi tab sah yang hanya diperoleh dengan PIN.
- Jika notifikasi lock gagal terkirim, sesi server kedaluwarsa sendiri dalam ≤ 2 menit.
- Tidak ada reset publik bila semua perangkat Owner hilang.
- Rate limit global tidak ada (in-memory per instance); throttle PIN bersifat per-perangkat di database.
- XSS adalah ancaman utama bagi cookie/perangkat: CSP diterapkan (`next.config.ts`), tetapi `unsafe-inline` diperlukan oleh Next.js saat ini (belum memakai nonce).
- WCAG 3.3.8 (Accessible Authentication): PIN adalah uji kognitif; tidak ada alternatif non-kognitif saat ini (lihat BUG_REGISTER KI-004).
- Platform admin break-glass belum ada (tidak ada akses admin sama sekali ke data tenant lewat aplikasi).
- Pengujian: unit (hash/validasi) + smoke API (lock, tab isolation, revoke, brute force). Pengujian browser untuk event lock = NOT TESTED.

/** Konten panduan — hanya menjelaskan fitur yang benar-benar tersedia. */
export const GUIDE_STEPS: { title: string; body: string }[] = [
  { title: "Apa itu Business Flow", body: "Platform pencatatan dan pengelolaan bisnis: keuangan, penjualan/kasir, stok, pembelian, klien, karyawan, tugas, booking, proyek, aset, dan laporan dalam satu sistem. Business Flow tidak memproses uang; pembayaran dicatat manual." },
  { title: "Cara memulai", body: "Buka halaman utama lalu pilih ‘Mulai Siapkan Bisnis’. Tidak ada login/email/kata sandi. Jawaban Anda tersimpan otomatis sebagai draft, sehingga dapat dilanjutkan dari perangkat yang sama jika browser ditutup." },
  { title: "Memilih template bisnis", body: "Ada 16 template (Warung, Cafe, Laundry, Salon, Bengkel, dst.). Template menentukan modul prioritas di sidebar, istilah, kategori awal, dan daftar langkah awal. Semua modul tetap tersedia; template bisa diganti di menu Template Bisnis." },
  { title: "Membuat nama bisnis & PIN", body: "Setelah nama bisnis diisi, Anda membuat PIN 4–6 angka (PIN seperti 1234 atau 1111 ditolak). PIN disimpan sebagai hash Argon2id dan berfungsi sebagai kunci layar perangkat ini." },
  { title: "Mengisi profil & lokasi", body: "Isi profil usaha, nama pemilik/manajer, nama perangkat, wilayah, zona waktu, dan mata uang. Email/telepon hanya informasi kontak opsional." },
  { title: "Cabang", body: "Tentukan cabang utama dan cabang tambahan. Setiap bisnis otomatis mendapat satu gudang utama." },
  { title: "Menyiapkan keuangan", body: "Buat Akun Kas & Bank (mis. Kas Utama, Bank BCA), kategori pemasukan/pengeluaran, dan awal tahun fiskal. Saldo awal hanya diisi jika Anda mengetahui nilainya; sistem mencatatnya sebagai jurnal saldo awal." },
  { title: "Mengenal sidebar", body: "Sidebar mengelompokkan modul: Overview, Business Operations, Management, Reports, Configuration. Titik teal menandai modul prioritas template. Mode Sederhana menyembunyikan modul lanjutan; ubah lewat tombol Mode di topbar." },
  { title: "Menggunakan dashboard", body: "Dashboard menampilkan angka dari jurnal dan transaksi nyata untuk rentang tanggal yang dipilih. Jika belum ada data, Anda akan melihat panduan memulai, bukan angka contoh." },
  { title: "Membuat transaksi", body: "Tombol Transaksi Cepat: pilih Pemasukan, Pengeluaran, atau Transfer, ketik nominal dengan keypad, pilih kategori dan akun. Transfer antar akun tidak dihitung sebagai pemasukan/pengeluaran. Transaksi yang sudah diposting tidak dapat diubah; koreksi lewat pembalikan." },
  { title: "Mengelola klien", body: "Menu CRM/Klien menyimpan klien perorangan atau organisasi, banyak kontak, aktivitas, catatan internal, serta faktur dan pembayaran klien. Deteksi duplikat tersedia; penggabungan dilakukan manual dengan audit." },
  { title: "Mengelola produk", body: "Tambah produk atau layanan dengan SKU, barcode, satuan, dan harga. Layanan tidak melacak stok." },
  { title: "Mengelola stok", body: "Stok berasal dari ledger pergerakan (penerimaan pembelian, penjualan, penyesuaian) dengan biaya rata-rata bergerak. Stok awal dicatat lewat Penyesuaian Stok (alasan: stok awal)." },
  { title: "Membuat penjualan", body: "Di Penjualan & POS pilih produk, pelanggan (wajib bila belum lunas), diskon, dan pembayaran per akun. Checkout divalidasi server: stok, jurnal, piutang, dan HPP dibuat dalam satu transaksi database." },
  { title: "Mengelola pesanan/booking", body: "Daftarkan sumber daya (meja/kamar/kursi/kendaraan) lalu buat booking. Jadwal yang bentrok pada sumber daya yang sama ditolak oleh server, termasuk bila dua perangkat memesan bersamaan." },
  { title: "Memantau laporan", body: "Laporan: Neraca Saldo, Laba Rugi, Neraca, Arus Kas, Buku Besar, Penjualan, Nilai Persediaan, Ringkasan Klien. Semua dapat diekspor ke CSV. Ekspor XLSX/PDF belum tersedia." },
  { title: "Mengelola perangkat", body: "Di Perangkat & Keamanan, Owner membuat kode pairing sekali pakai (berlaku 10 menit) dan peran perangkat baru. Perangkat baru memilih ‘Sambungkan Perangkat’, memasukkan kode, lalu membuat PIN. Perangkat dapat dicabut kapan saja." },
  { title: "Mengunci dan membuka aplikasi", body: "Layar PIN muncul saat aplikasi dibuka, di-refresh, tab berpindah, jendela kehilangan fokus, atau layar mati. Berpindah halaman di dalam tab yang sama tidak meminta PIN lagi. Setiap tab terkunci sendiri-sendiri. ‘Ubah PIN’ ada di pojok kanan bawah layar PIN dan tidak memerlukan PIN lama." },
];

export const FAQ: { q: string; a: string }[] = [
  { q: "Apakah ada login atau akun?", a: "Tidak. Akses diberikan kepada perangkat dan dikunci PIN. Karena itu, siapa pun yang menguasai perangkat tepercaya yang tidak terkunci dapat mengganti PIN. Cabut perangkat yang hilang dari menu Perangkat & Keamanan." },
  { q: "Saya lupa PIN. Bagaimana?", a: "Pada layar PIN, tekan ‘Ubah PIN’ di pojok kanan bawah, lalu buat PIN baru. Tidak diperlukan PIN lama." },
  { q: "Perangkat Owner hilang semua. Bagaimana?", a: "Tidak ada reset publik. Pulihkan akses lewat prosedur administrator database sesuai dokumen deployment." },
  { q: "Apakah saya bisa mengubah transaksi yang sudah diposting?", a: "Tidak. Gunakan Pembalikan, lalu buat transaksi pengganti. Semuanya tercatat di audit." },
  { q: "Mengapa faktur tidak bisa dibayar melebihi sisa tagihan?", a: "Server menolak pembayaran lebih untuk menjaga piutang tetap akurat." },
  { q: "Apakah file/dokumen bisa diunggah?", a: "Belum. Unggah dokumen memerlukan Neon Object Storage dan Neon Functions yang harus dikonfigurasi pemilik (lihat dokumen deployment)." },
  { q: "Apakah ada pembayaran online?", a: "Tidak. Business Flow hanya mencatat pembayaran secara manual." },
];

export const GLOSSARY: { t: string; d: string }[] = [
  { t: "Jurnal", d: "Catatan akuntansi dua sisi (debit dan kredit) yang selalu seimbang." },
  { t: "Posted", d: "Transaksi yang sudah dibukukan dan tidak dapat diubah." },
  { t: "Pembalikan (Reversal)", d: "Jurnal yang membatalkan efek transaksi posted tanpa menghapus riwayat." },
  { t: "Piutang", d: "Tagihan kepada pelanggan yang belum dibayar." },
  { t: "Utang usaha", d: "Kewajiban membayar supplier atas barang yang sudah diterima." },
  { t: "HPP", d: "Harga Pokok Penjualan: biaya rata-rata barang yang terjual." },
  { t: "Biaya rata-rata bergerak", d: "Metode biaya persediaan: biaya rata-rata dihitung ulang setiap barang masuk." },
  { t: "Pairing", d: "Proses menghubungkan perangkat baru dengan kode sekali pakai." },
  { t: "Idempotency", d: "Mengulang permintaan yang sama tidak menciptakan transaksi ganda." },
];

export const TROUBLE: { q: string; a: string }[] = [
  { q: "Layar PIN terus muncul saat saya berpindah tab", a: "Itu perilaku keamanan: setiap tab terkunci saat tidak terlihat/fokus. Masukkan PIN lagi." },
  { q: "PIN salah berkali-kali dan perangkat dikunci sementara", a: "Setelah 5 kali salah, perangkat dikunci sementara dengan jeda yang bertambah. Tunggu hitungan mundur atau pakai ‘Ubah PIN’ bila Anda lupa." },
  { q: "Stok tidak cukup saat checkout", a: "Server memeriksa stok terkini. Tambahkan stok lewat Pembelian atau Penyesuaian Stok." },
  { q: "Periode sudah ditutup", a: "Transaksi pada tanggal dalam periode tertutup ditolak. Gunakan tanggal pada periode terbuka." },
];

export function GuideContent() {
  return (
    <ol className="space-y-4">
      {GUIDE_STEPS.map((s, i) => (
        <li key={s.title} className="rounded-2xl border border-line bg-white p-4">
          <h3 className="text-[15px] font-semibold text-ink"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-primary-bg text-xs font-bold text-primary-deep">{i + 1}</span>{s.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

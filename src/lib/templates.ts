/** 16 template bisnis = konfigurasi workflow (navigasi prioritas, istilah, kategori, langkah awal). */
export type NavKey =
  | "dashboard" | "finance" | "sales" | "bookings" | "products" | "purchasing" | "crm" | "hr"
  | "tasks" | "operations" | "marketing" | "projects" | "assets" | "reports";

export type BusinessTemplate = {
  key: string;
  name: string;
  summary: string;
  modules: NavKey[]; // prioritas navigasi awal
  terms: { product: string; booking: string; client: string };
  incomeCategories: string[];
  expenseCategories: string[];
  workflow: { text: string; href: string }[];
  scope?: string;
};

const baseExpense = ["Beban Operasional", "Beban Gaji", "Beban Sewa", "Beban Utilitas", "Beban Pemasaran"];
const baseIncome = ["Pendapatan Penjualan", "Pendapatan Jasa", "Pendapatan Lain"];

const T = (
  key: string, name: string, summary: string, modules: NavKey[],
  terms: Partial<BusinessTemplate["terms"]>, workflow: [string, string][],
  extra: Partial<Pick<BusinessTemplate, "incomeCategories" | "expenseCategories" | "scope">> = {},
): BusinessTemplate => ({
  key, name, summary, modules,
  terms: { product: "Produk", booking: "Sumber daya", client: "Pelanggan", ...terms },
  incomeCategories: extra.incomeCategories ?? baseIncome,
  expenseCategories: extra.expenseCategories ?? baseExpense,
  workflow: workflow.map(([text, href]) => ({ text, href })),
  scope: extra.scope,
});

export const TEMPLATES: BusinessTemplate[] = [
  T("retail", "Warung & Retail", "Katalog produk, barcode/SKU, kasir, stok, pembelian dari supplier.", ["sales", "products", "purchasing", "finance", "crm", "reports"], { product: "Produk" }, [["Tambah produk dengan SKU & barcode", "/products"], ["Catat penerimaan stok dari supplier", "/purchasing"], ["Jual lewat POS", "/sales"], ["Buka & tutup kas harian", "/operations"]]),
  T("fnb", "Restoran & Cafe", "Menu, meja, pesanan, bahan baku, limbah, dan kasir.", ["sales", "bookings", "products", "purchasing", "operations", "finance"], { product: "Menu", booking: "Meja" }, [["Tambah menu (produk) dan bahan baku", "/products"], ["Daftarkan meja sebagai sumber daya", "/bookings"], ["Jual lewat POS", "/sales"], ["Catat limbah & penyesuaian stok", "/products"]], { expenseCategories: [...baseExpense, "Bahan Baku"] , scope: "Resep/BOM, kitchen ticket, dan modifier belum tersedia pada versi ini." }),
  T("laundry", "Laundry", "Katalog layanan, pesanan, status proses, pengambilan, pembayaran.", ["sales", "crm", "tasks", "products", "operations", "finance"], { product: "Layanan", client: "Pelanggan" }, [["Tambah layanan (jenis: layanan)", "/products"], ["Daftarkan pelanggan", "/crm"], ["Catat transaksi & pembayaran", "/sales"], ["Pantau tugas cucian", "/tasks"]], { scope: "Harga per berat dicatat sebagai kuantitas desimal (kg); status proses lewat modul Tugas." }),
  T("salon", "Salon & Barbershop", "Layanan, staf, booking, kalender, pelanggan, kasir.", ["bookings", "sales", "crm", "hr", "products", "finance"], { product: "Layanan", booking: "Kursi/Staf" }, [["Tambah layanan & produk", "/products"], ["Daftarkan kursi/staf sebagai sumber daya", "/bookings"], ["Buat booking", "/bookings"], ["Kasir", "/sales"]], { scope: "Komisi staf belum tersedia." }),
  T("workshop", "Bengkel", "Kendaraan pelanggan, work order, suku cadang, invoice, biaya.", ["sales", "crm", "products", "tasks", "purchasing", "finance"], { product: "Suku cadang/Jasa" }, [["Tambah suku cadang & jasa", "/products"], ["Daftarkan pelanggan", "/crm"], ["Work order sebagai tugas", "/tasks"], ["Tagihan & pembayaran", "/sales"]], { scope: "Catatan kendaraan dituliskan pada catatan klien; modul kendaraan khusus belum tersedia." }),
  T("catering", "Catering & Bakery", "Paket, bahan, produksi, pesanan terjadwal, pengiriman, limbah.", ["bookings", "sales", "products", "purchasing", "tasks", "finance"], { product: "Paket/Produk", booking: "Jadwal produksi" }, [["Tambah paket & bahan", "/products"], ["Jadwalkan pesanan sebagai booking", "/bookings"], ["Beli bahan", "/purchasing"], ["Tagihan", "/sales"]], { scope: "BOM/resep & produksi otomatis belum tersedia." }),
  T("fashion", "Fashion & Butik", "Varian ukuran/warna, SKU, barcode, stok, penjualan, supplier.", ["products", "sales", "purchasing", "crm", "finance", "reports"], { product: "Produk" }, [["Tambah varian sebagai SKU terpisah (mis. KAOS-M-HITAM)", "/products"], ["Terima stok dari supplier", "/purchasing"], ["Jual lewat POS", "/sales"]], { scope: "Varian dicatat sebagai SKU terpisah." }),
  T("hotel", "Hotel & Villa", "Kamar, reservasi, hunian, tamu, pembayaran manual.", ["bookings", "crm", "operations", "finance", "tasks", "assets"], { booking: "Kamar", client: "Tamu" }, [["Daftarkan kamar sebagai sumber daya", "/bookings"], ["Catat reservasi (anti double booking)", "/bookings"], ["Housekeeping sebagai tugas", "/tasks"], ["Catat pembayaran manual", "/finance"]]),
  T("wholesale", "Distributor & Grosir", "Harga bertingkat, pelanggan, supplier, pesanan besar, piutang.", ["sales", "purchasing", "products", "crm", "finance", "reports"], { product: "Barang" }, [["Tambah barang", "/products"], ["Buat PO ke supplier", "/purchasing"], ["Buat faktur kredit & catat piutang", "/sales"]], { scope: "Harga bertingkat (tier) belum tersedia; satu harga jual per produk." }),
  T("contractor", "Kontraktor", "Proyek, termin, material, tenaga kerja, anggaran, biaya aktual.", ["projects", "finance", "purchasing", "tasks", "crm", "assets"], { client: "Klien" }, [["Buat proyek & anggaran", "/projects"], ["Catat biaya proyek dari Transaksi Cepat", "/finance"], ["Beli material", "/purchasing"]]),
  T("gym", "Gym & Fitness", "Keanggotaan, paket, jadwal, pelatih, pembayaran manual.", ["crm", "bookings", "sales", "hr", "assets", "finance"], { product: "Paket", booking: "Kelas/Alat", client: "Member" }, [["Daftarkan member", "/crm"], ["Tambah paket sebagai layanan", "/products"], ["Jadwal kelas sebagai booking", "/bookings"]], { scope: "Absensi member belum tersedia; absensi karyawan tersedia di modul HR." }),
  T("professional", "Jasa Profesional", "Klien, layanan, proyek, tugas, faktur, biaya.", ["crm", "projects", "tasks", "sales", "finance", "reports"], { product: "Layanan", client: "Klien" }, [["Daftarkan klien", "/crm"], ["Buat proyek", "/projects"], ["Terbitkan faktur", "/sales"]]),
  T("education", "Lembaga Pendidikan", "Peserta didik, kelas, pengajar, jadwal, biaya.", ["crm", "bookings", "hr", "sales", "finance", "reports"], { product: "Biaya/Program", booking: "Kelas", client: "Siswa" }, [["Daftarkan siswa sebagai klien", "/crm"], ["Jadwalkan kelas sebagai booking", "/bookings"], ["Tagih biaya", "/sales"]], { scope: "Pendaftaran kelas & absensi siswa belum tersedia." }),
  T("clinic", "Klinik & Kesehatan", "Janji temu, praktisi, layanan, antrean, kasir. Tanpa rekam medis.", ["bookings", "sales", "products", "crm", "operations", "reports"], { product: "Layanan", booking: "Praktisi", client: "Pasien" }, [["Daftarkan praktisi sebagai sumber daya", "/bookings"], ["Buat janji temu", "/bookings"], ["Kasir", "/sales"]], { scope: "Sengaja TIDAK mencakup diagnosis, rekam medis, atau resep. Jangan simpan data medis di catatan klien." }),
  T("rental", "Rental Kendaraan", "Armada, reservasi, ketersediaan, inspeksi, perawatan, faktur.", ["bookings", "crm", "sales", "assets", "finance", "tasks"], { booking: "Kendaraan" }, [["Daftarkan kendaraan sebagai sumber daya", "/bookings"], ["Catat aset armada & perawatan", "/assets"], ["Reservasi & faktur", "/bookings"]]),
  T("other", "Bisnis Lainnya", "Katalog layanan/produk, pelanggan, pesanan, keuangan, tugas.", ["finance", "sales", "crm", "products", "tasks", "reports"], {}, [["Tambah produk/layanan", "/products"], ["Catat transaksi keuangan", "/finance"], ["Kelola tugas", "/tasks"]]),
];

export const templateByKey = (k: string) => TEMPLATES.find((t) => t.key === k) ?? TEMPLATES[TEMPLATES.length - 1];

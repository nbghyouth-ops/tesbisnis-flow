export const LEGAL_VERSION = "1.0";

export const LEGAL_DOCS = {
  terms: {
    title: "Syarat & Ketentuan Business Flow",
    body: [
      "1. Business Flow adalah alat pencatatan dan pengelolaan bisnis. Business Flow bukan penyedia layanan pembayaran, dompet digital, atau perantara uang. Semua pembayaran dicatat manual.",
      "2. Tidak ada akun pengguna. Akses diberikan kepada perangkat. Pemilik bisnis bertanggung jawab atas perangkat yang dipercaya dan atas pencabutan akses perangkat yang hilang.",
      "3. PIN adalah kunci tampilan ringan dan bukan bukti identitas seseorang. Siapa pun yang menguasai perangkat tepercaya dapat mengganti PIN. Tidak ada pemulihan PIN publik.",
      "4. Pemilik bisnis bertanggung jawab atas keakuratan data yang dimasukkan, kepatuhan perpajakan, dan kewajiban hukum usahanya.",
      "5. Transaksi yang telah diposting tidak dapat diubah; koreksi dilakukan melalui pembalikan (reversal) dan transaksi pengganti.",
      "6. Ketersediaan, pencadangan, dan retensi data bergantung pada konfigurasi penyedia database yang dipilih pemilik bisnis.",
    ],
  },
  privacy: {
    title: "Kebijakan Privasi Business Flow",
    body: [
      "1. Data yang dikelola: profil bisnis, transaksi keuangan, data klien/pelanggan, karyawan, dan log audit perangkat.",
      "2. Tujuan: pengelolaan operasional dan pembukuan bisnis Anda. Data tidak dikirim melalui email dan tidak dipakai untuk fitur AI.",
      "3. Data disimpan di database PostgreSQL yang Anda konfigurasi. Lokasi server dapat berada di luar Indonesia; Anda bertanggung jawab menilai kewajiban transfer data lintas negara.",
      "4. Anda wajib mempunyai dasar hukum (misalnya persetujuan atau kepentingan sah) sebelum menyimpan data pribadi klien, serta menanggapi permintaan subjek data.",
      "5. Retensi: klien dapat diarsipkan atau dibatasi; data yang menjadi bagian jurnal, faktur, dan transaksi tetap disimpan untuk kepentingan pembukuan.",
      "6. Dokumen ini adalah templat awal dan bukan nasihat hukum. Konsultasikan dengan penasihat hukum untuk kepatuhan UU PDP.",
    ],
  },
} as const;

# 🔀 ALTERNATIF SELAIN MIDTRANS — Riset Pembanding

**Tanggal riset:** 13 Agustus 2026
**Status:** riset & perbandingan — belum ada kode yang diimplementasikan
**Pendamping:** [`PAYMENT.md`](./PAYMENT.md) (riset awal, memilih Midtrans) · [`PAYMENT-SETUP.md`](./PAYMENT-SETUP.md) (panduan pasang) · [`WALLET.md`](./WALLET.md) (saldo QuPay)
**Lanjutan:** [`PAYMENT-IPAYMU.md`](./PAYMENT-IPAYMU.md) — kebutuhan & panduan pasang bila memilih iPaymu
**Kandidat kelima (13 hari kemudian):** [`PAYMENT-GOBIZ.md`](./PAYMENT-GOBIZ.md) — GoPay Merchant lewat **GoBiz Open API**. Tidak masuk perbandingan di bawah karena baru ditemukan 24 Agustus 2026; **mengoreksi `PAYMENT.md` §1**.
**Pertanyaan yang dijawab:** kalau Midtrans tidak dipakai, apa penggantinya — dan apakah pindah gateway benar-benar mengubah sesuatu?

---

## 0. Ringkasan untuk yang buru-buru

| Kalau tujuannya… | Pakai |
|---|---|
| Skripsi/sandbox, ingin cepat jalan, `firebase-admin` seperti sekarang | **Midtrans** (tetap) atau **Duitku** |
| Menghindari syarat NPWP saat daftar | **Tripay** (cukup KTP + verifikasi wajah) — tapi baca §3 soal biaya tetapnya |
| Produksi bersama Dishub / uang masuk kas daerah | **Bank Jateng / QRIS daerah** (§6) — bukan payment gateway swasta |
| Sekadar QRIS dinamis + webhook, tanpa 25 metode bayar | **Ezeelink / Netzme / QRIS Interactive** (§5) |
| **Jangan dipakai** untuk QuParkir | **Xendit** — tidak menerima perorangan, dan biaya tetapnya Rp 4.000/transaksi |
| **Sudah punya akun GoPay Merchant** dan cukup QRIS saja | **GoBiz Open API** ([`PAYMENT-GOBIZ.md`](./PAYMENT-GOBIZ.md)) — tanpa daftar merchant baru, tanpa verifikasi ulang |

Temuan yang paling penting ada di §1 dan §3: **pindah gateway hampir tidak mengubah biaya**, tapi **salah pilih gateway bisa membuat biaya jadi 200% dari nilai transaksi.**

---

## 1. Temuan utama: MDR bukan alasan untuk pindah

`PAYMENT.md` §6 mencatat QRIS 0,7% dan menandainya "perlu dikonfirmasi ke Midtrans". Konfirmasinya sudah ketemu, dan jawabannya bukan di Midtrans — melainkan di Bank Indonesia.

**MDR QRIS ditetapkan BI dan seragam di semua penyelenggara.** Berlaku efektif **15 Maret 2025**:

| Kategori merchant | MDR |
|---|---|
| **UMI** (usaha mikro), transaksi ≤ Rp 500.000 | **0%** |
| UMI, transaksi > Rp 500.000 | 0,3% |
| UKE / UME / UBE (kecil, menengah, besar) | 0,7% |
| Pendidikan | 0,6% |
| SPBU | 0,4% |
| **BLU / PSO / G2P / P2G** (layanan publik, bansos, pembayaran pemerintah) | **0%** |

Artinya: memilih Duitku alih-alih Midtrans **tidak** membuat MDR-nya lebih murah. Angka 0,7% itu sama di Midtrans, Duitku, iPaymu, DOKU, Xendit, dan semua PJP berlisensi BI. Yang berbeda antar-penyedia hanya **biaya yang mereka tambahkan sendiri di atas MDR**.

> 💡 Dua baris di tabel itu langsung relevan untuk QuParkir:
> - Semua transaksi parkir QuParkir (Rp 2.000–5.000) jauh di bawah Rp 500.000. **Kalau merchant-nya terkategori UMI, MDR-nya 0%.**
> - Kalau kelak QuParkir dijalankan atas nama Pemkot/Dishub sebagai penarikan retribusi, kategorinya masuk **G2P/P2G → MDR 0%** juga.
>
> Kategori merchant ditentukan saat verifikasi oleh PJP, bukan dipilih sendiri. **Ini yang harus ditanyakan saat mendaftar**, ke gateway mana pun.

---

## 2. Jadi apa yang sebenarnya membedakan gateway?

Empat hal, berurutan dari yang paling menentukan untuk QuParkir:

1. **Biaya tetap (fixed fee) per transaksi.** Ini pembunuhnya. Lihat §3.
2. **Syarat pendaftaran** — perorangan boleh atau wajib badan usaha; NPWP wajib atau tidak.
3. **Kualitas sandbox & dokumentasi** — seberapa cepat bisa diuji tanpa verifikasi.
4. **Biaya pencairan (disbursement)** — sering terlewat, padahal untuk nominal kecil bisa lebih besar dari MDR-nya.

Runtime backend (Netlify/Cloudflare Workers) **tidak dipengaruhi sama sekali** oleh pilihan gateway. Seluruh analisis §3.3 di `PAYMENT.md` tetap berlaku apa adanya.

---

## 3. Biaya tetap: kenapa ini fatal untuk QuParkir

Tarif QuParkir dari `public/js/util.js:48`:

```js
export function hitungTarif(type, ms) {
  const jam = Math.max(1, Math.ceil(ms / 3600000));
  if (type === "mobil") return 3000 + (jam - 1) * 2000;
  return 2000 + (jam - 1) * 1000;
}
```

Transaksi terkecil — motor 1 jam — adalah **Rp 2.000**. Ini nominal yang sangat kecil untuk ukuran payment gateway, dan biaya tetap per transaksi menjadi dominan:

### Simulasi: bayar parkir motor 1 jam (Rp 2.000)

| Penyedia | Struktur biaya | Biaya | % dari transaksi |
|---|---|---|---|
| Midtrans / Duitku / iPaymu / DOKU | 0,7% | **Rp 14** | 0,7% |
| Semua, bila merchant terkategori UMI | 0% | **Rp 0** | 0% |
| **Tripay** | Rp 750 + 0,7% | **Rp 764** | **38%** |
| **Xendit** | Rp 4.000 + 0,7% | **Rp 4.014** | **201%** |

Xendit menagih **dua kali lipat nilai parkirnya**. Tripay memakan lebih dari sepertiga. Keduanya tidak salah — mereka memang tidak dirancang untuk transaksi Rp 2.000 — tapi berarti keduanya gugur untuk pembayaran parkir langsung.

### Simulasi: top up QuPay Rp 50.000

Inilah alasan arsitektur `WALLET.md` penting secara ekonomi, bukan cuma UX. Kalau uang masuk lewat top up, gateway hanya disentuh **sekali per Rp 50.000**, bukan tiap parkir:

| Penyedia | Biaya | % | Setara berapa transaksi parkir? |
|---|---|---|---|
| Midtrans / Duitku / iPaymu / DOKU | Rp 350 | 0,7% | 1 top up menutup ~17 kali parkir motor |
| UMI (≤ Rp 500.000) | Rp 0 | 0% | — |
| Tripay | Rp 1.100 | 2,2% | masih wajar |
| Xendit | Rp 4.350 | 8,7% | mahal, tapi tidak absurd |

> 🔑 **Kesimpulan yang tidak terduga:** model saldo QuPay di `WALLET.md` bukan sekadar fitur — ia **mengubah gateway mana yang layak dipakai**. Dengan bayar-langsung-per-parkir, hanya penyedia tanpa biaya tetap yang masuk akal. Dengan top up, hampir semua penyedia jadi bisa dipertimbangkan.
>
> Kalau QuParkir akhirnya memakai QuPay sebagai jalur utama (dan QRIS langsung hanya sebagai cadangan), pilihan gateway jadi jauh lebih longgar.

---

## 4. Perbandingan kandidat

| Penyedia | QRIS | Biaya tetap | Perorangan? | Sandbox | Tanda tangan webhook | Catatan |
|---|---|---|---|---|---|---|
| **Midtrans** (acuan) | 0,7% | — | ✅ KTP + NPWP pribadi | Aktif seketika | SHA512 | Satu-satunya yang memproses GoPay. Sudah ditulis lengkap di `PAYMENT-SETUP.md` |
| **Duitku** ⭐ | 0,7% | — | ✅ (KTP + NPWP + rekening) | Aktif setelah daftar | HMAC-SHA256 | Pesaing terdekat Midtrans. E-wallet malah lebih murah: OVO/DANA/LinkAja 1,67%, ShopeePay 2% |
| **iPaymu** | dari 0,7%; QRIS statis 0–0,3% | — | ✅ perorangan diterima | Ada, tanpa verifikasi (`sandbox.ipaymu.com`) | HMAC-SHA256, kunci = **nomor VA** | ⚠️ Dua penghalang serius — verifikasi menuntut website **min. 5 produk**, dan produksi **mewajibkan IP statis** (Netlify/Workers gratis tidak bisa). Rinciannya di [`PAYMENT-IPAYMU.md`](./PAYMENT-IPAYMU.md) |
| **DOKU** | 0,7% | — | ⚠️ belum terkonfirmasi | Daftar mandiri di `sandbox.doku.com` | HMAC | Pionir sejak 2007, cenderung berorientasi enterprise. QRIS Checkout perlu minta kredensial ke tim mereka dulu |
| **Tripay** | 0,7% | **+ Rp 750** | ✅ **cukup KTP** (verifikasi wajah via Privy) | `tripay.co.id/api-sandbox/` | HMAC-SHA256 (`X-Callback-Signature`) | Syarat daftar paling ringan. Tapi Rp 750 = 38% dari parkir motor → **hanya layak untuk top up** |
| **Xendit** | 0,7% | **+ Rp 4.000** | ❌ **tidak menerima perorangan** | Ada | Callback token | Dokumentasi & DX terbaik, tapi dua penghalangnya mutlak untuk proyek ini |
| **Winpay** | 0,7% | belum terkonfirmasi | ⚠️ belum terkonfirmasi | belum terkonfirmasi | belum terkonfirmasi | Berlisensi BI, tanpa biaya pendaftaran. Dokumentasi publiknya paling tipis di daftar ini |
| **Espay / Faspay / NicePay** | 0,7% | — | ❌ praktis enterprise | Lewat sales | HMAC | Onboarding lewat tim penjualan, bukan self-service. Tidak cocok untuk skripsi |

**Yang gugur dan alasannya:**

- **Xendit** — dua alasan berdiri sendiri: (a) [help center-nya menyatakan tidak menerima akun individual](https://help.xendit.co/hc/en-us/articles/360035083911-Can-Individual-businesses-use-Xendit-s-services), harus badan hukum (PT/CV/PT Perorangan); (b) biaya proses Rp 4.000/transaksi. Untuk QuParkir, (b) saja sudah cukup untuk mencoretnya.
- **Espay, Faspay, NicePay** — tidak ada jalur daftar mandiri. Untuk penelitian yang butuh sandbox hari ini, ini mematikan.
- **iPaymu** — bukan gugur, tapi syarat "min. 5 produk yang bisa diuji" adalah friksi nyata untuk aplikasi parkir. Perlu ditanyakan lebih dulu sebelum menghabiskan waktu.

---

## 5. Jalur ketiga: penyedia QRIS saja, bukan payment gateway penuh

QuParkir sebetulnya tidak butuh 25 metode pembayaran. Yang dibutuhkan cuma: **QRIS dinamis** (nominal ditentukan server) + **webhook**. Ada kategori penyedia yang menjual persis itu, dengan onboarding lebih ringan:

| Penyedia | MDR | Biaya lain | Catatan |
|---|---|---|---|
| **Ezeelink** | 0,7% (0% untuk UMI ≤ Rp 500.000) | Pendaftaran gratis | API-nya menyebut eksplisit: QR dinamis, status pembayaran, webhook, **idempotency**, sandbox, rekonsiliasi — kosakata yang tepat, tanda API-nya dirancang serius |
| **Netzme** | **0,3%** (0% di bawah Rp 500.000) | **Rp 10.000/bulan** | MDR terendah di daftar ini. Pendaftaran mitra lewat email dengan KTP + NPWP + rekening |
| **QRIS Interactive** (`qris.interactive.co.id`) | 0,7% | — | Punya Open API Platform |

**Kelebihan:** lebih murah, lebih sedikit yang harus dipelajari, dan cakupannya persis sesuai kebutuhan.
**Kekurangan:** tidak ada GoPay deeplink (pengguna wajib scan QRIS), tidak ada VA/kartu bila kelak dibutuhkan, dan dokumentasi publiknya lebih tipis daripada Midtrans/Duitku — untuk skripsi yang harus ditulis alurnya, itu biaya waktu yang nyata.

---

## 6. Jalur keempat — dan yang paling relevan untuk tesis ini

Ini yang belum dibahas sama sekali di `PAYMENT.md`, dan mungkin yang paling penting.

**QuParkir menarik retribusi daerah, bukan menjual barang.** Judul penelitiannya sendiri menyebut "Transparansi Retribusi". Secara hukum, retribusi daerah masuk ke **Kas Umum Daerah (RKUD)** — dan RKUD Kota Surakarta dipegang **Bank Jateng**, bukan Midtrans, bukan Xendit. Payment gateway swasta tidak bisa menjadi tempat singgah uang retribusi dalam skema produksi yang sah.

Dan ini bukan teori — sudah berjalan:

- **Bank Jateng Cabang Koordinator Surakarta** mendukung digitalisasi pembayaran retribusi **pasar dan shelter** di Kota Surakarta, terintegrasi lewat m-banking **Bima Mobile** dan kanal non-tunai lain (OVO, GoPay, dll).
- **Bank Jateng** aktif memasifkan **"QRIS daerah"** untuk PBB dan retribusi di beberapa kabupaten (mis. Purworejo).
- **Pemkab Jepara** menerapkan **e-parkir berbasis QRIS** dengan target PAD Rp 1,5 miliar (Agustus 2026) — preseden paling dekat dengan QuParkir yang ada saat ini.

**Konsekuensi untuk QuParkir:**

| Fase | Jalur pembayaran |
|---|---|
| **Skripsi / uji coba / demo** | Payment gateway swasta (Midtrans/Duitku) di **sandbox**. Sah, cepat, tidak ada uang sungguhan, cukup untuk membuktikan arsitekturnya |
| **Pilot lapangan bersama Dishub** | **Bank Jateng / QRIS daerah** — merchant atas nama Pemkot, MDR 0% (kategori G2P/P2G), dana langsung ke RKUD |

Bagian ini justru memperkuat proposal, bukan melemahkannya: menunjukkan bahwa arsitektur QuParkir sadar akan jalur institusional uang retribusi, bukan cuma "bisa terima pembayaran".

> ⚠️ **Yang harus dikerjakan sendiri:** API Bank Jateng untuk QRIS daerah **tidak terbuka publik**. Aksesnya lewat kerja sama resmi (PKS) antara Pemkot/Dishub dan Bank Jateng. Untuk skripsi, cukup tulis ini sebagai **jalur produksi yang direkomendasikan** di bab pembahasan/saran, dan tetap implementasikan gateway swasta di sandbox sebagai bukti konsep. Jangan menunggu PKS — itu di luar kendali penelitian.

---

## 7. Rekomendasi

### 7a. Untuk sekarang (skripsi): **tetap Midtrans**

Alasannya bukan karena Midtrans terbaik, tapi karena **tidak ada alternatif yang cukup lebih baik untuk membenarkan membuang `PAYMENT-SETUP.md` dan `WALLET.md` yang sudah ditulis lengkap**:

- MDR-nya identik dengan semua kandidat (§1) — tidak ada penghematan
- Tanpa biaya tetap — salah satu dari sedikit yang aman untuk nominal Rp 2.000
- Sandbox aktif seketika, dokumentasi paling lengkap dalam bahasa Indonesia (penting saat harus dikutip di naskah)
- Satu-satunya yang memproses GoPay

### 7b. Kalau Midtrans bermasalah: **Duitku**

Pengganti paling setara. Tidak ada biaya tetap, HMAC-SHA256 untuk webhook, sandbox langsung aktif setelah daftar, tanpa biaya pendaftaran/bulanan, dan e-wallet-nya justru lebih murah (OVO/DANA/LinkAja 1,67% vs standar pasar 3%). Perubahan kode dari rencana Midtrans relatif kecil — lihat §8.

### 7c. Kalau NPWP jadi penghambat pendaftaran: **Tripay**, tapi hanya untuk top up

Syarat daftarnya paling ringan (KTP + verifikasi wajah). Tapi Rp 750/transaksi berarti **jangan** pakai untuk bayar parkir langsung — arahkan semua uang masuk lewat top up QuPay minimal Rp 25.000, di mana biaya tetap itu tinggal 3%.

### 7d. Yang tidak perlu diubah apa pun

Backend (Netlify Functions / Cloudflare Workers), Firestore Rules, model data `orders`, alur webhook, idempotensi, `reconcile` — **semuanya identik** untuk gateway mana pun. Riset §3.3 dan seluruh `WALLET.md` tetap berlaku.

---

## 8. Kalau memang pindah, apa yang berubah di kode?

Lebih sedikit dari yang dikira. Berdasarkan kerangka di `PAYMENT-SETUP.md` §5:

| Berkas | Berubah? | Apa yang berubah |
|---|---|---|
| `_lib.js` | ✅ | URL endpoint, cara autentikasi (Midtrans: Basic Auth; Duitku/Tripay: HMAC signature di body/header) |
| `create-payment.js` | ✅ sebagian | Bentuk body request & nama field respons. Logika hitung tarif, cek kepemilikan sesi, dan pencatatan `orders` **tidak berubah** |
| `midtrans-webhook.js` | ✅ sebagian | Hanya rumus verifikasi tanda tangan dan pemetaan nama status. Fungsi `terapkan()` — idempotensi, transaksi Firestore, penutupan sesi — **tidak berubah sama sekali** |
| `reconcile.js` | ✅ sedikit | URL Get Status API |
| `firestore.rules` | ❌ | Sama persis |
| `public/js/pay.js` | ✅ | Snap popup vs render QR sendiri |
| `public/app.html` (CSP) | ✅ | Ganti domain di `script-src`/`connect-src`/`frame-src` |

**Saran struktur** — kalau ada kemungkinan pindah, pisahkan bagian yang gateway-spesifik sejak awal:

```
netlify/functions/
├─ _lib.js                    ← Firestore, CORS, hitungTarif — netral
├─ _gateway/
│  ├─ midtrans.js             ← createCharge(), verifySignature(), normalizeStatus()
│  └─ duitku.js               ← antarmuka yang sama persis
├─ create-payment.js          ← import gateway dari env, bukan hardcode
├─ payment-webhook.js
└─ reconcile.js
```

Tiga fungsi itu (`createCharge`, `verifySignature`, `normalizeStatus`) adalah **seluruh** permukaan yang gateway-spesifik. Sisanya milik QuParkir. Memisahkannya sekarang membuat pergantian gateway jadi pekerjaan setengah hari, bukan setengah minggu — dan di naskah skripsi, ini bisa ditulis sebagai keputusan desain (*vendor-agnostic payment abstraction*), bukan sekadar kerapian kode.

---

## 9. Yang belum bisa saya pastikan — tanyakan sendiri

Semua ini menentukan angka di §3, dan **tidak ada di dokumentasi publik mana pun**:

| # | Pertanyaan | Ke siapa | Kenapa penting |
|---|---|---|---|
| 1 | **Kategori merchant apa yang diberikan untuk usaha parkir** — UMI, UKE, atau G2P? | Gateway yang dipilih, saat verifikasi | Selisih 0% vs 0,7%. Ini satu-satunya variabel yang benar-benar mengubah model bisnis |
| 2 | Biaya pencairan (disbursement) ke rekening — gratis, flat, atau persentase? | Duitku, Tripay, iPaymu | Untuk saldo kecil, biaya pencairan bisa lebih besar dari total MDR |
| 3 | Ada minimum nominal transaksi QRIS? | Semua kandidat | Rp 2.000 mungkin di bawah minimum sebagian penyedia |
| 4 | Duitku: perorangan tanpa badan usaha masih diterima di 2026? | Duitku langsung | Sumber saya sekunder, bukan dokumentasi resmi Duitku |
| 5 | iPaymu: syarat "min. 5 produk" bisa dikecualikan untuk aplikasi layanan? | iPaymu | Menentukan apakah iPaymu layak dilanjutkan sama sekali |
| 6 | Bank Jateng: apakah ada skema QRIS daerah untuk retribusi parkir Surakarta? | Dishub Surakarta / Bank Jateng Cab. Solo | Jalur produksi sesungguhnya (§6) |

Pertanyaan 1 sudah ditandai di `PAYMENT.md` §6 sebagai "perlu dikonfirmasi" dan masih terbuka. Sekarang kita tahu **jawabannya sama di semua gateway** — jadi cukup ditanyakan sekali, ke gateway mana pun yang dipilih.

---

## 10. Sumber

**Regulasi & tarif:**

- [Bank Indonesia — MDR QRIS Bagi Merchant: Kategorisasi dan Simulasi](https://www.bi.go.id/id/publikasi/ruang-media/cerita-bi/Pages/mdr-qris.aspx) — sumber primer tarif MDR per kategori, berlaku 15 Maret 2025
- [Infobank — BI Bebaskan Biaya MDR QRIS di RS, Transportasi Umum hingga Tempat Wisata](https://infobanknews.com/bi-bebaskan-biaya-mdr-qris-di-rs-transportasi-umum-hingga-tempat-wisata/) — kategori BLU/PSO turun ke 0%
- [Ezeelink — MDR QRIS: Apa Itu, Berapa Persen & Siapa Menanggung 2026](https://ezeelink.co.id/blog/mdr-qris/)

**Kandidat gateway:**

- [Xendit — Apakah bisnis perorangan bisa memakai layanan Xendit?](https://help.xendit.co/hc/en-us/articles/360035083911-Can-Individual-businesses-use-Xendit-s-services) — jawabannya tidak
- [Xendit — Pricing](https://www.xendit.co/en/pricing/) — QRIS 0,70% + Rp 4.000 processing fee
- [Duitku — Harga / Pricing](https://www.duitku.com/en/pricing/) · [Duitku — API Reference](https://docs.duitku.com/api/id/) · [Duitku — Buat Akun](https://docs.duitku.com/account/)
- [Tripay — API Developer Guide](https://tripay.co.id/developer) — QRIS Rp 750 + 0,7%; HMAC-SHA256 `X-Callback-Signature`; sandbox `tripay.co.id/api-sandbox/`
- [iPaymu — Pricing](https://ipaymu.com/id/pricing/) · [iPaymu — Syarat Register dan Tips Verifikasi](https://blog.ipaymu.com/syarat-register-dan-tips-melakukan-verifikasi-di-ipaymu/) · [iPaymu — Public API v2](https://ipaymu.com/dokumentasi-api)
- [DOKU — Pricing](https://www.doku.com/en-us/pricing) · [DOKU — QRIS Direct API](https://developers.doku.com/accept-payments/direct-api/snap/integration-guide/qris) · [DOKU — Cara menggunakan sandbox](https://www.doku.com/en-us/blog/bagaimana-cara-menggunakan-sandbox-untuk-uji-coba-pembayaran)
- [Winpay](https://www.winpay.id/) · [Espay — Direct API SNAP QRIS](https://docs.espay.id/pembayaran/direct-api/snap/qris/) · [Faspay](https://faspay.co.id/en/)

**Penyedia QRIS saja:**

- [Ezeelink — QRIS](https://ezeelink.co.id/qris/) — dynamic QR, webhook, idempotency, sandbox, rekonsiliasi
- [Netzme — Jenis-Jenis QRIS](https://www.netzme.id/jenis-jenis-qris-dan-cara-membayarnya/) — MDR 0,3% + Rp 10.000/bulan
- [QRIS Interactive — Open API Platform](https://qris.interactive.co.id/homepage/open-api.php)

**Jalur pemerintah daerah (§6):**

- [ANTARA — Bank Jateng dukung digitalisasi retribusi pasar di Kota Surakarta](https://jogja.antaranews.com/berita/804658/bank-jateng-dukung-digitalisasi-retribusi-pasar-di-kota-surakarta)
- [ANTARA — Bank Jateng masifkan QRIS daerah dukung Purworejo digital](https://jateng.antaranews.com/berita/613897/bank-jateng-masifkan-qris-daerah-dukung-purworejo-digital)
- [Joglo Jateng — Kejar PAD Rp 1,5 Miliar, Pemkab Jepara Terapkan E-Parkir Berbasis QRIS](https://joglojateng.com/2026/08/05/kejar-pad-rp-15-miliar-pemkab-jepara-terapkan-e-parkir-berbasis-qris/) — preseden terdekat, Agustus 2026
- [Radar Banyumas — QRIS Kini Bisa Bayar PBB dan Retribusi, Bank Jateng Percepat Transformasi Transaksi Non-Tunai](https://radarbanyumas.disway.id/purwokerto/read/153842/qris-kini-bisa-bayar-pbb-dan-retribusi-bank-jateng-percepat-transformasi-transaksi-non-tunai)
- [Jurnal IDEI — Retribusi Parkir Berbasis QRIS dalam Meningkatkan PAD](https://journal.idei.or.id/jeb/article/download/536/180) — bisa dipakai sebagai referensi di BAB II

# 💳 RISET PEMBAYARAN — GoPay / QRIS via Midtrans

**Tanggal riset:** 8 Agustus 2026
**Status:** riset & perencanaan — belum ada kode yang diimplementasikan
**Panduan kerjanya:** [`PAYMENT-SETUP.md`](./PAYMENT-SETUP.md) — langkah demi langkah beserta kodenya
**Pertanyaan yang dijawab:** bagaimana QuParkir bisa benar-benar menerima pembayaran, dan bagaimana sistem tahu bahwa pembayaran itu berhasil.

---

## 1. Temuan utama: "GoPay Merchant" bukan jalur untuk aplikasi ini

GoPay Merchant (dulu GoBiz) ditujukan untuk transaksi **tatap muka** — QRIS statis di meja kasir, POS, GoFood. Untuk aplikasi web/mobile dengan tarif dinamis seperti QuParkir, jalurnya adalah **Midtrans**, yang satu grup dengan GoPay (GoTo) dan merupakan satu-satunya payment gateway yang memproses GoPay.

Akun keduanya terhubung — email dan nomor telepon usaha tidak bisa didaftarkan dua kali di Midtrans/GoBiz/GoFood. Jadi:

> Mendaftar **Midtrans** tetap memberi akses GoPay, plus QRIS, Virtual Account, dan kartu sekaligus. Tidak perlu mendaftar GoPay Merchant secara terpisah.

Kalau kelak QuParkir punya loket fisik, GoPay Merchant bisa dipakai berdampingan — tapi bukan untuk pembayaran di dalam aplikasi.

---

## 2. Penghalang arsitektur yang harus diselesaikan lebih dulu

QuParkir saat ini **100% berjalan di browser**: `public/` statis + Firestore langsung dari klien, tanpa server sama sekali. Pembayaran sungguhan tidak bisa dipasang di atas arsitektur ini, karena tiga hal berikut mutlak harus dikerjakan di server:

| # | Hal | Kenapa wajib di server |
|---|-----|------------------------|
| 1 | **Server Key Midtrans** | Dipakai sebagai Basic Auth untuk membuat token transaksi. Kalau ditaruh di `config.js`, siapa pun bisa membacanya lewat View Source dan membuat transaksi atas nama kita. |
| 2 | **Perhitungan tarif** | `hitungTarif()` sekarang dihitung di browser (`public/js/util.js`), lalu `data.js:checkout()` menulis `amount` ke Firestore. Pengguna bisa mengubahnya jadi Rp 1 lewat DevTools. |
| 3 | **Penentuan "sudah lunas"** | Harus datang dari webhook Midtrans yang diverifikasi tanda tangannya, bukan dari callback JavaScript di browser. |

**Urutannya: server dulu, baru gateway.**

---

## 3. Daftar kebutuhan

### 3.1 Administratif — akun Midtrans

Dokumen tergantung badan usaha.

**Perorangan** — paling ringan, cukup untuk uji coba/skripsi:

- [ ] KTP pemilik usaha
- [ ] NPWP pribadi
- [ ] Rekening bank — **nama pemilik rekening wajib sama dengan nama di KTP**; kalau berbeda, pencairan dana tersendat
- [ ] Tautan website/media sosial/katalog yang bisa diakses (untuk verifikasi jenis usaha)

**CV / PT / PMA** — bila QuParkir dijalankan bersama Dishub atau badan usaha:

- [ ] Akta perusahaan terbaru
- [ ] SK Kemenkumham atas akta pendirian/perubahan
- [ ] KTP atau paspor direktur
- [ ] NPWP direktur **dan** NPWP perusahaan
- [ ] NIB / SIUP / TDP
- [ ] Izin usaha spesifik sektor bila ada

**Yayasan** — akta + SK Kemenkumham, KTP/paspor ketua yayasan, NPWP yayasan + NPWP ketua, tanda daftar yayasan, NIB/SIUP/TDP, izin sesuai bidang kegiatan.

> Verifikasi memakan beberapa hari kerja. **Akun sandbox aktif langsung tanpa verifikasi** — seluruh integrasi bisa dibangun dan diuji sekarang sambil dokumen produksi diurus paralel.

### 3.2 Infrastruktur

| Kebutuhan | Keterangan |
|---|---|
| Tempat menjalankan kode server | Belum ada di proyek ini — `firebase.json` hanya punya `hosting` + `firestore` |
| Cloud Functions → **butuh paket Blaze** | Paket Spark memblokir semua permintaan jaringan keluar kecuali ke layanan Google, jadi memanggil API Midtrans mustahil. **Kalau tidak bisa/tidak mau upgrade, lihat §3.3 — ada beberapa pilihan gratis penuh** |
| Endpoint webhook publik | HTTPS, port 443, sertifikat valid (bukan self-signed), tidak boleh localhost/VPN/port tidak lazim |
| Server Key & Client Key | Server Key disimpan sebagai secret di server; **tidak pernah** masuk folder `public/` |

> 🔑 **Yang perlu diluruskan:** Blaze hanya dibutuhkan oleh **Cloud Functions**. Firestore, Authentication, dan Hosting tetap berjalan gratis di paket **Spark** dan tidak perlu diubah sama sekali. Jadi backend pembayaran boleh ditaruh di penyedia lain tanpa memindahkan apa pun dari Firebase.

### 3.3 Alternatif gratis pengganti Cloud Functions (tanpa Blaze)

Yang dibutuhkan backend pembayaran sebetulnya sederhana: **bisa memanggil API keluar** dan **punya URL HTTPS publik** untuk webhook. Banyak penyedia memberikan itu gratis permanen.

Firebase tetap dipakai apa adanya — Auth, Firestore, Hosting semuanya di Spark. Backend di luar menulis ke Firestore memakai **service account**, yang tidak dibatasi paket. Kuota Spark (50.000 baca / 20.000 tulis per hari) jauh di atas kebutuhan pilot parkir.

```
[ Browser ] ──── Auth + baca data ────► [ Firebase Spark ]  ← gratis, tidak berubah
     │                                         ▲
     │ createPayment                           │ service account
     ▼                                         │
[ Backend gratis di luar ] ───────────────────►┘
     │  Server Key
     ▼
[ Midtrans ] ──── webhook ────► backend yang sama
```

#### Perbandingan pilihan

Ada **dua syarat mati** yang menyingkirkan sebagian besar kandidat:

1. **Selalu hidup.** Webhook Midtrans wajib dibalas dalam 5 detik (batas keras 15 detik). Penyedia yang menidurkan layanan gratisnya akan melewatkan batas ini. Midtrans memang mengulang (2 → 10 → 30 → 90 → 210 menit, total ~5,7 jam) lalu **menyerah** — dan pembayaran yang sudah masuk tidak pernah tercatat di aplikasi.
2. **Boleh dipakai komersial.** Beberapa paket gratis melarangnya secara eksplisit.

| Penyedia | Kuota gratis | Kartu kredit? | Selalu hidup? | Boleh komersial? | Catatan teknis |
|---|---|---|---|---|---|
| **Cloudflare Workers** ⭐ | 100.000 permintaan/hari, 10 ms CPU | Tidak | ✅ Ya | ✅ Ya | `firebase-admin` **tidak jalan** (butuh Node crypto & gRPC) → Firestore REST API + JWT service account via Web Crypto |
| **Netlify Functions** | 125.000 pemanggilan/bulan | Tidak | ✅ Ya | ✅ Ya | Runtime **Node penuh** → `firebase-admin` jalan langsung, kodenya paling sedikit |
| **Deno Deploy** | 1 juta permintaan/bulan, 20 GB egress, 15 jam CPU | Tidak | ✅ Ya | ✅ Ya | Runtime Web-standard seperti Workers → pertimbangan Firestore REST yang sama |
| **Supabase Edge Functions** | 500.000 pemanggilan/bulan | Tidak | ⚠️ **Tidak** | ✅ Ya | Proyek gratis **dijeda otomatis setelah 7 hari tanpa aktivitas** — lihat di bawah |
| ~~Vercel Hobby~~ | 100 GB-jam, timeout 10 dtk | Tidak | ✅ Ya | ❌ **Tidak** | Lihat di bawah |
| ~~Render free~~ | — | Tidak | ❌ Tidak | ✅ Ya | Layanan tidur saat menganggur; cold start puluhan detik |

#### Kenapa Vercel tidak bisa (untuk produksi)

Ketentuan **Fair Use** Vercel melarang penggunaan komersial di paket Hobby, dan contoh yang mereka sebutkan sendiri adalah *"any method of requesting or processing payment from site visitors"* — persis yang kita bangun. Penggunaan komersial mewajibkan paket **Pro (US$20/bulan)**.

Penegakannya memang tidak konsisten dan banyak proyek kecil berjalan berbulan-bulan tanpa masalah — tapi risikonya adalah deployment dimatikan tanpa pemberitahuan, tepat saat pembayaran pelanggan sedang berjalan. Itu bukan risiko yang layak diambil untuk menghemat biaya yang sebetulnya bisa nol di tempat lain.

> ✅ **Pengecualian:** untuk tahap **sandbox/skripsi**, di mana tidak ada uang sungguhan yang berpindah, Vercel Hobby tidak melanggar apa pun — tidak ada pembayaran yang benar-benar diproses. Sah dipakai untuk membangun dan mendemokan. Yang tidak boleh adalah membiarkannya jadi produksi saat kunci Midtrans sudah diganti ke live.

#### Kenapa Supabase berisiko

Edge Functions-nya sendiri memadai — 500.000 pemanggilan/bulan, jauh melebihi kebutuhan. Masalahnya di lapisan proyek:

> **Proyek Supabase gratis dijeda otomatis setelah 7 hari tanpa aktivitas database.** Saat dijeda, Edge Functions ikut mati.

Untuk aplikasi parkir, jeda seminggu sangat mungkin terjadi — libur semester, jeda uji coba, akhir tahun. Skenario buruknya: proyek tertidur, pelanggan membayar, webhook Midtrans tidak terjawab selama ~5,7 jam percobaan ulang, lalu Midtrans menyerah. **Uang pelanggan sudah terpotong tapi sesi parkirnya tidak pernah tertutup.**

Bisa diakali dengan cron keep-alive yang memanggil database tiap beberapa hari, tapi itu satu komponen tambahan yang bisa gagal diam-diam — dan kalau gagal, gejalanya baru ketahuan setelah ada transaksi hilang.

**Supabase masuk akal bila** Anda memang berencana memakai Postgres-nya sekalian (menggantikan Firestore). Kalau hanya untuk backend pembayaran, kerugiannya tidak sepadan.

#### Rekomendasi

**Cloudflare Workers.** Alasannya:

- Gratis permanen tanpa kartu kredit, bukan masa percobaan
- Tidak ada larangan penggunaan komersial
- **Cold start hitungan milidetik** — ini penting: webhook Midtrans harus dibalas dalam 5 detik (batas keras 15 detik), dan platform yang menidurkan layanan gratisnya akan gagal di sini
- 100.000 permintaan/hari sangat berlebih; satu transaksi parkir memakai ~3 permintaan

**Konsekuensi teknis yang harus diterima:** `firebase-admin` tidak bisa dipakai di Workers karena runtime-nya tidak menyediakan Node crypto dan gRPC. Menulis ke Firestore dilakukan lewat **REST API** dengan token JWT service account yang ditandatangani memakai Web Crypto. Ada pustaka pembungkus (`firebase-admin-rest`, `firebase-cfworkers`) yang menyederhanakannya.

**Soal batas 10 ms CPU** — terdengar mepet, tapi tidak jadi masalah di sini:

- Waktu menunggu jaringan **tidak dihitung** sebagai CPU. Panggilan ke Midtrans dan Firestore boleh makan berapa pun detik; yang dihitung hanya eksekusi kode kita
- Worker rata-rata memakai ~2,2 ms per permintaan
- Satu hal yang perlu dijaga: **cache token OAuth Google** (berlaku 1 jam) di KV atau variabel modul. Menandatangani JWT RSA di setiap permintaan adalah satu-satunya operasi berat di alur ini — kalau di-cache, ia hanya terjadi sekali per jam, bukan setiap transaksi

**Kalau ingin kode sesederhana mungkin**, pilih **Netlify Functions** — runtime Node penuh, `firebase-admin` bisa langsung dipakai seperti di Cloud Functions, jadi contoh kode dari dokumentasi Midtrans/Firebase bisa disalin nyaris apa adanya. Kuotanya (125.000/bulan) tetap jauh melebihi kebutuhan.

#### Catatan tentang Blaze

Sekadar informasi, bukan dorongan: kuota gratis Blaze mencakup 2 juta pemanggilan fungsi per bulan, sehingga tagihan pada trafik pilot besar kemungkinan **Rp 0**. Penghalangnya bukan biaya, melainkan **kewajiban memasang kartu kredit**. Kalau kartunya memang tidak tersedia, pilihan di atas menyelesaikan masalah sepenuhnya tanpa kompromi teknis apa pun.

#### Alternatif termurah: tanpa server sama sekali (QRIS statis)

Kalau untuk sekarang tujuannya hanya membuktikan konsep:

**GoPay Merchant / QRIS Statis** — cetak satu QR per kantong parkir, tempel di gerbang. Pelanggan memindai, uang masuk ke rekening merchant, petugas melihat notifikasi masuk di aplikasi GoPay Merchant.

| | |
|---|---|
| ✅ | Nol server, nol kode, nol biaya, tidak perlu Cloud Functions maupun Blaze |
| ✅ | Pendaftaran cukup KTP |
| ❌ | **Tidak ada rekonsiliasi otomatis** — aplikasi tidak tahu siapa membayar berapa; petugas harus mencocokkan manual |
| ❌ | Nominal diketik pelanggan sendiri → rawan salah/kurang bayar |
| ❌ | E-ticket tidak bisa menutup sesi otomatis |

Ini jalan keluar yang sah untuk uji lapangan, tapi **bukan** yang dijanjikan proposal QuParkir (transparansi retribusi & pencatatan otomatis). Anggap sebagai jembatan, bukan tujuan.

### 3.4 Perubahan kode di repo ini

**Berkas baru:**

- `server/` (atau `functions/` bila memakai Cloud Functions) — minimal tiga endpoint. Tugasnya sama di penyedia mana pun; yang berbeda hanya cara deploy:

  | Endpoint | Tugas |
  |---|---|
  | `createPayment` | Hitung tarif dari data sesi di Firestore, buat `order_id` unik, panggil Snap/Core API, kembalikan token/QR ke klien |
  | `midtransWebhook` | Terima notifikasi, verifikasi tanda tangan, perbarui status transaksi |
  | `reconcile` | Sapu transaksi `pending` yang webhook-nya tidak pernah sampai, lewat Get Status API (Cron Triggers di Workers / Scheduled Functions di Netlify) |

  Di luar Cloud Functions, `createPayment` dipanggil sebagai **HTTPS POST biasa** — bukan `httpsCallable`. Klien mengirim **ID token Firebase Auth** di header `Authorization`, dan server memverifikasinya sebelum mengerjakan apa pun.

**Berkas yang diubah:**

| Berkas | Perubahan |
|---|---|
| `public/js/pay.js` | `simulasiQRIS()` menyelesaikan pembayaran lewat tombol "Saya sudah bayar" — artinya **klien yang memutuskan lunas**. Diganti: klien hanya menampilkan QR/deeplink lalu menunggu status berubah di Firestore |
| `public/js/data.js` | `checkout()` tidak lagi menulis `amount` dan `transactions` dari klien |
| `public/js/config.js` | `paymentConfig` diisi Client Key (aman publik); Server Key tidak boleh ada di sini |
| `public/app.html` | **CSP saat ini akan memblokir Midtrans.** Tambahkan `https://app.sandbox.midtrans.com` / `https://app.midtrans.com` di `script-src`, `connect-src`, dan `frame-src` (Snap membuka iframe). Bila backend di luar Firebase, domainnya juga wajib masuk `connect-src` |
| `firebase.json` | Hanya bila memakai Cloud Functions: tambah blok `functions` + rewrite ke fungsi webhook. Dengan backend di luar, berkas ini tidak berubah |

> ⚠️ Soal CSP: ini paling sering terlewat dan gejalanya membingungkan — popup Snap diam saja tanpa pesan error apa pun.

### 3.5 Model data

Koleksi baru `orders` (atau `payments`), ditulis **hanya oleh server**:

```
orders/{orderId}
  uid                    // pemilik sesi
  sessionId              // sesi parkir yang dibayar
  amount                 // dihitung server, bukan kiriman klien
  status                 // pending | paid | expired | failed
  midtransTransactionId
  paymentType            // gopay | qris | ...
  createdAt, paidAt
  rawNotification        // simpan mentahnya untuk audit
```

Ketentuan `order_id` Midtrans: maksimal 50 karakter, hanya alfanumerik dan `-_~.`, dan **harus unik selamanya** — Midtrans menolak `order_id` yang pernah dipakai.

---

## 4. ⚠️ Lubang keamanan yang wajib ditutup sebelum uang sungguhan masuk

Ditemukan saat membaca `firestore.rules`. Tiga hal ini **tidak berbahaya selama masih simulasi**, tapi menjadi fatal begitu ada uang nyata.

| # | Lubang | Lokasi | Akibat |
|---|--------|--------|--------|
| 1 | **Saldo bisa diisi sendiri** | `match /users/{u}` — pemilik boleh menulis `wallet` ke angka berapa pun asal ≥ 0 | Siapa pun bisa membuka DevTools dan mengisi saldo QuPay tanpa membayar |
| 2 | **Nominal transaksi ditentukan klien** | `match /transactions/{id}` — hanya divalidasi `amount > 0` | Parkir 5 jam bisa dicatat Rp 1 |
| 3 | **Tarif sesi bisa diubah pemilik sesi** | `match /sessions/{id}` — pemilik boleh menulis `amount` tanpa validasi | Sama seperti di atas, dari sisi sesi |

Komentar di `firestore.rules` sendiri sudah menandai `wallet` sebagai *"prototipe; server-side wallet = fase Cloud Functions"* — fase itu adalah sekarang.

**Perbaikan:** `wallet`, `transactions`, dan `sessions.amount` diubah menjadi **tulis-server-saja** (`allow write: if false` untuk klien; Admin SDK di Cloud Functions memintas rules).

---

## 5. Alur pembayaran

```
1. User tekan "Bayar" di halaman Status
2. Klien → createPayment(sessionId)                 [callable, TANPA mengirim nominal]
3. Server: baca sesi dari Firestore → hitung tarif sendiri
           → buat orders/{orderId} status=pending
           → POST ke Midtrans memakai Server Key
4. Server → klien: token Snap  ATAU  QR string + deeplink GoPay
5. User bayar di aplikasi Gojek/GoPay, atau scan QRIS dari e-wallet/m-banking mana pun
6. Midtrans → POST webhook ke Cloud Function
7. Server: verifikasi SHA512(order_id + status_code + gross_amount + ServerKey)
                      == signature_key
           → bila cocok DAN transaction_status ∈ {settlement, capture}
                        DAN fraud_status == accept
             → tandai lunas, tutup sesi parkir, kurangi keterisian lokasi
8. Klien: onSnapshot orders/{orderId} → layar berubah jadi "Lunas" dengan sendirinya
```

### 5.1 Bagaimana sistem tahu pembayaran berhasil

**Langkah 6–7 — webhook, bukan callback browser.**

Callback `onSuccess` dari Snap hanya untuk mengubah tampilan; dokumentasi Midtrans tegas soal ini. Alasannya sederhana: pengguna bisa menutup browser tepat setelah membayar, dan webhook tetap sampai.

Tiga hal yang harus benar di webhook:

1. **Verifikasi tanda tangan** — tanpa ini, siapa pun yang tahu URL webhook bisa mengirim "sudah lunas" palsu.
   ```
   signature_key == SHA512(order_id + status_code + gross_amount + ServerKey)
   ```
2. **Idempoten** — Midtrans mengirim ulang bila endpoint gagal, dengan jeda **2 mnt → 10 mnt → 30 mnt → 90 mnt → 210 mnt**. Proses yang sama harus aman dijalankan dua kali; pakai `order_id` sebagai kunci.
3. **Balas HTTP 200 dalam 5 detik** (batas keras 15 detik). Kerja berat dilakukan setelah membalas.

Tambahan: sediakan job rekonsiliasi terjadwal. Webhook bisa hilang, dan **Get Status API adalah sumber kebenaran cadangan**.

### 5.2 Nilai `transaction_status`

| Status | Arti |
|---|---|
| `settlement` | Transaksi selesai, dana diterima — **ini yang menandakan lunas** |
| `capture` | Kartu berhasil, dana ditahan (khusus kartu; sukses bila `fraud_status == accept`) |
| `pending` | Menunggu pelanggan menyelesaikan pembayaran |
| `expire` | Lewat batas waktu |
| `deny` | Ditolak penyedia/FDS |
| `cancel` | Dibatalkan merchant |
| `failure` | Galat tak terduga |
| `refund` / `partial_refund` | Pengembalian dana |

**Kriteria sukses:** `transaction_status` bernilai `settlement` atau `capture`, **dan** `fraud_status` bernilai `accept` bila field tersebut ada.

### 5.3 Endpoint Midtrans

| | Sandbox | Produksi |
|---|---|---|
| Snap (buat token) | `https://app.sandbox.midtrans.com/snap/v1/transactions` | `https://app.midtrans.com/snap/v1/transactions` |
| Core API (charge) | `https://api.sandbox.midtrans.com/v2/charge` | `https://api.midtrans.com/v2/charge` |
| snap.js | `https://app.sandbox.midtrans.com/snap/snap.js` | `https://app.midtrans.com/snap/snap.js` |

Autentikasi: **Basic Auth**, username = Server Key, password kosong (base64 dari `"ServerKey:"`).

### 5.4 Snap vs Core API

| | Snap | Core API |
|---|---|---|
| Tampilan | Popup siap pakai dari Midtrans | Kita rancang sendiri |
| Kerja klien | `window.snap.pay(token)` | Tampilkan QR / deeplink sendiri dari `actions[]` |
| Deteksi perangkat | Otomatis | Manual (desktop → QR, mobile → deeplink) |
| Cocok untuk | Jalan cepat, integrasi awal | Kontrol penuh atas tampilan, tetap dalam gaya QuParkir |

Untuk `payment_type: "gopay"`, respons Core API berisi `actions[]`:
- `generate-qr-code` — QR untuk dipindai dari perangkat lain
- `deeplink-redirect` — buka aplikasi Gojek/GoPay langsung (mobile)
- `get-status`, `cancel` — administratif

> Catatan: bila pelanggan membayar transaksi `gopay` dengan cara memindai QRIS, webhook akan melaporkan `"payment_type": "qris"`. Jangan mengandalkan `payment_type` untuk mencocokkan transaksi — gunakan `order_id`.

**Rekomendasi:** mulai dengan **Snap** (lebih cepat sampai berfungsi), pertimbangkan pindah ke Core API belakangan bila tampilannya ingin sepenuhnya menyatu dengan QuParkir.

---

## 6. Biaya

| Pos | Besaran |
|---|---|
| QRIS reguler | **0,7%** per transaksi sukses (ketetapan Bank Indonesia) |
| GoPay / QRIS usaha mikro | **0%** untuk transaksi sampai Rp 500 ribu, sesuai regulasi BI |
| Settlement GoPay | Umumnya **T+0** ke rekening |
| Settlement QRIS | Hari yang sama atau H+1 hari kerja |
| Biaya pencairan | Sering gratis; bisa ~Rp 2.900 bila antarbank lewat SKN |

> ⚠️ **Perlu dikonfirmasi ke Midtrans:** MDR bergantung kategori merchant, dan dokumen Midtrans hanya menyebut tarif reguler. Untuk transaksi Rp 2.000, selisih 0% vs 0,7% berarti **Rp 0 vs Rp 14** — dan itu menentukan model bisnisnya. Tanyakan kategori mana yang berlaku untuk usaha parkir sebelum menghitung proyeksi pendapatan.

### Regulasi 2026

PBI 10/2025 (berlaku 31 Maret 2026) dan kewajiban kepatuhan SNAP adalah beban **Midtrans sebagai pemegang lisensi PJP Bank Indonesia**, bukan urusan kita sebagai merchant.

---

## 7. Urutan pengerjaan yang disarankan

| # | Langkah | Bisa dimulai |
|---|---------|--------------|
| 1 | **Tutup tiga lubang keamanan di `firestore.rules`** (bagian 4) | **Sekarang** — tidak menunggu apa pun, dan wajib sebelum langkah lain berarti |
| 2 | Daftar akun Midtrans, ambil **kunci sandbox** | Sekarang (sandbox aktif langsung) |
| 3 | Siapkan backend — **Cloudflare Workers** (gratis, tanpa kartu) atau Cloud Functions bila Blaze tersedia. Lihat §3.3 | Sekarang |
| 4 | Bangun alur lengkap di sandbox | Setelah 2–3 |
| 5 | Longgarkan CSP `app.html` untuk domain Midtrans | Bersamaan dengan 4 |
| 6 | Urus dokumen legal, ajukan akun produksi | Paralel sejak awal |
| 7 | Ganti kunci sandbox → produksi, uji transaksi kecil sungguhan | Setelah 6 disetujui |

Langkah **1–5 bisa dikerjakan sekarang juga** tanpa menunggu verifikasi apa pun. Midtrans menyediakan simulator pembayaran di sandbox, jadi seluruh siklus — termasuk webhook — bisa diuji tanpa uang sungguhan.

---

## 8. Sumber

- [Midtrans — HTTP(S) Notification / Webhooks](https://docs.midtrans.com/docs/https-notification-webhooks)
- [Midtrans — Snap Integration Guide](https://docs.midtrans.com/docs/snap-snap-integration-guide)
- [Midtrans — Core API E-Wallet (GoPay & QRIS)](https://docs.midtrans.com/docs/coreapi-e-money-integration)
- [Midtrans — Dokumen legalitas untuk registrasi akun](https://docs.midtrans.com/docs/apa-saja-dokumen-legalitas-yang-diperlukan-untuk-registrasi-akun-midtrans)
- [Midtrans — Berapa biaya transaksi untuk QRIS?](https://docs.midtrans.com/docs/berapa-biaya-transaksi-untuk-qris)
- [Midtrans — Cara mendaftar menjadi merchant](https://docs.midtrans.com/docs/bagaimana-cara-mendaftar-menjadi-merchant-midtrans)
- [Midtrans — Best Practices to Handle Notification](https://docs.midtrans.com/reference/best-practices-to-handle-notification)
- [GoPay — Biaya transaksi QRIS untuk merchant](https://gopay.co.id/blog/biaya-transaksi-qris-panduan-lengkap-untuk-merchant)
- [Midtrans — Payment Methods](https://midtrans.com/features/payment-methods)
- [Midtrans — Pengenalan QRIS Statis](https://docs.midtrans.com/docs/pengenalan-qris-statis)
- [Firebase Pricing (Spark vs Blaze)](https://firebase.google.com/pricing)
- [PaymentBrief — Indonesia Payments Operator Guide](https://paymentbrief.com/articles/indonesia-payments-operator-guide/)

**Alternatif hosting gratis (§3.3):**

- [Cloudflare Workers — Pricing & limits (resmi)](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers — batas paket gratis 2026](https://eastondev.com/blog/en/posts/dev/20260526-cloudflare-free-limits/)
- [Supabase — Pricing & Fees (resmi)](https://supabase.com/pricing)
- [Supabase — batas paket gratis & jeda otomatis 7 hari](https://www.itpathsolutions.com/supabase-free-tier-limits)
- [Cloudflare Blog — Writing an API at the Edge with Workers and Cloud Firestore](https://blog.cloudflare.com/api-at-the-edge-workers-and-firestore/)
- [`firebase-admin-rest` — pembungkus Firebase Admin berbasis REST untuk Workers/Deno/Bun](https://github.com/Moe03/firebase-admin-rest)
- [`firebase-cfworkers` — Firebase Admin SDK untuk Cloudflare Workers](https://github.com/franknoh/firebase-cfworkers)
- [Vercel — Fair Use Guidelines (larangan penggunaan komersial di Hobby)](https://vercel.com/docs/limits/fair-use-guidelines)
- [Vercel — Hobby Plan](https://vercel.com/docs/plans/hobby)
- [Render — Platforms with a real free tier for developers in 2026](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026)

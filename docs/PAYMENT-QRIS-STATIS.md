# ⚡ QRIS STATIS → DINAMIS — Yang Sudah Terpasang

**Tanggal:** 24 Agustus 2026
**Status:** **terpasang & teruji** (19 uji lulus, lihat §4) — beda dari dokumen pembayaran lain di folder ini yang masih berupa rencana
**Untuk:** demo/simulasi hari ini, saat akun produksi Midtrans masih diproses
**Pendamping:** [`PAYMENT-GOBIZ.md`](./PAYMENT-GOBIZ.md) §0.2 (kenapa cara ini tidak cukup untuk produksi) · [`PAYMENT-SETUP.md`](./PAYMENT-SETUP.md) (jalur otomatis penuh)

---

## 1. Apa yang dilakukan

QRIS **statis** (yang tercetak di stiker merchant) tidak memuat nominal — pembayar mengetiknya sendiri, rawan salah. Berkas baru `public/js/qris.js` mengubahnya jadi **dinamis** langsung di browser:

| Langkah | Isi |
|---|---|
| 1 | Tag `01` (metode inisiasi): `11` (statis) → `12` (dinamis) |
| 2 | Sisipkan tag `54` (nominal) pada posisi urut yang benar — setelah `53`, sebelum `58` |
| 3 | Hitung ulang tag `63` (CRC16-CCITT). **Tanpa ini seluruh QR ditolak pemindai** |

Hasilnya: pembayar memindai, nominalnya **sudah terkunci** dan tidak bisa diketik ulang.

Semua terjadi di browser — nol server, nol pendaftaran, nol biaya.

---

## 2. Cara memakai

### 2a. Ambil string QRIS merchant

Pindai QRIS cetakan Anda dengan pembaca QR apa pun (aplikasi kamera, situs pembaca QR), lalu salin **teksnya**, bukan gambarnya. Cirinya: diawali `00020101` dan diakhiri `6304` + 4 karakter.

> **Sudah dikerjakan.** QRIS merchant proyek ini sudah dibaca dari `docs/WhatsApp Image 2026-08-24 at 23.52.26.jpeg` dan sudah tertanam di `config.js` — lihat §2d. Bagian ini hanya perlu diulang bila QRIS-nya diganti.

### 2b. Uji dulu di panel admin

`admin.html` → tab **Export QRIS** → bagian *QR Kustom / QRIS Statis*:

1. Tempel string QRIS
2. Isi nominal, mis. `2000`
3. Tekan **Buat QR**

Kalau benar, muncul `✅ QRIS dinamis Rp 2.000 — NAMA MERCHANT, KOTA`. Kalau string salah salin, muncul pesan galat yang menyebut persis apa yang rusak (CRC tidak cocok / string terpotong).

> **Uji dengan uang sungguhan sebelum demo.** Pindai hasilnya dengan HP, pastikan nominalnya benar dan pembayaran masuk. Ini satu-satunya cara memastikan penerbit QRIS Anda menerima penyisipan tag 54.

### 2c. Aktifkan di aplikasi

`public/js/config.js`:

```js
export const paymentConfig = {
  provider: "simulasi",
  midtransClientKey: "",
  qrisStatic: "00020101021126610014COM.GO-JEK.WWW...63042F87",   // ← sudah terisi
};
```

Begitu `qrisStatic` terisi, tombol Bayar → QRIS menampilkan **QR merchant asli** dengan nominal terkunci. Kalau dikosongkan lagi, otomatis kembali ke mode simulasi. Kalau stringnya salah, aplikasi **tidak** menampilkan QR rusak — ia jatuh ke mode simulasi sambil memberi peringatan.

### 2d. QRIS merchant proyek ini — sudah terpasang & terverifikasi

Isi QRIS yang dipakai, hasil pembacaan langsung atas gambar yang diberikan:

| Ruas | Tag | Nilai |
|---|---|---|
| Metode inisiasi | `01` | `11` — **statis** |
| Penyelenggara | `26` | `COM.GO-JEK.WWW` — merchant ID `G843759356` |
| Domestik QRIS | `51` | NMID `ID1026577085958`, kriteria **UMI** |
| Kategori merchant | `52` | `4789` (jasa transportasi) |
| Mata uang / negara | `53` / `58` | `360` (IDR) / `ID` |
| Nama merchant | `59` | `Quparkir, COLOMADU` |
| Kota / kode pos | `60` / `61` | `KARANGANYAR` / `57173` |
| CRC | `63` | `2F87` — **cocok** |

Kriteria **UMI** berarti MDR-nya 0% untuk transaksi ≤ Rp 500.000 — tarif parkir jelas di bawah itu, jadi uang yang masuk utuh tanpa potongan.

Hasil konversi ke dinamis Rp 2.000 (`tag 01` → `12`, `tag 54` = `2000`, CRC → `CA69`):

```
00020101021226610014COM.GO-JEK.WWW01189360091438437593560210G8437593560303UMI51440014ID.CO.QRIS.WWW0215ID10265770859580303UMI520447895303360540420005802ID5918Quparkir, COLOMADU6011KARANGANYAR61055717362140703A0111036216304CA69
```

Sudah digambar jadi QR nyata di `docs/uji-qris-dinamis-2000.png`, lalu **dipindai balik oleh pembaca QR independen (ZXing)** dan hasilnya identik karakter demi karakter. Artinya QR-nya sah secara format dan terbaca mesin pemindai sungguhan.

Yang tetap harus Anda lakukan sendiri: **pindai berkas PNG itu dengan aplikasi e-wallet dan bayar Rp 2.000.** Bahwa QR-nya terbaca sudah terbukti; bahwa GoPay Merchant menerima nominal sisipan pada QRIS statis miliknya hanya bisa dibuktikan dengan satu transaksi sungguhan.

---

## 3. ⚠️ Batas yang harus disebutkan di naskah

**Uangnya nyata, tapi aplikasi tidak tahu kapan masuk.**

QRIS statis tidak membawa `order_id`. Yang diterima merchant hanya nominal, waktu, dan nama pembayar — tidak ada penanda yang menghubungkannya ke sesi parkir tertentu. Dua motor yang keluar bersamaan menghasilkan dua transaksi Rp 2.000 yang tidak terbedakan.

Akibatnya:

| | Status |
|---|---|
| Nominal terkunci, tidak bisa salah ketik | ✅ Teratasi |
| Uang masuk ke rekening merchant | ✅ Nyata |
| Aplikasi tahu sendiri sudah lunas | ❌ **Tidak** — tombol "Saya sudah bayar" adalah pernyataan pengguna |
| Sesi tertutup otomatis | ❌ Bergantung pada konfirmasi tadi |
| Rekonsiliasi otomatis | ❌ Petugas mencocokkan manual di aplikasi merchant |

Ini jujur ditulis sebagai komentar di `public/js/pay.js` pada fungsi `qrisMerchant()`, bukan disembunyikan.

**Untuk bab pembahasan:** cara ini sah sebagai *proof of concept* tahap pertama, dan jalur menuju rekonsiliasi otomatis sudah dipetakan — QRIS dinamis terbitan PJP + webhook bertanda tangan, lihat [`PAYMENT-SETUP.md`](./PAYMENT-SETUP.md) (Midtrans) atau [`PAYMENT-GOBIZ.md`](./PAYMENT-GOBIZ.md) (GoPay Merchant). Menyebut batas ini lebih kuat daripada menyembunyikannya; penguji hampir pasti menanyakannya.

---

## 4. Yang sudah diuji

19 uji lulus, termasuk:

- CRC16 cocok dengan nilai baku CCITT-FALSE (`crc16("123456789") === "29B1"`)
- QRIS statis contoh dikenali, dikonversi, dan hasilnya lolos validasi CRC-nya sendiri
- Tag `54` mendarat setelah `53` dan sebelum `58`; tag `63` tetap paling akhir
- Data merchant (tag 26, 51, 59, 60, 61, 62) utuh setelah konversi
- Konversi ulang atas QR yang sudah dinamis **tidak** menggandakan tag `54`
- Biaya layanan rupiah (`55=02` + `56`) dan persen (`55=03` + `57`)
- Penolakan yang benar: CRC salah, string terpotong, nominal 0, bukan EMV

**Satu jebakan yang sempat ketemu dan sudah diperbaiki:** membuang seluruh spasi dari string QRIS akan merusaknya — nama merchant dan kota (tag 59/60) sah mengandung spasi, dan membuangnya menggeser seluruh offset TLV. Yang dibuang sekarang hanya pembungkus baris (`\r`, `\n`, `\t`).

**Diuji dengan QRIS merchant sungguhan.** String asli lolos validasi CRC, dikonversi ke Rp 2.000 / Rp 5.000 / Rp 12.500, dan tiap hasilnya digambar jadi QR lalu dibaca ulang oleh pembaca QR independen — identik karakter demi karakter. Rincian di §2d.

**Yang belum bisa diuji dari sini:** apakah GoPay Merchant benar-benar menerima nominal yang disisipkan ke QRIS statisnya. Secara format QR-nya sah dan terbaca; apakah nominalnya dihormati di sisi penerbit wajib dibuktikan dengan satu transaksi sungguhan sebelum demo — lihat §2d.

---

## 5. Berkas yang tersentuh

| Berkas | Perubahan |
|---|---|
| `public/js/qris.js` | **Baru** — `crc16`, `parseEMV`, `validateQris`, `toDynamic` |
| `public/js/pay.js` | `qrisMerchant()` — mode ketiga di `payQRIS()`, dengan jatuh-balik ke simulasi bila string tidak sah |
| `public/js/config.js` | `paymentConfig.qrisStatic` + penjelasan tiga mode |
| `public/js/admin-panel.js` | Tab Export QRIS: kolom nominal, validasi, dan info merchant |
| `public/sw.js`, `public/version.json` | Versi cache → `qp-v11` supaya berkas baru tidak tertahan cache lama |
| `docs/uji-qris-dinamis-2000.png` | **Baru** — QR dinamis Rp 2.000 untuk uji bayar sungguhan |

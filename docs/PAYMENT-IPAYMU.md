# 🔁 PINDAH KE IPAYMU — Kebutuhan & Panduan Pasang

**Tanggal riset:** 13 Agustus 2026
**Pendamping:** [`PAYMENT-ALTERNATIF.md`](./PAYMENT-ALTERNATIF.md) (kenapa iPaymu masuk daftar) · [`PAYMENT-SETUP.md`](./PAYMENT-SETUP.md) (versi Midtrans — sebagian besar tetap berlaku) · [`WALLET.md`](./WALLET.md)
**Status kode di dokumen ini:** kerangka kerja yang belum pernah dijalankan. Wajib diuji di sandbox sebelum dipercaya.
**Pertanyaan yang dijawab:** apa saja yang dibutuhkan untuk mengganti Midtrans dengan iPaymu, dan apa yang berubah di kode.

---

## 0. Baca ini dulu — dua penghalang sebelum menulis kode sebaris pun

Keduanya bukan soal teknis integrasi, tapi soal **apakah iPaymu bisa dipakai sama sekali** oleh QuParkir. Keduanya baru muncul saat membaca dokumentasi resminya, tidak terlihat dari halaman pemasaran.

### ⛔ Penghalang 1 — Verifikasi mensyaratkan "toko dengan minimal 5 produk"

Syarat verifikasi merchant perorangan iPaymu:

> Website/aplikasi/toko online yang aktif dan bisa diuji transaksinya, **minimal 5 produk**, harga dalam Rupiah. Alternatifnya: tautan media sosial usaha atau URL app store.

**QuParkir bukan toko.** Tidak ada katalog produk; yang ada adalah tarif parkir yang dihitung dari durasi. Ini perlu dinegosiasikan lebih dulu ke `support@ipaymu.com` sebelum menghabiskan waktu integrasi.

> ✅ **Tidak menghalangi skripsi.** Akun **sandbox** iPaymu bisa didaftarkan di `sandbox.ipaymu.com` **tanpa verifikasi dokumen sama sekali**. Seluruh integrasi bisa dibangun dan didemokan tanpa menyentuh syarat ini.

### ⛔ Penghalang 2 — Produksi mewajibkan **IP statis**, dan ini meruntuhkan rencana backend gratis

Dokumentasi iPaymu menyatakan tegas: di mode Production, **alamat IP server Anda wajib terdaftar** di `my.ipaymu.com/ip`, dan **IP dinamis dilarang**. Kalau IP berubah, request ditolak dengan galat `Invalid IP`.

Ini bertabrakan langsung dengan `PAYMENT.md` §3.3:

| Backend | Punya IP keluar statis? |
|---|---|
| **Netlify Functions** | ❌ Berjalan di atas AWS Lambda dengan 80+ IPv4 yang berganti-ganti. IP statis hanya ada di paket **Enterprise** |
| **Cloudflare Workers** | ❌ Keluar lewat rentang IP Cloudflare yang sangat luas dan tidak bisa dipatok di paket gratis |
| **Deno Deploy / Supabase Edge** | ❌ Sama, serverless bersama |

**Konsekuensi:** dengan iPaymu, backend pembayaran **tidak bisa** berjalan gratis di Netlify/Workers saat produksi. Pilihannya:

| Opsi | Biaya kira-kira | Catatan |
|---|---|---|
| **VPS kecil di Indonesia** (Biznet Gio, IDCloudHost, Contabo) | ~Rp 30.000–60.000/bulan | Paling lurus. Satu IP statis, Node.js jalan apa adanya, sekaligus jadi endpoint callback. Tapi harus diurus sendiri: update, TLS, uptime |
| **Proxy IP statis** di depan Netlify (QuotaGuard, OutboundGateway) | mulai ~US$10/bulan | Set `HTTPS_PROXY` sebagai env var, kode tidak berubah. Lebih mahal dari VPS-nya sendiri |
| **Netlify Enterprise** | mahal | Tidak masuk akal untuk proyek ini |
| **Tetap di sandbox** | Rp 0 | Sah untuk skripsi. Tidak sah untuk uang sungguhan |

> 🔑 **Ini perbedaan paling mahal antara Midtrans dan iPaymu**, dan tidak ada hubungannya dengan MDR. Midtrans tidak mewajibkan IP statis, sehingga backend gratis di Netlify/Workers cukup. iPaymu mewajibkannya, sehingga produksi butuh minimal satu VPS berbayar.
>
> Kalau alasan mempertimbangkan iPaymu adalah **menghemat biaya**, hasilnya justru sebaliknya: MDR-nya sama persis (0,7%, ditetapkan BI — lihat [`PAYMENT-ALTERNATIF.md`](./PAYMENT-ALTERNATIF.md) §1), tapi infrastrukturnya jadi berbayar.
>
> Kalau alasannya **pendaftaran lebih mudah**, penghalang 1 justru membuatnya lebih sulit daripada Midtrans untuk aplikasi non-toko.

**Silakan lanjut membaca** — sisa dokumen ini tetap berlaku penuh, dan untuk keperluan skripsi/sandbox semuanya bisa dikerjakan tanpa biaya apa pun. Tapi dua hal di atas sebaiknya diputuskan sadar, bukan ditemukan di tengah jalan.

---

## 1. Yang dibutuhkan — daftar lengkap

### 1a. Akun & kredensial

| # | Kebutuhan | Cara dapat | Biaya |
|---|---|---|---|
| 1 | **Akun sandbox iPaymu** | Daftar di [sandbox.ipaymu.com](https://sandbox.ipaymu.com) — **tanpa verifikasi dokumen** | Gratis |
| 2 | **VA sandbox** + **API Key sandbox** | Dashboard sandbox → menu **Integrasi** | Gratis |
| 3 | Akun produksi + verifikasi | [my.ipaymu.com](https://my.ipaymu.com), dokumen di §1b | Gratis, maks 2 hari kerja |
| 4 | VA + API Key **produksi** | Dashboard produksi → **Integrasi** (**berbeda** dari sandbox) | — |
| 5 | Service account Firebase | Sama persis dengan `PAYMENT-SETUP.md` Langkah 3 | Gratis |

### 1b. Dokumen verifikasi (perorangan)

- [ ] KTP
- [ ] NPWP (atau NIK yang sudah dipadankan dengan NPWP)
- [ ] Selfie memegang KTP
- [ ] Halaman depan buku tabungan — **nama pemilik rekening wajib sama dengan KTP**
- [ ] SIUP/NIB
- [ ] Website/aplikasi aktif, **min. 5 produk**, harga Rupiah ⚠️ **lihat Penghalang 1**

Kalau QuParkir dijalankan atas nama badan usaha, tambahannya sama seperti daftar di `PAYMENT.md` §3.1 (akta, SK Kemenkumham, NPWP perusahaan).

### 1c. Infrastruktur

| Kebutuhan | Sandbox | Produksi |
|---|---|---|
| Tempat menjalankan backend | Netlify Functions gratis — cukup | **VPS dengan IP statis** ⚠️ Penghalang 2 |
| Endpoint callback HTTPS publik | Netlify | Domain terdaftar di `my.ipaymu.com/domain`, diverifikasi maks 2 hari kerja |
| IP terdaftar | Tidak perlu | **Wajib**, di `my.ipaymu.com/ip` |
| Firebase | Spark, tidak berubah | Spark, tidak berubah |

### 1d. Nilai rahasia yang dikelola

```bash
IPAYMU_VA=0000001234567890          # VA sandbox → nanti VA produksi
IPAYMU_API_KEY=SANDBOX-xxxxxxxx      # Server saja. JANGAN masuk public/
IPAYMU_IS_PRODUCTION=false
FB_PROJECT_ID=quparkir
FB_CLIENT_EMAIL=firebase-adminsdk-xxxxx@quparkir.iam.gserviceaccount.com
FB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ALLOWED_ORIGIN=https://quparkir.web.app
```

> ⚠️ Berbeda dari Midtrans, **iPaymu tidak punya "Client Key" yang aman dipublikasikan.** VA dan API Key keduanya rahasia server. Artinya `public/js/config.js` **tidak menyimpan kredensial iPaymu sama sekali** — hanya `apiBase` ke backend kita.

---

## 2. Apa yang berubah dari rencana Midtrans

Kabar baiknya: **sebagian besar tidak berubah.** Seluruh `WALLET.md`, model data `orders`, Firestore Rules, idempotensi, dan alur `reconcile` berlaku identik.

| Berkas | Berubah? | Apa |
|---|---|---|
| `firestore.rules` | ❌ | Sama persis. Semua lubang keamanan di `PAYMENT-SETUP.md` Langkah 1 tetap wajib ditutup lebih dulu |
| `_lib.js` | ✅ **banyak** | Ganti Basic Auth → pembuatan signature HMAC. Ganti URL endpoint |
| `create-payment.js` | ✅ sebagian | Bentuk body & nama field respons. Logika hitung tarif, cek kepemilikan sesi, pencatatan `orders` **tidak berubah** |
| `midtrans-webhook.js` → `ipaymu-callback.js` | ✅ sebagian | Verifikasi tanda tangan & pemetaan status. Fungsi `terapkan()` **tidak berubah sama sekali** |
| `reconcile.js` | ✅ sedikit | URL & body Check Transaction |
| `public/js/pay.js` | ✅ | **Tidak ada `snap.js`.** Kita render QR sendiri, atau redirect ke halaman iPaymu |
| `public/js/config.js` | ✅ | Hapus `midtransClientKey` & `snapUrl`; sisakan `apiBase` |
| `public/app.html` (CSP) | ✅ **lebih ringan** | Tidak perlu `script-src`/`frame-src` pihak ketiga bila memakai Direct + render QR sendiri |

Perbandingan konsep:

| | Midtrans | iPaymu |
|---|---|---|
| Autentikasi API | Basic Auth (Server Key) | Header `va` + `signature` (HMAC-SHA256) + `timestamp` |
| UI pembayaran | Snap popup (`snap.js`) | **Tidak ada.** Pilih: Redirect (halaman iPaymu) atau Direct (render QR sendiri) |
| Kunci tanda tangan callback | Server Key | **Nomor VA** ⚠️ lihat §5 |
| Tanda "lunas" | `transaction_status` ∈ {settlement, capture} | `status == "berhasil"` / `status_code == 1` |
| Kunci transaksi | `order_id` (kita yang tentukan) | `referenceId` (kita) ↔ `trx_id`/`sid` (mereka) |
| IP statis di produksi | Tidak wajib | **Wajib** |

---

## 3. Endpoint & signature

### 3a. Base URL

| | Sandbox | Produksi |
|---|---|---|
| Base | `https://sandbox.ipaymu.com/api/v2` | `https://my.ipaymu.com/api/v2` |
| Buat pembayaran (direct) | `POST /payment/direct` | sama |
| Buat pembayaran (redirect) | `POST /payment` | sama |
| Cek transaksi | `POST /transaction` | sama |

### 3b. Header wajib di setiap request

```
Content-Type: application/json
va:        <nomor VA>
signature: <hex HMAC-SHA256>
timestamp: <YYYYMMDDhhmmss>
```

### 3c. Rumus signature

```
bodyHash    = lowercase( SHA256( JSON.stringify(body) ) )
stringToSign = METHOD + ":" + VA + ":" + bodyHash + ":" + APIKEY
signature    = hex( HMAC-SHA256( stringToSign, APIKEY ) )
```

Perhatikan: `apiKey` muncul **dua kali** — sebagai bagian string yang ditandatangani, sekaligus sebagai kunci HMAC-nya. Itu memang begitu di dokumentasi resmi, bukan salah ketik.

> ⚠️ `bodyHash` harus dihitung dari **string JSON yang persis dikirim**. Jangan `JSON.stringify()` dua kali dengan hasil berbeda (mis. beda urutan key). Simpan hasilnya di satu variabel, tanda tangani variabel itu, kirim variabel itu juga.

---

## 4. Kode

### 4a. `netlify/functions/_lib.js` — bagian yang menggantikan Midtrans

Sisanya (`admin`, `db`, `cors`, `json`, `hitungTarif`) **salin apa adanya** dari `PAYMENT-SETUP.md` §5a.

```js
const crypto = require("crypto");

const isProd = process.env.IPAYMU_IS_PRODUCTION === "true";
const VA = process.env.IPAYMU_VA;
const API_KEY = process.env.IPAYMU_API_KEY;

const IPAYMU_BASE = isProd
  ? "https://my.ipaymu.com/api/v2"
  : "https://sandbox.ipaymu.com/api/v2";

// timestamp iPaymu: YYYYMMDDhhmmss
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const sha256hex = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Satu pintu untuk semua panggilan ke iPaymu. bodyStr ditandatangani DAN dikirim —
// jangan pernah men-stringify ulang, hash-nya harus cocok byte per byte.
async function ipaymu(path, body) {
  const bodyStr = JSON.stringify(body);
  const stringToSign = `POST:${VA}:${sha256hex(bodyStr).toLowerCase()}:${API_KEY}`;
  const signature = crypto.createHmac("sha256", API_KEY)
    .update(stringToSign).digest("hex");

  const res = await fetch(`${IPAYMU_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      va: VA,
      signature,
      timestamp: stamp(),
    },
    body: bodyStr,
  });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

module.exports = { /* ...yang lama..., */ ipaymu, VA, API_KEY, IPAYMU_BASE };
```

### 4b. `create-payment.js` — yang berubah

Bagian 1–5 (verifikasi ID token, ambil sesi, hitung tarif di server, pakai ulang order pending, catat `orders` sebelum memanggil gateway) **disalin apa adanya** dari `PAYMENT-SETUP.md` §5b. Yang berbeda hanya langkah 6:

```js
// 6) Minta pembayaran QRIS ke iPaymu
const { ok, body } = await ipaymu("/payment/direct", {
  name:   s.plate || "Pelanggan QuParkir",
  email:  "noreply@quparkir.web.app",   // iPaymu mewajibkan; boleh e-mail akun bila ada
  phone:  "08000000000",
  amount,                                // dihitung server, bukan kiriman klien
  paymentMethod:  "qris",
  paymentChannel: "qris",
  referenceId: orderId,                  // ← kunci penghubung ke orders/{orderId}
  notifyUrl: `${process.env.PUBLIC_BASE}/.netlify/functions/ipaymu-callback`,
  expired: 1,                            // satuan JAM (bukan menit seperti Midtrans)
  description: `Parkir ${s.vehicle.type} — ${s.locationName}`.slice(0, 50),
});

if (!ok || body.Status !== 200) {
  await db.collection("orders").doc(orderId).update({
    status: "failed", error: JSON.stringify(body).slice(0, 500),
  });
  console.error("iPaymu gagal:", body);
  return json(502, { error: "gateway_error" });
}

// Simpan pengenal milik iPaymu supaya reconcile bisa menanyakannya nanti
const d = body.Data || {};
await db.collection("orders").doc(orderId).update({
  ipaymuTransactionId: d.TransactionId ?? null,
  ipaymuSessionId:     d.SessionID ?? null,
});

return json(200, { orderId, amount, qr: d });   // klien merender QR dari sini
```

> ⚠️ **Bentuk `Data` untuk QRIS belum saya verifikasi.** Dokumentasi publik iPaymu memastikan endpoint, header, signature, dan daftar `paymentMethod` (`qris`), tapi **tidak memperlihatkan contoh respons QRIS-nya** (apakah berisi `QrString`, `QrImage`, `Url`, atau kombinasinya). Hal pertama yang harus dilakukan di sandbox: panggil endpoint ini, `console.log(body)` mentahnya, lalu sesuaikan.
>
> **Jalan aman kalau ingin cepat:** pakai `POST /payment` (Redirect) alih-alih `/payment/direct`. Responsnya berisi `Url` halaman pembayaran iPaymu — tinggal `window.location = url`. Lebih jelek untuk UX (keluar dari aplikasi), tapi bentuk responsnya sederhana dan pasti. Pindah ke Direct belakangan setelah bentuk `Data` diketahui.

### 4c. `ipaymu-callback.js` — pengganti `midtrans-webhook.js`

Fungsi `terapkan(b)` dari `PAYMENT-SETUP.md` §5c dan `WALLET.md` Langkah 4 **dipakai kembali tanpa perubahan**. Yang diganti hanya lapisan verifikasi + penerjemahan status.

```js
const crypto = require("crypto");
const { db, VA } = require("./_lib");
const { terapkan } = require("./_terapkan");   // dipisah agar tidak melingkar

// Bentuk kanonik menurut dokumentasi callback iPaymu.
function canonical(b) {
  const o = { ...b };
  // 1) normalisasi tipe
  for (const k of ["trx_id", "status_code", "transaction_status_code", "paid_off"]) {
    if (k in o) o[k] = parseInt(o[k], 10);
  }
  if ("is_escrow" in o) o.is_escrow = Boolean(Number(o.is_escrow));
  if ("additional_info" in o && !Array.isArray(o.additional_info)) o.additional_info = [];
  // 2) urutkan key A-Z (case-sensitive — perilaku bawaan sort() JS sudah benar)
  const sorted = {};
  for (const k of Object.keys(o).sort()) sorted[k] = o[k];
  // 3) JSON, lalu 4) escape "/" jadi "\/" — JSON.stringify JS TIDAK melakukannya,
  //    sedangkan json_encode PHP (yang dipakai iPaymu) melakukannya secara bawaan.
  return JSON.stringify(sorted).replace(/\//g, "\\/");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };

  try {
    const ct = event.headers["content-type"] || "";
    const b = ct.includes("json")
      ? JSON.parse(event.body || "{}")
      : Object.fromEntries(new URLSearchParams(event.body || ""));

    const expected = crypto.createHmac("sha256", VA)   // ← kuncinya VA, bukan API Key
      .update(canonical(b)).digest("hex");
    const sigOk = expected === (event.headers["x-signature"] || "");

    if (!sigOk) console.warn("Signature callback tidak cocok:", b.reference_id);

    // WAJIB: jangan percaya isi callback. Tanya ulang ke iPaymu. Lihat §5.
    await terapkanDariStatusResmi(b.reference_id);

    return { statusCode: 200, body: "OK" };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: "error" };   // sengaja 500 → iPaymu mengulang
  }
};
```

### 4d. Sumber kebenaran: Check Transaction

```js
const { ipaymu, db } = require("./_lib");
const { terapkan } = require("./_terapkan");

// Menanyakan status resmi ke iPaymu, lalu memanggil terapkan() yang sama
// dengan versi Midtrans. Dipakai oleh callback DAN reconcile.
async function terapkanDariStatusResmi(orderId) {
  const snap = await db.collection("orders").doc(orderId).get();
  if (!snap.exists) { console.warn("Order tak dikenal:", orderId); return; }

  const { ok, body } = await ipaymu("/transaction", {
    transactionId: snap.data().ipaymuTransactionId,
  });
  if (!ok || body.Status !== 200) { console.error("Cek transaksi gagal:", orderId, body); return; }

  const d = body.Data || {};
  // Terjemahkan kosakata iPaymu ke bentuk yang sudah dimengerti terapkan()
  await terapkan({
    order_id: orderId,
    gross_amount: d.Amount ?? d.Total,
    transaction_status:
      d.StatusCode === 1 || d.Status === "berhasil" ? "settlement"
      : d.StatusCode === -2 || d.Status === "expired" ? "expire"
      : "pending",
    transaction_id: String(d.TransactionId ?? ""),
    payment_type: d.Via || "qris",
    fraud_status: "accept",
  });
}
```

Dengan pemetaan ini, `terapkan()` — beserta seluruh penjaga idempotensi, transaksi Firestore, penutupan sesi, pengembalian slot, dan cabang `type === "topup"` dari `WALLET.md` — **tidak perlu disentuh sama sekali**.

`reconcile.js` cukup mengganti isi perulangannya jadi `await terapkanDariStatusResmi(doc.id)`.

---

## 5. ⚠️ Perbedaan keamanan yang harus disadari

**Kunci HMAC callback iPaymu adalah nomor VA, bukan API Key.**

Midtrans menandatangani notifikasi dengan **Server Key** — rahasia yang tidak pernah keluar dari server kita. iPaymu menandatangani dengan **nomor VA** — nilai yang kita kirimkan di header setiap request, tercetak di dashboard, dan secara umum diperlakukan sebagai pengenal, bukan rahasia.

Ditambah dua hal lain:

- Callback bisa datang sebagai `application/x-www-form-urlencoded`, di mana semua nilai menjadi string. Merekonstruksi JSON kanonik yang persis sama jadi rapuh — satu tipe meleset, tanda tangan gagal.
- Verifikasinya menuntut normalisasi tipe + urutan key + escape `/`, tiga tempat yang gampang salah dan gejalanya identik dengan "tanda tangan palsu".

**Karena itu kode di §4c sengaja tidak menjadikan tanda tangan sebagai penentu.** Polanya:

```
callback masuk → catat & periksa tanda tangan (untuk log/deteksi)
              → JANGAN percaya isinya
              → panggil Check Transaction API ke iPaymu
              → status dari SITU yang menentukan lunas
```

Ini lebih lambat satu panggilan jaringan, tapi callback berubah peran dari "sumber kebenaran" menjadi sekadar "pemberitahuan bahwa ada yang perlu dicek". Pemalsu yang mengirim callback palsu tidak menghasilkan apa pun — kita tetap bertanya ke iPaymu.

> Pola ini juga membuat `reconcile.js` dan `ipaymu-callback.js` berbagi jalur kode yang sama persis, sehingga jalur cadangan ikut teruji setiap kali pembayaran normal terjadi.

---

## 6. Sisi klien

### 6a. `public/js/config.js`

```js
export const paymentConfig = {
  provider: "ipaymu",
  apiBase: "https://quparkir-pay.netlify.app/.netlify/functions",
  // Tidak ada kunci apa pun di sini — iPaymu tidak punya client key publik
};
```

### 6b. `public/app.html` — CSP

Lebih ringan daripada Midtrans. Dengan Direct + render QR sendiri, **tidak perlu** `script-src`/`frame-src` pihak ketiga:

```
connect-src ... https://quparkir-pay.netlify.app
img-src     ... data:        ← bila QR dirender sebagai data URI
```

Kalau memilih Redirect, tidak perlu tambahan CSP sama sekali (pindah halaman, bukan iframe).

### 6c. `public/js/pay.js`

Struktur `payMidtrans()` di `PAYMENT-SETUP.md` §6c dipakai kembali, dengan dua perbedaan: tidak ada `loadSnap()`, dan alih-alih `window.snap.pay(token)` kita menampilkan QR sendiri di modal yang sudah ada.

```js
export async function payIpaymu({ sessionId }) {
  const idToken = await getAuth().currentUser.getIdToken();
  const res = await fetch(`${paymentConfig.apiBase}/create-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ sessionId }),        // ← nominal TIDAK dikirim
  });
  if (!res.ok) throw new Error("Gagal membuat transaksi");
  const { orderId, qr } = await res.json();

  tampilkanQR(qr);          // modal yang sudah ada di simulasiQRIS(), tanpa tombol "sudah bayar"

  // Kebenaran tetap datang dari server, sama seperti versi Midtrans
  return tungguLunas(orderId);
}
```

`tungguLunas(orderId)` — `onSnapshot` ke `orders/{orderId}` — **tidak berubah**, salin apa adanya.

> Modal `simulasiQRIS()` yang ada sekarang sudah punya bentuk yang tepat. Yang dibuang cuma tombol **"✅ Saya sudah bayar (simulasi)"** — tombol itulah yang membuat klien memutuskan lunas. Sisanya (tata letak, QR, nominal) bisa dipakai ulang.

---

## 7. Urutan pengerjaan

| # | Langkah | Bisa dimulai |
|---|---|---|
| 1 | **Tutup lubang keamanan `firestore.rules`** — `PAYMENT-SETUP.md` Langkah 1, identik | **Sekarang**, tidak menunggu apa pun |
| 2 | Daftar sandbox `sandbox.ipaymu.com`, ambil VA + API Key dari menu **Integrasi** | Sekarang (tanpa verifikasi) |
| 3 | **Panggil `/payment/direct` sekali, cetak respons mentahnya** → ketahui bentuk `Data` untuk QRIS | Setelah 2 — **kerjakan ini lebih dulu**, sebelum menulis kode lain |
| 4 | Tulis `_lib.js` + `create-payment.js` | Setelah 3 |
| 5 | Tulis `_terapkan.js` (salin dari `PAYMENT-SETUP.md` §5c, **perbaiki urutan `tx.get()`**) | Paralel dengan 4 |
| 6 | Tulis `ipaymu-callback.js` + `terapkanDariStatusResmi()` + `reconcile.js` | Setelah 5 |
| 7 | Ubah klien: `config.js`, `pay.js`, `data.js`, CSP | Setelah 4–6 di-deploy |
| 8 | Uji seluruh skenario §8 di sandbox | Setelah 7 |
| 9 | **Putuskan Penghalang 1 & 2** (hubungi iPaymu; pilih VPS atau tetap Midtrans) | **Paralel sejak sekarang** |
| 10 | Naik produksi: verifikasi dokumen, daftarkan IP statis + domain, ganti VA/API Key | Setelah 9 tuntas |

Langkah 3 sengaja diletakkan sebelum menulis kode: bentuk respons QRIS adalah satu-satunya hal yang tidak bisa saya pastikan dari dokumentasi, dan ia menentukan bentuk `create-payment.js` maupun `pay.js`.

---

## 8. Skenario uji yang wajib lulus

Sama seperti `PAYMENT-SETUP.md` §8 dan `WALLET.md` §7 — semuanya tetap berlaku — ditambah empat yang khas iPaymu:

| # | Uji | Hasil yang benar |
|---|---|---|
| 1 | Bayar normal sampai selesai | `orders.status = paid`, sesi `done`, slot kembali |
| 2 | **Tutup browser tepat setelah bayar** | Tetap `paid` — membuktikan callback, bukan klien, yang menentukan |
| 3 | Kirim callback palsu ke `ipaymu-callback` dengan `status: "berhasil"` | **Tidak ada yang berubah** — status diambil dari Check Transaction, bukan dari body callback |
| 4 | Kirim callback yang sama dua kali | Sesi tidak tertutup dua kali (dijaga `if (o.status === "paid") return;`) |
| 5 | **Ubah satu karakter di body request** setelah signature dihitung | Ditolak iPaymu — membuktikan signature benar-benar mengikat body |
| 6 | Ubah `amount` lewat DevTools lalu bayar | Tidak berpengaruh — nominal dihitung server |
| 7 | Biarkan sampai kedaluwarsa | `orders.status = failed`, sesi tetap `active` |

Simulator pembayaran sandbox ada di **`sandbox.ipaymu.com/notify`**.

---

## 9. Naik produksi

- [ ] **Penghalang 1 tuntas** — iPaymu menyetujui QuParkir meski bukan toko dengan 5 produk
- [ ] **Penghalang 2 tuntas** — backend pindah ke host ber-IP statis (atau proxy IP statis terpasang)
- [ ] Dokumen verifikasi disetujui, akun produksi aktif
- [ ] **IP server didaftarkan** di `my.ipaymu.com/ip`
- [ ] **Domain callback didaftarkan** di `my.ipaymu.com/domain` (verifikasi maks 2 hari kerja)
- [ ] `IPAYMU_VA` & `IPAYMU_API_KEY` diganti ke nilai **produksi** (berbeda dari sandbox)
- [ ] `IPAYMU_IS_PRODUCTION=true`
- [ ] `ALLOWED_ORIGIN` diset tepat ke `https://quparkir.web.app`, bukan `*`
- [ ] Uji satu transaksi sungguhan bernominal kecil, pastikan dana masuk rekening
- [ ] Tanyakan **kategori merchant** yang diberikan (UMI/UKE) — menentukan MDR 0% atau 0,7%
- [ ] Pastikan service account JSON tidak pernah masuk riwayat Git

---

## 10. Yang belum bisa saya pastikan

| # | Pertanyaan | Kenapa penting |
|---|---|---|
| 1 | **Bentuk respons `/payment/direct` untuk QRIS** — `QrString`? `QrImage`? `Url`? | Menentukan bentuk `create-payment.js` & `pay.js`. **Cek empiris di sandbox, Langkah 3** |
| 2 | Satuan & batas `expired` — jam atau menit? | Saya asumsikan jam. Verifikasi di sandbox |
| 3 | Ada minimum nominal transaksi QRIS? | Parkir motor Rp 2.000 mungkin di bawah minimum |
| 4 | Biaya pencairan (disbursement) ke rekening | Untuk saldo kecil bisa lebih besar dari total MDR |
| 5 | Apakah verifikasi "min. 5 produk" bisa dikecualikan untuk aplikasi layanan? | **Penghalang 1** — menentukan iPaymu layak dilanjutkan atau tidak |
| 6 | Kategori merchant untuk usaha parkir (UMI/UKE/G2P) | 0% vs 0,7%. Sama untuk semua gateway — lihat [`PAYMENT-ALTERNATIF.md`](./PAYMENT-ALTERNATIF.md) §1 |

Nomor 1 dan 5 sebaiknya dijawab **sebelum** menulis kode. Sisanya bisa berjalan paralel.

---

## 11. Sumber

- [iPaymu — Dokumentasi API v2 (indeks)](https://docs.ipaymu.com/id/docs/) — header wajib `va`, `signature`, `timestamp`
- [iPaymu — Pembuatan Signature](https://docs.ipaymu.com/id/docs/signature) — rumus `Method:VA:SHA256(body):APIKey` dan contoh Node.js
- [iPaymu — Callback](https://docs.ipaymu.com/id/docs/callback) — daftar field, `X-Signature`/`X-Timestamp`, langkah verifikasi (normalisasi tipe → urut A-Z → JSON → escape `/`), kunci HMAC = VA, nilai `status`/`status_code`
- [iPaymu — Validasi IP & Domain](https://docs.ipaymu.com/id/docs/ip-domain-validation) — **kewajiban IP statis di produksi** (Penghalang 2)
- [iPaymu — Getting Started](https://docs.ipaymu.com/id/docs/getting-started)
- [iPaymu — FAQ Akun dan Verifikasi](https://ipaymu.com/id/faq-account-and-verification/) — dokumen perorangan & **syarat min. 5 produk** (Penghalang 1)
- [iPaymu — Tutorial Penggunaan Sandbox](https://blog.ipaymu.com/tutorial-penggunaan-sandbox-ipaymu/) — daftar sandbox tanpa verifikasi, VA & API Key di menu Integrasi, simulator di `/notify`
- [iPaymu — Mengatasi error Invalid IP/Domain](https://blog.ipaymu.com/mengatasi-masalah-error-invalid-ip-domain-di-ipaymu/)
- [iPaymu — Pricing](https://ipaymu.com/id/pricing/) · [iPaymu — Public API v2 (Postman)](https://www.postman.com/dark-comet-735202/ipaymu-api-v2/documentation/5q5a9yw/ipaymu-public-api-v2)
- [iPaymu — SDK resmi PHP](https://github.com/ipaymu/ipaymu-php-api) · [Go](https://github.com/ipaymu/ipaymu-go-api) · [Python](https://github.com/ipaymu/ipaymu-python-api) — rujukan bila contoh Node kurang
- [QuotaGuard — Static IP untuk Netlify](https://www.quotaguard.com/integrations/netlify-static-ip) · [OutboundGateway — Static IP for Netlify](https://outboundgateway.com/use-cases/netlify-static-ip/) — opsi proxy bila tidak mau VPS

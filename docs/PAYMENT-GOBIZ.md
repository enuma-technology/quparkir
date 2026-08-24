# 🟢 GOPAY MERCHANT (GoBiz Open API) — Kebutuhan & Panduan Pasang

**Tanggal riset:** 24 Agustus 2026
**Pendamping:** [`PAYMENT.md`](./PAYMENT.md) (riset awal — **§1-nya dikoreksi oleh dokumen ini**) · [`PAYMENT-SETUP.md`](./PAYMENT-SETUP.md) (versi Midtrans; sebagian besar tetap berlaku) · [`PAYMENT-ALTERNATIF.md`](./PAYMENT-ALTERNATIF.md) · [`WALLET.md`](./WALLET.md)
**Status kode di dokumen ini:** kerangka kerja yang belum pernah dijalankan. Wajib diuji di sandbox sebelum dipercaya.
**Pertanyaan yang dijawab:** bisakah QRIS GoPay Merchant yang sudah dimiliki dipakai langsung oleh QuParkir, dengan halaman pembayaran buatan sendiri, dan API key untuk mengetahui uang sudah masuk?

---

## 0. Baca ini dulu

### 0.1 Koreksi terhadap `PAYMENT.md` §1

`PAYMENT.md` §1 menyatakan *"GoPay Merchant bukan jalur untuk aplikasi ini — hanya untuk transaksi tatap muka"*. **Itu tidak akurat.**

GoBiz (payung GoPay Merchant) punya **Open API** dengan kategori **Payment Integration** yang isinya persis kebutuhan QuParkir:

| Kebutuhan QuParkir | Tersedia di GoBiz Open API |
|---|---|
| QRIS dinamis, nominal ditentukan server | ✅ `POST .../v2/transactions` dengan `gross_amount` |
| `order_id` milik kita ikut dalam transaksi | ✅ `transaction_details.order_id` |
| String QR mentah untuk digambar sendiri | ✅ `qris_string` di respons |
| Pemberitahuan otomatis saat lunas | ✅ webhook `payment.transaction.settlement` |
| Tanda tangan webhook | ✅ `X-Go-Signature` = HMAC-SHA256 |
| Idempotensi | ✅ header `Idempotency-Key` bawaan |
| Sumber kebenaran cadangan | ✅ `GET .../v1/transactions/{id}` |

Bentuknya nyaris kembar dengan Midtrans — wajar, keduanya di grup GoTo. Artinya seluruh kerangka di `PAYMENT-SETUP.md` **tidak perlu dibuang**; yang berubah hanya tiga fungsi yang memang sudah dirancang untuk bisa diganti (`PAYMENT-ALTERNATIF.md` §8).

### 0.2 Kenapa BUKAN "bikin QRIS dinamis sendiri dari QRIS statis"

Ini pertanyaan yang memicu dokumen ini, dan jawabannya perlu ditulis supaya tidak ditanyakan ulang.

Mengubah QRIS statis jadi dinamis secara mandiri memang **bisa** secara teknis: ubah tag `01` dari `11` → `12`, sisipkan tag `54` (nominal), hitung ulang CRC16-CCITT di tag `63`. Ada belasan library open source yang melakukannya.

**Tapi itu menyelesaikan masalah yang salah.** Masalahnya bukan menampilkan nominal di layar pembayar — masalahnya **rekonsiliasi**:

> QRIS statis tidak membawa `order_id`. Yang sampai ke merchant hanya nominal, waktu, dan nama pembayar. Aplikasi tidak punya cara menghubungkan *"Rp 2.000 masuk jam 14:03"* dengan *"sesi parkir #A7F3 milik Budi"*. Dua motor yang keluar bersamaan menghasilkan dua transaksi Rp 2.000 yang tidak terbedakan.

Dan **tidak ada API key untuk QRIS statis** — QRIS statis itu selembar stiker, tidak ada endpoint yang bisa ditanya "sudah masuk belum". Cara-cara yang beredar untuk menambalnya:

| Cara | Kenapa gugur |
|---|---|
| Scraping mutasi (OrderKuota dsb) | Kredensial merchant dititipkan ke pihak ketiga; melanggar ToS; putus kapan saja tanpa peringatan |
| Notification listener di HP Android | Butuh HP nyala 24/7; rapuh; tidak bisa dipertahankan di metodologi skripsi |
| Trik nominal unik (Rp 2.001, 2.002, …) | Mengatasi ambiguitas, tapi mengacaukan tarif dan tetap butuh sumber data mutasi di atas |
| Konfirmasi manual petugas | Sudah dianalisis di `PAYMENT.md` §3.3 sebagai "jembatan, bukan tujuan" |

**Kesimpulan:** yang dibutuhkan bukan QRIS statis yang diakali, melainkan **QRIS dinamis resmi + webhook** — dan itu justru tersedia di akun GoPay Merchant yang sudah dimiliki, lewat Open API. Jalur di dokumen ini memberi hasil yang Anda inginkan (halaman bayar sendiri, uang ke akun GoPay Merchant sendiri) **tanpa** satu pun kompromi di atas.

### 0.3 ⛔ Satu penghalang yang harus dicek lebih dulu — 10 menit

Dokumentasi GoBiz menyebut dua model integrasi:

| Model | Untuk siapa | Cara dapat kredensial |
|---|---|---|
| **Direct Integration** | *"You're a GoBiz merchant and you want to access Gojek features directly from your own system"* | Self-service di **GoBiz Developer Portal**, login pakai akun GoBiz **role owner** |
| **Facilitator** | Penyedia POS / agregator pesan-antar | Lewat form kemitraan, ada asesmen tim Gojek |

Halaman ikhtisar Open API menyebut pendaftaran mandiri tersedia untuk **merchant GoFood** di Indonesia dan Vietnam. **Belum ada dokumentasi publik yang menyatakan apakah merchant GoPay Merchant non-GoFood (mis. usaha jasa seperti parkir) juga bisa self-register.**

> 🔎 **Cek sebelum menulis kode sebaris pun:** buka [developer.gobiz.com](https://developer.gobiz.com/), login dengan email & password akun GoBiz Anda (**wajib role owner**, bukan staf).
>
> - Dapat **Client ID + Client Secret** → jalur ini terbuka, lanjutkan dokumen ini
> - Diarahkan ke form kemitraan / tidak ada menu Payment → kembali ke [`PAYMENT-SETUP.md`](./PAYMENT-SETUP.md) (Midtrans). Hasil akhirnya untuk pengguna **identik**: QR di halaman QuParkir, bisa dipindai e-wallet mana pun termasuk GoPay

Jangan menghabiskan waktu integrasi sebelum pertanyaan ini terjawab.

---

## 1. Yang dibutuhkan — daftar lengkap

### 1a. Akun & kredensial

| # | Kebutuhan | Cara dapat | Biaya |
|---|---|---|---|
| 1 | **Akun GoBiz / GoPay Merchant aktif** | Sudah ada — ini titik awalnya | — |
| 2 | **Akses role owner** di akun tersebut | Cek di aplikasi GoBiz → Pengaturan → Pengguna. Akun staf tidak bisa membuka Developer Portal | — |
| 3 | **Client ID** | GoBiz Developer Portal | Gratis |
| 4 | **Client Secret** | Sumber yang sama. **Hanya ditampilkan sekali** — simpan segera | Gratis |
| 5 | **Notification Secret Key** | Sumber yang sama, bagian Webhook/Notification. Dipakai memverifikasi `X-Go-Signature` | Gratis |
| 6 | **`outlet_id`** | `GET /integrations/partner/v1/token-info` (mengembalikan outlet yang tertaut ke token), atau terlihat di Developer Portal | — |
| 7 | Kredensial sandbox | Konfirmasi ketersediaannya saat mendapat akses portal — lihat §10 | Gratis |

> ⚠️ **Perbedaan penting dari Midtrans:** Midtrans memberi Server Key **dan** Client Key, di mana Client Key aman dipublikasikan di `public/js/config.js`. **GoBiz tidak punya padanan Client Key** — Client ID dan Client Secret dua-duanya rahasia server. Tidak ada satu pun nilai GoBiz yang boleh masuk folder `public/`.

### 1b. Dokumen

Tidak ada. Verifikasi merchant sudah selesai saat akun GoPay Merchant dibuat — inilah keunggulan terbesar jalur ini dibanding mendaftar gateway baru (bandingkan `PAYMENT.md` §3.1: KTP + NPWP + rekening + verifikasi berhari-hari).

### 1c. Infrastruktur

Sama persis dengan `PAYMENT.md` §3.3 — tidak ada yang berubah:

| Kebutuhan | Keterangan |
|---|---|
| Backend yang bisa memanggil API keluar | **Netlify Functions** (paling sedikit kode) atau **Cloudflare Workers** (paling irit). Gratis, tanpa kartu kredit |
| Endpoint webhook HTTPS publik | Port 443, sertifikat sah, bukan localhost. Netlify/Workers sudah memenuhi |
| Firebase | Tetap paket **Spark**. Tidak perlu Blaze, tidak ada yang dipindahkan |
| Penjadwal untuk `reconcile` | Netlify Scheduled Functions / Cloudflare Cron Triggers |

> ✅ **Tidak ada syarat IP statis** di dokumentasi GoBiz — berbeda dari iPaymu, yang mewajibkannya dan meruntuhkan rencana backend gratis ([`PAYMENT-IPAYMU.md`](./PAYMENT-IPAYMU.md) §0). Tapi ini belum dikonfirmasi ke Gojek; lihat §10 no. 4.

### 1d. Perkakas lokal

- [ ] Node.js 18+ — `node -v`
- [ ] Netlify CLI — `npm i -g netlify-cli`
- [ ] Service account Firebase (`PAYMENT-SETUP.md` Langkah 3)

### 1e. Nilai rahasia yang dikelola

Semua sebagai environment variable di Netlify/Workers, **tidak satu pun di `public/`**:

| Env var | Isi | Sumber |
|---|---|---|
| `GOBIZ_CLIENT_ID` | Client ID | Developer Portal |
| `GOBIZ_CLIENT_SECRET` | Client Secret | Developer Portal |
| `GOBIZ_NOTIF_SECRET` | Notification Secret Key | Developer Portal |
| `GOBIZ_OUTLET_ID` | ID outlet penerima pembayaran | `token-info` / portal |
| `GOBIZ_IS_PRODUCTION` | `"true"` / `"false"` | Ditentukan sendiri |
| `FB_PROJECT_ID` | `quparkir` | Firebase |
| `FB_CLIENT_EMAIL` | dari JSON service account | Firebase |
| `FB_PRIVATE_KEY` | dari JSON service account | Firebase |
| `ALLOWED_ORIGIN` | `https://quparkir.web.app` | Ditentukan sendiri |

---

## 2. Apa yang berubah dari rencana Midtrans

| Berkas | Berubah? | Apa yang berubah |
|---|---|---|
| `firestore.rules` | ❌ | **Sama persis.** Tiga lubang di `PAYMENT.md` §4 tetap wajib ditutup lebih dulu |
| Model data `orders` | ❌ | Sama; `midtransTransactionId` → `gatewayTransactionId` |
| `_lib.js` | ✅ sebagian | Blok konstanta Midtrans & `authHeader()` pindah ke `_gateway/gobiz.js`. `hitungTarif`, CORS, `json()`, init Firestore **tidak berubah** |
| `create-payment.js` | ✅ sebagian | Mengembalikan `qris_string`, bukan `snapToken`. Verifikasi ID token, cek kepemilikan sesi, hitung tarif, pakai-ulang order pending — **tidak berubah** |
| `midtrans-webhook.js` → `gobiz-webhook.js` | ✅ sebagian | Rumus tanda tangan (SHA512 gabungan string → HMAC-SHA256 atas raw body) dan pemetaan status. Fungsi `terapkan()` — idempotensi, transaksi Firestore, penutupan sesi, pengembalian slot — **tidak berubah sama sekali** |
| `reconcile.js` | ✅ sedikit | URL Get Status |
| `public/js/pay.js` | ✅ | **Tidak ada popup Snap.** Render QR sendiri dengan `renderQR()` yang sudah ada di `public/js/qr.js` |
| `public/app.html` (CSP) | ✅ **lebih ringan** | Hanya `connect-src` untuk domain backend. **Tidak perlu** menambah `script-src` maupun `frame-src` — tidak ada script pihak ketiga yang dimuat |
| `public/js/config.js` | ✅ | Hanya `apiBase`. Tidak ada client key sama sekali |

> 💡 Perhatikan baris CSP: karena QR digambar sendiri di browser oleh `qrcodejs`, jalur ini justru **memperkecil** permukaan CSP dibanding Snap. Masalah "popup Snap diam tanpa pesan galat" yang ditandai `PAYMENT.md` §3.4 tidak bisa terjadi di sini.

---

## 3. Endpoint & autentikasi

### 3a. Base URL

| | Sandbox | Produksi |
|---|---|---|
| OAuth | `https://integration-goauth.gojekapi.com` | `https://accounts.go-jek.com` |
| API | `https://api.partner-sandbox.gobiz.co.id` | `https://api.gobiz.co.id` |

> ⚠️ Dokumentasi publik GoBiz **tidak konsisten** soal host ini — halaman yang berbeda menyebut `api.sandbox.gobiz.co.id` dan `integration-goauth.gojekapi.com` untuk konteks produksi. **Pastikan ke dokumentasi yang menyertai kredensial Anda**, bukan ke dokumen ini. Salah host akan muncul sebagai 404, bukan sebagai galat autentikasi.

### 3b. Token OAuth 2.0

```
POST {OAUTH}/oauth2/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(client_id:client_secret)

grant_type=client_credentials&scope=payment:transaction:write payment:transaction:read
```

Respons: `access_token`, `token_type: "Bearer"`, `expires_in: 3600`.

**Token berlaku 1 jam dan wajib di-cache.** Meminta token baru di setiap transaksi adalah pemborosan sekaligus titik gagal tambahan.

Scope yang relevan: `payment:transaction:write` (buat transaksi), `payment:transaction:read` (cek status).

### 3c. Buat transaksi

```
POST {API}/integrations/payment/outlets/{outlet_id}/v2/transactions
Authorization: Bearer {access_token}
Idempotency-Key: {string acak, maks 32 karakter}
Content-Type: application/json

{
  "payment_type": "qris",
  "transaction_details": {
    "order_id": "QP-abc123-1756000000",
    "gross_amount": 2000,
    "currency": "IDR"
  }
}
```

Respons `201`: `qris_string` (inilah yang digambar jadi QR), `transaction_id`, `status`, dan `actions[]` (berisi tautan `generate-qr-code` bila ingin gambar QR dari server Gojek alih-alih menggambar sendiri).

Opsional: `item_details`, `customer_details`, `metadata`.

### 3d. Cek status

```
GET {API}/integrations/payment/outlets/{outlet_id}/v1/transactions/{transaction_id}
Authorization: Bearer {access_token}      // scope payment:transaction:read
```

Respons: `data.transaction.{id, order_id, status, gross_amount, currency, payment_type, created_at, settlement_at}`. `settlement_at` bernilai `null` selama belum lunas.

> Perhatikan: parameternya **`transaction_id` milik Gojek**, bukan `order_id` kita. Jadi `transaction_id` wajib disimpan di dokumen `orders` saat transaksi dibuat — kalau tidak, `reconcile` kehilangan cara bertanya.

### 3e. Webhook

Event: **`payment.transaction.settlement`**

Payload memuat `outlet.id` dan `transaction.{id, order_id, gross_amount, currency, payment_type, status, created_at, settlement_at, terminal_label}`.

Verifikasi:

```
X-Go-Signature = HMAC-SHA256(notification_secret_key, raw_request_body)
```

Tiga hal yang wajib benar:

1. **HMAC dihitung atas body MENTAH**, bukan hasil `JSON.parse` lalu `JSON.stringify` ulang — satu spasi berbeda membuat tanda tangan tidak cocok
2. **Bandingkan dengan `crypto.timingSafeEqual`**, bukan `===`
3. **Idempoten** — event yang sama bisa datang dua kali; `order_id` adalah kuncinya

> ⚠️ Dokumentasi publik **tidak menyebut** kebijakan retry, batas waktu balasan, maupun IP allowlist. Midtrans menyebutkannya eksplisit (5 detik, ulang 5 kali sampai ~5,7 jam). Untuk GoBiz, perlakukan `reconcile` sebagai jaring pengaman utama, bukan pelengkap — lihat §10 no. 2.

---

## 4. Kode

Struktur yang disarankan `PAYMENT-ALTERNATIF.md` §8, dengan bagian gateway dipisah sejak awal:

```
netlify/functions/
├─ _lib.js                 ← Firestore, CORS, hitungTarif — netral
├─ _gateway/
│  └─ gobiz.js             ← token(), createCharge(), verifySignature(), getStatus()
├─ create-payment.js
├─ gobiz-webhook.js
└─ reconcile.js
```

### 4a. `netlify/functions/_gateway/gobiz.js`

```js
const crypto = require("crypto");

const isProd = process.env.GOBIZ_IS_PRODUCTION === "true";
const OAUTH = isProd ? "https://accounts.go-jek.com"
                     : "https://integration-goauth.gojekapi.com";
const API   = isProd ? "https://api.gobiz.co.id"
                     : "https://api.partner-sandbox.gobiz.co.id";
const OUTLET = process.env.GOBIZ_OUTLET_ID;

// Token berlaku 1 jam. Netlify memakai ulang kontainer, jadi cache di level
// modul cukup — jangan minta token baru tiap transaksi.
let cache = { token: null, expiresAt: 0 };

async function token() {
  if (cache.token && Date.now() < cache.expiresAt) return cache.token;

  const basic = Buffer.from(
    `${process.env.GOBIZ_CLIENT_ID}:${process.env.GOBIZ_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${OAUTH}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "payment:transaction:write payment:transaction:read",
    }),
  });
  if (!res.ok) throw new Error(`oauth ${res.status}: ${await res.text()}`);

  const j = await res.json();
  // Kedaluwarsakan 60 detik lebih awal — hindari balapan di ujung masa berlaku
  cache = { token: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000 };
  return cache.token;
}

// Buat QRIS dinamis. Mengembalikan string QR + id transaksi milik Gojek.
async function createCharge({ orderId, amount, label }) {
  const res = await fetch(
    `${API}/integrations/payment/outlets/${OUTLET}/v2/transactions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${await token()}`,
        // Maks 32 karakter. Turunan orderId → percobaan ulang atas order yang
        // sama tidak pernah menghasilkan transaksi ganda.
        "Idempotency-Key": crypto.createHash("sha256").update(orderId)
          .digest("hex").slice(0, 32),
      },
      body: JSON.stringify({
        payment_type: "qris",
        transaction_details: { order_id: orderId, gross_amount: amount, currency: "IDR" },
        item_details: [{ name: label.slice(0, 50), price: amount, quantity: 1 }],
      }),
    }
  );
  if (!res.ok) throw new Error(`charge ${res.status}: ${await res.text()}`);

  const j = await res.json();
  // ⚠️ Bentuk pembungkus respons (data.transaction vs data vs akar) belum
  // diverifikasi terhadap API sungguhan — longgarkan sampai terbukti.
  const t = j.data?.transaction || j.data || j;
  return { qris: t.qris_string, transactionId: t.id, raw: j };
}

async function getStatus(transactionId) {
  const res = await fetch(
    `${API}/integrations/payment/outlets/${OUTLET}/v1/transactions/${transactionId}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${await token()}` } }
  );
  if (!res.ok) return null;
  const j = await res.json();
  return j.data?.transaction || null;
}

// HMAC-SHA256 atas body MENTAH. Jangan parse lalu stringify ulang.
function verifySignature(rawBody, header) {
  if (!header) return false;
  const expected = crypto
    .createHmac("sha256", process.env.GOBIZ_NOTIF_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Samakan kosakata status dengan yang dipakai koleksi `orders`
function normalizeStatus(s) {
  if (s === "settlement") return "paid";
  if (["expire", "expired", "cancel", "cancelled", "failed", "deny"].includes(s)) return "failed";
  return "pending";
}

module.exports = { token, createCharge, getStatus, verifySignature, normalizeStatus, API, OUTLET };
```

### 4b. `create-payment.js` — yang berubah

Langkah 1–5 di [`PAYMENT-SETUP.md`](./PAYMENT-SETUP.md) §5b **disalin apa adanya** (verifikasi ID token, ambil sesi, cek kepemilikan, hitung tarif di server, pakai ulang order pending, catat `orders` sebelum memanggil gateway). Yang berbeda hanya langkah 6 ke bawah:

```js
const { createCharge } = require("./_gateway/gobiz");

// ... langkah 1–5 sama persis dengan PAYMENT-SETUP.md §5b ...

// 6) Minta QRIS dinamis
let charge;
try {
  charge = await createCharge({
    orderId,
    amount,
    label: `Parkir ${s.vehicle.type} — ${s.locationName}`,
  });
} catch (e) {
  await db.collection("orders").doc(orderId).update({ status: "failed", error: String(e) });
  console.error("charge gagal:", e);
  return json(502, { error: "gateway_error" });
}

// transactionId WAJIB disimpan — reconcile bertanya memakai id ini, bukan orderId
await db.collection("orders").doc(orderId).update({
  gatewayTransactionId: charge.transactionId,
  qris: charge.qris,
});

return json(200, { orderId, qris: charge.qris, amount });
```

Bagian yang **tidak boleh** ikut berubah, apa pun gateway-nya:

- Klien hanya mengirim `sessionId`. **Nominal tidak pernah dipercaya dari klien**
- `amount` dihitung dari `checkinAt` yang tersimpan di Firestore, bukan dari kiriman browser
- Dokumen `orders` ditulis **sebelum** memanggil gateway, supaya kegagalan di tengah tetap meninggalkan jejak yang bisa disapu `reconcile`

### 4c. `gobiz-webhook.js`

```js
const { db, json } = require("./_lib");
const { verifySignature } = require("./_gateway/gobiz");
const { terapkan } = require("./_apply");   // ← fungsi terapkan() dari PAYMENT-SETUP.md §5c,
                                            //   dipindah ke berkas sendiri agar netral gateway

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };

  // Body MENTAH — Netlify bisa mengirimnya ter-base64 untuk sebagian content-type
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : (event.body || "");

  // 1) VERIFIKASI TANDA TANGAN. Tanpa ini, siapa pun yang tahu URL ini bisa
  //    mengirim "sudah lunas" palsu.
  if (!verifySignature(raw, event.headers["x-go-signature"])) {
    console.warn("X-Go-Signature tidak cocok");
    return { statusCode: 403, body: "invalid signature" };
  }

  try {
    const b = JSON.parse(raw);
    const t = b.transaction || b.data?.transaction;
    if (!t?.order_id) return { statusCode: 200, body: "diabaikan" };

    // Petakan ke bentuk yang sudah dipahami terapkan() — kontraknya tidak diubah
    await terapkan({
      order_id: t.order_id,
      transaction_status: t.status,                    // "settlement" saat lunas
      gross_amount: t.gross_amount,
      transaction_id: t.id,
      payment_type: t.payment_type || "qris",
      fraud_status: "accept",                          // GoBiz tidak punya padanan FDS
      _raw: b,
    });

    return { statusCode: 200, body: "OK" };
  } catch (e) {
    console.error(e);
    // Sengaja 500 supaya pengirim mengulang — jangan menelan galat diam-diam
    return { statusCode: 500, body: "error" };
  }
};
```

`terapkan()` sendiri **tidak berubah satu baris pun** dari `PAYMENT-SETUP.md` §5c: idempotensi lewat `if (o.status === "paid") return`, pencocokan nominal (`gross_amount` vs `orders.amount`), penutupan sesi, pencatatan `transactions`, dan pengembalian slot lokasi — semuanya milik QuParkir, bukan milik gateway.

> ⚠️ Catatan yang sudah ditandai di `PAYMENT-SETUP.md` tetap berlaku: di dalam `db.runTransaction`, **semua `tx.get()` harus dipanggil sebelum `tx.update()`/`tx.set()` pertama**. Perbaiki saat menulis versi finalnya.

### 4d. `reconcile.js`

```js
const { db } = require("./_lib");
const { getStatus, normalizeStatus } = require("./_gateway/gobiz");
const { terapkan } = require("./_apply");

exports.handler = async () => {
  const batas = new Date(Date.now() - 10 * 60 * 1000);
  const snap = await db.collection("orders")
    .where("status", "==", "pending")
    .where("createdAt", "<", batas)
    .limit(50).get();

  for (const doc of snap.docs) {
    const o = doc.data();
    if (!o.gatewayTransactionId) continue;            // tidak ada yang bisa ditanyakan
    try {
      const t = await getStatus(o.gatewayTransactionId);
      if (!t) continue;
      if (normalizeStatus(t.status) === "pending") continue;
      // Sumbernya kita sendiri yang memanggil → tidak perlu tanda tangan
      await terapkan({
        order_id: t.order_id,
        transaction_status: t.status,
        gross_amount: t.gross_amount,
        transaction_id: t.id,
        payment_type: t.payment_type || "qris",
        fraud_status: "accept",
      });
    } catch (e) {
      console.error("reconcile", doc.id, e);
    }
  }
  return { statusCode: 200, body: `dicek: ${snap.size}` };
};
```

---

## 5. Sisi klien — halaman pembayaran buatan sendiri

Inilah bagian yang menjawab *"bikin halaman payment gateway sendiri"*. Tidak ada popup vendor, tidak ada iframe, tidak ada script pihak ketiga.

### 5a. `public/js/config.js`

```js
export const paymentConfig = {
  provider: "gobiz",
  apiBase: "https://quparkir-pay.netlify.app/.netlify/functions",
  // Tidak ada client key. GoBiz tidak punya nilai yang aman dipublikasikan.
};
```

### 5b. `public/app.html` — CSP

Cukup satu penambahan di `connect-src`:

```
connect-src 'self' https://*.googleapis.com ... https://quparkir-pay.netlify.app
```

`script-src` dan `frame-src` **tidak perlu disentuh** — QR digambar di browser oleh `qrcodejs` yang sudah dimuat `public/js/qr.js`.

### 5c. `public/js/pay.js`

`simulasiQRIS()` (`pay.js:51`) sudah berbentuk persis seperti yang dibutuhkan: modal, `renderQR()`, nominal besar di atas. Yang berubah hanya **sumber string QR** dan **siapa yang memutuskan lunas**:

```js
export async function payGobiz({ sessionId, title = "Pembayaran QRIS" }) {
  const idToken = await getAuth().currentUser.getIdToken();

  const res = await fetch(`${paymentConfig.apiBase}/create-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ sessionId }),         // ← nominal TIDAK dikirim
  });
  if (!res.ok) throw new Error("Gagal membuat transaksi");
  const { orderId, qris, amount } = await res.json();

  const qrEl = h(".qrbox");
  renderQR(qrEl, qris, 220);                     // ← QRIS asli, bukan "QRIS-SIM|..."

  const body = h("div", { style: "text-align:center" }, [
    h(".big-amt", { style: "margin:4px 0 12px", text: rupiah(amount) }),
    qrEl,
    h("p.muted", { style: "margin-top:8px",
      html: "<small>Pindai dengan GoPay, DANA, OVO, atau m-banking apa pun</small>" }),
    h("p.muted", { id: "payStatus", text: "Menunggu pembayaran…" }),
  ]);
  modal(title, body);

  // TIDAK ADA tombol "Saya sudah bayar". Layar berubah sendiri saat webhook
  // memperbarui orders/{orderId} — pengguna boleh menutup browser kapan pun.
  return tungguLunas(orderId);
}

function tungguLunas(orderId) {
  return new Promise((resolve) => {
    const unsub = onSnapshot(doc(db, "orders", orderId), (snap) => {
      const st = snap.data()?.status;
      if (st === "paid")   { unsub(); $("#modalHost").innerHTML = ""; resolve(true); }
      if (st === "failed") { unsub(); $("#modalHost").innerHTML = ""; resolve(false); }
    });
  });
}
```

Sisakan `simulasiQRIS()` hanya untuk mode demo (`provider: "simulasi"`), jangan di jalur produksi.

### 5d. `public/js/data.js`

`checkout()` (`data.js:112` dan `:245`) tidak boleh lagi menulis `status`, `amount`, `method`, `transactions`, maupun mengurangi `occ*`. Semua itu kini dikerjakan `terapkan()` di server.

---

## 6. Perbedaan yang harus disadari vs Midtrans

| Hal | Midtrans | GoBiz | Dampak |
|---|---|---|---|
| Verifikasi merchant | Daftar baru, KTP + NPWP + rekening, beberapa hari | **Sudah selesai** | ✅ Keunggulan terbesar GoBiz |
| Sandbox | Aktif seketika tanpa verifikasi | Belum terkonfirmasi | ⚠️ Penentu untuk jadwal skripsi |
| Kunci publik untuk klien | Client Key (aman di `public/`) | Tidak ada | Netral — kita memang tidak butuh |
| Popup siap pakai | Snap | Tidak ada | ✅ Justru sesuai keinginan: halaman sendiri |
| Metode bayar | QRIS, GoPay, VA, kartu, 25+ | **QRIS saja** | Cukup — QRIS dipindai semua e-wallet & m-banking |
| **Masa berlaku QR** | Bisa diatur (`expiry`, mis. 30 menit) | **1 minggu**, tidak terdokumentasi bisa diubah | ⚠️ Lihat di bawah |
| Cancel / refund | Terdokumentasi | Tidak terdokumentasi publik | ⚠️ Tanyakan |
| Retry & batas waktu webhook | Terdokumentasi rinci | Tidak terdokumentasi | ⚠️ `reconcile` jadi wajib, bukan pelengkap |
| MDR | 0,7%, atau 0% untuk UMI ≤ Rp 500.000 | **Sama** — ditetapkan BI, bukan penyelenggara | Netral (`PAYMENT-ALTERNATIF.md` §1) |

### Soal masa berlaku 1 minggu

Ini risiko operasional nyata untuk parkir: pelanggan bisa memindai QR yang sudah lama ditinggalkan dan membayar tiga hari kemudian, saat sesi parkirnya sudah lama tidak relevan.

**Penanganan yang disarankan** — dan ini justru memperkuat arsitektur [`WALLET.md`](./WALLET.md):

1. UI berhenti menampilkan QR setelah 30 menit dan menandai `orders.status = "stale"` (bukan `failed` — uangnya masih mungkin masuk)
2. `terapkan()` tetap menerima settlement yang datang terlambat — **jangan pernah menolak uang yang sudah masuk**
3. Bila sesi parkirnya sudah ditutup lewat jalur lain, settlement terlambat **dikreditkan ke saldo QuPay** pengguna, bukan dibuang

Tanpa aturan ini, uang pelanggan masuk ke rekening merchant tanpa jejak di aplikasi — persis kegagalan yang membuat QRIS statis tidak layak sejak awal.

---

## 7. Urutan pengerjaan

| # | Langkah | Bisa dimulai |
|---|---|---|
| 1 | **Cek akses Developer Portal** (§0.3) | **Sekarang, 10 menit.** Ini menentukan apakah sisa dokumen ini terpakai |
| 2 | **Tutup tiga lubang `firestore.rules`** (`PAYMENT.md` §4) | **Sekarang** — tidak menunggu apa pun, dan wajib sebelum langkah lain berarti |
| 3 | Service account Firebase (`PAYMENT-SETUP.md` Langkah 3) | Sekarang |
| 4 | Siapkan proyek Netlify + env var (§1e) | Sekarang |
| 5 | Ambil `outlet_id` lewat `token-info`, uji dapat token | Setelah 1 |
| 6 | `_gateway/gobiz.js` + `create-payment.js`, uji `netlify dev` | Setelah 5 |
| 7 | Deploy, daftarkan URL webhook, langganan `payment.transaction.settlement` | Setelah 6 |
| 8 | Ubah `pay.js`, `config.js`, CSP | Bersamaan dengan 6 |
| 9 | Uji seluruh skenario §8 | Setelah 7–8 |
| 10 | Naik produksi: ganti env ke kredensial live, uji transaksi kecil sungguhan | Setelah 9 |

Langkah 2–4 dan 8 **tidak bergantung pada jawaban langkah 1** — kalau ternyata harus kembali ke Midtrans, semuanya tetap terpakai apa adanya.

---

## 8. Skenario uji yang wajib lulus

| # | Uji | Hasil yang benar |
|---|---|---|
| 1 | Bayar normal sampai selesai | `orders.status = paid`, sesi `done`, slot lokasi bertambah kembali |
| 2 | **Tutup browser tepat setelah memindai** | Tetap `paid` — membuktikan webhook, bukan callback, yang menentukan |
| 3 | Kirim webhook palsu tanpa `X-Go-Signature` | `403`, tidak ada perubahan data |
| 4 | Kirim webhook dengan body diubah satu karakter | `403` |
| 5 | Kirim webhook yang sama **dua kali** | Sesi tidak tertutup dua kali, saldo/transaksi tidak dobel |
| 6 | Tekan "Bayar" dua kali cepat | Satu `order_id`, satu QR, bukan dua transaksi |
| 7 | Ubah `amount` lewat DevTools sebelum memanggil | Tidak berpengaruh — server tidak membaca nominal dari klien |
| 8 | Matikan webhook, jalankan `reconcile` manual | Order tetap jadi `paid` |
| 9 | Nominal webhook ≠ `orders.amount` | `status = mismatch`, sesi **tidak** ditutup |
| 10 | Token OAuth kedaluwarsa di tengah pemakaian | Diperbarui otomatis, transaksi tetap jalan |

---

## 9. Naik produksi

- [ ] Ganti `GOBIZ_IS_PRODUCTION=true` dan tiga kredensial ke nilai live
- [ ] Daftarkan ulang URL webhook di lingkungan produksi
- [ ] `Notification Secret Key` produksi berbeda dari sandbox — perbarui `GOBIZ_NOTIF_SECRET`
- [ ] Pastikan `ALLOWED_ORIGIN` menunjuk domain produksi, bukan `*`
- [ ] Uji satu transaksi sungguhan bernilai kecil, lalu cek dana masuk di aplikasi GoBiz
- [ ] Pastikan `reconcile` benar-benar terjadwal dan lognya terpantau

---

## 10. Yang belum bisa saya pastikan — tanyakan sendiri

Semua ini menentukan kelayakan jalur ini dan **tidak ada di dokumentasi publik**:

| # | Pertanyaan | Ke siapa | Kenapa penting |
|---|---|---|---|
| 1 | **Apakah merchant GoPay Merchant non-GoFood bisa self-register Direct Integration?** | GoBiz Developer Portal / dukungan GoBiz | Penentu tunggal apakah jalur ini terbuka (§0.3) |
| 2 | Kebijakan retry & batas waktu balasan webhook | Gojek | Menentukan seberapa agresif `reconcile` harus dijadwalkan |
| 3 | Masa berlaku QRIS bisa dipersingkat dari 1 minggu? | Gojek | Menentukan apakah §6 "settlement terlambat" perlu ditangani |
| 4 | Ada syarat IP allowlist untuk produksi? | Gojek | Kalau ada, backend gratis Netlify/Workers gugur seperti pada iPaymu |
| 5 | Endpoint cancel/refund tersedia? | Gojek | Untuk pembatalan sesi & penanganan salah bayar |
| 6 | Bentuk pasti pembungkus respons `create transaction` | Uji sandbox | Kode §4a sengaja longgar sampai ini terverifikasi |
| 7 | Kategori merchant untuk usaha parkir — UMI, UKE, atau G2P? | Gojek, saat verifikasi | Selisih MDR 0% vs 0,7%. Pertanyaan yang sama sudah terbuka di `PAYMENT.md` §6 |

Pertanyaan 7 jawabannya **sama di semua penyelenggara** (`PAYMENT-ALTERNATIF.md` §1) — cukup ditanyakan sekali.

---

## 11. Sumber

- [GoBiz Developer Portal — API Reference](https://developer.gobiz.com/docs/api/intro/)
- [GoBiz — Payment Integration](https://developer.gobiz.com/docs/api/payment-integration/)
- [GoBiz — Create Payment Transaction](https://developer.gobiz.com/docs/api/payment-integration/create-transaction/)
- [GoBiz — Get Transaction Detail](https://developer.gobiz.com/docs/api/payment-integration/get-transaction/)
- [GoBiz — Event List (`payment.transaction.settlement`)](https://developer.gobiz.com/docs/api/event-list/index.html)
- [GoBiz — Receiving Notifications (`X-Go-Signature`)](https://developer.gobiz.com/docs/api/webhooks/receiving-notifications/)
- [GoBiz — Authentication: Direct Integration](https://developer.gobiz.com/docs/api/auth/direct-integration/)
- [GoBiz — Direct Integration Model](https://developer.gobiz.com/docs/docs/food-integration/direct-integration/)
- [GoBiz — Facilitator Model](https://developer.gobiz.com/docs/docs/food-integration/facilitator/)
- [GoBiz — Outlet Information](https://developer.gobiz.com/docs/api/outlet-information/)
- [GoBiz Open API — Overview & Base URL](https://app.gobiz.com/files/static/cpp/docs/index.html)

**Konteks QRIS statis→dinamis (§0.2), sebagai rujukan mengapa jalur itu ditolak:**

- [`qris-dinamis`](https://github.com/verssache/qris-dinamis) · [`qris-saurus`](https://github.com/creasico/qris-saurus) · [`qris-statis-to-dinamis`](https://github.com/DioSaputra28/qris-statis-to-dinamis)

# 🛠️ PANDUAN PASANG PEMBAYARAN — Midtrans + Netlify Functions

**Pendamping:** [`PAYMENT.md`](./PAYMENT.md) — riset & alasan di balik pilihan ini.
**Alternatif yang muncul belakangan:** [`PAYMENT-GOBIZ.md`](./PAYMENT-GOBIZ.md) — GoPay Merchant lewat GoBiz Open API. Langkah 1, 3, 4, dan seluruh `firestore.rules` di panduan ini **berlaku identik** di sana.
**Baru pertama kali pakai Netlify?** Pakai [`NETLIFY-PEMULA.md`](./NETLIFY-PEMULA.md) dulu untuk Langkah 4 — versi klik-klik lewat website, tanpa CLI.
**Proyek Netlify sudah berdiri tapi belum ada function?** [`NETLIFY-LANJUTAN.md`](./NETLIFY-LANJUTAN.md) — jembatan menuju Langkah 5 di sini.
**⚠️ Langkah 1 sudah sebagian dikerjakan** dengan cara lain (tanpa server) pada 25 Agustus 2026 — lihat catatan di awal Langkah 1 sebelum menyalin apa pun.
**Platform:** Netlify Functions (gratis, tanpa kartu kredit, `firebase-admin` jalan langsung).
**Firebase:** tetap paket **Spark**. Tidak perlu Blaze, tidak ada yang dipindahkan.
**Status kode di dokumen ini:** kerangka kerja yang belum pernah dijalankan. Wajib diuji di sandbox sebelum dipercaya.

---

## Daftar isi

1. [Yang perlu disiapkan](#1-yang-perlu-disiapkan)
2. [Peta berkas](#2-peta-berkas)
3. [Langkah 1 — Tutup lubang keamanan](#langkah-1--tutup-lubang-keamanan-firestorerules)
4. [Langkah 2 — Akun Midtrans sandbox](#langkah-2--akun-midtrans-sandbox)
5. [Langkah 3 — Service account Firebase](#langkah-3--service-account-firebase)
6. [Langkah 4 — Siapkan proyek Netlify](#langkah-4--siapkan-proyek-netlify)
7. [Langkah 5 — Tulis fungsi server](#langkah-5--tulis-fungsi-server)
8. [Langkah 6 — Ubah sisi klien](#langkah-6--ubah-sisi-klien)
9. [Langkah 7 — Daftarkan URL webhook](#langkah-7--daftarkan-url-webhook-di-midtrans)
10. [Langkah 8 — Uji coba](#langkah-8--uji-coba-sandbox)
11. [Langkah 9 — Naik produksi](#langkah-9--naik-produksi)
12. [Masalah yang sering muncul](#12-masalah-yang-sering-muncul)
13. [Lampiran — kalau memilih Cloudflare Workers](#13-lampiran--kalau-memilih-cloudflare-workers)

---

## 1. Yang perlu disiapkan

### Akun (semuanya gratis)

- [ ] **Midtrans** — daftar di [dashboard.midtrans.com](https://dashboard.midtrans.com). Akun sandbox aktif seketika tanpa verifikasi dokumen
- [ ] **Netlify** — daftar dengan akun GitHub, tanpa kartu kredit
- [ ] **Firebase** — sudah ada (`quparkir`), tetap di paket Spark

### Perkakas lokal

- [ ] Node.js 18 atau lebih baru — `node -v`
- [ ] Netlify CLI — `npm i -g netlify-cli`

### Yang harus dikumpulkan di sepanjang panduan

| Nilai | Diambil dari | Dipakai di |
|---|---|---|
| `MIDTRANS_SERVER_KEY` | Dashboard Midtrans → Settings → Access Keys | **Server saja**, jangan pernah di `public/` |
| `MIDTRANS_CLIENT_KEY` | Sumber yang sama | `public/js/config.js` (aman publik) |
| `FB_PROJECT_ID` | `quparkir` | Server |
| `FB_CLIENT_EMAIL` | Berkas JSON service account | Server |
| `FB_PRIVATE_KEY` | Berkas JSON service account | Server |

> ⚠️ Service account JSON setara kunci induk seluruh proyek Firebase. **Jangan pernah** di-commit ke Git.

---

## 2. Peta berkas

```
quparkir/
├─ netlify/
│  └─ functions/
│     ├─ create-payment.js      ← buat transaksi, hitung tarif di server
│     ├─ midtrans-webhook.js    ← terima notifikasi, verifikasi tanda tangan
│     └─ reconcile.js           ← jaring pengaman, berjalan tiap jam
├─ netlify.toml                 ← konfigurasi Netlify + jadwal reconcile
├─ package.json                 ← dependensi fungsi
├─ .env                         ← rahasia lokal (WAJIB masuk .gitignore)
├─ firestore.rules              ← DIUBAH (Langkah 1)
└─ public/
   ├─ app.html                  ← DIUBAH (CSP)
   └─ js/
      ├─ config.js              ← DIUBAH (client key + URL backend)
      ├─ pay.js                 ← DIUBAH (ganti simulasi)
      └─ data.js                ← DIUBAH (jangan tulis amount dari klien)
```

---

## Langkah 1 — Tutup lubang keamanan (`firestore.rules`)

> **⚠️ SEBAGIAN SUDAH DIKERJAKAN — jangan salin mentah-mentah.**
>
> Pada 25 Agustus 2026, tiga dari empat lubang di bawah sudah ditutup **tanpa
> server sama sekali**, sudah ter-deploy, dan lulus 33 uji di
> [`scripts/rules-test/`](../scripts/rules-test/README.md). Rules yang berlaku
> sekarang berbeda dari versi "SESUDAH" di bawah:
>
> | Bagian | Keadaan sebenarnya |
> |---|---|
> | **1a** `wallet` | Ditutup dengan cara lain: pemilik hanya boleh *mengurangi*; menambah adalah hak **admin** lewat koleksi `/topups` |
> | **1b** `transactions` | Belum baca-saja. Klien masih menulis, tapi nominalnya dicocokkan ke sesi yang dirujuk |
> | **1c** `sessions.amount` | Ditutup: rules menghitung sendiri batas bawah tarif dari `checkinAt` + jam server |
> | **1d** koleksi `orders` | ✅ Sudah ada sejak 25 Agu 2026 (baca-saja bagi klien, ditulis Admin SDK). Lima kasus ujinya di `scripts/rules-test/rules.test.mjs` |
>
> Yang masih perlu dikerjakan dari Langkah 1 hanyalah **1d**, dan **1b** baru
> bisa dijadikan baca-saja setelah `create-payment.js` jalan. Rinciannya di
> [`NETLIFY-LANJUTAN.md` §8](./NETLIFY-LANJUTAN.md).

**Kerjakan ini lebih dulu.** Tanpa ini, semua langkah berikutnya sia-sia: orang bisa mengisi saldo sendiri tanpa membayar.

Ganti tiga blok berikut di `firestore.rules`.

### 1a. `wallet` jadi tulis-server-saja

```js
// SEBELUM — pengguna bisa menulis wallet ke angka berapa pun
match /users/{u} {
  allow update: if isSignedIn() && uid() == u
    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role'])
    && (!('wallet' in request.resource.data) || ...);
}

// SESUDAH — 'wallet' ikut dilarang, sejajar dengan 'role'
match /users/{u} {
  allow read: if isSignedIn() && uid() == u;
  allow create: if isSignedIn() && uid() == u
    && !request.resource.data.keys().hasAny(['role', 'wallet']);
  allow update: if isSignedIn() && uid() == u
    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role', 'wallet']);
  match /vehicles/{v} {
    allow read, write: if isSignedIn() && uid() == u;
  }
}
```

### 1b. `transactions` jadi baca-saja bagi klien

```js
match /transactions/{id} {
  allow read: if isSignedIn() && (resource.data.uid == uid() || isAdmin());
  allow write: if false;          // hanya Admin SDK (memintas rules)
}
```

### 1c. `sessions.amount` tidak boleh disentuh klien

```js
match /sessions/{id} {
  allow read: if isSignedIn() && (resource.data.uid == uid() || isPetugas());
  allow create: if isSignedIn() && request.resource.data.uid == uid()
                && request.resource.data.status == 'active'
                && request.resource.data.verified == false;
  // Pemilik TIDAK boleh lagi menulis 'amount' maupun 'status' — checkout
  // dikerjakan server setelah pembayaran terverifikasi.
  allow update: if isPetugas()
    && request.resource.data.diff(resource.data).affectedKeys()
         .hasOnly(['verified', 'verifiedBy']);
}
```

### 1d. Koleksi baru `orders`

```js
match /orders/{id} {
  allow read: if isSignedIn() && (resource.data.uid == uid() || isAdmin());
  allow write: if false;          // hanya server
}
```

Terapkan:

```bash
firebase deploy --only firestore:rules
```

> 📌 Setelah langkah ini, **`data.js:checkout()` akan gagal** karena klien tidak lagi boleh menutup sesi. Itu memang disengaja — penutupan sesi dipindah ke server di Langkah 5. Selama masa transisi, mode DEMO (localStorage) tetap berjalan normal karena tidak menyentuh Firestore.

---

## Langkah 2 — Akun Midtrans sandbox

1. Daftar di [dashboard.midtrans.com](https://dashboard.midtrans.com), verifikasi email
2. Di pojok kiri atas, pastikan sakelar lingkungan pada **SANDBOX** (bukan Production)
3. Buka **Settings → Access Keys**, salin:
   - **Client Key** → nanti masuk `public/js/config.js`
   - **Server Key** → **jangan** masuk folder `public/`
4. Buka **Settings → Snap Preference → Payment Channels**, aktifkan minimal **GoPay** dan **QRIS**

Belum perlu mengisi URL notifikasi — URL-nya baru ada setelah Netlify di-deploy (Langkah 7).

---

## Langkah 3 — Service account Firebase

Ini yang mengizinkan server luar menulis ke Firestore.

1. [Firebase Console](https://console.firebase.google.com) → proyek `quparkir`
2. ⚙️ **Project settings → Service accounts**
3. Klik **Generate new private key** → berkas JSON terunduh
4. Buka berkasnya, ambil tiga nilai: `project_id`, `client_email`, `private_key`

> 🔐 Simpan berkas JSON di luar folder proyek, atau segera hapus setelah nilainya disalin. **Jangan pernah di-commit.**

---

## Langkah 4 — Siapkan proyek Netlify

### 4a. Dependensi

Di akar proyek:

```bash
npm init -y
npm install firebase-admin
```

### 4b. `netlify.toml`

```toml
[build]
  # QuParkir tidak punya proses build — folder public disajikan apa adanya
  publish = "public"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"

# Jaring pengaman: sapu order 'pending' yang webhook-nya tidak pernah sampai
[functions."reconcile"]
  schedule = "@hourly"
```

### 4c. `.gitignore`

Pastikan berisi:

```
node_modules/
.env
.netlify/
*serviceAccount*.json
```

### 4d. `.env` untuk uji lokal

```bash
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxx
MIDTRANS_IS_PRODUCTION=false
FB_PROJECT_ID=quparkir
FB_CLIENT_EMAIL=firebase-adminsdk-xxxxx@quparkir.iam.gserviceaccount.com
FB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
ALLOWED_ORIGIN=https://quparkir.web.app
```

> ⚠️ `FB_PRIVATE_KEY` harus dalam tanda kutip dan baris barunya ditulis sebagai `\n` literal. Kode nanti mengubahnya kembali.

### 4e. Sambungkan ke Netlify

```bash
netlify login
netlify init          # pilih "Create & configure a new site"
```

Lalu daftarkan rahasianya di server (jangan hanya di `.env` lokal):

```bash
netlify env:import .env
```

---

## Langkah 5 — Tulis fungsi server

> **✅ SUDAH DITULIS pada 25 Agustus 2026 — dan berbeda dari contoh di bawah.**
>
> Berkasnya kini ada di repo, semuanya **di belakang saklar** (lihat §5e).
> Contoh kode di §5a–5d dibiarkan apa adanya sebagai bahan rujukan, tapi versi
> yang berlaku adalah yang di `netlify/functions/`. Bedanya yang penting:
>
> | Hal | Panduan §5a–5d | Yang sebenarnya dipakai |
> |---|---|---|
> | Gaya function | v1 (`exports.handler`, CommonJS) | **v2 ESM** (`export default`, `Request`/`Response`) — mengikuti `hello.js` yang sudah terbukti jalan |
> | Berkas bersama | `netlify/functions/_lib.js` | `netlify/functions/lib/_lib.js` — berkas .js yang duduk langsung di folder functions akan dideploy jadi endpoint sendiri |
> | `terapkan()` | diekspor dari `midtrans-webhook.js` | pindah ke `_lib.js` sebagai `terapkanStatus()`, supaya webhook & reconcile tidak saling mengimpor |
> | Urutan baca/tulis transaksi | melanggar aturan Firestore (baca lokasi setelah tulis) | **diperbaiki** — order, sesi, dan lokasi dibaca semua di atas |
> | `activeSession` | tidak disentuh | ikut dikosongkan; tanpa itu pengguna tidak bisa check-in lagi meski parkirnya sudah lunas |
> | Nominal Get Status API | `signature_key: null` | `order_id` ikut dipaksakan dari dokumen order |
> | Endpoint tambahan | — | `payment-config.js`: menyerahkan Client Key (publik) ke browser, supaya tidak ada kunci yang perlu disalin tangan ke repo publik ini |
>
> **Uji tanpa deploy:** `npm run midtrans:test` (butuh Firestore Emulator jalan).
> 21 kasus, termasuk tiga yang paling menentukan di §8: tanda tangan palsu
> ditolak 403, notifikasi ganda tidak menutup sesi dua kali, dan nominal yang
> tidak cocok tidak meluluskan pembayaran. Uji ini memakai Server Key palsu dan
> menulis ke emulator, jadi tidak menyentuh kunci asli maupun data produksi —
> dan tidak membakar 15 kredit Netlify seperti sekali deploy produksi.

### 5f. Saldo QuPay — top up & bayar lewat server (25 Agu 2026)

Dua function tambahan yang tidak ada di panduan asli, keduanya menutup lubang
"pengguna mengaku sudah bayar":

| Function | Yang dikerjakan |
|---|---|
| `create-topup.js` | Order Snap untuk top up saldo. Saldo bertambah di **webhook**, bukan saat pengguna menekan tombol. Jalur lama (`/topups` + persetujuan admin di panel `/admin`) tetap ada sebagai cadangan saat gateway mati. |
| `wallet-checkout.js` | Bayar parkir dengan saldo, seluruhnya di server dalam **satu** `runTransaction()`: cek saldo, potong saldo, tutup sesi, catat transaksi, kembalikan slot, lepas `activeSession`. |

Kenapa `wallet-checkout` perlu ada: sebelumnya browser menutup sesi lalu
menulis saldo baru sebagai **dua operasi terpisah**, dan `firestore.rules`
tidak punya cara mengikat keduanya. Siapa pun bisa menjalankan yang pertama
tanpa yang kedua — parkir gratis, tanpa meretas apa pun. Di dalam satu
transaksi, keduanya tidak bisa dipisahkan.

`wallet-checkout` **tidak** ikut saklar Midtrans: ia murni Firestore dan tidak
menyentuh gateway sama sekali. Kalau function-nya tak terjangkau, klien mundur
ke jalur lama (browser yang memotong saldo).

Uji: `npm run midtrans:test` — 30 kasus webhook + 21 kasus saldo. Butuh
emulator **firestore dan auth** (`--only firestore,auth`); rinciannya di
[`scripts/midtrans/README.md`](../scripts/midtrans/README.md).

### 5e. Saklar — cara menyalakan & mematikan

Jalur Midtrans mati secara default. Menyalakannya perlu **dua** saklar,
sengaja terpisah supaya satu salah ketik tidak bisa mematikan jalur QRIS
merchant yang sudah terbukti menerima uang sungguhan:

| Saklar | Tempat | Nyalakan |
|---|---|---|
| Server | env var Netlify | `netlify env:set MIDTRANS_ENABLED true` |
| Klien | `public/js/config.js` | `paymentConfig.provider = "midtrans"` |

Perilaku saat salah satu mati:

- Server mati → `create-payment` membalas **503**, `pay.js` mundur ke QRIS merchant.
- Klien mati → jalur gateway tidak pernah dipanggil sama sekali.
- Function tak terjangkau / perangkat offline → sama, mundur ke QRIS merchant.
- **`midtrans-webhook` tetap hidup dalam keadaan apa pun.** Kalau saklar
  dimatikan selagi ada pembayaran yang telanjur berjalan, uangnya tetap dicatat
  dan sesinya tetap ditutup. Mematikan saklar menghentikan order **baru**, bukan
  yang sudah berjalan.

Mematikan kembali: `netlify env:unset MIDTRANS_ENABLED` — berlaku detik itu
juga, tanpa push dan tanpa deploy ulang.


### 5a. Berkas bersama — `netlify/functions/_lib.js`

```js
// Dipakai bersama oleh ketiga fungsi.
const admin = require("firebase-admin");

// Netlify memakai ulang kontainer; init hanya sekali per kontainer.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FB_PROJECT_ID,
      clientEmail: process.env.FB_CLIENT_EMAIL,
      // .env menyimpan baris baru sebagai "\n" literal — kembalikan
      privateKey: process.env.FB_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();
const isProd = process.env.MIDTRANS_IS_PRODUCTION === "true";

const MIDTRANS = {
  snap: isProd
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions",
  status: (orderId) => isProd
    ? `https://api.midtrans.com/v2/${orderId}/status`
    : `https://api.sandbox.midtrans.com/v2/${orderId}/status`,
};

// Midtrans memakai Basic Auth: username = Server Key, password kosong
const authHeader = () =>
  "Basic " + Buffer.from(process.env.MIDTRANS_SERVER_KEY + ":").toString("base64");

// Klien di quparkir.web.app memanggil fungsi di *.netlify.app → beda origin
const cors = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", ...cors },
  body: JSON.stringify(body),
});

// ⚠️ SALINAN dari public/js/util.js — versi INI yang menentukan tagihan.
// Kalau tarif di util.js diubah, ubah juga di sini.
function hitungTarif(type, ms) {
  const jam = Math.max(1, Math.ceil(ms / 3600000));
  return type === "mobil" ? 3000 + (jam - 1) * 2000 : 2000 + (jam - 1) * 1000;
}

module.exports = { admin, db, MIDTRANS, authHeader, cors, json, hitungTarif };
```

### 5b. `netlify/functions/create-payment.js`

```js
const { admin, db, MIDTRANS, authHeader, cors, json, hitungTarif } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    // 1) Siapa pemanggilnya? Token Firebase Auth, bukan uid kiriman klien.
    const idToken = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!idToken) return json(401, { error: "unauthenticated" });
    const { uid } = await admin.auth().verifyIdToken(idToken);

    // 2) Klien HANYA mengirim sessionId. Nominal tidak pernah dipercaya dari klien.
    const { sessionId } = JSON.parse(event.body || "{}");
    if (!sessionId) return json(400, { error: "sessionId_required" });

    const sessRef = db.collection("sessions").doc(sessionId);
    const sess = await sessRef.get();
    if (!sess.exists) return json(404, { error: "session_not_found" });

    const s = sess.data();
    if (s.uid !== uid) return json(403, { error: "forbidden" });
    if (s.status !== "active") return json(409, { error: "session_not_active" });

    // 3) Tarif dihitung DI SINI, dari waktu check-in yang tersimpan di Firestore
    const amount = hitungTarif(s.vehicle.type, Date.now() - s.checkinAt);

    // 4) Pakai ulang order yang masih pending — cegah dobel-transaksi bila
    //    pengguna menekan Bayar dua kali.
    const existing = await db.collection("orders")
      .where("sessionId", "==", sessionId)
      .where("status", "==", "pending")
      .limit(1).get();
    if (!existing.empty) {
      const o = existing.docs[0].data();
      return json(200, { orderId: existing.docs[0].id, token: o.snapToken, amount: o.amount });
    }

    // order_id: maks 50 karakter, hanya alfanumerik dan -_~. , unik selamanya
    const orderId = `QP-${sessionId}-${Date.now()}`.slice(0, 50);

    // 5) Catat SEBELUM memanggil Midtrans. Kalau panggilan gagal di tengah,
    //    jejaknya tetap ada dan bisa disapu reconcile.
    await db.collection("orders").doc(orderId).set({
      uid, sessionId, amount,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 6) Minta token Snap
    const res = await fetch(MIDTRANS.snap, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authHeader(),
      },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: amount },
        item_details: [{
          id: s.locationId,
          price: amount,
          quantity: 1,
          name: `Parkir ${s.vehicle.type} — ${s.locationName}`.slice(0, 50),
        }],
        enabled_payments: ["gopay", "qris", "other_qris"],
        expiry: { unit: "minutes", duration: 30 },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      await db.collection("orders").doc(orderId).update({ status: "failed", error: detail });
      console.error("Snap gagal:", res.status, detail);
      return json(502, { error: "gateway_error" });
    }

    const { token } = await res.json();
    await db.collection("orders").doc(orderId).update({ snapToken: token });

    return json(200, { orderId, token, amount });
  } catch (e) {
    console.error(e);
    return json(500, { error: "internal" });
  }
};
```

### 5c. `netlify/functions/midtrans-webhook.js`

Ini inti dari "bagaimana sistem tahu pembayaran berhasil".

```js
const crypto = require("crypto");
const { admin, db, json } = require("./_lib");

// Sukses = settlement/capture DAN tidak ditandai fraud
const lunas = (b) =>
  ["settlement", "capture"].includes(b.transaction_status) &&
  (!b.fraud_status || b.fraud_status === "accept");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };

  try {
    const b = JSON.parse(event.body || "{}");

    // 1) VERIFIKASI TANDA TANGAN — tanpa ini siapa pun yang tahu URL ini
    //    bisa mengirim "sudah lunas" palsu.
    const expected = crypto.createHash("sha512")
      .update(b.order_id + b.status_code + b.gross_amount + process.env.MIDTRANS_SERVER_KEY)
      .digest("hex");
    if (expected !== b.signature_key) {
      console.warn("Tanda tangan tidak cocok:", b.order_id);
      return { statusCode: 403, body: "invalid signature" };
    }

    await terapkan(b);

    // 2) Balas 200 secepatnya. Midtrans menunggu maks 15 detik; lewat itu
    //    ia mengulang (2 → 10 → 30 → 90 → 210 menit).
    return { statusCode: 200, body: "OK" };
  } catch (e) {
    console.error(e);
    // Sengaja 500 supaya Midtrans mengulang — jangan menelan galat diam-diam
    return { statusCode: 500, body: "error" };
  }
};

// Idempoten: aman dijalankan berkali-kali untuk order yang sama.
async function terapkan(b) {
  const orderRef = db.collection("orders").doc(b.order_id);

  await db.runTransaction(async (tx) => {
    const order = await tx.get(orderRef);
    if (!order.exists) { console.warn("Order tak dikenal:", b.order_id); return; }

    const o = order.data();
    if (o.status === "paid") return;              // ← kunci idempotensi

    if (!lunas(b)) {
      tx.update(orderRef, {
        status: ["expire", "cancel", "deny", "failure"].includes(b.transaction_status)
          ? "failed" : "pending",
        rawNotification: b,
      });
      return;
    }

    // Nominal yang dibayar HARUS sama dengan yang kita tagih
    if (Math.round(Number(b.gross_amount)) !== o.amount) {
      tx.update(orderRef, { status: "mismatch", rawNotification: b });
      console.error("Nominal tidak cocok:", b.order_id, b.gross_amount, o.amount);
      return;
    }

    const sessRef = db.collection("sessions").doc(o.sessionId);
    const sess = await tx.get(sessRef);

    tx.update(orderRef, {
      status: "paid",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      midtransTransactionId: b.transaction_id,
      paymentType: b.payment_type,
      rawNotification: b,
    });

    // Tutup sesi parkir + catat transaksi, dalam transaksi yang sama
    if (sess.exists && sess.data().status === "active") {
      const s = sess.data();
      tx.update(sessRef, {
        status: "done",
        checkoutAt: Date.now(),
        amount: o.amount,
        method: b.payment_type,
      });
      tx.set(db.collection("transactions").doc(), {
        sessionId: o.sessionId, uid: o.uid, locationId: s.locationId,
        amount: o.amount, method: b.payment_type, paidAt: Date.now(),
      });
      // kembalikan slot yang terpakai
      const locRef = db.collection("locations").doc(s.locationId);
      const loc = await tx.get(locRef);
      if (loc.exists) {
        const key = s.vehicle.type === "mobil" ? "occCar" : "occMotor";
        tx.update(locRef, { [key]: Math.max(0, (loc.data()[key] || 0) - 1) });
      }
    }
  });
}

module.exports.terapkan = terapkan;   // dipakai reconcile.js
```

> ⚠️ **Batasan Firestore:** semua `tx.get()` harus dipanggil **sebelum** `tx.update()`/`tx.set()` pertama. Kode di atas melanggar aturan itu pada pembacaan `locRef`. Sebelum dipakai, pindahkan seluruh pembacaan (`orderRef`, `sessRef`, `locRef`) ke bagian atas transaksi. Sengaja saya tandai alih-alih dirapikan diam-diam supaya Anda tahu titik yang harus diperiksa saat menulis versi finalnya.

### 5d. `netlify/functions/reconcile.js`

Webhook bisa hilang. Ini jaring pengamannya.

```js
const { db, MIDTRANS, authHeader } = require("./_lib");
const { terapkan } = require("./midtrans-webhook");

exports.handler = async () => {
  // Order pending yang lebih tua dari 10 menit — kemungkinan webhook-nya hilang
  const batas = new Date(Date.now() - 10 * 60 * 1000);
  const snap = await db.collection("orders")
    .where("status", "==", "pending")
    .where("createdAt", "<", batas)
    .limit(50).get();

  for (const doc of snap.docs) {
    try {
      const res = await fetch(MIDTRANS.status(doc.id), {
        headers: { Accept: "application/json", Authorization: authHeader() },
      });
      if (!res.ok) continue;
      const body = await res.json();
      // Get Status API tidak mengirim signature_key; terapkan() dipanggil
      // langsung karena sumbernya sudah tepercaya (kita yang memanggil).
      await terapkan({ ...body, signature_key: null });
    } catch (e) {
      console.error("reconcile", doc.id, e);
    }
  }
  return { statusCode: 200, body: `dicek: ${snap.size}` };
};
```

Deploy:

```bash
netlify deploy --prod
```

Catat URL yang muncul, mis. `https://quparkir-pay.netlify.app`.

---

## Langkah 6 — Ubah sisi klien

### 6a. `public/js/config.js`

> **Sudah dikerjakan, tapi berbeda dari contoh ini.** `midtransClientKey` dan
> `snapUrl` TIDAK ditulis di berkas ini: repo ini publik, dan menyalin kunci
> dengan tangan adalah cara dua kunci sebelumnya bocor. Keduanya diambil saat
> berjalan dari `/.netlify/functions/payment-config`. Yang tersisa di config.js
> hanyalah `provider` (saklar klien) dan `apiBase`.

```js
export const paymentConfig = {
  provider: "midtrans",
  midtransClientKey: "SB-Mid-client-xxxxxxxxxxxx",   // AMAN publik
  // Snap.js sandbox; ganti ke app.midtrans.com saat produksi
  snapUrl: "https://app.sandbox.midtrans.com/snap/snap.js",
  apiBase: "https://quparkir-pay.netlify.app/.netlify/functions",
};
```

### 6b. `public/app.html` — CSP

Tanpa ini popup Snap **diam saja tanpa pesan galat apa pun**. Tambahkan ke `Content-Security-Policy`:

```
script-src  ... https://app.sandbox.midtrans.com https://app.midtrans.com
connect-src ... https://app.sandbox.midtrans.com https://app.midtrans.com
                https://api.sandbox.midtrans.com https://api.midtrans.com
                https://quparkir-pay.netlify.app
frame-src   ... https://app.sandbox.midtrans.com https://app.midtrans.com
```

### 6c. `public/js/pay.js`

> **Sudah dikerjakan.** Versi yang berlaku ada di `public/js/pay.js`; ia
> menambahkan hal yang tidak ada di contoh bawah: pengecekan saklar server,
> kemunduran otomatis ke QRIS merchant, tenggang 20 detik setelah popup Snap
> ditutup (webhook biasanya datang beberapa detik setelahnya), dan hasil
> `{ server: true, amount }` supaya `status.js` tahu sesinya sudah ditutup
> server dan tidak menutupnya untuk kedua kali.

Ganti `payMidtrans()` yang masih stub:

```js
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Muat snap.js sekali saja
let snapReady = null;
function loadSnap() {
  if (snapReady) return snapReady;
  snapReady = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = paymentConfig.snapUrl;
    s.setAttribute("data-client-key", paymentConfig.midtransClientKey);
    s.onload = resolve;
    s.onerror = () => reject(new Error("Gagal memuat Snap"));
    document.head.append(s);
  });
  return snapReady;
}

export async function payMidtrans({ sessionId }) {
  await loadSnap();

  const idToken = await getAuth().currentUser.getIdToken();
  const res = await fetch(`${paymentConfig.apiBase}/create-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ sessionId }),          // ← nominal TIDAK dikirim
  });
  if (!res.ok) throw new Error("Gagal membuat transaksi");
  const { orderId, token } = await res.json();

  window.snap.pay(token);   // callback-nya hanya untuk tampilan

  // Kebenaran datang dari server, bukan dari callback Snap. Pengguna bisa
  // menutup browser tepat setelah bayar dan webhook tetap sampai.
  return tungguLunas(orderId);
}

function tungguLunas(orderId) {
  return new Promise((resolve) => {
    const unsub = onSnapshot(doc(db, "orders", orderId), (snap) => {
      const st = snap.data()?.status;
      if (st === "paid")   { unsub(); resolve(true); }
      if (st === "failed") { unsub(); resolve(false); }
    });
  });
}
```

Hapus `simulasiQRIS()` dari jalur produksi — biarkan hanya untuk mode DEMO.

### 6d. `public/js/data.js`

Pada backend Firebase, `checkout()` tidak boleh lagi menulis `status`, `amount`, `method`, `transactions`, maupun mengurangi `occ*`. Semua itu kini dikerjakan webhook. Sisakan hanya pemicu pembayaran.

---

## Langkah 7 — Daftarkan URL webhook di Midtrans

1. Dashboard Midtrans → **Settings → Configuration**
2. Isi **Payment Notification URL**:
   ```
   https://quparkir-pay.netlify.app/.netlify/functions/midtrans-webhook
   ```
3. Simpan, lalu tekan tombol **Test** yang tersedia di sana

Syarat yang harus terpenuhi (Netlify sudah memenuhi semuanya): HTTPS, port 443, sertifikat sah, dapat diakses publik.

---

## Langkah 8 — Uji coba (sandbox)

### Uji lokal

```bash
netlify dev      # fungsi tersedia di http://localhost:8888/.netlify/functions/...
```

`create-payment` bisa diuji lokal. **Webhook tidak bisa** — Midtrans tidak dapat menjangkau localhost. Pakai `netlify deploy` (preview) atau terowongan seperti `ngrok`, lalu arahkan Notification URL ke sana untuk sementara.

### Skenario yang wajib lulus

| # | Uji | Hasil yang benar |
|---|---|---|
| 1 | Bayar normal sampai selesai | `orders.status = paid`, sesi jadi `done`, slot lokasi bertambah kembali |
| 2 | **Tutup browser tepat setelah bayar** | Tetap `paid` — membuktikan webhook, bukan callback, yang menentukan |
| 3 | Tekan tombol Bayar dua kali | Hanya satu order dibuat |
| 4 | Kirim webhook palsu tanpa `signature_key` benar | Dibalas **403**, tidak ada data berubah |
| 5 | Kirim ulang webhook yang sama dua kali | Sesi tidak tertutup dua kali, transaksi tidak dobel |
| 6 | Biarkan sampai kedaluwarsa (30 menit) | `orders.status = failed`, sesi tetap `active` |
| 7 | Ubah `amount` di DevTools lalu bayar | Tidak berpengaruh — nominal dihitung server |

Uji nomor 2, 4, dan 5 adalah yang paling penting. Ketiganya persis yang membedakan pembayaran sungguhan dari simulasi.

### Alat bantu

- **Simulator Midtrans** — [simulator.sandbox.midtrans.com](https://simulator.sandbox.midtrans.com) untuk membayar tanpa uang sungguhan
- **Log Netlify** — `netlify functions:log` atau tab Functions di dashboard
- **Riwayat webhook** — Dashboard Midtrans menyimpan setiap notifikasi beserta kode balasan server Anda

---

## Langkah 9 — Naik produksi

- [ ] Dokumen legal disetujui, akun produksi Midtrans aktif (lihat `PAYMENT.md` §3.1)
- [ ] `MIDTRANS_SERVER_KEY` di Netlify diganti ke kunci produksi
- [ ] `MIDTRANS_IS_PRODUCTION=true`
- [ ] `config.js`: `midtransClientKey` dan `snapUrl` diganti ke produksi (`app.midtrans.com`)
- [ ] Notification URL didaftarkan lagi di dashboard **Production** (setelan sandbox tidak ikut terbawa)
- [ ] `ALLOWED_ORIGIN` diset tepat ke `https://quparkir.web.app`, bukan `*`
- [ ] Uji satu transaksi sungguhan bernominal kecil, lalu pastikan dana masuk rekening
- [ ] Pastikan service account JSON tidak pernah masuk riwayat Git: `git log --all -- '*serviceAccount*'`

---

## 12. Masalah yang sering muncul

| Gejala | Sebab | Perbaikan |
|---|---|---|
| Popup Snap tidak muncul, konsol bersih | CSP memblokir `snap.js` | Langkah 6b — periksa `script-src` dan `frame-src` |
| `401 unauthenticated` | Token Firebase belum siap | Panggil `getIdToken()` setelah `onAuthStateChanged`, bukan saat modul dimuat |
| `Failed to fetch` di browser | Header CORS kurang | Pastikan cabang `OPTIONS` di fungsi berjalan dan `ALLOWED_ORIGIN` benar |
| Webhook selalu 403 | Server Key salah lingkungan | Kunci sandbox tidak berlaku untuk notifikasi produksi, dan sebaliknya |
| `Invalid PEM formatted message` | `FB_PRIVATE_KEY` tidak dipulihkan | Pastikan ada `.replace(/\\n/g, "\n")` dan nilainya diapit tanda kutip |
| Status tidak berubah walau sudah bayar | Notification URL belum didaftarkan | Langkah 7 — cek riwayat webhook di dashboard Midtrans |
| Sesi tertutup dua kali | Penjaga idempotensi hilang | Pastikan `if (o.status === "paid") return;` ada di dalam transaksi |
| `order_id has already been taken` | `order_id` dipakai ulang | Sertakan timestamp; `order_id` unik selamanya |

---

## 13. Lampiran — kalau memilih Cloudflare Workers

Alur, model data, dan seluruh logika di atas **sama persis**. Yang berbeda hanya tiga hal:

| | Netlify | Cloudflare Workers |
|---|---|---|
| Akses Firestore | `firebase-admin` langsung | **Tidak bisa** — runtime tanpa Node crypto & gRPC. Pakai Firestore REST API + JWT service account via Web Crypto, atau pustaka `firebase-admin-rest` / `firebase-cfworkers` |
| Verifikasi tanda tangan | `crypto.createHash("sha512")` | `crypto.subtle.digest("SHA-512", ...)` lalu ubah ke hex |
| Penjadwalan `reconcile` | `schedule` di `netlify.toml` | Cron Triggers di `wrangler.toml` |

Tambahan khusus Workers: **cache token OAuth Google** (berlaku 1 jam) di KV atau variabel modul. Menandatangani JWT RSA adalah satu-satunya operasi berat di alur ini; kalau tidak di-cache, ia dijalankan tiap permintaan dan bisa mendekati batas 10 ms CPU. Waktu menunggu jaringan sendiri tidak dihitung sebagai CPU, jadi panggilan ke Midtrans aman berapa pun lamanya.

---

## Sumber

- [Midtrans — Snap Integration Guide](https://docs.midtrans.com/docs/snap-snap-integration-guide)
- [Midtrans — HTTP(S) Notification / Webhooks](https://docs.midtrans.com/docs/https-notification-webhooks)
- [Midtrans — Best Practices to Handle Notification](https://docs.midtrans.com/reference/best-practices-to-handle-notification)
- [Netlify — Scheduled Functions](https://docs.netlify.com/functions/scheduled-functions/)
- [Firebase — Initialize the Admin SDK](https://firebase.google.com/docs/admin/setup)
- [`firebase-admin-rest` untuk runtime edge](https://github.com/Moe03/firebase-admin-rest)

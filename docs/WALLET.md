# 💰 SALDO QUPAY — Membuatnya Benar-Benar Berfungsi

**Pendamping:** [`PAYMENT.md`](./PAYMENT.md) (riset gateway) & [`PAYMENT-SETUP.md`](./PAYMENT-SETUP.md) (panduan pasang Midtrans + Netlify Functions).
**Prasyarat:** dokumen ini **melanjutkan** `PAYMENT-SETUP.md` — dianggap Langkah 1–7 di sana sudah dikerjakan (akun Midtrans, service account, proyek Netlify, `netlify/functions/_lib.js` sudah ada). Kalau belum, mulai dari sana dulu.
**Status kode di dokumen ini:** kerangka kerja yang belum pernah dijalankan. Wajib diuji di sandbox sebelum dipercaya.
**Pertanyaan yang dijawab:** bagaimana top up QuPay membuat saldo yang **sungguhan** — bukan angka yang bisa ditulis siapa pun lewat DevTools — dan bagaimana saldo itu benar-benar terpotong saat dipakai bayar parkir, tanpa bisa dicurangi atau balapan (race condition) antar-tab.

---

## Daftar isi

1. [Cara kerja SEKARANG — dan kenapa saldonya palsu](#1-cara-kerja-sekarang--dan-kenapa-saldonya-palsu)
2. [Arsitektur yang benar](#2-arsitektur-yang-benar)
3. [Model data](#3-model-data)
4. [Langkah 1 — Tutup lubang `wallet` di `firestore.rules`](#langkah-1--tutup-lubang-wallet-di-firestorerules)
5. [Langkah 2 — Tambahan di `_lib.js`](#langkah-2--tambahan-di-_libjs)
6. [Langkah 3 — Fungsi baru: `topup-create.js`](#langkah-3--fungsi-baru-topup-createjs)
7. [Langkah 4 — Cabang top up di `midtrans-webhook.js`](#langkah-4--cabang-top-up-di-midtrans-webhookjs)
8. [Langkah 5 — Fungsi baru: `checkout-qupay.js`](#langkah-5--fungsi-baru-checkout-qupayjs)
9. [Langkah 6 — Ubah sisi klien](#langkah-6--ubah-sisi-klien)
10. [Skenario uji yang wajib lulus](#7-skenario-uji-yang-wajib-lulus)
11. [Mode DEMO tetap seperti sekarang](#8-mode-demo-tetap-seperti-sekarang)
12. [Urutan pengerjaan](#9-urutan-pengerjaan)
13. [Sumber](#10-sumber)

---

## 1. Cara kerja SEKARANG — dan kenapa saldonya palsu

Tiga tempat di kode, dibaca apa adanya:

**Saldo awal — gratis, tanpa membayar apa pun.**

```js
// public/js/data.js:97 (demo) & :221 (firebase)
wallet: { get: (u) => s.wallet[u] ?? 25000, ... }
wallet: { get: async (u) => (await getDoc(doc(db, "users", u))).data()?.wallet ?? 25000, ... }
```

Setiap akun baru membaca `?? 25000` — muncul Rp 25.000 dari udara.

**Top up — "bayar" itu cuma satu tombol yang mengaku sendiri sudah bayar.**

```js
// public/js/pay.js:59 — payQRIS() jalan ke sini kalau paymentConfig.provider bukan "midtrans"
h("button.btn", { onclick: () => { $("#modalHost").innerHTML = ""; resolve(true); } },
  "✅ Saya sudah bayar (simulasi)"),
```

```js
// public/js/pages/akun.js:57-67 — topUpModal()
const ok = await payQRIS({ amount, title: "Top Up QuPay" });
if (!ok) return toast("Top up dibatalkan", "err");
const cur = await Promise.resolve(DB.wallet.get(u.uid));
await DB.wallet.set(u.uid, cur + amount);        // ← klien yang menambah saldonya sendiri
```

Klik "Saya sudah bayar" → `DB.wallet.set()` dipanggil **dari browser**, langsung `setDoc(users/{uid}, {wallet: v})`. Tidak ada gateway yang benar-benar dihubungi, tidak ada yang memverifikasi apa pun.

**Firestore Rules mengizinkan ini secara eksplisit** — bukan celah tak sengaja, tapi keputusan sadar yang sudah ditandai sebagai sementara:

```js
// firestore.rules:25-26
// 'wallet' boleh (prototipe; server-side wallet = fase Cloud Functions) tapi wajib angka >= 0.
match /users/{u} {
  allow update: if isSignedIn() && uid() == u
    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role'])
    && (!('wallet' in request.resource.data)
        || (request.resource.data.wallet is number && request.resource.data.wallet >= 0));
```

Satu-satunya syarat: angkanya ≥ 0. Siapa pun yang login bisa buka console browser dan menjalankan:

```js
import("./js/data.js").then(({ DB, Auth }) => DB.wallet.set(Auth.current().uid, 999999999));
```

Saldo Rp 999.999.999 langsung tersimpan di server. **Fase itu — "server-side wallet" — adalah yang dikerjakan dokumen ini.**

**Pemakaian saldo (bayar parkir) juga ditulis langsung dari klien**, dan berpotensi balapan (race):

```js
// public/js/pages/status.js:66-76 — doCheckout(), cabang method === "qupay"
const fresh = await Promise.resolve(DB.wallet.get(u.uid));   // baca
if (fresh < z.amount) { ... }
else {
  sisa = fresh - z.amount;
  await DB.wallet.set(u.uid, sisa);                           // tulis — baca-ubah-tulis, TIDAK atomik
}
```

Baca-lalu-tulis dari klien berarti dua tab yang checkout bersamaan bisa membaca saldo yang sama sebelum salah satunya sempat menulis — hasil akhirnya saldo terpotong **satu kali**, bukan dua, meski dua sesi parkir ditutup. Komentar kode sendiri sudah mengakui ini ("hindari lost-update dari tab lain") tapi solusinya (baca ulang sesaat sebelum tulis) hanya memperkecil jendela balapan, tidak menutupnya.

---

## 2. Arsitektur yang benar

Prinsipnya sama persis dengan `PAYMENT.md` §2: **apa pun yang menentukan uang berpindah, harus terjadi di server** — bukan di JavaScript yang dikirim ke browser siapa saja.

```
TOP UP (uang masuk)
1. User pilih nominal → topup-create (server, uid dari token, nominal divalidasi ulang)
2. Server: buat orders/{id} { type:"topup", status:"pending" } → minta token Snap ke Midtrans
3. User bayar di Gojek/GoPay/QRIS lewat popup Snap
4. Midtrans → webhook (server) → verifikasi tanda tangan
5. Webhook: FieldValue.increment(amount) ke users/{uid}.wallet — ATOMIK, bukan baca-ubah-tulis
6. Klien: onSnapshot users/{uid} → saldo di layar naik SENDIRI, tanpa refresh

BAYAR PARKIR PAKAI QUPAY (uang keluar)
1. User pilih "QuPay" di modal Pilih Metode Pembayaran (sudah ada, tidak berubah)
2. Klien → checkout-qupay(sessionId)                 [TANPA mengirim nominal maupun saldo]
3. Server, dalam SATU transaksi Firestore:
   baca sesi + saldo TERBARU → hitung tarif sendiri → saldo cukup?
   → potong saldo, tutup sesi, catat transaksi, kembalikan slot lokasi — atau gagal total, tidak ada yang berubah
4. Klien: baca hasil dari respons (untuk struk) — saldo di layar sudah ikut ter-update lewat onSnapshot
```

Dua alur ini **tidak saling memanggil Midtrans** — top up memang perlu Midtrans (uang sungguhan masuk dari luar sistem), tapi bayar-pakai-QuPay murni pemindahan buku internal (saldo yang *sudah* terverifikasi lewat top up sebelumnya), jadi cukup satu transaksi Firestore di server, tanpa gateway kedua.

---

## 3. Model data

Memakai ulang koleksi `orders` dari `PAYMENT-SETUP.md` §3.5, ditambah satu field `type` untuk membedakan tujuannya:

```
orders/{orderId}
  uid                    // pemilik
  type                   // "topup" | "parking"   ← BARU
  sessionId              // hanya ada bila type == "parking"
  amount                 // untuk topup: nominal pilihan user (divalidasi server);
                          // untuk parking: dihitung server dari checkinAt (tidak berubah)
  status                 // pending | paid | expired | failed
  midtransTransactionId
  paymentType             // gopay | qris | ...
  createdAt, paidAt
  rawNotification
```

`order_id` untuk top up memakai prefiks berbeda supaya gampang dibedakan di dashboard Midtrans dan log:

```js
const orderId = `TOPUP-${uid}-${Date.now()}`.slice(0, 50);   // vs QP-{sessionId}-{ts} untuk parkir
```

Saldo sendiri **tetap** di `users/{uid}.wallet` (tidak dipindah ke koleksi baru) — cukup diubah siapa yang boleh menulisnya.

---

## Langkah 1 — Tutup lubang `wallet` di `firestore.rules`

Sama seperti `PAYMENT-SETUP.md` §1a, disesuaikan dengan rules yang berlaku saat ini:

```js
// SEBELUM
match /users/{u} {
  allow read: if isSignedIn() && uid() == u;
  allow create: if isSignedIn() && uid() == u
    && !request.resource.data.keys().hasAny(['role'])
    && (!('wallet' in request.resource.data)
        || (request.resource.data.wallet is number && request.resource.data.wallet >= 0));
  allow update: if isSignedIn() && uid() == u
    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role'])
    && (!('wallet' in request.resource.data)
        || (request.resource.data.wallet is number && request.resource.data.wallet >= 0));
  match /vehicles/{v} {
    allow read, write: if isSignedIn() && uid() == u;
  }
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

Dan tambahkan blok `orders` (belum ada di rules sekarang — `PAYMENT-SETUP.md` §1d menyebutnya juga, tulis sekali saja bila belum ada):

```js
match /orders/{id} {
  allow read: if isSignedIn() && (resource.data.uid == uid() || isAdmin());
  allow write: if false;          // hanya Admin SDK (memintas rules)
}
```

Terapkan:

```bash
firebase deploy --only firestore:rules
```

> ⚠️ Saldo awal Rp 25.000 (`?? 25000` di `data.js`) tidak dipengaruhi rules ini — itu **nilai baca**, bukan tulisan. Kalau tidak ingin akun baru mulai dengan saldo gratis, hapus `?? 25000` (ganti jadi `?? 0`) sekalian di Langkah 6.

---

## Langkah 2 — Tambahan di `_lib.js`

`_lib.js` sudah ada dari `PAYMENT-SETUP.md` §5a. Tambahkan validasi nominal top up di sana supaya dipakai ulang oleh `topup-create.js`:

```js
// tambahan di netlify/functions/_lib.js

const TOPUP_MIN = 10000, TOPUP_MAX = 1000000;   // sama dengan public/js/pages/akun.js — SALINAN, jaga tetap sinkron

function nominalTopupValid(n) {
  return Number.isInteger(n) && n >= TOPUP_MIN && n <= TOPUP_MAX;
}

module.exports = { admin, db, MIDTRANS, authHeader, cors, json, hitungTarif, nominalTopupValid, TOPUP_MIN, TOPUP_MAX };
```

> Nominal top up **datang dari pilihan pengguna** (bukan dihitung dari data lain seperti tarif parkir), jadi tidak bisa divalidasi dengan cara "hitung ulang di server" seperti `hitungTarif()`. Yang bisa dan wajib dilakukan server: **memastikan angkanya masih dalam batas wajar** — supaya DevTools tidak bisa mengirim `amount: -50000` atau `amount: 0.5`.

---

## Langkah 3 — Fungsi baru: `topup-create.js`

```js
// netlify/functions/topup-create.js
const { admin, db, MIDTRANS, authHeader, cors, json, nominalTopupValid } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const idToken = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!idToken) return json(401, { error: "unauthenticated" });
    const { uid } = await admin.auth().verifyIdToken(idToken);

    const { amount } = JSON.parse(event.body || "{}");
    if (!nominalTopupValid(amount)) return json(400, { error: "amount_out_of_range" });

    const orderId = `TOPUP-${uid}-${Date.now()}`.slice(0, 50);

    // Catat SEBELUM memanggil Midtrans — kalau panggilan gagal di tengah,
    // jejaknya tetap ada dan bisa disapu reconcile.js (sudah ada, lihat §5d PAYMENT-SETUP.md).
    await db.collection("orders").doc(orderId).set({
      uid, type: "topup", amount,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const res = await fetch(MIDTRANS.snap, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: authHeader() },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: amount },
        item_details: [{ id: "topup", price: amount, quantity: 1, name: "Top Up Saldo QuPay" }],
        enabled_payments: ["gopay", "qris", "other_qris"],
        expiry: { unit: "minutes", duration: 30 },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      await db.collection("orders").doc(orderId).update({ status: "failed", error: detail });
      console.error("Snap gagal (topup):", res.status, detail);
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

Nyaris identik dengan `create-payment.js` (§5b `PAYMENT-SETUP.md`) — bedanya nominal datang dari input pengguna (tervalidasi rentang), bukan dihitung dari sesi parkir, dan tidak ada `sessionId`.

---

## Langkah 4 — Cabang top up di `midtrans-webhook.js`

`midtrans-webhook.js` sudah ada dari `PAYMENT-SETUP.md` §5c. Fungsi `terapkan(b)` di dalamnya perlu bercabang berdasarkan `order.type` **sebelum** masuk ke logika penutupan sesi yang sudah ada:

```js
// ganti isi terapkan(b) di netlify/functions/midtrans-webhook.js

async function terapkan(b) {
  const orderRef = db.collection("orders").doc(b.order_id);

  await db.runTransaction(async (tx) => {
    const order = await tx.get(orderRef);
    if (!order.exists) { console.warn("Order tak dikenal:", b.order_id); return; }

    const o = order.data();
    if (o.status === "paid") return;              // kunci idempotensi — sama untuk kedua jenis order

    if (!lunas(b)) {
      tx.update(orderRef, {
        status: ["expire", "cancel", "deny", "failure"].includes(b.transaction_status) ? "failed" : "pending",
        rawNotification: b,
      });
      return;
    }
    if (Math.round(Number(b.gross_amount)) !== o.amount) {
      tx.update(orderRef, { status: "mismatch", rawNotification: b });
      console.error("Nominal tidak cocok:", b.order_id, b.gross_amount, o.amount);
      return;
    }

    if (o.type === "topup") {
      // Kredit saldo — WAJIB increment(), bukan baca-lalu-tulis. Sebuah order topup
      // hanya diproses SEKALI (dijaga baris "if (o.status === 'paid') return;" di atas),
      // tapi increment() tetap dipakai supaya AMAN meski dua webhook untuk order yang
      // berbeda tiba nyaris bersamaan (mis. user top up dua kali berturut-turut).
      tx.update(db.collection("users").doc(o.uid), {
        wallet: admin.firestore.FieldValue.increment(o.amount),
      });
      tx.update(orderRef, {
        status: "paid",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        midtransTransactionId: b.transaction_id,
        paymentType: b.payment_type,
        rawNotification: b,
      });
      return;
    }

    // type === "parking" — logika lama, TIDAK berubah (lihat PAYMENT-SETUP.md §5c
    // untuk catatan soal urutan tx.get() sebelum tx.update()/tx.set()).
    const sessRef = db.collection("sessions").doc(o.sessionId);
    const sess = await tx.get(sessRef);

    tx.update(orderRef, {
      status: "paid",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      midtransTransactionId: b.transaction_id,
      paymentType: b.payment_type,
      rawNotification: b,
    });

    if (sess.exists && sess.data().status === "active") {
      const s = sess.data();
      tx.update(sessRef, { status: "done", checkoutAt: Date.now(), amount: o.amount, method: b.payment_type });
      tx.set(db.collection("transactions").doc(), {
        sessionId: o.sessionId, uid: o.uid, locationId: s.locationId,
        amount: o.amount, method: b.payment_type, paidAt: Date.now(),
      });
      const locRef = db.collection("locations").doc(s.locationId);
      const loc = await tx.get(locRef);
      if (loc.exists) {
        const key = s.vehicle.type === "mobil" ? "occCar" : "occMotor";
        tx.update(locRef, { [key]: Math.max(0, (loc.data()[key] || 0) - 1) });
      }
    }
  });
}
```

> Ingat catatan `PAYMENT-SETUP.md` §5c soal urutan `tx.get()`/`tx.update()` di cabang `parking` — perbaiki sekalian saat menyalin (semua pembacaan sebelum tulisan pertama), jangan dibiarkan seperti draft aslinya.

`reconcile.js` (§5d `PAYMENT-SETUP.md`) memanggil `terapkan()` yang sama — otomatis ikut menangani order top up yang webhook-nya hilang, tanpa perubahan apa pun di berkas itu.

---

## Langkah 5 — Fungsi baru: `checkout-qupay.js`

Ini yang menggantikan `DB.wallet.set(u.uid, sisa)` di `status.js` — memindahkan pemotongan saldo ke server, dalam satu transaksi Firestore supaya tidak balapan.

```js
// netlify/functions/checkout-qupay.js
const { admin, db, cors, json, hitungTarif } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const idToken = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!idToken) return json(401, { error: "unauthenticated" });
    const { uid } = await admin.auth().verifyIdToken(idToken);

    const { sessionId } = JSON.parse(event.body || "{}");
    if (!sessionId) return json(400, { error: "sessionId_required" });

    const sessRef = db.collection("sessions").doc(sessionId);
    const userRef = db.collection("users").doc(uid);

    const hasil = await db.runTransaction(async (tx) => {
      // Semua get() DULU, sebelum tulisan pertama — batasan transaksi Firestore.
      const [sess, user] = await Promise.all([tx.get(sessRef), tx.get(userRef)]);
      if (!sess.exists) throw new Error("session_not_found");
      const s = sess.data();
      if (s.uid !== uid) throw new Error("forbidden");
      if (s.status !== "active") throw new Error("session_not_active");

      const amount = hitungTarif(s.vehicle.type, Date.now() - s.checkinAt);
      const saldo = user.data()?.wallet ?? 0;
      if (saldo < amount) throw new Error("saldo_kurang");

      const locRef = db.collection("locations").doc(s.locationId);
      const loc = await tx.get(locRef);

      // Dari titik ini baru boleh menulis.
      tx.update(userRef, { wallet: admin.firestore.FieldValue.increment(-amount) });
      tx.update(sessRef, { status: "done", checkoutAt: Date.now(), amount, method: "qupay" });
      tx.set(db.collection("transactions").doc(), {
        sessionId, uid, locationId: s.locationId, amount, method: "qupay", paidAt: Date.now(),
      });
      if (loc.exists) {
        const key = s.vehicle.type === "mobil" ? "occCar" : "occMotor";
        tx.update(locRef, { [key]: Math.max(0, (loc.data()[key] || 0) - 1) });
      }
      return { amount, sisa: saldo - amount };
    });

    return json(200, hasil);
  } catch (e) {
    // Pesan e.message ("saldo_kurang", "session_not_active", ...) aman ditampilkan
    // ke pengguna — tidak membocorkan apa pun, hanya kode alasan yang sudah didefinisikan di atas.
    const kode = { session_not_found: 404, forbidden: 403, session_not_active: 409, saldo_kurang: 402 }[e.message];
    if (kode) return json(kode, { error: e.message });
    console.error(e);
    return json(500, { error: "internal" });
  }
};
```

**Kenapa pengecekan saldo harus di DALAM transaksi**, bukan dibaca sekali lalu dipercaya: dua tab yang menutup sesi berbeda dengan metode QuPay di saat bersamaan, keduanya membaca saldo Rp 15.000 sebelum salah satu sempat menulis, keduanya menganggap cukup untuk tagihan Rp 10.000 masing-masing — hasil akhir saldo minus Rp 5.000 kalau dicek di luar transaksi. Firestore transaction menjamin `tx.get(userRef)` di dalam sini melihat versi yang sudah termutakhirkan bila ada penulisan lain yang menyerobot lebih dulu; salah satu percobaan otomatis diulang oleh Firestore sampai konsisten.

---

## Langkah 6 — Ubah sisi klien

### 6a. `public/js/config.js`

```js
export const paymentConfig = {
  provider: "midtrans",
  midtransClientKey: "SB-Mid-client-xxxxxxxxxxxx",
  snapUrl: "https://app.sandbox.midtrans.com/snap/snap.js",
  apiBase: "https://quparkir-pay.netlify.app/.netlify/functions",   // sama dengan PAYMENT-SETUP.md §6a
};
```

Kalau sudah mengikuti `PAYMENT-SETUP.md` untuk alur bayar parkir, berkas ini sudah begini — tidak ada tambahan khusus wallet di sini.

### 6b. `public/js/pay.js` — tambah `payTopup()`

`payQRIS()`/`payMidtrans()` yang sudah ada (dan akan dibangun sesuai `PAYMENT-SETUP.md` §6c) ditujukan untuk **membayar sesi parkir** — mengandalkan `sessionId`. Top up tidak punya sesi, jadi butuh fungsi tersendiri yang memanggil `topup-create` dan menunggu `orders/{id}` berubah jadi `paid`, sama seperti pola `tungguLunas()`:

```js
// tambahan di public/js/pay.js
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function payTopup({ amount }) {
  await loadSnap();   // fungsi yang sama dari PAYMENT-SETUP.md §6c

  const idToken = await getAuth().currentUser.getIdToken();
  const res = await fetch(`${paymentConfig.apiBase}/topup-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error("Gagal membuat transaksi top up");
  const { orderId, token } = await res.json();   // body hanya bisa dibaca sekali — jangan panggil res.json() dua kali

  window.snap.pay(token);   // callback-nya hanya untuk tampilan, sama seperti payMidtrans()

  return new Promise((resolve) => {
    const unsub = onSnapshot(doc(getFirestore(), "orders", orderId), (snap) => {
      const st = snap.data()?.status;
      if (st === "paid")   { unsub(); resolve(true); }
      if (st === "failed") { unsub(); resolve(false); }
    });
  });
}
```

### 6c. `public/js/data.js` — saldo jadi LIVE, bukan sekali baca

Saat ini `wallet.get()` hanya membaca sekali (`getDoc`) — begitu webhook mengkredit saldo, layar tidak berubah sampai halaman dimuat ulang. Samakan dengan `DB.locations`/`DB.sessions` yang sudah memakai `onSnapshot`:

```js
// backend Firebase di data.js — GANTI wallet.get() jadi wallet.subscribe()
wallet: {
  subscribe: (u, cb) => onSnapshot(doc(db, "users", u), (snap) => cb(snap.data()?.wallet ?? 0)),
  // set() DIHAPUS dari backend Firebase — Rules sekarang menolaknya (Langkah 1),
  // dan penulisan saldo hanya boleh lewat webhook (top up) atau checkout-qupay (bayar).
},

// panggilan server, bukan tulis Firestore langsung
async checkoutQupay(sessionId) {
  const idToken = await getAuth().currentUser.getIdToken();
  const res = await fetch(`${paymentConfig.apiBase}/checkout-qupay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ sessionId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error === "saldo_kurang" ? "Saldo tidak cukup" : "Gagal memproses pembayaran");
  return body;   // { amount, sisa }
},
```

> Backend **demo** (localStorage) tidak berubah — `wallet.get/set` di sana tetap sinkron seperti sekarang, karena tidak ada uang sungguhan yang perlu diverifikasi (lihat §8).

### 6d. `public/js/pages/akun.js` — `topUpModal()`

```js
// SEBELUM
const ok = await payQRIS({ amount, title: "Top Up QuPay" });
if (!ok) return toast("Top up dibatalkan", "err");
const cur = await Promise.resolve(DB.wallet.get(u.uid));
await DB.wallet.set(u.uid, cur + amount);
toast("Top up berhasil", "ok");
render();

// SESUDAH — klien tidak lagi menghitung/menulis saldo sendiri
const ok = MODE === "firebase"
  ? await payTopup({ amount })
  : await payQRIS({ amount, title: "Top Up QuPay" });   // demo tetap simulasi lama
if (!ok) return toast("Top up dibatalkan / gagal", "err");
if (MODE !== "firebase") {
  // hanya demo: tidak ada webhook yang mengkredit, jadi tulis langsung di sini
  const cur = await Promise.resolve(DB.wallet.get(u.uid));
  await DB.wallet.set(u.uid, cur + amount);
}
toast("Top up berhasil", "ok");
// TIDAK perlu render() paksa — kalau halaman Akun sudah memakai DB.wallet.subscribe(),
// saldo di layar naik sendiri begitu webhook selesai memproses.
```

Import tambahan: `payTopup` dari `pay.js`.

### 6e. `public/js/pages/status.js` — `doCheckout()`, cabang QuPay

Berkas ini belum mengimpor `MODE` — tambahkan ke baris impor `data.js` yang sudah ada:

```js
import { DB, MODE } from "../data.js";   // MODE baru ditambahkan
```

```js
// SEBELUM (baca-ubah-tulis dari klien, lihat §1)
if (method === "qupay") {
  const fresh = await Promise.resolve(DB.wallet.get(u.uid));
  if (fresh < z.amount) { ... }
  else { sisa = fresh - z.amount; await DB.wallet.set(u.uid, sisa); }
}

// SESUDAH — server yang memutuskan & mengeksekusi sekaligus
if (method === "qupay" && MODE === "firebase") {
  const hasil = await DB.checkoutQupay(s.id);   // sudah termasuk checkout, TIDAK panggil DB.checkout() lagi
  sisa = hasil.sisa;
} else {
  // demo, atau method === "qris" — alur lama tidak berubah
  const z = await DB.checkout(s.id, { method });
  ...
}
```

> Perhatikan: untuk `MODE === "firebase"` dan `method === "qupay"`, `checkout-qupay.js` di server **sudah** menutup sesi (`status: "done"`) sekaligus dalam transaksi yang sama — jangan panggil `DB.checkout()` lagi sesudahnya, itu akan mencoba menutup sesi yang sudah tertutup.

---

## 7. Skenario uji yang wajib lulus

| # | Uji | Hasil yang benar |
|---|---|---|
| 1 | Top up normal sampai selesai | `orders.status = paid`, saldo bertambah **tanpa refresh manual** (lewat `onSnapshot`) |
| 2 | Tutup browser tepat setelah bayar top up | Saldo tetap bertambah — webhook, bukan klien, yang menentukan |
| 3 | Dua top up beruntun cepat (klik top up lagi sebelum yang pertama selesai) | Dua order terpisah, keduanya kredit dengan benar — tidak ada yang tertimpa (dijamin `increment()`) |
| 4 | Coba `DB.wallet.set(uid, 999999999)` langsung dari console browser | `permission-denied` dari Firestore Rules |
| 5 | Checkout QuPay dua sesi berbeda hampir bersamaan (dua tab, saldo hanya cukup untuk satu) | Satu berhasil, satu gagal dengan pesan "Saldo tidak cukup" — **tidak ada saldo minus** |
| 6 | Klik tombol "Check-out & Bayar" dua kali cepat pada sesi & metode yang sama | Saldo terpotong **satu kali** (sesi kedua kalinya gagal "session_not_active") |
| 7 | Nominal top up dikirim `-50000` atau `0.5` langsung ke `topup-create` (lewat curl/DevTools, lewati UI) | Ditolak `400 amount_out_of_range` |
| 8 | Webhook top up terkirim dua kali untuk `order_id` yang sama (simulasi retry Midtrans) | Saldo bertambah **sekali saja** — dijaga baris `if (o.status === "paid") return;` |

Uji 3, 5, dan 8 adalah inti dari kenapa dokumen ini ada — ketiganya persis yang gagal di implementasi klien-langsung yang berjalan sekarang.

---

## 8. Mode DEMO tetap seperti sekarang

Semua di atas **hanya berlaku saat `MODE === "firebase"`** (Netlify Functions terpasang, `paymentConfig.provider === "midtrans"`). Mode demo (localStorage, tanpa config Firebase) tetap seperti sebelumnya:

- Saldo awal Rp 25.000 tetap muncul begitu saja — memang untuk uji coba/demo, bukan uang sungguhan.
- `payQRIS()` simulasi ("Saya sudah bayar") tetap dipakai untuk top up **dan** bayar parkir.
- `DB.wallet.set()` tetap ada dan tetap ditulis langsung dari klien — tidak ada yang perlu "diamankan" karena tidak ada uang sungguhan yang bisa dicuri.

Jangan menghapus jalur demo ini — itu yang membuat aplikasi tetap bisa dijalankan dan didemokan tanpa akun Midtrans/Netlify sama sekali (lihat `public/js/config.js`: `USE_FIREBASE` otomatis `false` selama `firebaseConfig` masih placeholder).

---

## 9. Urutan pengerjaan

| # | Langkah | Bisa dimulai |
|---|---------|--------------|
| 1 | `PAYMENT-SETUP.md` Langkah 1–7 (kalau belum) — akun Midtrans, service account, proyek Netlify, `create-payment`/`midtrans-webhook`/`reconcile` sudah jalan untuk bayar parkir | Prasyarat dokumen ini |
| 2 | Tutup lubang `wallet` di `firestore.rules` (§Langkah 1 di sini) | Sekarang, tidak menunggu apa pun |
| 3 | Tambah `topup-create.js` + cabang `type` di `midtrans-webhook.js` (§Langkah 2–4) | Setelah 2 |
| 4 | Tambah `checkout-qupay.js` (§Langkah 5) | Paralel dengan 3 |
| 5 | Ubah klien: `pay.js`, `data.js`, `akun.js`, `status.js` (§Langkah 6) | Setelah 3–4 di-deploy ke Netlify |
| 6 | Jalankan semua skenario di §7 di sandbox | Setelah 5 |
| 7 | Naik produksi — ikuti `PAYMENT-SETUP.md` §Langkah 9 (kunci sandbox → produksi) sekaligus untuk dua alur (top up & bayar parkir), keduanya pakai kunci yang sama | Setelah 6 lulus semua |

---

## 10. Sumber

- [Firestore — Transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions) — urutan `get()` sebelum `set()`/`update()`, dan kenapa transaksi otomatis diulang saat ada konflik
- [Firestore — `FieldValue.increment()`](https://firebase.google.com/docs/reference/js/firestore_.fieldvalue.md#fieldvalueincrement) — penambahan/pengurangan atomik, aman dari race condition tanpa perlu transaksi eksplisit untuk kasus sederhana
- [Midtrans — HTTP(S) Notification / Webhooks](https://docs.midtrans.com/docs/https-notification-webhooks)
- Lihat juga daftar sumber lengkap di [`PAYMENT.md`](./PAYMENT.md#8-sumber) dan [`PAYMENT-SETUP.md`](./PAYMENT-SETUP.md#sumber) — semuanya berlaku sama untuk dokumen ini.

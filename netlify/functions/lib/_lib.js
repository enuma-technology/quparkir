// ============================================================
// Berkas bersama seluruh function pembayaran.
//
// Letaknya di subfolder lib/ dengan awalan garis bawah SENGAJA: setiap berkas
// .js yang duduk langsung di netlify/functions/ akan dideploy sebagai endpoint
// tersendiri. Berkas ini bukan endpoint — ia tidak boleh bisa dipanggil orang.
// Subfolder tanpa index.js tidak pernah dijadikan function oleh Netlify, jadi
// isinya hanya ikut terbundel ke function yang mengimpornya.
//
// Gaya modulnya ESM + Functions API v2 (Request/Response standar), mengikuti
// hello.js yang sudah terbukti jalan di proyek ini. Panduan di
// docs/PAYMENT-SETUP.md §5 masih memakai gaya v1 (exports.handler) — kalau
// keduanya dicampur dalam satu berkas, Netlify hanya menjalankan salah satu
// dan galatnya tidak menyebut penyebabnya.
// ============================================================
import crypto from "node:crypto";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
// firebase-admin/auth TIDAK dipakai sama sekali — lihat uidDariToken().

// "\n" di environment variable tersimpan sebagai dua karakter biasa, bukan
// baris baru. Ini penyebab kegagalan init paling sering.
const privateKey = (process.env.FB_PRIVATE_KEY || "").replace(/\\n/g, "\n");

// FIRESTORE_EMULATOR_HOST hanya diset oleh uji lokal, TIDAK PERNAH di Netlify.
// Saat ia ada, firebase-admin bicara ke emulator dan kredensial sungguhan tidak
// diperlukan sama sekali — uji webhook jadi bisa dijalankan tanpa menyentuh
// berkas rahasia mana pun, dan tanpa risiko menulis ke Firestore produksi.
const pakaiEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

export const app =
  getApps()[0] ||
  initializeApp(
    pakaiEmulator
      ? { projectId: process.env.FB_PROJECT_ID || "quparkir" }
      : {
          credential: cert({
            projectId: process.env.FB_PROJECT_ID,
            clientEmail: process.env.FB_CLIENT_EMAIL,
            privateKey,
          }),
        }
  );

export const db = getFirestore(app);
export { FieldValue };

// ---------- SAKLAR ----------
// Satu env var menentukan apakah jalur Midtrans hidup. Nilai selain "true"
// (termasuk belum diset sama sekali) = MATI, dan create-payment menolak dengan
// 503 sebelum menyentuh apa pun. Jalur QRIS merchant yang sudah terbukti tidak
// melewati kode ini sedikit pun, jadi ia tidak bisa ikut rusak.
//
// Webhook SENGAJA tidak ikut dimatikan saklar ini: kalau saklar dimatikan
// selagi ada uang yang sudah telanjur dibayar, notifikasinya tetap harus
// diterima dan sesinya tetap harus ditutup.
export const MIDTRANS_AKTIF = process.env.MIDTRANS_ENABLED === "true";

const isProd = process.env.MIDTRANS_IS_PRODUCTION === "true";

export const MIDTRANS = {
  isProd,
  snap: isProd
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions",
  // snap.js yang dimuat browser — dikirim ke klien lewat payment-config
  snapUrl: isProd
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js",
  status: (orderId) =>
    isProd
      ? `https://api.midtrans.com/v2/${encodeURIComponent(orderId)}/status`
      : `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(orderId)}/status`,
};

// Midtrans memakai Basic Auth: username = Server Key, password kosong.
export const authHeader = () =>
  "Basic " + Buffer.from((process.env.MIDTRANS_SERVER_KEY || "") + ":").toString("base64");

// ---------- HTTP ----------
// Klien hidup di quparkir.web.app, function di *.netlify.app → beda origin,
// dan header Authorization memicu preflight. Daftar putihnya eksplisit;
// "*" tidak dipakai karena permintaannya membawa token Firebase.
const ORIGIN_LOKAL = [
  "http://localhost:8888", "http://127.0.0.1:8888",
  "http://localhost:5000", "http://127.0.0.1:5000",
  "http://localhost:8080", "http://127.0.0.1:8080",
];
export function corsHeaders(req) {
  const izin = [process.env.ALLOWED_ORIGIN, ...ORIGIN_LOKAL].filter(Boolean);
  const asal = req?.headers?.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": izin.includes(asal) ? asal : (izin[0] || "null"),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export const json = (req, status, body) =>
  Response.json(body, { status, headers: corsHeaders(req) });

// Body WAJIB null. `new Response("", { status: 204 })` melempar TypeError —
// status 204/205/304 tidak boleh membawa body — dan karena galat itu terjadi
// di dalam handler, Netlify membalas 502 TANPA header CORS. Gejalanya di
// peramban menyesatkan total: "No 'Access-Control-Allow-Origin' header",
// seolah daftar origin yang salah. Akibatnya seluruh jalur gateway diam-diam
// mundur ke QRIS merchant selama dua deploy.
export const preflight = (req) =>
  new Response(null, { status: 204, headers: corsHeaders(req) });

// ---------- Tarif ----------
// ⚠️ SALINAN dari public/js/util.js — versi INI yang menentukan tagihan, karena
// angka dari browser tidak pernah dipercaya. Kalau tarif di util.js diubah,
// ubah juga di sini (dan di firestore.rules, yang memakai bentuk perkaliannya).
export function hitungTarif(type, ms) {
  const jam = Math.max(1, Math.ceil(ms / 3600000));
  return type === "mobil" ? 3000 + (jam - 1) * 2000 : 2000 + (jam - 1) * 1000;
}

// Saldo awal saat field 'wallet' belum ada. HARUS sama dengan DB.wallet.get()
// di public/js/data.js (`?? 25000`) dan dengan default di firestore.rules —
// kalau berbeda, saldo tampak 25.000 di layar tapi dianggap 0 saat membayar.
export const SALDO_DEFAULT = 25000;

// ---------- Identitas ----------
//
// Token Firebase diverifikasi SENDIRI di sini, memakai crypto bawaan Node —
// bukan lewat admin.auth().verifyIdToken().
//
// Kenapa: firebase-admin/auth menarik jwks-rsa → jose, dan rantai itu sudah
// dua kali meruntuhkan function ini di Netlify. Yang kedua paling jahat:
// pemuatan modulnya gagal DI DALAM blok try, sehingga terlaporkan sebagai
// "token ditolak" — gejalanya sama persis dengan token yang memang salah,
// dan setiap pembayaran mundur diam-diam ke QRIS merchant. Token yang benar
// pun ditolak, dan tidak ada satu pesan pun yang menunjuk sebab sebenarnya.
//
// Yang diperiksa di bawah adalah seluruh syarat yang diperiksa Firebase:
// tanda tangan RS256 terhadap sertifikat publik Google yang cocok kid-nya,
// alg, aud, iss, exp, iat, dan sub. Melewatkan satu saja membuat verifikasi
// ini teater belaka — token buatan siapa pun akan lolos.
const SERTIFIKAT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let sertifikat = null, sertifikatKedaluwarsa = 0;

async function ambilSertifikat() {
  // Kontainer Netlify dipakai ulang, jadi cache ini bertahan antar-permintaan.
  // Google memutar kuncinya harian; max-age dari responsnya yang menentukan,
  // bukan angka yang dikarang sendiri.
  if (sertifikat && Date.now() < sertifikatKedaluwarsa) return sertifikat;
  const res = await fetch(SERTIFIKAT_URL);
  if (!res.ok) throw new Error("sertifikat_google_http_" + res.status);
  const cc = res.headers.get("cache-control") || "";
  const maks = Number((cc.match(/max-age=(\d+)/) || [])[1] || 3600);
  sertifikat = await res.json();
  sertifikatKedaluwarsa = Date.now() + maks * 1000;
  return sertifikat;
}

const dariB64url = (t) => Buffer.from(t.replace(/-/g, "+").replace(/_/g, "/"), "base64");

// Mengembalikan uid, atau null bila token tidak sah. Alasannya dicatat ke log
// dengan kode pendek supaya bisa dibedakan di dasbor Netlify.
export async function uidDariToken(req) {
  const raw = req.headers.get("authorization") || "";
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const proyek = process.env.FB_PROJECT_ID;
  const bagian = token.split(".");
  if (bagian.length !== 3) { console.warn("Token ditolak: bukan_jwt"); return null; }

  let kepala, isi;
  try {
    kepala = JSON.parse(dariB64url(bagian[0]).toString("utf8"));
    isi = JSON.parse(dariB64url(bagian[1]).toString("utf8"));
  } catch { console.warn("Token ditolak: rusak"); return null; }

  const sekarang = Math.floor(Date.now() / 1000);
  const TOLERANSI = 60;   // jam server tidak identik dengan jam peramban

  if (isi.aud !== proyek) { console.warn("Token ditolak: aud_salah"); return null; }
  if (isi.iss !== "https://securetoken.google.com/" + proyek) { console.warn("Token ditolak: iss_salah"); return null; }
  if (!isi.sub || typeof isi.sub !== "string" || isi.sub.length > 128) { console.warn("Token ditolak: sub_kosong"); return null; }
  if (!(isi.exp > sekarang - TOLERANSI)) { console.warn("Token ditolak: kedaluwarsa"); return null; }
  if (!(isi.iat <= sekarang + TOLERANSI)) { console.warn("Token ditolak: belum_berlaku"); return null; }

  // Auth Emulator menerbitkan token TANPA tanda tangan (alg "none"). Jalur ini
  // hanya hidup bila FIREBASE_AUTH_EMULATOR_HOST diset, dan variabel itu tidak
  // pernah ada di Netlify — dipakai uji lokal saja.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) return isi.sub;

  if (kepala.alg !== "RS256") { console.warn("Token ditolak: alg_" + kepala.alg); return null; }
  if (!kepala.kid) { console.warn("Token ditolak: tanpa_kid"); return null; }

  try {
    const semua = await ambilSertifikat();
    const pem = semua[kepala.kid];
    if (!pem) { console.warn("Token ditolak: kid_tak_dikenal"); return null; }
    const publik = new crypto.X509Certificate(pem).publicKey;
    const sah = crypto.verify(
      "RSA-SHA256",
      Buffer.from(bagian[0] + "." + bagian[1], "utf8"),
      publik,
      dariB64url(bagian[2]),
    );
    if (!sah) { console.warn("Token ditolak: tanda_tangan"); return null; }
    return isi.sub;
  } catch (e) {
    console.warn("Token ditolak: galat_verifikasi", e.message);
    return null;
  }
}

export async function adalahAdmin(uid) {
  if (!uid) return false;
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists && snap.data().role === "admin";
}

// ---------- Inti: menerapkan status pembayaran ----------
// Dipakai webhook (sumber: notifikasi Midtrans, tanda tangannya sudah
// diverifikasi pemanggil) DAN reconcile (sumber: Get Status API, kita sendiri
// yang memanggil). Karena itu fungsi ini TIDAK memeriksa tanda tangan — yang
// memanggil wajib sudah memastikan datanya sah.
//
// Idempoten: aman dijalankan berkali-kali untuk order yang sama. Midtrans
// memang mengirim ulang notifikasi, dan reconcile bisa berpapasan dengan
// webhook yang sedang berjalan.
const lunas = (b) =>
  ["settlement", "capture"].includes(b.transaction_status) &&
  (!b.fraud_status || b.fraud_status === "accept");

const GAGAL = ["expire", "cancel", "deny", "failure"];

export async function terapkanStatus(b) {
  const orderId = String(b.order_id || "");
  if (!orderId) return "order_id_kosong";
  const orderRef = db.collection("orders").doc(orderId);

  return db.runTransaction(async (tx) => {
    // ── SELURUH PEMBACAAN LEBIH DULU ──────────────────────────────────
    // Firestore menolak tx.get() yang datang setelah tx.update()/tx.set()
    // pertama. Panduan §5c melanggar ini pada pembacaan lokasi; di sini
    // ketiganya sengaja dikumpulkan di atas.
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      console.warn("Order tak dikenal:", orderId);
      return "order_tak_dikenal";
    }
    const o = orderSnap.data();
    if (o.status === "paid") return "sudah_lunas";      // ← kunci idempotensi

    const bersih = { ...b };
    delete bersih.signature_key;    // jangan simpan turunan server key

    if (!lunas(b)) {
      tx.update(orderRef, {
        status: GAGAL.includes(b.transaction_status) ? "failed" : "pending",
        notifikasiTerakhir: bersih,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return GAGAL.includes(b.transaction_status) ? "gagal" : "menunggu";
    }

    // Nominal yang dibayar HARUS sama dengan yang ditagih.
    if (Math.round(Number(b.gross_amount)) !== o.amount) {
      console.error("Nominal tidak cocok:", orderId, b.gross_amount, o.amount);
      tx.update(orderRef, {
        status: "mismatch",
        notifikasiTerakhir: bersih,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "nominal_tidak_cocok";
    }

    // ── Order TOP UP: tidak ada sesi parkir, yang bertambah adalah saldo ──
    if (o.jenis === "topup") {
      const userRef = db.collection("users").doc(o.uid);
      const userSnap = await tx.get(userRef);      // dibaca untuk nama saja

      tx.update(orderRef, {
        status: "paid",
        paidAt: FieldValue.serverTimestamp(),
        midtransTransactionId: b.transaction_id || null,
        paymentType: b.payment_type || null,
        notifikasiTerakhir: bersih,
        updatedAt: FieldValue.serverTimestamp(),
      });
      // increment(), bukan baca-lalu-tulis: dua top up yang selesai nyaris
      // bersamaan tidak boleh saling menimpa.
      tx.set(userRef, { wallet: FieldValue.increment(o.amount) }, { merge: true });
      // Dicatat juga di /topups supaya muncul di riwayat pengguna dan di panel
      // petugas — bentuknya sama seperti top up manual yang disetujui, hanya
      // yang menyetujui adalah sistem.
      tx.set(db.collection("topups").doc(), {
        uid: o.uid,
        name: userSnap.exists ? (userSnap.data().name || "") : "",
        amount: o.amount,
        method: "midtrans",
        channel: b.payment_type || null,
        status: "approved",
        handledBy: "sistem",
        handledAt: Date.now(),
        createdAt: Date.now(),
        orderId,
      });
      return "topup_lunas";
    }

    const sessRef = db.collection("sessions").doc(o.sessionId);
    const sessSnap = await tx.get(sessRef);
    const s = sessSnap.exists ? sessSnap.data() : null;
    const tutupSesi = !!s && s.status === "active";

    let locRef = null, locSnap = null;
    if (tutupSesi && s.locationId) {
      locRef = db.collection("locations").doc(s.locationId);
      locSnap = await tx.get(locRef);
    }

    // ── BARU MENULIS ──────────────────────────────────────────────────
    const saatIni = Date.now();
    tx.update(orderRef, {
      status: "paid",
      paidAt: FieldValue.serverTimestamp(),
      midtransTransactionId: b.transaction_id || null,
      paymentType: b.payment_type || null,
      notifikasiTerakhir: bersih,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (tutupSesi) {
      tx.update(sessRef, {
        status: "done",
        checkoutAt: saatIni,
        amount: o.amount,
        // 'qris' supaya riwayat & dashboard membacanya seperti pembayaran
        // QRIS lain; kanal aslinya disimpan terpisah agar tetap jujur.
        method: "qris",
        gateway: "midtrans",
        channel: b.payment_type || null,
      });
      tx.set(db.collection("transactions").doc(), {
        sessionId: o.sessionId,
        uid: o.uid,
        locationId: s.locationId,
        amount: o.amount,
        method: "qris",
        gateway: "midtrans",
        channel: b.payment_type || null,
        orderId,
        paidAt: saatIni,
      });
      // Kunci anti double-parking dilepas — kalau tidak, pengguna tidak bisa
      // check-in lagi meski parkirnya sudah selesai dan lunas.
      tx.set(db.collection("users").doc(o.uid), { activeSession: null }, { merge: true });
      if (locSnap && locSnap.exists) {
        const key = s.vehicle?.type === "mobil" ? "occCar" : "occMotor";
        tx.update(locRef, { [key]: Math.max(0, (locSnap.data()[key] || 0) - 1) });
      }
    }

    return tutupSesi ? "lunas_sesi_ditutup" : "lunas";
  });
}

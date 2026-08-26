// ============================================================
// POST /.netlify/functions/create-topup   { amount }
//
// Membuat order Snap untuk TOP UP saldo QuPay. Saldo bertambah bukan di sini,
// melainkan di midtrans-webhook setelah Midtrans memastikan uangnya masuk —
// itu bedanya dengan jalur lama, di mana pengguna menekan "saya sudah bayar"
// lalu admin harus mencocokkan sendiri di panel /admin.
//
// Nominal di sini MEMANG datang dari klien (tidak seperti tarif parkir yang
// diturunkan dari checkinAt) — pengguna bebas memilih mau mengisi berapa. Yang
// dijaga bukan angkanya, tapi kesamaan angka: order menyimpan nominal yang
// ditagihkan, dan webhook menolak kalau gross_amount yang dibayar berbeda.
// ============================================================
import {
  db, FieldValue, MIDTRANS, midtransAktif, authHeader, WEBHOOK_URL,
  json, preflight, uidDariToken,
} from "./lib/_lib.js";

// Sama dengan TOPUP_MIN/TOPUP_MAX di public/js/pages/akun.js dan dengan batas
// di firestore.rules untuk koleksi /topups.
const MIN = 10000, MAKS = 1000000;

export default async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  if (!midtransAktif() || !process.env.MIDTRANS_SERVER_KEY)
    return json(req, 503, { error: "midtrans_disabled" });

  try {
    const uid = await uidDariToken(req);
    if (!uid) return json(req, 401, { error: "unauthenticated" });

    let body = {};
    try { body = await req.json(); } catch { /* body kosong/rusak */ }
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount < MIN || amount > MAKS)
      return json(req, 400, { error: "amount_invalid", min: MIN, max: MAKS });

    // Order pending dengan nominal yang sama dipakai ulang — pengguna yang
    // menekan Top Up dua kali tidak boleh punya dua tagihan kembar. Nominal
    // berbeda tetap jadi order sendiri: itu memang niat yang berbeda.
    // Dibungkus try: empat filter kesetaraan dilayani gabungan indeks bawaan,
    // tapi kalau suatu saat Firestore menuntut indeks komposit, kegagalan
    // pencarian ini tidak boleh ikut menggagalkan top up-nya — paling buruk
    // pengguna dapat order baru, dan yang lama kedaluwarsa sendiri.
    try {
      const lama = await db.collection("orders")
        .where("uid", "==", uid)
        .where("jenis", "==", "topup")
        .where("status", "==", "pending")
        .where("amount", "==", amount)
        .limit(1).get();
      if (!lama.empty && lama.docs[0].data().snapToken) {
        const d = lama.docs[0];
        return json(req, 200, { orderId: d.id, token: d.data().snapToken, amount, reused: true });
      }
    } catch (e) {
      console.warn("Pencarian order top up pending gagal:", e.message);
    }

    const orderId = ("TU-" + uid + "-" + Date.now()).replace(/[^A-Za-z0-9_.~-]/g, "").slice(0, 50);

    await db.collection("orders").doc(orderId).set({
      uid, jenis: "topup", amount,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    const res = await fetch(MIDTRANS.snap, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authHeader(),
        // Alamat webhook untuk transaksi INI. Tanpa ini, Midtrans hanya tahu
        // alamat yang diisi di dasbor — dan kalau kosong, pembayaran berhasil
        // tapi tidak ada yang memberitahu kita.
        "X-Override-Notification": WEBHOOK_URL,
      },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: amount },
        item_details: [{ id: "topup", price: amount, quantity: 1, name: "Top Up Saldo QuPay" }],
        enabled_payments: ["gopay", "qris", "other_qris", "shopeepay"],
        expiry: { unit: "minutes", duration: 30 },
      }),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 500);
      console.error("Snap top up gagal:", res.status, detail);
      await db.collection("orders").doc(orderId).update({ status: "failed", error: detail });
      return json(req, 502, { error: "gateway_error" });
    }

    const { token } = await res.json();
    await db.collection("orders").doc(orderId).update({ snapToken: token });

    return json(req, 200, { orderId, token, amount });
  } catch (e) {
    console.error("create-topup:", e);
    return json(req, 500, { error: "internal" });
  }
};

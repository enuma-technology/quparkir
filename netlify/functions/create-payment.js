// ============================================================
// POST /.netlify/functions/create-payment   { sessionId }
//
// Membuat order + token Snap. Klien HANYA mengirim sessionId — nominalnya
// dihitung di sini dari checkinAt yang tersimpan di Firestore, jadi mengubah
// angka di DevTools tidak berpengaruh apa pun.
// ============================================================
import {
  db, FieldValue, MIDTRANS, MIDTRANS_AKTIF, authHeader,
  hitungTarif, json, preflight, uidDariToken,
} from "./lib/_lib.js";

export default async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  // SAKLAR: selama MIDTRANS_ENABLED belum "true", endpoint ini tidak pernah
  // menyentuh Firestore maupun Midtrans. Klien menangkap 503 ini dan mundur
  // ke QRIS merchant yang sudah terbukti.
  if (!MIDTRANS_AKTIF || !process.env.MIDTRANS_SERVER_KEY)
    return json(req, 503, { error: "midtrans_disabled" });

  try {
    const uid = await uidDariToken(req);
    if (!uid) return json(req, 401, { error: "unauthenticated" });

    let body = {};
    try { body = await req.json(); } catch { /* body kosong/rusak */ }
    const sessionId = String(body.sessionId || "");
    if (!sessionId) return json(req, 400, { error: "sessionId_required" });

    const sessRef = db.collection("sessions").doc(sessionId);
    const sess = await sessRef.get();
    if (!sess.exists) return json(req, 404, { error: "session_not_found" });

    const s = sess.data();
    if (s.uid !== uid) return json(req, 403, { error: "forbidden" });
    if (s.status !== "active") return json(req, 409, { error: "session_not_active" });

    const amount = hitungTarif(s.vehicle?.type, Date.now() - s.checkinAt);

    // Pakai ulang order yang masih pending — tombol Bayar yang ditekan dua kali
    // tidak boleh melahirkan dua tagihan. Dua filter kesetaraan seperti ini
    // dilayani gabungan indeks bawaan, jadi tidak perlu indeks komposit.
    const lama = await db.collection("orders")
      .where("sessionId", "==", sessionId)
      .where("status", "==", "pending")
      .limit(1).get();
    if (!lama.empty) {
      const d = lama.docs[0];
      const o = d.data();
      if (o.snapToken)
        return json(req, 200, { orderId: d.id, token: o.snapToken, amount: o.amount, reused: true });
      // Order tercatat tapi token tidak pernah sampai (panggilan Snap putus di
      // tengah). Tandai gagal supaya tidak menghalangi order baru selamanya.
      await d.ref.update({ status: "failed", error: "token_tidak_pernah_terbit" });
    }

    // order_id Midtrans: maks 50 karakter, hanya alfanumerik dan -_~.
    // Wajib unik SELAMANYA — order_id yang pernah dipakai ditolak, termasuk
    // yang transaksinya gagal. Karena itu stempel waktu ikut disertakan.
    const orderId = ("QP-" + sessionId + "-" + Date.now())
      .replace(/[^A-Za-z0-9_.~-]/g, "").slice(0, 50);

    // Dicatat SEBELUM memanggil Midtrans: kalau panggilannya putus di tengah,
    // jejaknya tetap ada dan bisa disapu reconcile.
    await db.collection("orders").doc(orderId).set({
      uid, sessionId, amount,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

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
          id: String(s.locationId || "parkir"),
          price: amount,
          quantity: 1,
          name: ("Parkir " + (s.vehicle?.type || "") + " - " + (s.locationName || "")).slice(0, 50),
        }],
        customer_details: { first_name: (s.vehicle?.plate || "Pelanggan").slice(0, 20) },
        enabled_payments: ["gopay", "qris", "other_qris", "shopeepay"],
        expiry: { unit: "minutes", duration: 30 },
      }),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 500);
      console.error("Snap gagal:", res.status, detail);
      await db.collection("orders").doc(orderId).update({ status: "failed", error: detail });
      return json(req, 502, { error: "gateway_error" });
    }

    const { token, redirect_url } = await res.json();
    await db.collection("orders").doc(orderId).update({ snapToken: token, redirectUrl: redirect_url || null });

    return json(req, 200, { orderId, token, amount });
  } catch (e) {
    console.error("create-payment:", e);
    return json(req, 500, { error: "internal" });
  }
};

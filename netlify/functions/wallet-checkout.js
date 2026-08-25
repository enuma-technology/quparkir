// ============================================================
// POST /.netlify/functions/wallet-checkout   { sessionId }
//
// Bayar parkir memakai saldo QuPay — SELURUHNYA di server, dalam SATU
// transaksi Firestore.
//
// Kenapa harus pindah ke sini: sebelumnya browser menutup sesi lalu menulis
// saldo baru sebagai dua operasi terpisah, dan firestore.rules tidak punya
// cara mengikat keduanya. Artinya sesi bisa ditutup tanpa saldo benar-benar
// terpotong — parkir gratis, tanpa perlu meretas apa pun, cukup tidak
// menjalankan perintah kedua. Di sini keduanya tidak bisa dipisahkan.
//
// TIDAK bergantung pada saklar Midtrans: ini murni Firestore, tidak menyentuh
// gateway sama sekali. Kalau function ini tak terjangkau, klien mundur ke
// jalur lama (lihat pay.js).
// ============================================================
import {
  db, FieldValue, SALDO_DEFAULT, hitungTarif,
  json, preflight, uidDariToken,
} from "./lib/_lib.js";

export default async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  try {
    const uid = await uidDariToken(req);
    if (!uid) return json(req, 401, { error: "unauthenticated" });

    let body = {};
    try { body = await req.json(); } catch { /* body kosong/rusak */ }
    const sessionId = String(body.sessionId || "");
    if (!sessionId) return json(req, 400, { error: "sessionId_required" });

    const hasil = await db.runTransaction(async (tx) => {
      // ── semua pembacaan lebih dulu ──
      const sessRef = db.collection("sessions").doc(sessionId);
      const sessSnap = await tx.get(sessRef);
      if (!sessSnap.exists) return { kode: 404, badan: { error: "session_not_found" } };
      const s = sessSnap.data();
      if (s.uid !== uid) return { kode: 403, badan: { error: "forbidden" } };
      // Penjagaan dobel-checkout: dua tab yang menekan bayar bersamaan, yang
      // kedua akan melihat status 'done' di dalam transaksi ini.
      if (s.status !== "active") return { kode: 409, badan: { error: "session_not_active" } };

      const userRef = db.collection("users").doc(uid);
      const userSnap = await tx.get(userRef);
      const saldo = userSnap.exists ? (userSnap.data().wallet ?? SALDO_DEFAULT) : SALDO_DEFAULT;

      const amount = hitungTarif(s.vehicle?.type, Date.now() - s.checkinAt);
      if (saldo < amount)
        return { kode: 402, badan: { error: "saldo_kurang", amount, saldo } };

      let locRef = null, locSnap = null;
      if (s.locationId) {
        locRef = db.collection("locations").doc(s.locationId);
        locSnap = await tx.get(locRef);
      }

      // ── baru menulis ──
      const saatIni = Date.now();
      const sisa = saldo - amount;
      tx.set(userRef, { wallet: sisa, activeSession: null }, { merge: true });
      tx.update(sessRef, { status: "done", checkoutAt: saatIni, amount, method: "qupay" });
      tx.set(db.collection("transactions").doc(), {
        sessionId, uid, locationId: s.locationId,
        amount, method: "qupay", paidAt: saatIni,
      });
      if (locSnap && locSnap.exists) {
        const key = s.vehicle?.type === "mobil" ? "occCar" : "occMotor";
        tx.update(locRef, { [key]: Math.max(0, (locSnap.data()[key] || 0) - 1) });
      }

      return { kode: 200, badan: { ok: true, amount, sisa } };
    });

    return json(req, hasil.kode, hasil.badan);
  } catch (e) {
    console.error("wallet-checkout:", e);
    return json(req, 500, { error: "internal" });
  }
};

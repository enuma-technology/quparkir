// ============================================================
// POST /.netlify/functions/midtrans-webhook
//
// Inilah satu-satunya sumber kebenaran "pembayaran berhasil". Callback Snap di
// browser TIDAK dipakai untuk menutup sesi — pengguna bisa menutup browser
// tepat setelah membayar, dan uangnya tetap masuk.
//
// SENGAJA tidak ikut dimatikan saklar MIDTRANS_ENABLED: kalau saklar dimatikan
// selagi ada pembayaran yang telanjur berjalan, notifikasinya tetap wajib
// diterima. Yang berhenti hanyalah pembuatan order baru.
// ============================================================
import crypto from "node:crypto";
import { terapkanStatus } from "./lib/_lib.js";

// Tanda tangan Midtrans: sha512(order_id + status_code + gross_amount + server_key)
function tandaTanganSah(b) {
  const kunci = process.env.MIDTRANS_SERVER_KEY || "";
  if (!kunci || !b.signature_key) return false;
  const harusnya = crypto.createHash("sha512")
    .update(String(b.order_id) + String(b.status_code) + String(b.gross_amount) + kunci)
    .digest("hex");
  const a = Buffer.from(harusnya, "utf8");
  const c = Buffer.from(String(b.signature_key), "utf8");
  // Panjang berbeda membuat timingSafeEqual melempar, bukan mengembalikan false.
  return a.length === c.length && crypto.timingSafeEqual(a, c);
}

export default async (req) => {
  if (req.method !== "POST") return new Response("", { status: 405 });

  try {
    const b = await req.json();

    // Tanpa pemeriksaan ini, siapa pun yang tahu URL ini bisa mengirim
    // "sudah lunas" palsu dan memarkir gratis selamanya.
    if (!tandaTanganSah(b)) {
      console.warn("Tanda tangan tidak cocok:", b?.order_id);
      return new Response("invalid signature", { status: 403 });
    }

    const hasil = await terapkanStatus(b);
    console.log("webhook", b.order_id, b.transaction_status, "→", hasil);

    // Balas 200 secepatnya: Midtrans menunggu maks 15 detik, lewat itu ia
    // mengulang (2 → 10 → 30 → 90 → 210 menit). Order yang tak dikenal pun
    // dibalas 200 — mengulanginya tidak akan pernah mengubah apa pun.
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("webhook:", e);
    // 500 disengaja supaya Midtrans mengulang — jangan menelan galat diam-diam.
    return new Response("error", { status: 500 });
  }
};

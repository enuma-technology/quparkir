// ============================================================
// Jaring pengaman: menyapu order 'pending' yang webhook-nya tidak pernah
// sampai, lalu menanyakan statusnya langsung ke Midtrans.
//
// BELUM DIJADWALKAN. Baris config di bawah sengaja masih dikomentari — selama
// jalur Midtrans masih di belakang saklar, cron tiap jam hanya membakar kredit
// Netlify untuk memeriksa koleksi yang kosong. Nyalakan bersamaan dengan
// saklar, setelah skenario uji §8 lulus.
//
// export const config = { schedule: "@hourly" };
//
// ⚠️ Begitu baris itu diaktifkan, Netlify menutup pemanggilan HTTP dari luar
// untuk function ini — jalur "admin memanggil manual" di bawah otomatis mati.
// Itu memang benar; jangan dikira rusak.
// ============================================================
import { db, MIDTRANS, midtransAktif, authHeader, terapkanStatus, adalahAdmin, uidDariToken, json, preflight } from "./lib/_lib.js";

const BATAS_MENIT = 10;
const MAKS = 50;

export default async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  // Dipanggil penjadwal Netlify? (berlaku setelah config.schedule diaktifkan)
  const terjadwal = req.headers.get("x-netlify-event") === "schedule";

  // Selain penjadwal, hanya admin yang boleh — kalau tidak, endpoint ini jadi
  // tombol gratis untuk menguras kuota Midtrans milik kita.
  if (!terjadwal) {
    const uid = await uidDariToken(req);
    if (!(await adalahAdmin(uid))) return json(req, 403, { error: "forbidden" });
  }

  if (!midtransAktif() || !process.env.MIDTRANS_SERVER_KEY)
    return json(req, 503, { error: "midtrans_disabled" });

  const batas = new Date(Date.now() - BATAS_MENIT * 60 * 1000);
  const snap = await db.collection("orders")
    .where("status", "==", "pending")
    .where("createdAt", "<", batas)
    .limit(MAKS).get();

  const hasil = [];
  for (const d of snap.docs) {
    try {
      const res = await fetch(MIDTRANS.status(d.id), {
        headers: { Accept: "application/json", Authorization: authHeader() },
      });
      if (!res.ok) { hasil.push({ orderId: d.id, hasil: "http_" + res.status }); continue; }
      const body = await res.json();
      // Get Status API tidak mengirim signature_key, dan memang tidak perlu:
      // kita sendiri yang memanggilnya ke alamat Midtrans dengan Server Key.
      hasil.push({ orderId: d.id, hasil: await terapkanStatus({ ...body, order_id: d.id }) });
    } catch (e) {
      console.error("reconcile", d.id, e);
      hasil.push({ orderId: d.id, hasil: "galat" });
    }
  }

  // Batas MAKS dicatat terang-terangan: kalau tumpukannya lebih banyak dari
  // ini, sisanya menunggu putaran berikutnya — bukan hilang diam-diam.
  console.log("reconcile: dicek", snap.size, snap.size === MAKS ? "(mentok batas, ada sisa)" : "");
  return json(req, 200, { dicek: snap.size, mentokBatas: snap.size === MAKS, hasil });
};

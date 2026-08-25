// ============================================================
// Menjalankan logika reconcile dari komputer, terhadap Firestore PRODUKSI.
//
// Gunanya saat ada pembayaran yang sungguh-sungguh lunas di Midtrans tapi
// ordernya masih 'pending' di kita — biasanya karena notifikasi tidak pernah
// sampai. Statusnya ditanyakan langsung ke Midtrans, lalu diterapkan lewat
// terapkanStatus() yang sama persis dengan yang dipakai webhook, jadi aturan
// idempotensi dan pencocokan nominalnya tetap berlaku.
//
// Ini MENULIS KE PRODUKSI. Kredensial dibaca dari .env dan tidak pernah
// dicetak. Jalankan hanya kalau memang ada order menggantung:
//
//   node scripts/midtrans/rekonsiliasi-lokal.mjs          (lihat saja)
//   node scripts/midtrans/rekonsiliasi-lokal.mjs --terapkan
// ============================================================
import { readFileSync } from "node:fs";
import https from "node:https";

// fetch bawaan Node menggantung saat menghubungi api.sandbox.midtrans.com dari
// komputer ini (UND_ERR_CONNECT_TIMEOUT), sementara curl tembus dalam 2 detik.
// Penyebabnya pemilihan alamat pada jaringan dual-stack. https.request dengan
// family:4 berperilaku seperti curl. Hanya soal lokal — function di Netlify
// memakai fetch biasa dan tidak terpengaruh.
function ambil(url, opsi = {}) {
  return new Promise((selesai, gagal) => {
    const r = https.request(url, { method: opsi.method || "GET", headers: opsi.headers, family: 4, timeout: 25000 }, (resp) => {
      let data = "";
      resp.on("data", (c) => (data += c));
      resp.on("end", () => selesai({ status: resp.statusCode, badan: () => { try { return JSON.parse(data || "{}"); } catch { return {}; } } }));
    });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", gagal);
    if (opsi.body) r.write(opsi.body);
    r.end();
  });
}

const terapkan = process.argv.includes("--terapkan");

for (const baris of readFileSync(".env", "utf8").split("\n")) {
  if (!baris || baris.startsWith("#") || !baris.includes("=")) continue;
  const i = baris.indexOf("=");
  process.env[baris.slice(0, i)] ||= baris.slice(i + 1);
}
process.env.FB_PRIVATE_KEY = process.env.FB_PRIVATE_KEY.replace(/^"|"$/g, "");
delete process.env.FIRESTORE_EMULATOR_HOST;      // sengaja: ini memang produksi

const { db, MIDTRANS, authHeader, terapkanStatus } = await import("../../netlify/functions/lib/_lib.js");

const snap = await db.collection("orders").where("status", "==", "pending").limit(50).get();
console.log(`Order pending: ${snap.size}${terapkan ? "" : "  (mode lihat-saja)"}\n`);

for (const d of snap.docs) {
  const o = d.data();
  const res = await ambil(MIDTRANS.status(d.id), {
    headers: { Accept: "application/json", Authorization: authHeader() },
  });
  const body = res.badan();
  const status = body.transaction_status || "http_" + res.status;
  console.log(`${d.id.slice(0, 46)}  ${o.jenis || "parkir"}  Rp${o.amount}  → Midtrans: ${status}`);

  if (!terapkan) continue;
  const hasil = await terapkanStatus({ ...body, order_id: d.id });
  console.log(`   diterapkan → ${hasil}`);
}

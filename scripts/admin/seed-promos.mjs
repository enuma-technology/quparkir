// ============================================================
// seed-promos.mjs — tulis promo default ke Firestore lewat Firebase Admin SDK.
//
// Admin SDK memakai kredensial service account, jadi tulisannya MELEWATI
// Firestore Security Rules (bukan lewat rule isAdmin() seperti admin.html).
// Dipakai untuk bootstrap awal / backfill saat koleksi `promos` masih kosong
// atau saat belum ada akun Firebase Auth ber-role "admin" untuk login ke
// admin.html. Untuk operasional sehari-hari (tambah/ubah/hapus promo),
// tetap pakai tab Promo di admin.html — skrip ini bukan penggantinya.
//
// Pemakaian:
//   cd scripts/admin && npm install
//   node seed-promos.mjs
//   node seed-promos.mjs /path/lain/ke/serviceAccount.json   (opsional)
// ============================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Isi sama persis dengan DEFAULT_PROMOS di public/js/data.js. Kalau daftar itu
// berubah, salin ulang ke sini — skrip ini sengaja berdiri sendiri (tanpa
// import dari public/js) supaya tidak menyeret kode berorientasi-browser
// (DOM, localStorage) ke lingkungan Node.
const DEFAULT_PROMOS = [
  { id: "promo-cashback", tag: "BARU", title: "Cashback 50%", desc: "Semua transaksi parkir pakai QuPay · 27 Feb – 31 Agu 2026" },
  { id: "promo-admin", tag: "HEMAT", title: "Gratis Biaya Admin", desc: "Top up QuPay pertama tanpa biaya tambahan" },
  { id: "promo-poin", tag: "POIN", title: "2× Poin", desc: "Check-in di kantong parkir favoritmu akhir pekan ini" },
];

const keyPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(REPO_ROOT, "quparkir-firebase-adminsdk-fbsvc-4ab069b984.json");

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
} catch (e) {
  console.error(`Tidak bisa membaca kunci service account di:\n  ${keyPath}\n${e.message}`);
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const snap = await db.collection("promos").get();
console.log(`Koleksi "promos" saat ini berisi ${snap.size} dokumen.`);

const batch = db.batch();
for (const { id, ...data } of DEFAULT_PROMOS) {
  batch.set(db.collection("promos").doc(id), data, { merge: true });
}
await batch.commit();

console.log(`Selesai — ${DEFAULT_PROMOS.length} promo default ditulis/disegarkan ke Firestore (project: ${serviceAccount.project_id}).`);
console.log(DEFAULT_PROMOS.map(p => `  • ${p.id} — ${p.title}`).join("\n"));

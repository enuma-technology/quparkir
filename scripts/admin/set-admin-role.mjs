// ============================================================
// set-admin-role.mjs — jadikan satu akun Firebase Auth sebagai admin.
//
// firestore.rules SENGAJA melarang klien menulis field `role` pada
// users/{uid} (anti privilege-escalation) — lihat match /users/{u} di
// firestore.rules. Konsekuensinya: TIDAK ADA cara bagi admin.html sendiri
// untuk membuat admin pertama; harus lewat jalur server (Admin SDK ini)
// atau Firebase Console. Sekali sudah ada 1 akun admin, akun itu bisa
// mengelola akun lain lewat Firestore Console (users/{uid}.role).
//
// Pemakaian (WAJIB sebut akun secara eksplisit — tidak ada default):
//   cd scripts/admin && npm install
//   node set-admin-role.mjs nama@email.com
//   node set-admin-role.mjs <uid> --uid
// ============================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const arg = process.argv[2];
const byUid = process.argv.includes("--uid");
if (!arg) {
  console.error("Wajib sebutkan akun: node set-admin-role.mjs nama@email.com   (atau --uid <uid>)");
  process.exit(1);
}

const keyPath = path.join(REPO_ROOT, "quparkir-firebase-adminsdk-fbsvc-4ab069b984.json");
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
} catch (e) {
  console.error(`Tidak bisa membaca kunci service account di:\n  ${keyPath}\n${e.message}`);
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

const user = byUid ? await auth.getUser(arg) : await auth.getUserByEmail(arg);
await db.collection("users").doc(user.uid).set({ role: "admin" }, { merge: true });

console.log(`OK — ${user.email || user.uid} (uid: ${user.uid}) sekarang ber-role "admin".`);
console.log("Login ulang di app.html#/login (atau tunggu token menyegarkan) agar peran baru terbaca.");

// ============================================================
// set-role.mjs — setel peran satu akun Firebase Auth (admin / petugas / pelanggan).
//
// firestore.rules SENGAJA melarang klien menulis field `role` pada users/{uid}
// (anti privilege-escalation). Konsekuensinya peran pertama TIDAK BISA dibuat
// dari dalam app — harus lewat jalur server seperti skrip ini, atau lewat
// Firestore Console.
//
// Kredensial dibaca dari .env di akar repo (FB_PROJECT_ID / FB_CLIENT_EMAIL /
// FB_PRIVATE_KEY) — sama dengan yang dipakai Netlify Functions, jadi tidak ada
// berkas kunci kedua yang harus dijaga. Nilainya tidak pernah dicetak.
//
// Pemakaian:
//   node scripts/admin/set-role.mjs petugas1@quparkir.com petugas
//   node scripts/admin/set-role.mjs nama@email.com admin
//   node scripts/admin/set-role.mjs <uid> petugas --uid
//
// Peran baru terbaca setelah pengguna login ulang (app membaca users/{uid}
// saat status auth berubah).
// ============================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const PERAN = ["pelanggan", "petugas", "admin"];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const akun = process.argv[2];
const peran = process.argv[3];
const byUid = process.argv.includes("--uid");

if (!akun || !PERAN.includes(peran)) {
  console.error(`Pemakaian: node scripts/admin/set-role.mjs <email|uid> <${PERAN.join("|")}> [--uid]`);
  process.exit(1);
}

const env = {};
for (const baris of readFileSync(path.join(REPO_ROOT, ".env"), "utf8").split("\n")) {
  if (!baris || baris.startsWith("#") || !baris.includes("=")) continue;
  const i = baris.indexOf("=");
  env[baris.slice(0, i)] = baris.slice(i + 1);
}

initializeApp({ credential: cert({
  projectId: env.FB_PROJECT_ID,
  clientEmail: env.FB_CLIENT_EMAIL,
  privateKey: env.FB_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/^"|"$/g, ""),
}) });

const auth = getAuth();
const db = getFirestore();
const user = byUid ? await auth.getUser(akun) : await auth.getUserByEmail(akun);

const ref = db.collection("users").doc(user.uid);
const sebelum = (await ref.get()).data() || {};
await ref.set({ role: peran, ...(sebelum.name ? {} : { name: user.displayName || akun.split("@")[0] }) }, { merge: true });

console.log(`${user.email || user.uid} (uid: ${user.uid})`);
console.log(`  peran: ${sebelum.role || "pelanggan (bawaan)"} → ${peran}`);
console.log("  login ulang di app agar peran baru terbaca.");

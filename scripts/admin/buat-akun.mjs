// ============================================================
// buat-akun.mjs — buat (atau perbarui) satu akun Firebase Auth sekaligus
// menyetel perannya di Firestore.
//
// Bedanya dengan set-role.mjs: skrip itu hanya mengubah `users/{uid}.role` dan
// MENUNTUT akunnya sudah ada di Auth. Skrip ini membuat akunnya kalau belum
// ada, dan menyetel/mengganti sandinya kalau sudah ada — satu langkah untuk
// menyiapkan akun petugas/admin dari nol.
//
// Kredensial Firebase dibaca dari .env di akar repo (FB_PROJECT_ID /
// FB_CLIENT_EMAIL / FB_PRIVATE_KEY), sama dengan set-role.mjs dan Netlify
// Functions. Nilainya tidak pernah dicetak.
//
// SANDI DIBACA DARI ENV VAR, BUKAN DARI ARGUMEN BARIS PERINTAH.
// Argumen baris perintah tersimpan di riwayat shell (~/.zsh_history) dan
// terlihat oleh siapa pun yang menjalankan `ps aux` selama skrip berjalan.
// Env var yang diberikan hanya untuk satu perintah tidak masuk riwayat kalau
// barisnya diawali spasi, dan tidak muncul di daftar proses milik orang lain.
//
// Pemakaian:
//    QP_SANDI='...' node scripts/admin/buat-akun.mjs admin@quparkir.com admin --nama "Admin QuParkir"
//    QP_SANDI='...' node scripts/admin/buat-akun.mjs petugas2@quparkir.com petugas
//
// (perhatikan spasi di depan perintah — itu yang menahannya masuk riwayat)
//
// Peran baru terbaca setelah pengguna login (app membaca users/{uid} saat
// status auth berubah).
//
// ⚠️ Akun ber-peran admin/petugas bisa MENYETUJUI TOP UP, artinya bisa
// menambah saldo orang. Sandinya setara dengan akses ke uang — ganti sandi
// yang pernah tertulis di mana pun (chat, dokumen, tangkapan layar).
// ============================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const PERAN = ["pelanggan", "petugas", "admin"];
const SANDI_MIN = 6;   // batas keras Firebase Auth
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const email = process.argv[2];
const peran = process.argv[3];
const iNama = process.argv.indexOf("--nama");
const nama = iNama > -1 ? process.argv[iNama + 1] : null;
const sandi = process.env.QP_SANDI || "";

const keluarDenganPetunjuk = (pesan) => {
  console.error("⛔ " + pesan + "\n");
  console.error(`Pemakaian:  QP_SANDI='...' node scripts/admin/buat-akun.mjs <email> <${PERAN.join("|")}> [--nama "Nama Tampilan"]`);
  console.error("Sandi sengaja lewat env var, bukan argumen — argumen tersimpan di riwayat shell & terlihat di `ps`.");
  process.exit(1);
};

if (!email || !email.includes("@")) keluarDenganPetunjuk("Email tidak sah.");
if (!PERAN.includes(peran)) keluarDenganPetunjuk(`Peran harus salah satu dari: ${PERAN.join(", ")}.`);
if (!sandi) keluarDenganPetunjuk("Env var QP_SANDI belum diisi.");
if (sandi.length < SANDI_MIN) keluarDenganPetunjuk(`Sandi minimal ${SANDI_MIN} karakter (batas Firebase Auth).`);

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

// Buat kalau belum ada, perbarui kalau sudah. Dibedakan supaya keluarannya
// jujur: "sandi diganti" pada akun yang sudah dipakai orang bukan hal yang
// boleh lewat tanpa disebut.
let user, baru = false;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, {
    password: sandi,
    ...(nama ? { displayName: nama } : {}),
    emailVerified: true,
  });
} catch (e) {
  if (e.code !== "auth/user-not-found") throw e;
  user = await auth.createUser({
    email,
    password: sandi,
    displayName: nama || email.split("@")[0],
    emailVerified: true,
  });
  baru = true;
}

// Peran HARUS ditulis dari sini: firestore.rules melarang klien menyentuh
// field `role` sama sekali (anti privilege-escalation), jadi peran pertama
// tidak mungkin lahir dari dalam app.
const ref = db.collection("users").doc(user.uid);
const sebelum = (await ref.get()).data() || {};
await ref.set({
  role: peran,
  email,
  ...(nama || !sebelum.name ? { name: nama || user.displayName || email.split("@")[0] } : {}),
}, { merge: true });

console.log(`${baru ? "Akun DIBUAT" : "Akun sudah ada — sandi DIGANTI"}: ${email}`);
console.log(`  uid   : ${user.uid}`);
console.log(`  peran : ${sebelum.role || "(belum ada — dibaca app sebagai 'pelanggan')"} → ${peran}`);
console.log(`  nama  : ${nama || user.displayName || "(bawaan dari email)"}`);
console.log("\nLogin ulang di app agar peran baru terbaca.");
if (peran !== "pelanggan")
  console.log("⚠️ Akun ini bisa menyetujui top up — artinya bisa menambah saldo orang. Jaga sandinya.");

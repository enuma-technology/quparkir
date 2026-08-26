// ============================================================
// Uji wallet-checkout — bayar parkir memakai saldo QuPay.
//
// Yang dibuktikan di sini bukan "bisa memotong saldo", melainkan bahwa
// memotong saldo dan menutup sesi TIDAK BISA DIPISAHKAN. Versi lama
// mengerjakan keduanya dari browser sebagai dua operasi terpisah, dan siapa
// pun bisa menjalankan yang pertama tanpa yang kedua — parkir gratis tanpa
// perlu meretas apa pun.
//
// Jalankan:
//   firebase emulators:start --only firestore --project quparkir   (terminal 1)
//   node scripts/midtrans/uji-saldo.mjs                            (terminal 2)
// ============================================================
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
// FIREBASE_AUTH_EMULATOR_HOST membuat uidDariToken() melewati pemeriksaan
// tanda tangan (lihat _lib.js), sehingga token uji bisa dirakit di sini tanpa
// kunci apa pun. Klaimnya tetap diperiksa penuh — aud, iss, exp, iat, sub —
// dan jalur tanda tangan RS256 diuji terpisah di uji-token.mjs.
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
process.env.FB_PROJECT_ID ||= "quparkir-uji-saldo";

const { db } = await import("../../netlify/functions/lib/_lib.js");
const walletCheckout = (await import("../../netlify/functions/wallet-checkout.js")).default;

const JAM = 3600000;
const UID = "uid-saldo", LAIN = "uid-lain", LOC = "loc-saldo";
const PROYEK = process.env.FB_PROJECT_ID;

let pass = 0, fail = 0;
function t(nama, syarat, keterangan = "") {
  if (syarat) { console.log("  ✔", nama); pass++; }
  else { console.log("  ✘", nama, keterangan ? "→ " + keterangan : ""); fail++; }
}

// Emulator menyimpan data antar-jalan. Tanpa membersihkannya, hitungan seperti
// "transaksi tercatat 1×" akan menghitung sisa percobaan sebelumnya dan uji
// yang benar terlihat gagal — kegagalan palsu yang paling membuang waktu.
async function bersihkanEmulator(proyek) {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${proyek}/databases/(default)/documents`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Gagal membersihkan emulator: HTTP " + res.status);
}
await bersihkanEmulator(PROYEK);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function tokenUntuk(uid) {
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: "none", typ: "JWT" }) + "." + b64({
    iss: "https://securetoken.google.com/" + PROYEK, aud: PROYEK,
    sub: uid, user_id: uid, auth_time: now, iat: now, exp: now + 3600,
    firebase: { identities: {}, sign_in_provider: "custom" },
  }) + ".";
}

const panggil = (sessionId, uid = UID) =>
  walletCheckout(new Request("http://localhost/.netlify/functions/wallet-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: "Bearer " + tokenUntuk(uid) },
    body: JSON.stringify({ sessionId }),
  }));

const ambil = async (kol, id) => (await db.collection(kol).doc(id).get()).data();
const jumlahTransaksi = async (sessionId) =>
  (await db.collection("transactions").where("sessionId", "==", sessionId).get()).size;

// jamLalu = 4,5 bukan 5 dengan sengaja: checkinAt tepat 5 jam lalu berarti
// durasinya 5 jam LEBIH beberapa milidetik, dan hitungTarif() membulatkan ke
// atas — hasilnya 6 jam (Rp 7.000), bukan 5 jam. Angka setengah jam membuat
// pembulatannya tidak ambigu: ceil(4,5) = 5 jam → 2000 + 4×1000 = Rp 6.000.
// saldo: null berarti profil ditulis TANPA field 'wallet' sama sekali —
// keadaan setiap akun baru sebelum top up pertama.
async function siapkan(kode, { saldo = 25000, jamLalu = 4.5, status = "active" } = {}) {
  const sessionId = "sesi-" + kode;
  await db.collection("locations").doc(LOC).set({ name: "Lokasi Uji", capMotor: 10, occMotor: 3, capCar: 5, occCar: 1 });
  const profil = { name: "Penguji", activeSession: sessionId };
  if (saldo !== null) profil.wallet = saldo;
  await db.collection("users").doc(UID).set(profil);
  await db.collection("sessions").doc(sessionId).set({
    uid: UID, vehicle: { type: "motor", plate: "AD 1234 XX" },
    locationId: LOC, locationName: "Lokasi Uji",
    checkinAt: Date.now() - jamLalu * JAM, status, verified: false });
  return sessionId;
}

console.log("\n— BAYAR NORMAL —");
{
  // motor 5 jam = 2000 + 4*1000 = 6000
  const sid = await siapkan("normal", { saldo: 25000 });
  const res = await panggil(sid);
  const badan = await res.json();
  const s = await ambil("sessions", sid);
  const u = await ambil("users", UID);
  t("dibalas 200", res.status === 200, "status " + res.status);
  t("tarif dihitung server: 6.000", badan.amount === 6000, String(badan.amount));
  t("saldo 25.000 → 19.000", u.wallet === 19000, String(u.wallet));
  t("sisa yang dilaporkan = saldo sebenarnya", badan.sisa === u.wallet);
  t("sesi jadi done, method qupay", s.status === "done" && s.method === "qupay");
  t("transaksi tercatat 1×", (await jumlahTransaksi(sid)) === 1);
  t("slot motor dikembalikan (3 → 2)", (await ambil("locations", LOC)).occMotor === 2);
  t("kunci anti double-parking dilepas", u.activeSession === null);
}

console.log("\n— SALDO TIDAK CUKUP —");
{
  const sid = await siapkan("kurang", { saldo: 3000 });
  const res = await panggil(sid);
  const badan = await res.json();
  t("dibalas 402", res.status === 402, "status " + res.status);
  t("menyebut tagihan & saldo apa adanya", badan.amount === 6000 && badan.saldo === 3000);
  t("saldo TIDAK dipotong sebagian", (await ambil("users", UID)).wallet === 3000);
  t("sesi TETAP aktif", (await ambil("sessions", sid)).status === "active");
  t("tidak ada transaksi tercatat", (await jumlahTransaksi(sid)) === 0);
}

console.log("\n— PROFIL TANPA FIELD WALLET —");
{
  // Sampai 26 Agu 2026 SALDO_DEFAULT = 25000, jadi akun yang belum pernah top
  // up sepeser pun tetap bisa membayar parkir — Rp 6.000 pendapatan hilang per
  // akun baru, dan akun baru gratis dibuat siapa saja.
  const sid = await siapkan("kosong", { saldo: null });
  const res = await panggil(sid);
  const badan = await res.json();
  t("dibalas 402", res.status === 402, "status " + res.status);
  t("saldo dibaca 0, bukan 25.000", badan.saldo === 0, String(badan.saldo));
  t("sesi TETAP aktif", (await ambil("sessions", sid)).status === "active");
  t("tidak ada transaksi tercatat", (await jumlahTransaksi(sid)) === 0);
}

console.log("\n— BAYAR DUA KALI —");
{
  const sid = await siapkan("ganda", { saldo: 25000 });
  await panggil(sid);
  const res2 = await panggil(sid);
  t("panggilan kedua ditolak 409", res2.status === 409, "status " + res2.status);
  t("saldo hanya terpotong sekali", (await ambil("users", UID)).wallet === 19000, String((await ambil("users", UID)).wallet));
  t("transaksi tetap 1×", (await jumlahTransaksi(sid)) === 1);
  t("slot tidak dikembalikan dua kali", (await ambil("locations", LOC)).occMotor === 2);
}

console.log("\n— SESI MILIK ORANG LAIN —");
{
  const sid = await siapkan("milikorang", { saldo: 25000 });
  const res = await panggil(sid, LAIN);
  t("dibalas 403", res.status === 403, "status " + res.status);
  t("sesi tidak tertutup", (await ambil("sessions", sid)).status === "active");
  t("saldo pemilik tidak tersentuh", (await ambil("users", UID)).wallet === 25000);
}

console.log("\n— TANPA TOKEN —");
{
  const res = await walletCheckout(new Request("http://localhost/x", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "apa-saja" }),
  }));
  t("dibalas 401", res.status === 401, "status " + res.status);
}

console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
process.exit(fail ? 1 : 0);

// Replay operasi NYATA dari public/js/data.js terhadap firestore.rules (emulator)
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import fs from "node:fs";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, runTransaction,
} from "firebase/firestore";

const ROOT = new URL("../../", import.meta.url);
const RULES = fs.readFileSync(new URL("firestore.rules", ROOT), "utf8");

// Pakai SEED_LOCATIONS yang sama persis dengan aplikasi (public/js/data.js),
// supaya uji ini ikut berubah kalau data lokasi diperbarui. config.js membaca
// location/localStorage saat dimuat → sediakan tiruannya untuk Node.
globalThis.location ??= { hostname: "localhost", search: "" };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { SEED_LOCATIONS: SEED } = await import(new URL("public/js/data.js", ROOT).href);

const env = await initializeTestEnvironment({
  projectId: "quparkir-test",
  firestore: { rules: RULES, host: "127.0.0.1", port: 8080 },
});

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message?.split("\n")[0]]); }
};

const hitungTarif = (type, ms) => {
  const jam = Math.max(1, Math.ceil(ms / 3600000));
  return type === "mobil" ? 3000 + (jam - 1) * 2000 : 2000 + (jam - 1) * 1000;
};

await env.clearFirestore();

// --- bootstrap: role admin & petugas hanya bisa dibuat dari server/console ---
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "users", "admin1"), { name: "Admin", role: "admin" });
  await setDoc(doc(db, "users", "ptg1"), { name: "Petugas", role: "petugas" });
});

const pel = env.authenticatedContext("pel1").firestore();
const pel2 = env.authenticatedContext("pel2").firestore();
const adm = env.authenticatedContext("admin1").firestore();
const ptg = env.authenticatedContext("ptg1").firestore();
const anon = env.unauthenticatedContext().firestore();

// 1. auth.js: sinkron profil saat login
await t("profil: user membuat/merge users/{uid} (name,email)", () =>
  assertSucceeds(setDoc(doc(pel, "users", "pel1"), { name: "Pel", email: "p@x.com" }, { merge: true })));

await t("profil: user TIDAK bisa menulis role (privilege escalation)", () =>
  assertFails(setDoc(doc(pel, "users", "pel1"), { role: "admin" }, { merge: true })));

await t("profil: user tidak bisa baca profil user lain", () =>
  assertFails(getDoc(doc(pel, "users", "pel2"))));

// 2. locations
await t("locations: seed oleh admin (DB.locations.seed)", () =>
  assertSucceeds(Promise.all(SEED.map(l => { const { id, ...d } = l;
    return setDoc(doc(adm, "locations", id), { ...d, occMotor: 0, occCar: 0 }); }))));

await t("locations: pelanggan TIDAK bisa membuat lokasi", () =>
  assertFails(setDoc(doc(pel, "locations", "loc-x"), { name: "X", capMotor: 1, capCar: 1, occMotor: 0, occCar: 0 })));

await t("locations: publik (belum login) bisa baca daftar lokasi", () =>
  assertSucceeds(getDocs(collection(anon, "locations"))));

await t("locations: admin ubah kapasitas (admin.js editCap)", () =>
  assertSucceeds(updateDoc(doc(adm, "locations", "loc-square"), { capMotor: 90, capCar: 60 })));

// 3. vehicles
let vehId;
await t("vehicles: tambah kendaraan", async () => {
  const r = await assertSucceeds(addDoc(collection(pel, "users", "pel1", "vehicles"), { type: "motor", plate: "AD 1234 XY", name: "Vario" }));
  vehId = r.id;
});
await t("vehicles: user lain tidak bisa baca kendaraan saya", () =>
  assertFails(getDocs(collection(pel2, "users", "pel1", "vehicles"))));

// 4. checkin (transaksi persis seperti data.js)
const checkin = (db, u, { vehicle, locationId }) => {
  const ref = doc(collection(db, "sessions"));
  return runTransaction(db, async (tx) => {
    const userRef = doc(db, "users", u);
    if ((await tx.get(userRef)).data()?.activeSession) throw new Error("double");
    const locRef = doc(db, "locations", locationId);
    const loc = (await tx.get(locRef)).data();
    const key = vehicle.type === "mobil" ? "occCar" : "occMotor";
    const cap = vehicle.type === "mobil" ? "capCar" : "capMotor";
    if ((loc[key] || 0) >= loc[cap]) throw new Error("penuh");
    tx.update(locRef, { [key]: (loc[key] || 0) + 1 });
    tx.set(ref, { uid: u, vehicle, locationId, locationName: loc.name, checkinAt: Date.now(),
      status: "active", qrToken: "QP-TEST", verified: false });
    tx.set(userRef, { activeSession: ref.id }, { merge: true });
  }).then(() => ref.id);
};

let sesId;
await t("checkin: transaksi lolos rules (sessions+locations+users)", async () => {
  sesId = await assertSucceeds(checkin(pel, "pel1", { vehicle: { plate: "AD 1234 XY", type: "motor", name: "" }, locationId: "loc-square" }));
});

await t("checkin: TIDAK bisa membuat sesi atas nama uid lain", () =>
  assertFails(setDoc(doc(collection(pel, "sessions")), { uid: "pel2", status: "active", verified: false })));

await t("checkin: TIDAK bisa membuat sesi yang langsung verified", () =>
  assertFails(setDoc(doc(collection(pel, "sessions")), { uid: "pel1", status: "active", verified: true })));

// 5. petugas
await t("petugas: baca semua sesi aktif (subscribeAllActive)", () =>
  assertSucceeds(getDocs(query(collection(ptg, "sessions"), where("status", "==", "active")))));

await t("pelanggan: TIDAK bisa baca semua sesi aktif", () =>
  assertFails(getDocs(query(collection(pel, "sessions"), where("status", "==", "active")))));

await t("pelanggan: baca sesi miliknya (subscribeFor/listFor)", () =>
  assertSucceeds(getDocs(query(collection(pel, "sessions"), where("uid", "==", "pel1")))));

await t("petugas: verifikasi e-ticket (DB.verify)", () =>
  assertSucceeds(updateDoc(doc(ptg, "sessions", sesId), { verified: true, verifiedBy: "ptg1" })));

await t("pelanggan: TIDAK bisa self-verify sesinya", () =>
  assertFails(updateDoc(doc(pel, "sessions", sesId), { verified: true, verifiedBy: "pel1" })));

// 6. checkout (transaksi persis seperti data.js)
const checkout = (db, id, method) => runTransaction(db, async (tx) => {
  const ref = doc(db, "sessions", id);
  const z = (await tx.get(ref)).data();
  const locRef = doc(db, "locations", z.locationId);
  const loc = (await tx.get(locRef)).data();
  const checkoutAt = Date.now();
  const amount = hitungTarif(z.vehicle.type, checkoutAt - z.checkinAt);
  const key = z.vehicle.type === "mobil" ? "occCar" : "occMotor";
  tx.update(ref, { checkoutAt, status: "done", amount, method });
  tx.update(locRef, { [key]: Math.max(0, (loc[key] || 0) - 1) });
  tx.set(doc(db, "users", z.uid), { activeSession: null }, { merge: true });
  tx.set(doc(collection(db, "transactions")), { sessionId: id, uid: z.uid,
    locationId: z.locationId, amount, method, paidAt: checkoutAt });
});

await t("checkout: transaksi lolos rules (sessions+locations+users+transactions)", () =>
  assertSucceeds(checkout(pel, sesId, "qris")));

// 7. wallet
//
// Pemilik hanya boleh MENGURANGI saldonya (membayar). Menaikkan saldo adalah
// top up, dan top up wajib lewat persetujuan petugas/admin — lihat koleksi
// /topups. Dulu rules mengizinkan pemilik menulis angka berapa pun asal >= 0
// (prototipe sebelum saldo pindah ke server, lihat docs/WALLET.md §1), dan uji
// ini masih menegaskan aturan lama itu.
//
// Profil pel1 belum pernah punya field 'wallet', dan itu berarti saldo NOL —
// bukan 25.000 seperti bawaan lama. Jadi angka positif berapa pun adalah
// KENAIKAN dan harus ditolak.
await t("wallet: pelanggan menaikkan saldonya sendiri DITOLAK", () =>
  assertFails(setDoc(doc(pel, "users", "pel1"), { wallet: 75000 }, { merge: true })));
await t("wallet: profil tanpa field wallet dianggap NOL, bukan 25.000", () =>
  assertFails(setDoc(doc(pel, "users", "pel1"), { wallet: 5000 }, { merge: true })));
await t("wallet: menulis 0 pada profil tanpa wallet BOLEH", () =>
  assertSucceeds(setDoc(doc(pel, "users", "pel1"), { wallet: 0 }, { merge: true })));
await t("wallet: saldo negatif ditolak", () =>
  assertFails(setDoc(doc(pel, "users", "pel1"), { wallet: -1 }, { merge: true })));

// 8. admin dashboard
await t("admin: baca seluruh koleksi transactions (rekap)", () =>
  assertSucceeds(getDocs(collection(adm, "transactions"))));
await t("pelanggan: TIDAK bisa baca seluruh koleksi transactions", () =>
  assertFails(getDocs(collection(pel, "transactions"))));
await t("pelanggan: baca transaksinya sendiri", () =>
  assertSucceeds(getDocs(query(collection(pel, "transactions"), where("uid", "==", "pel1")))));

// 9. officers (petugas.js/admin)
await t("officers: dibaca user login", () => assertSucceeds(getDocs(collection(pel, "officers"))));
await t("officers: hanya admin yang bisa menulis", () =>
  assertFails(setDoc(doc(pel, "officers", "o1"), { name: "X" })));

// 10. anonymous (login tamu) — alur penuh
const tamu = env.authenticatedContext("tamu1").firestore();
await t("tamu: profil + kendaraan + checkin berjalan", async () => {
  await assertSucceeds(setDoc(doc(tamu, "users", "tamu1"), { name: "Tamu", email: null }, { merge: true }));
  await assertSucceeds(addDoc(collection(tamu, "users", "tamu1", "vehicles"), { type: "mobil", plate: "AD 9 ZZ", name: "" }));
  await assertSucceeds(checkin(tamu, "tamu1", { vehicle: { plate: "AD 9 ZZ", type: "mobil", name: "" }, locationId: "loc-gede" }));
});

// 11. jejak audit pengelolaan petugas — HANYA server (Admin SDK).
// Koleksi ini tidak punya match di firestore.rules, jadi yang diuji adalah
// default-deny-nya: siapa pun yang bisa membacanya berarti bisa memetakan
// akun petugas beserta siapa yang mengubah sandinya.
await t("auditPetugas: admin sekalipun tidak bisa membacanya dari klien", () =>
  assertFails(getDocs(collection(adm, "auditPetugas"))));
await t("auditPetugas: klien tidak bisa menulis (memalsukan jejak)", () =>
  assertFails(addDoc(collection(adm, "auditPetugas"), { aksi: "hapus", oleh: "pel1" })));

// 12. vehicles remove
await t("vehicles: hapus kendaraan", () =>
  assertSucceeds(deleteDoc(doc(pel, "users", "pel1", "vehicles", vehId))));

await env.cleanup();

const fail = results.filter(r => r[0] === "FAIL");
for (const [s, n, m] of results) console.log(`${s === "PASS" ? "✅" : "❌"} ${n}${m ? "  →  " + m : ""}`);
console.log(`\n${results.length - fail.length}/${results.length} lolos`);
process.exit(fail.length ? 1 : 0);

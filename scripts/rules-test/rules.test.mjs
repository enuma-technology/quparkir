import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, addDoc, collection, deleteDoc } from "firebase/firestore";
import fs from "fs";

const JAM = 3600000;
const env = await initializeTestEnvironment({
  projectId: "quparkir-rules-test",
  firestore: { host: "127.0.0.1", port: 8080, rules: fs.readFileSync("/mnt/01DCAFA2D1032800/1Works/quarkir/firestore.rules", "utf8") },
});
await env.clearFirestore();

const ALI = "user-ali", BUD = "user-budi", PTG = "petugas-1";
const ali = env.authenticatedContext(ALI).firestore();
const budi = env.authenticatedContext(BUD).firestore();
const ptg = env.authenticatedContext(PTG).firestore();

await env.withSecurityRulesDisabled(async (c) => {
  const d = c.firestore();
  await setDoc(doc(d, "users", ALI), { name: "Ali", wallet: 25000 });
  await setDoc(doc(d, "users", BUD), { name: "Budi", wallet: 25000 });
  await setDoc(doc(d, "users", PTG), { name: "Petugas", role: "petugas" });
  const mk = (id, uid, type, jamLalu) => setDoc(doc(d, "sessions", id), {
    uid, vehicle: { type, plate: "AD 1234 XX" }, locationId: "loc-square", locationName: "Solo Square",
    checkinAt: Date.now() - jamLalu * JAM, status: "active", verified: false, qrToken: "QP-" + id });
  await Promise.all([
    mk("s-motor-0", ALI, "motor", 0), mk("s-motor-0b", ALI, "motor", 0), mk("s-motor-0c", ALI, "motor", 0),
    mk("s-motor-5", ALI, "motor", 5), mk("s-motor-5b", ALI, "motor", 5),
    mk("s-mobil-3", ALI, "mobil", 3), mk("s-mobil-3b", ALI, "mobil", 3),
    mk("s-verif", ALI, "motor", 1), mk("s-verif2", ALI, "motor", 1),
    mk("s-tx", ALI, "motor", 5),
  ]);
  await setDoc(doc(d, "orders", "QP-s-tx-1"), {
    uid: ALI, sessionId: "s-tx", amount: 6000, status: "pending", createdAt: Date.now() });
  await setDoc(doc(d, "topups", "t-ali"), { uid: ALI, name: "Ali", amount: 50000, method: "qris", status: "pending", createdAt: Date.now() });
  await setDoc(doc(d, "topups", "t-ali2"), { uid: ALI, name: "Ali", amount: 50000, method: "qris", status: "pending", createdAt: Date.now() });
});

const CO = (amount, method = "qris") => ({ status: "done", checkoutAt: Date.now(), amount, method });
let pass = 0, fail = 0;
async function t(nama, p) {
  try { await p; console.log("  ✔", nama); pass++; }
  catch (e) { console.log("  ✘", nama, "→", String(e.message || e).slice(0, 90)); fail++; }
}

console.log("\n— TARIF (sessions.amount) —");
await t("motor <1 jam bayar 2000 → BOLEH", assertSucceeds(updateDoc(doc(ali, "sessions", "s-motor-0"), CO(2000))));
await t("motor bayar 1 rupiah → DITOLAK", assertFails(updateDoc(doc(ali, "sessions", "s-motor-0b"), CO(1))));
await t("motor 5 jam bayar 2000 → DITOLAK", assertFails(updateDoc(doc(ali, "sessions", "s-motor-5"), CO(2000))));
await t("motor 5 jam bayar 6000 → BOLEH", assertSucceeds(updateDoc(doc(ali, "sessions", "s-motor-5b"), CO(6000))));
await t("mobil 3 jam bayar 5000 → DITOLAK", assertFails(updateDoc(doc(ali, "sessions", "s-mobil-3"), CO(5000))));
await t("mobil 3 jam bayar 7000 → BOLEH", assertSucceeds(updateDoc(doc(ali, "sessions", "s-mobil-3b"), CO(7000))));
await t("orang lain checkout sesi Ali → DITOLAK", assertFails(updateDoc(doc(budi, "sessions", "s-motor-0c"), CO(2000))));

console.log("\n— VERIFIKASI —");
await t("pemilik self-verify → DITOLAK", assertFails(updateDoc(doc(ali, "sessions", "s-verif"), { verified: true, verifiedBy: ALI })));
await t("petugas verify → BOLEH", assertSucceeds(updateDoc(doc(ptg, "sessions", "s-verif2"), { verified: true, verifiedBy: PTG })));

console.log("\n— SALDO (users.wallet) —");
await t("Ali menaikkan saldonya sendiri → DITOLAK", assertFails(updateDoc(doc(ali, "users", ALI), { wallet: 999999 })));
await t("Ali menurunkan saldonya (bayar) → BOLEH", assertSucceeds(updateDoc(doc(ali, "users", ALI), { wallet: 23000 })));
await t("Ali menyetel role admin → DITOLAK", assertFails(updateDoc(doc(ali, "users", ALI), { role: "admin" })));
await t("Ali mengubah saldo Budi → DITOLAK", assertFails(updateDoc(doc(ali, "users", BUD), { wallet: 999999 })));
await t("petugas menaikkan saldo Budi → BOLEH", assertSucceeds(updateDoc(doc(ptg, "users", BUD), { wallet: 75000 })));
await t("petugas mengubah nama Budi → DITOLAK", assertFails(updateDoc(doc(ptg, "users", BUD), { name: "Diretas" })));
await t("Ali menulis activeSession → BOLEH", assertSucceeds(updateDoc(doc(ali, "users", ALI), { activeSession: "s-x" })));

console.log("\n— TOP UP (/topups) —");
await t("Ali membuat permintaan pending → BOLEH", assertSucceeds(addDoc(collection(ali, "topups"), { uid: ALI, name: "Ali", amount: 50000, method: "qris", status: "pending", createdAt: Date.now() })));
await t("Ali membuat langsung approved → DITOLAK", assertFails(addDoc(collection(ali, "topups"), { uid: ALI, amount: 50000, method: "qris", status: "approved", createdAt: Date.now() })));
await t("Ali membuat atas nama Budi → DITOLAK", assertFails(addDoc(collection(ali, "topups"), { uid: BUD, amount: 50000, method: "qris", status: "pending", createdAt: Date.now() })));
await t("Ali menyetujui top up-nya sendiri → DITOLAK", assertFails(updateDoc(doc(ali, "topups", "t-ali"), { status: "approved", handledBy: ALI, handledAt: Date.now() })));
await t("petugas menyetujui → BOLEH", assertSucceeds(updateDoc(doc(ptg, "topups", "t-ali"), { status: "approved", handledBy: PTG, handledAt: Date.now() })));
await t("petugas menyetujui ulang (ganda) → DITOLAK", assertFails(updateDoc(doc(ptg, "topups", "t-ali"), { status: "approved", handledBy: PTG, handledAt: Date.now() })));
await t("petugas mengubah nominal → DITOLAK", assertFails(updateDoc(doc(ptg, "topups", "t-ali2"), { status: "approved", amount: 999999, handledBy: PTG, handledAt: Date.now() })));

console.log("\n— TRANSAKSI —");
const tx = (amount, sessionId = "s-tx") => ({ sessionId, uid: ALI, locationId: "loc-square", amount, method: "qris", paidAt: Date.now() });
await t("catat 6000 utk sesi motor 5 jam → BOLEH", assertSucceeds(addDoc(collection(ali, "transactions"), tx(6000))));
await t("catat 1000 utk sesi yg sama → DITOLAK", assertFails(addDoc(collection(ali, "transactions"), tx(1000))));
await t("catat tanpa sessionId → DITOLAK", assertFails(addDoc(collection(ali, "transactions"), { uid: ALI, amount: 6000, method: "qris", paidAt: Date.now() })));
await t("catat merujuk sesi orang lain → DITOLAK", assertFails(addDoc(collection(budi, "transactions"), { ...tx(6000), uid: BUD })));

console.log("\n— ORDER GATEWAY (/orders) —");
// Ditulis hanya oleh Admin SDK di Netlify Functions (yang memintas rules
// sepenuhnya). Dari browser, dokumen ini harus BENAR-BENAR baca-saja: kalau
// pemiliknya bisa menyetel status 'paid' sendiri, seluruh gateway tidak ada
// gunanya — webhook cuma jadi hiasan.
await t("Ali membaca ordernya sendiri → BOLEH", assertSucceeds(getDoc(doc(ali, "orders", "QP-s-tx-1"))));
await t("Budi membaca order Ali → DITOLAK", assertFails(getDoc(doc(budi, "orders", "QP-s-tx-1"))));
await t("Ali menyetel ordernya jadi paid → DITOLAK", assertFails(updateDoc(doc(ali, "orders", "QP-s-tx-1"), { status: "paid" })));
await t("Ali membuat order sendiri → DITOLAK", assertFails(setDoc(doc(ali, "orders", "QP-palsu"), { uid: ALI, sessionId: "s-tx", amount: 1, status: "paid" })));
await t("Ali menghapus ordernya → DITOLAK", assertFails(deleteDoc(doc(ali, "orders", "QP-s-tx-1"))));

console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
await env.cleanup();
process.exit(fail ? 1 : 0);

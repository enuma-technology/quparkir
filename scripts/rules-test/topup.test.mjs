// Uji jalur NYATA persetujuan top up: satu runTransaction menaikkan saldo
// pengguna DAN menandai permintaannya, persis seperti DB.topups.approve.
// Yang boleh menjalankannya HANYA admin (panel /admin). Petugas diuji ikut
// di sini karena tombolnya pernah ada di app-nya: yang menutup pintu adalah
// rules, bukan hilangnya tombol.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, runTransaction, increment } from "firebase/firestore";
import fs from "fs";
const env = await initializeTestEnvironment({
  projectId: "quparkir-topup-test",
  firestore: { host: "127.0.0.1", port: 8080, rules: fs.readFileSync("/mnt/01DCAFA2D1032800/1Works/quarkir/firestore.rules", "utf8") },
});
await env.clearFirestore();
const ALI = "user-ali", PTG = "petugas-1", ADM = "admin-1";
const ali = env.authenticatedContext(ALI).firestore();
const ptg = env.authenticatedContext(PTG).firestore();
const adm = env.authenticatedContext(ADM).firestore();
await env.withSecurityRulesDisabled(async (c) => {
  const d = c.firestore();
  await setDoc(doc(d, "users", ALI), { name: "Ali", wallet: 25000 });
  await setDoc(doc(d, "users", PTG), { name: "Petugas", role: "petugas" });
  await setDoc(doc(d, "users", ADM), { name: "Admin", role: "admin" });
  await setDoc(doc(d, "users", "user-baru"), { name: "Baru" });
  await setDoc(doc(d, "topups", "t3"), { uid: "user-baru", amount: 10000, method: "qris", status: "pending", createdAt: Date.now() });
  for (const id of ["t1", "t2"]) await setDoc(doc(d, "topups", id),
    { uid: ALI, name: "Ali", amount: 50000, method: "qris", status: "pending", createdAt: Date.now() });
});
const approve = (db, id, officerId) => runTransaction(db, async (tx) => {
  const ref = doc(db, "topups", id);
  const t = (await tx.get(ref)).data();
  if (!t) throw new Error("tidak ditemukan");
  if (t.status !== "pending") throw new Error("sudah diproses");
  tx.update(doc(db, "users", t.uid), { wallet: increment(t.amount) });
  tx.update(ref, { status: "approved", handledBy: officerId, handledAt: Date.now() });
});
let pass = 0, fail = 0;
const t = async (n, p) => { try { await p; console.log("  ✔", n); pass++; } catch (e) { console.log("  ✘", n, "→", String(e.message||e).slice(0,100)); fail++; } };
console.log("\n— persetujuan top up di dalam runTransaction —");
await t("admin menyetujui → BOLEH", assertSucceeds(approve(adm, "t1", ADM)));
await t("petugas menyetujui → DITOLAK", assertFails(approve(ptg, "t2", PTG)));
await t("pengguna menyetujui sendiri → DITOLAK", assertFails(approve(ali, "t2", ALI)));
await env.withSecurityRulesDisabled(async (c) => {
  const w = (await getDoc(doc(c.firestore(), "users", ALI))).data().wallet;
  await t("saldo 25.000 → 75.000", w === 75000 ? Promise.resolve() : Promise.reject(new Error("saldo malah " + w)));
});
await t("top up 10rb pada profil tanpa field wallet → BOLEH", assertSucceeds(approve(adm, "t3", ADM)));
console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
await env.cleanup();
process.exit(fail ? 1 : 0);

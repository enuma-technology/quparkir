// Uji jalur NYATA: checkout menulis 4 dokumen dalam SATU runTransaction
// (sessions + locations + users + transactions), persis seperti data.js.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, collection, runTransaction } from "firebase/firestore";
import fs from "fs";
const JAM = 3600000;
const env = await initializeTestEnvironment({
  projectId: "quparkir-tx-test",
  firestore: { host: "127.0.0.1", port: 8080, rules: fs.readFileSync("/mnt/01DCAFA2D1032800/1Works/quarkir/firestore.rules", "utf8") },
});
await env.clearFirestore();
const ALI = "user-ali";
const ali = env.authenticatedContext(ALI).firestore();
await env.withSecurityRulesDisabled(async (c) => {
  const d = c.firestore();
  await setDoc(doc(d, "users", ALI), { name: "Ali", wallet: 25000, activeSession: "s1" });
  await setDoc(doc(d, "locations", "loc-square"), { name: "Solo Square", capMotor: 80, capCar: 60, occMotor: 41, occCar: 22 });
  for (const id of ["s1", "s2"]) await setDoc(doc(d, "sessions", id), {
    uid: ALI, vehicle: { type: "motor", plate: "AD 1 X" }, locationId: "loc-square",
    locationName: "Solo Square", checkinAt: Date.now() - 5 * JAM, status: "active", verified: false, qrToken: "QP-" + id });
});

// salinan setia dari DB.checkout(), dengan amount bisa dipaksa
const checkout = (db, id, amount) => runTransaction(db, async (tx) => {
  const ref = doc(db, "sessions", id);
  const z = (await tx.get(ref)).data();
  const locRef = doc(db, "locations", z.locationId);
  const loc = (await tx.get(locRef)).data();
  const checkoutAt = Date.now();
  tx.update(ref, { checkoutAt, status: "done", amount, method: "qris" });
  tx.update(locRef, { occMotor: Math.max(0, (loc.occMotor || 0) - 1) });
  tx.set(doc(db, "users", z.uid), { activeSession: null }, { merge: true });
  tx.set(doc(collection(db, "transactions")), { sessionId: id, uid: z.uid,
    locationId: z.locationId, amount, method: "qris", paidAt: checkoutAt });
});

let pass = 0, fail = 0;
const t = async (n, p) => { try { await p; console.log("  ✔", n); pass++; } catch (e) { console.log("  ✘", n, "→", String(e.message||e).slice(0,100)); fail++; } };
console.log("\n— checkout penuh di dalam runTransaction —");
await t("motor 5 jam, bayar 6000 → BOLEH", assertSucceeds(checkout(ali, "s1", 6000)));
await t("motor 5 jam, bayar 2000 → DITOLAK", assertFails(checkout(ali, "s2", 2000)));
console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
await env.cleanup();
process.exit(fail ? 1 : 0);

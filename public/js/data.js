// ============================================================
// Data layer — satu antarmuka, dua backend:
//   - DEMO (localStorage)  → default, jalan tanpa config
//   - Firebase (Firestore) → otomatis saat config.js sudah diisi
// ============================================================
import { firebaseConfig, USE_FIREBASE } from "./config.js";
import { uid as randId, hitungTarif } from "./util.js";

export const SEED_LOCATIONS = [
  { id: "loc-square",   name: "Solo Square",          lat: -7.5599, lng: 110.7892, capMotor: 80, capCar: 60, occMotor: 41, occCar: 22, tarif: { motor: 2000, mobil: 3000 } },
  { id: "loc-grand",    name: "Solo Grand Mall",      lat: -7.5663, lng: 110.8126, capMotor: 120, capCar: 90, occMotor: 70, occCar: 51, tarif: { motor: 2000, mobil: 3000 } },
  { id: "loc-gede",     name: "Pasar Gede",           lat: -7.5697, lng: 110.8307, capMotor: 60, capCar: 25, occMotor: 52, occCar: 20, tarif: { motor: 2000, mobil: 3000 } },
  { id: "loc-vasten",   name: "Benteng Vastenburg",   lat: -7.5719, lng: 110.8290, capMotor: 50, capCar: 30, occMotor: 8,  occCar: 4,  tarif: { motor: 2000, mobil: 2000 } },
  { id: "loc-balapan",  name: "Stasiun Balapan",      lat: -7.5562, lng: 110.8190, capMotor: 70, capCar: 40, occMotor: 66, occCar: 35, tarif: { motor: 2000, mobil: 3000 } },
  { id: "loc-uns",      name: "Kampus UNS",           lat: -7.5599, lng: 110.8561, capMotor: 200, capCar: 80, occMotor: 90, occCar: 30, tarif: { motor: 1000, mobil: 2000 } },
];

export let DB;          // diisi sesuai backend
export let MODE = "demo";

// ---------- DEMO backend (localStorage + pub/sub) ----------
function demoBackend() {
  const KEY = "quparkir_db_v1";
  const load = () => JSON.parse(localStorage.getItem(KEY) || "null");
  let s = load() || {
    locations: structuredClone(SEED_LOCATIONS),
    vehicles: {}, sessions: [], transactions: [], officers: [
      { id: "ofc-1", name: "Budi Santoso", code: "PTG-001", locationId: "loc-square", active: true },
    ], profiles: {}, wallet: {},
  };
  const save = () => localStorage.setItem(KEY, JSON.stringify(s));
  save();
  const L = new Set();
  const emit = () => { save(); L.forEach(fn => fn()); };
  const sub = (sel, cb) => { const run = () => cb(sel(structuredClone(s))); L.add(run); run(); return () => L.delete(run); };

  return {
    mode: "demo",
    locations: {
      subscribe: (cb) => sub(x => x.locations, cb),
      get: (id) => s.locations.find(l => l.id === id),
      update: (id, patch) => { Object.assign(s.locations.find(l => l.id === id), patch); emit(); },
      seed: async () => { if (!s.locations.length) { s.locations = structuredClone(SEED_LOCATIONS); emit(); } },
    },
    vehicles: {
      subscribe: (u, cb) => sub(x => x.vehicles[u] || [], cb),
      add: (u, v) => { (s.vehicles[u] ||= []).push({ id: randId(), ...v }); emit(); },
      remove: (u, id) => { s.vehicles[u] = (s.vehicles[u] || []).filter(v => v.id !== id); emit(); },
    },
    sessions: {
      subscribeActive: (u, cb) => sub(x => x.sessions.find(z => z.uid === u && z.status === "active") || null, cb),
      subscribeAllActive: (cb) => sub(x => x.sessions.filter(z => z.status === "active"), cb),
      listFor: (u) => s.sessions.filter(z => z.uid === u).sort((a, b) => b.checkinAt - a.checkinAt),
      subscribeFor: (u, cb) => sub(x => x.sessions.filter(z => z.uid === u).sort((a, b) => b.checkinAt - a.checkinAt), cb),
    },
    transactions: { subscribe: (cb) => sub(x => x.transactions.sort((a, b) => b.paidAt - a.paidAt), cb) },
    officers: { subscribe: (cb) => sub(x => x.officers, cb) },
    profile: { get: (u) => s.profiles[u] || null, set: (u, p) => { s.profiles[u] = { ...s.profiles[u], ...p }; emit(); } },
    wallet: { get: (u) => s.wallet[u] ?? 25000, set: (u, v) => { s.wallet[u] = v; emit(); } },
    async ensureSeed() { /* demo sudah ter-seed di constructor */ },

    async checkin(u, { vehicle, locationId }) {
      if (s.sessions.some(z => z.uid === u && z.status === "active"))
        throw new Error("Anti double-parking: Anda masih punya sesi parkir aktif.");
      const loc = s.locations.find(l => l.id === locationId);
      const key = vehicle.type === "mobil" ? "occCar" : "occMotor";
      const cap = vehicle.type === "mobil" ? "capCar" : "capMotor";
      if (loc[key] >= loc[cap]) throw new Error("Slot penuh di lokasi ini.");
      loc[key]++;
      const sess = { id: randId(), uid: u, vehicle, locationId, locationName: loc.name,
        checkinAt: Date.now(), status: "active", qrToken: "QP-" + crypto.randomUUID().toUpperCase(), verified: false };
      s.sessions.push(sess); emit(); return sess;
    },
    async checkout(id, { method = "qris" } = {}) {
      const z = s.sessions.find(x => x.id === id); if (!z) throw new Error("Sesi tidak ditemukan");
      if (z.status !== "active") throw new Error("Sesi sudah selesai.");
      z.checkoutAt = Date.now(); z.status = "done"; z.method = method;
      z.amount = hitungTarif(z.vehicle.type, z.checkoutAt - z.checkinAt);
      const loc = s.locations.find(l => l.id === z.locationId);
      const key = z.vehicle.type === "mobil" ? "occCar" : "occMotor"; loc[key] = Math.max(0, loc[key] - 1);
      s.transactions.push({ id: randId(), sessionId: z.id, uid: z.uid, locationId: z.locationId,
        amount: z.amount, method, paidAt: Date.now() });
      emit(); return z;
    },
    async verify(id, officerId) {
      const z = s.sessions.find(x => x.id === id); if (z) { z.verified = true; z.verifiedBy = officerId; emit(); }
    },
  };
}

// ---------- Firebase backend (Firestore) ----------
async function firebaseBackend() {
  const [{ initializeApp, getApps }, fs] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"),
  ]);
  const app = getApps()[0] || initializeApp(firebaseConfig);   // hindari duplicate-app
  const db = fs.getFirestore(app);
  const { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
    onSnapshot, query, where, orderBy, runTransaction, serverTimestamp } = fs;

  const colArr = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));

  return {
    mode: "firebase", _db: db,
    // seed lokasi bila kosong — dipanggil SETELAH user login (non-fatal)
    async ensureSeed() {
      try {
        const snap = await getDocs(collection(db, "locations"));
        if (snap.empty) for (const l of SEED_LOCATIONS) { try { await setDoc(doc(db, "locations", l.id), l); } catch {} }
      } catch {}
    },
    locations: {
      subscribe: (cb) => onSnapshot(collection(db, "locations"), s => cb(colArr(s))),
      get: async (id) => (await getDoc(doc(db, "locations", id))).data(),
      update: (id, patch) => updateDoc(doc(db, "locations", id), patch),
      // seeding produksi: hanya lolos rules bila pemanggil ber-role admin
      seed: async () => { for (const l of SEED_LOCATIONS) { const { id, ...d } = l;
        await setDoc(doc(db, "locations", id), { ...d, occMotor: 0, occCar: 0 }); } },
    },
    vehicles: {
      subscribe: (u, cb) => onSnapshot(collection(db, "users", u, "vehicles"), s => cb(colArr(s))),
      add: (u, v) => addDoc(collection(db, "users", u, "vehicles"), v),
      remove: (u, id) => deleteDoc(doc(db, "users", u, "vehicles", id)),
    },
    sessions: {
      subscribeActive: (u, cb) => onSnapshot(query(collection(db, "sessions"), where("uid", "==", u), where("status", "==", "active")),
        s => cb(colArr(s)[0] || null)),
      subscribeAllActive: (cb) => onSnapshot(query(collection(db, "sessions"), where("status", "==", "active")), s => cb(colArr(s))),
      subscribeFor: (u, cb) => onSnapshot(query(collection(db, "sessions"), where("uid", "==", u)),
        s => cb(colArr(s).sort((a, b) => b.checkinAt - a.checkinAt))),
      listFor: async (u) => colArr(await getDocs(query(collection(db, "sessions"), where("uid", "==", u)))).sort((a, b) => b.checkinAt - a.checkinAt),
    },
    transactions: { subscribe: (cb) => onSnapshot(collection(db, "transactions"), s => cb(colArr(s).sort((a, b) => b.paidAt - a.paidAt))) },
    officers: { subscribe: (cb) => onSnapshot(collection(db, "officers"), s => cb(colArr(s))) },
    profile: { get: async (u) => (await getDoc(doc(db, "users", u))).data() || null, set: (u, p) => setDoc(doc(db, "users", u), p, { merge: true }) },
    wallet: { get: async (u) => (await getDoc(doc(db, "users", u))).data()?.wallet ?? 25000, set: (u, v) => setDoc(doc(db, "users", u), { wallet: v }, { merge: true }) },

    async checkin(u, { vehicle, locationId }) {
      // pre-check cepat (fast fail); jaminan sesungguhnya di transaksi bawah
      const actives = await getDocs(query(collection(db, "sessions"), where("uid", "==", u), where("status", "==", "active")));
      if (!actives.empty) throw new Error("Anti double-parking: Anda masih punya sesi parkir aktif.");
      const ref = doc(collection(db, "sessions"));
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, "users", u);
        if ((await tx.get(userRef)).data()?.activeSession)
          throw new Error("Anti double-parking: Anda masih punya sesi parkir aktif.");
        const locRef = doc(db, "locations", locationId);
        const loc = (await tx.get(locRef)).data();
        const key = vehicle.type === "mobil" ? "occCar" : "occMotor";
        const cap = vehicle.type === "mobil" ? "capCar" : "capMotor";
        if ((loc[key] || 0) >= loc[cap]) throw new Error("Slot penuh di lokasi ini.");
        tx.update(locRef, { [key]: (loc[key] || 0) + 1 });
        tx.set(ref, { uid: u, vehicle, locationId, locationName: loc.name, checkinAt: Date.now(),
          status: "active", qrToken: "QP-" + crypto.randomUUID().toUpperCase(), verified: false });
        tx.set(userRef, { activeSession: ref.id }, { merge: true });
      });
      return { id: ref.id };
    },
    async checkout(id, { method = "qris" } = {}) {
      const ref = doc(db, "sessions", id);
      let out;
      await runTransaction(db, async (tx) => {
        const z = (await tx.get(ref)).data();
        if (!z) throw new Error("Sesi tidak ditemukan");
        if (z.status !== "active") throw new Error("Sesi sudah selesai.");
        const locRef = doc(db, "locations", z.locationId);
        const loc = (await tx.get(locRef)).data();
        const checkoutAt = Date.now();
        const amount = hitungTarif(z.vehicle.type, checkoutAt - z.checkinAt);
        const key = z.vehicle.type === "mobil" ? "occCar" : "occMotor";
        tx.update(ref, { checkoutAt, status: "done", amount, method });
        tx.update(locRef, { [key]: Math.max(0, (loc[key] || 0) - 1) });
        tx.set(doc(db, "users", z.uid), { activeSession: null }, { merge: true });
        // catat transaksi di TRANSAKSI YANG SAMA — checkout & log pendapatan atomik
        tx.set(doc(collection(db, "transactions")), { sessionId: id, uid: z.uid,
          locationId: z.locationId, amount, method, paidAt: checkoutAt });
        out = { id, ...z, checkoutAt, status: "done", amount, method };
      });
      return out;
    },
    verify: (id, officerId) => updateDoc(doc(db, "sessions", id), { verified: true, verifiedBy: officerId }),
  };
}

export async function initData() {
  if (USE_FIREBASE) {
    try { DB = await firebaseBackend(); MODE = "firebase"; return; }
    catch (e) { console.warn("Firebase gagal, fallback DEMO:", e); }
  }
  DB = demoBackend(); MODE = "demo";
}

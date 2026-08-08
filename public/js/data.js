// ============================================================
// Data layer — satu antarmuka, dua backend:
//   - DEMO (localStorage)  → default, jalan tanpa config
//   - Firebase (Firestore) → otomatis saat config.js sudah diisi
// ============================================================
import { firebaseConfig, USE_FIREBASE, USE_EMULATOR, EMULATOR } from "./config.js";
import { uid as randId, hitungTarif } from "./util.js";

// Koordinat diverifikasi via Wikipedia + OpenStreetMap/Nominatim (Agustus 2026).
// Presisi 5 desimal ≈ 1 meter — dipakai langsung sebagai tujuan rute Google Maps,
// jadi jangan dibulatkan lagi saat mengubah data ini.
export const SEED_LOCATIONS = [
  { id: "loc-square",   name: "Solo Square",          address: "Jl. Slamet Riyadi No.451-455, Pajang, Laweyan, Surakarta 57146", lat: -7.56048, lng: 110.78882, capMotor: 80, capCar: 60, occMotor: 41, occCar: 22, tarif: { motor: 2000, mobil: 3000 } },
  { id: "loc-grand",    name: "Solo Grand Mall",      address: "Jl. Slamet Riyadi No.273, Penumping, Laweyan, Surakarta 57141", lat: -7.56628, lng: 110.80754, capMotor: 120, capCar: 90, occMotor: 70, occCar: 51, tarif: { motor: 2000, mobil: 3000 } },
  { id: "loc-gede",     name: "Pasar Gede",           address: "Jl. Urip Sumoharjo No.1, Sudiroprajan, Jebres, Surakarta 57121", lat: -7.56910, lng: 110.83185, capMotor: 60, capCar: 25, occMotor: 52, occCar: 20, tarif: { motor: 2000, mobil: 3000 } },
  { id: "loc-vasten",   name: "Benteng Vastenburg",   address: "Jl. Jend. Sudirman, Kedung Lumbu, Pasar Kliwon, Surakarta 57133", lat: -7.57206, lng: 110.83128, capMotor: 50, capCar: 30, occMotor: 8,  occCar: 4,  tarif: { motor: 2000, mobil: 2000 } },
  { id: "loc-balapan",  name: "Stasiun Balapan",      address: "Jl. Wolter Monginsidi No.112, Kestalan, Banjarsari, Surakarta 57133", lat: -7.55675, lng: 110.82140, capMotor: 70, capCar: 40, occMotor: 66, occCar: 35, tarif: { motor: 2000, mobil: 3000 } },
  { id: "loc-uns",      name: "Kampus UNS",           address: "Jl. Ir. Sutami No.36A, Kentingan, Jebres, Surakarta 57126", lat: -7.55993, lng: 110.85665, capMotor: 200, capCar: 80, occMotor: 90, occCar: 30, tarif: { motor: 1000, mobil: 2000 } },
];

// Isi awal Promo (dipakai saat storage/koleksi masih kosong). Admin bisa
// menambah/mengubah/menghapus lewat admin.html — tag & alt-style card dibuat
// otomatis oleh UI, admin cukup mengisi teks.
export const DEFAULT_PROMOS = [
  { id: "promo-cashback", tag: "BARU",  title: "Cashback 50%",         desc: "Semua transaksi parkir pakai QuPay · 27 Feb – 31 Agu 2026" },
  { id: "promo-admin",    tag: "HEMAT", title: "Gratis Biaya Admin",   desc: "Top up QuPay pertama tanpa biaya tambahan" },
  { id: "promo-poin",     tag: "POIN",  title: "2× Poin",              desc: "Check-in di kantong parkir favoritmu akhir pekan ini" },
];

export let DB;          // diisi sesuai backend
export let MODE = "demo";

// ---------- DEMO backend (localStorage + pub/sub) ----------
function demoBackend() {
  const KEY = "quparkir_db_v1";
  const load = () => JSON.parse(localStorage.getItem(KEY) || "null");
  let s = load() || {
    locations: structuredClone(SEED_LOCATIONS),
    promos: structuredClone(DEFAULT_PROMOS),
    banners: [],
    vehicles: {}, sessions: [], transactions: [], officers: [
      { id: "ofc-1", name: "Budi Santoso", code: "PTG-001", locationId: "loc-square", active: true },
    ], profiles: {}, wallet: {},
  };
  // Data lama di localStorage tidak ikut ter-seed ulang. Segarkan hanya field
  // geografis dari SEED agar koreksi koordinat sampai ke user lama tanpa
  // menghapus sesi/transaksi mereka; dan lengkapi koleksi baru (promo/banner)
  // untuk sesi lama yang dibuat sebelum fitur ini ada.
  for (const seed of SEED_LOCATIONS) {
    const cur = s.locations.find(l => l.id === seed.id);
    if (cur) Object.assign(cur, { lat: seed.lat, lng: seed.lng, address: seed.address });
  }
  s.promos ||= structuredClone(DEFAULT_PROMOS);
  s.banners ||= [];
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
      add: (loc) => { const l = { occMotor: 0, occCar: 0, ...loc, id: loc.id || randId() }; s.locations.push(l); emit(); return l; },
      remove: (id) => { s.locations = s.locations.filter(l => l.id !== id); emit(); },
      seed: async () => { if (!s.locations.length) { s.locations = structuredClone(SEED_LOCATIONS); emit(); } },
    },
    promos: {
      subscribe: (cb) => sub(x => x.promos, cb),
      add: (p) => { const row = { ...p, id: p.id || randId() }; s.promos.push(row); emit(); return row; },
      update: (id, patch) => { const p = s.promos.find(x => x.id === id); if (p) Object.assign(p, patch); emit(); },
      remove: (id) => { s.promos = s.promos.filter(p => p.id !== id); emit(); },
    },
    banners: {
      subscribe: (cb) => sub(x => x.banners, cb),
      add: (b) => { const row = { active: true, ...b, id: b.id || randId() }; s.banners.push(row); emit(); return row; },
      update: (id, patch) => { const b = s.banners.find(x => x.id === id); if (b) Object.assign(b, patch); emit(); },
      remove: (id) => { s.banners = s.banners.filter(b => b.id !== id); emit(); },
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
  // sambungkan ke emulator sekali saja (aman dipanggil sebelum operasi pertama)
  if (USE_EMULATOR && !window.__qpFsEmu) {
    window.__qpFsEmu = true;
    fs.connectFirestoreEmulator(db, EMULATOR.host, EMULATOR.firestorePort);
  }
  const { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
    onSnapshot, query, where, orderBy, runTransaction, serverTimestamp } = fs;

  const colArr = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // onSnapshot TANPA handler error akan diam saja saat rules menolak baca —
  // UI lalu menampilkan area kosong tanpa penjelasan (bukan "belum ada data",
  // benar-benar tidak ada yang tergambar). Bungkus supaya kegagalan tercatat
  // di console DAN halaman tetap menggambar keadaan kosongnya.
  // Semua pemakai watch() adalah langganan KOLEKSI, jadi bentuk kosongnya
  // selalu array — jangan kirim null, pemanggil langsung mem-filter/map hasilnya.
  const watch = (ref, cb, map = colArr, label = "") => onSnapshot(ref, s => cb(map(s)), (e) => {
    console.warn("Langganan" + (label ? " " + label : "") + " gagal:", e.code || e.message);
    cb([]);
  });

  return {
    mode: "firebase", _db: db,
    // Seed lokasi & promo bila koleksi masih kosong — dipanggil SETELAH user login dan
    // TIDAK boleh menggagalkan app: rules hanya mengizinkan penulis ber-role
    // admin, jadi bagi pelanggan biasa langkah ini memang akan ditolak.
    // Kegagalan tetap dicatat ke console supaya bisa didiagnosis (jangan
    // dibungkam total — dulu masalah seeding jadi tak terlihat sama sekali).
    async ensureSeed() {
      try {
        const snap = await getDocs(collection(db, "locations"));
        if (snap.empty) for (const l of SEED_LOCATIONS) {
          const { id, ...d } = l;
          try { await setDoc(doc(db, "locations", id), d); }
          catch (e) { console.warn("Seed lokasi", id, "gagal:", e.code || e.message); break; }
        }
      } catch (e) { console.warn("Cek seed lokasi gagal:", e.code || e.message); }
      try {
        const snap = await getDocs(collection(db, "promos"));
        if (snap.empty) for (const p of DEFAULT_PROMOS) {
          const { id, ...d } = p;
          try { await setDoc(doc(db, "promos", id), d); }
          catch (e) { console.warn("Seed promo", id, "gagal:", e.code || e.message); break; }
        }
      } catch (e) { console.warn("Cek seed promo gagal:", e.code || e.message); }
    },
    locations: {
      subscribe: (cb) => watch(collection(db, "locations"), cb, colArr, "locations"),
      get: async (id) => (await getDoc(doc(db, "locations", id))).data(),
      update: (id, patch) => updateDoc(doc(db, "locations", id), patch),
      add: async (loc) => { const ref = await addDoc(collection(db, "locations"), { occMotor: 0, occCar: 0, ...loc }); return { id: ref.id, ...loc }; },
      remove: (id) => deleteDoc(doc(db, "locations", id)),
      // seeding produksi: hanya lolos rules bila pemanggil ber-role admin
      seed: async () => { for (const l of SEED_LOCATIONS) { const { id, ...d } = l;
        await setDoc(doc(db, "locations", id), { ...d, occMotor: 0, occCar: 0 }); } },
    },
    promos: {
      subscribe: (cb) => watch(collection(db, "promos"), cb, colArr, "promos"),
      add: (p) => addDoc(collection(db, "promos"), p),
      update: (id, patch) => updateDoc(doc(db, "promos", id), patch),
      remove: (id) => deleteDoc(doc(db, "promos", id)),
    },
    banners: {
      subscribe: (cb) => watch(collection(db, "banners"), cb, colArr, "banners"),
      add: (b) => addDoc(collection(db, "banners"), { active: true, ...b }),
      update: (id, patch) => updateDoc(doc(db, "banners", id), patch),
      remove: (id) => deleteDoc(doc(db, "banners", id)),
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
    transactions: { subscribe: (cb) => watch(collection(db, "transactions"), cb, s => colArr(s).sort((a, b) => b.paidAt - a.paidAt), "transactions") },
    officers: { subscribe: (cb) => watch(collection(db, "officers"), cb, colArr, "officers") },
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
        if (!loc) throw new Error("Lokasi parkir tidak ditemukan.");
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
        // lokasi bisa saja sudah dihapus admin — checkout tetap harus bisa selesai
        if (loc) tx.update(locRef, { [key]: Math.max(0, (loc[key] || 0) - 1) });
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

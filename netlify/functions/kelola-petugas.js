// ============================================================
// POST /.netlify/functions/kelola-petugas   { aksi, ... }
//
// Satu endpoint untuk seluruh pengelolaan akun petugas dari panel /admin:
// mendaftar, membuat, mengganti nama/sandi, menonaktifkan, mencabut peran,
// dan menghapus.
//
// KENAPA HARUS DI SERVER, bukan di admin-panel.js:
//
//   1. `createUserWithEmailAndPassword` dari Web SDK IKUT MENGGANTI SESI yang
//      sedang berjalan — admin yang menambah petugas akan langsung "menjadi"
//      petugas itu di tab yang sama, dan panelnya menutup diri sendiri.
//   2. `users/{uid}.role` TIDAK BOLEH ditulis klien sama sekali
//      (firestore.rules, anti privilege-escalation). Kalau rules dilonggarkan
//      supaya admin bisa menulis role, siapa pun yang bisa memalsukan sesi
//      admin bisa mengangkat dirinya sendiri — jadi peran hanya lahir dari
//      Admin SDK, tempat kunci service account tidak pernah sampai ke browser.
//   3. Menonaktifkan/menghapus akun Auth memang tidak punya padanan di klien.
//
// Pekerjaan yang sama sebelumnya HANYA bisa lewat `scripts/admin/buat-akun.mjs`
// di komputer yang memegang .env. Endpoint ini memindahkannya ke panel tanpa
// mengubah aturan mainnya: yang menulis peran tetap Admin SDK.
//
// BATAS TEGAS: endpoint ini hanya menyentuh akun ber-peran 'petugas' (dan akun
// tanpa peran yang sedang diangkat jadi petugas). Akun 'admin' ditolak di
// setiap aksi — admin tidak bisa menurunkan, mengunci, atau mengganti sandi
// admin lain dari sini, termasuk dirinya sendiri. Membuat admin baru tetap
// hanya lewat scripts/admin/buat-akun.mjs.
//
// Catatan: koleksi /officers yang ada di firestore.rules & data.js adalah
// daftar tampilan lama (nama + kode + lokasi) yang tidak pernah terhubung ke
// akun Auth mana pun. Petugas yang SUNGGUHAN adalah akun Auth + users/{uid}
// .role == 'petugas' — itu yang dipakai app.js, dan itu yang dikelola di sini.
// ============================================================
import { app, db, json, preflight, uidDariToken, adalahAdmin } from "./lib/_lib.js";

const SANDI_MIN = 6;            // batas keras Firebase Auth
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAKS_DAFTAR = 200;        // panel bukan alat ekspor; 200 sudah jauh di atas kebutuhan
const MAKS_LOOKUP = 100;        // batas satu panggilan auth.getUsers()

// firebase-admin/auth dimuat SAAT DIPAKAI, bukan di puncak berkas.
//
// _lib.js sengaja tidak pernah menyentuhnya (lihat uidDariToken): rantai
// jwks-rsa → jose pernah dua kali meruntuhkan function pembayaran di Netlify,
// dan yang terakhir menyaru jadi "token ditolak" karena import-nya gagal di
// dalam blok try. Di sini modul itu memang tak terhindarkan — hanya Admin SDK
// yang bisa membuat akun — jadi tiga hal dijaga:
//
//   • letaknya di function TERSENDIRI, jadi kalau ia gagal dimuat, jalur
//     pembayaran tidak ikut mati;
//   • gagalnya dilaporkan dengan kode sendiri ("auth_sdk"), bukan menyamar
//     jadi galat lain — persis pelajaran dari kejadian 25 Agu 2026;
//   • NODE_VERSION = "22" di netlify.toml adalah syaratnya (runtime 20 milik
//     Netlify masih 20.x lawas yang tidak bisa require() modul ESM). Jangan
//     turunkan angka itu selama berkas ini ada.
let _auth = null;
async function authAdmin() {
  if (_auth) return _auth;
  try {
    const { getAuth } = await import("firebase-admin/auth");
    _auth = getAuth(app);
    return _auth;
  } catch (e) {
    console.error("kelola-petugas: firebase-admin/auth gagal dimuat:", e);
    const err = new Error("auth_sdk");
    err.kode = "auth_sdk";
    throw err;
  }
}

const bersih = (v, maks) => String(v ?? "").trim().slice(0, maks);

// Peran yang BERLAKU untuk sebuah uid. Dokumen tanpa field 'role' dibaca
// sebagai 'pelanggan' — sama persis dengan roleOf() di firestore.rules dan
// dengan auth.js; kalau ketiganya berbeda, akun bisa tampak petugas di panel
// tapi ditolak server (atau lebih buruk, sebaliknya).
async function peranDari(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? (snap.data().role || "pelanggan") : "pelanggan";
}

// Jejak audit. Mengganti sandi petugas = memegang akunnya, dan akun petugas
// memverifikasi kendaraan di lapangan — jadi siapa melakukan apa harus ada
// catatannya di luar log Netlify yang hanya bertahan beberapa hari.
// Koleksi ini tidak punya match di firestore.rules, jadi Firestore menolak
// SEMUA akses dari browser (default deny) — hanya Admin SDK yang bisa membaca.
async function catat(aksi, oleh, target, extra = {}) {
  try {
    await db.collection("auditPetugas").add({
      aksi, oleh, targetUid: target?.uid || null, targetEmail: target?.email || null,
      at: Date.now(), ...extra,
    });
  } catch (e) {
    // Audit gagal TIDAK boleh menggagalkan aksinya: akun sudah telanjur
    // dibuat/diubah, dan membalas galat hanya membuat panel mencoba lagi.
    console.warn("kelola-petugas: audit gagal:", e.message);
  }
}

// Semua aksi ber-target memakai gerbang yang sama: target harus ada dan harus
// petugas. Tanpa ini, satu aksi yang lupa memeriksa cukup untuk mengganti
// sandi akun admin lain lewat uid yang ditebak dari mana pun.
async function targetPetugas(uid) {
  const id = bersih(uid, 128);
  if (!id) return { galat: "uid_kosong" };
  const snap = await db.collection("users").doc(id).get();
  if (!snap.exists) return { galat: "target_tak_ada" };
  const data = snap.data();
  const peran = data.role || "pelanggan";
  if (peran !== "petugas") return { galat: peran === "admin" ? "target_admin" : "target_bukan_petugas" };
  return { uid: id, data, email: data.email || null };
}

// ---------- aksi ----------

async function daftar() {
  const auth = await authAdmin();
  const snap = await db.collection("users").where("role", "==", "petugas").limit(MAKS_DAFTAR).get();

  // Status nonaktif & jejak login hanya ada di Auth, bukan di Firestore.
  // Dibaca berkelompok (maks 100 per panggilan) supaya 200 petugas tetap 2
  // perjalanan, bukan 200.
  const infoAuth = new Map();
  const uids = snap.docs.map((d) => d.id);
  for (let i = 0; i < uids.length; i += MAKS_LOOKUP) {
    const { users } = await auth.getUsers(uids.slice(i, i + MAKS_LOOKUP).map((uid) => ({ uid })));
    users.forEach((u) => infoAuth.set(u.uid, u));
  }

  const list = snap.docs.map((d) => {
    const f = d.data();
    const a = infoAuth.get(d.id);
    return {
      uid: d.id,
      nama: f.name || "",
      email: f.email || a?.email || "",
      nonaktif: a ? !!a.disabled : false,
      // Dokumen peran ada tapi akun Auth-nya sudah tidak ada (dihapus lewat
      // Console). Ditandai, bukan disembunyikan: selama dokumennya tinggal,
      // rules masih menganggap uid itu petugas.
      yatim: !a,
      terakhirMasuk: a?.metadata?.lastSignInTime || null,
      dibuat: a?.metadata?.creationTime || null,
    };
  }).sort((x, y) => (x.nama || x.email).localeCompare(y.nama || y.email, "id"));

  return { list, batas: MAKS_DAFTAR, terpotong: snap.size === MAKS_DAFTAR };
}

async function buat(req, body, olehUid) {
  const auth = await authAdmin();
  const email = bersih(body.email, 120).toLowerCase();
  const nama = bersih(body.nama, 60);
  const sandi = String(body.sandi ?? "");

  if (!EMAIL_RE.test(email)) return json(req, 400, { error: "email_invalid" });
  if (sandi.length < SANDI_MIN) return json(req, 400, { error: "sandi_pendek", min: SANDI_MIN });

  let user = null;
  try { user = await auth.getUserByEmail(email); }
  catch (e) { if (e.code !== "auth/user-not-found") throw e; }

  let baru = false;
  if (user) {
    // Email sudah dipakai. Dua kemungkinan yang harus dibedakan, karena
    // akibatnya jauh berbeda: mengangkat pelanggan biasa jadi petugas itu
    // wajar, sedangkan menimpa sandi akun admin tidak boleh terjadi sama
    // sekali dari sini.
    const peran = await peranDari(user.uid);
    if (peran === "admin") return json(req, 409, { error: "email_admin" });
    // Panel bertanya dulu ke penggunanya ("akun ini sudah ada — jadikan
    // petugas?") lalu mengirim ulang dengan penanda ini. Tanpa penanda,
    // salah ketik email milik pelanggan lain akan diam-diam mengganti
    // sandinya dan mengangkatnya jadi petugas.
    if (!body.pakaiYangAda) return json(req, 409, { error: "email_terpakai", uid: user.uid, peran });
    await auth.updateUser(user.uid, {
      password: sandi,
      ...(nama ? { displayName: nama } : {}),
      emailVerified: true,
    });
  } else {
    user = await auth.createUser({
      email, password: sandi,
      displayName: nama || email.split("@")[0],
      emailVerified: true,
    });
    baru = true;
  }

  const ref = db.collection("users").doc(user.uid);
  const sebelum = (await ref.get()).data() || {};
  await ref.set({
    role: "petugas",
    email,
    // Nama yang sudah ada tidak ditimpa kalau admin mengosongkan kolomnya.
    ...(nama || !sebelum.name ? { name: nama || user.displayName || email.split("@")[0] } : {}),
  }, { merge: true });

  await catat(baru ? "buat" : "angkat", olehUid, { uid: user.uid, email }, { peranSebelum: sebelum.role || null });
  return json(req, 200, { ok: true, baru, uid: user.uid, email });
}

async function ubah(req, body, olehUid) {
  const auth = await authAdmin();
  const t = await targetPetugas(body.uid);
  if (t.galat) return json(req, 400, { error: t.galat });

  const nama = bersih(body.nama, 60);
  const sandi = body.sandi === undefined || body.sandi === null || body.sandi === "" ? null : String(body.sandi);
  if (sandi !== null && sandi.length < SANDI_MIN) return json(req, 400, { error: "sandi_pendek", min: SANDI_MIN });
  if (!nama && sandi === null) return json(req, 400, { error: "tidak_ada_perubahan" });

  const patch = {};
  if (nama) patch.displayName = nama;
  if (sandi !== null) patch.password = sandi;
  await auth.updateUser(t.uid, patch);
  if (nama) await db.collection("users").doc(t.uid).set({ name: nama }, { merge: true });

  await catat("ubah", olehUid, t, { namaDiubah: !!nama, sandiDiubah: sandi !== null });
  return json(req, 200, { ok: true });
}

async function nonaktif(req, body, olehUid) {
  const auth = await authAdmin();
  const t = await targetPetugas(body.uid);
  if (t.galat) return json(req, 400, { error: t.galat });

  const off = body.nonaktif !== false;
  // disabled di Auth, BUKAN sekadar penanda di Firestore: akun yang di-disable
  // ditolak Firebase saat login dan token yang masih hidup berhenti disegarkan
  // — penanda di Firestore hanya akan mengubah tampilan.
  await auth.updateUser(t.uid, { disabled: off });
  await catat(off ? "nonaktif" : "aktif", olehUid, t);
  return json(req, 200, { ok: true, nonaktif: off });
}

async function cabut(req, body, olehUid) {
  const t = await targetPetugas(body.uid);
  if (t.galat) return json(req, 400, { error: t.galat });

  // Akun Auth-nya TIDAK disentuh — orangnya tetap bisa masuk, hanya kembali
  // jadi pelanggan biasa. Ini yang dipakai saat petugas pindah tugas;
  // 'hapus' untuk akun yang memang harus lenyap.
  await db.collection("users").doc(t.uid).set({ role: "pelanggan" }, { merge: true });
  await catat("cabut", olehUid, t);
  return json(req, 200, { ok: true });
}

async function hapus(req, body, olehUid) {
  const auth = await authAdmin();
  const t = await targetPetugas(body.uid);
  if (t.galat) return json(req, 400, { error: t.galat });

  // Akun Auth dulu, dokumen peran belakangan. Urutan ini disengaja: kalau
  // penghapusan Auth gagal di tengah, yang tertinggal adalah akun yang masih
  // petugas (aman, tinggal diulang). Urutan terbalik meninggalkan akun Auth
  // hidup TANPA dokumen peran — masih bisa login sebagai pelanggan, tapi tak
  // terlihat lagi di panel mana pun.
  try {
    await auth.deleteUser(t.uid);
  } catch (e) {
    // Akun Auth-nya sudah lebih dulu dihapus lewat Console: dokumen peran yang
    // tertinggal justru inti masalahnya, jadi lanjutkan menghapusnya.
    if (e.code !== "auth/user-not-found") throw e;
  }
  await db.collection("users").doc(t.uid).delete();
  await catat("hapus", olehUid, t);
  return json(req, 200, { ok: true });
}

// ---------- handler ----------
export default async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  try {
    const uid = await uidDariToken(req);
    if (!uid) return json(req, 401, { error: "unauthenticated" });
    // Pemanggil harus admin MENURUT FIRESTORE, bukan menurut apa pun yang
    // dikirim browser — sumber kebenaran yang sama dengan firestore.rules.
    if (!(await adalahAdmin(uid))) return json(req, 403, { error: "forbidden" });

    let body = {};
    try { body = await req.json(); } catch { /* body kosong/rusak */ }

    switch (body.aksi) {
      case "daftar":   return json(req, 200, await daftar());
      case "buat":     return await buat(req, body, uid);
      case "ubah":     return await ubah(req, body, uid);
      case "nonaktif": return await nonaktif(req, body, uid);
      case "cabut":    return await cabut(req, body, uid);
      case "hapus":    return await hapus(req, body, uid);
      default:         return json(req, 400, { error: "aksi_tak_dikenal" });
    }
  } catch (e) {
    if (e.kode === "auth_sdk") return json(req, 503, { error: "auth_sdk" });
    // Galat Firebase Auth punya kode yang berguna bagi admin di layar
    // ("email sudah dipakai", "sandi terlalu lemah") — diteruskan apa adanya,
    // sisanya disembunyikan.
    if (typeof e.code === "string" && e.code.startsWith("auth/")) {
      console.warn("kelola-petugas:", e.code, e.message);
      return json(req, 400, { error: e.code });
    }
    console.error("kelola-petugas:", e);
    return json(req, 500, { error: "internal" });
  }
};

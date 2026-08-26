// ============================================================
// Uji netlify/functions/kelola-petugas.js — kelola akun petugas dari panel.
//
// Yang dibuktikan di sini bukan "bisa membuat akun", melainkan bahwa endpoint
// yang bisa MEMBUAT AKUN tidak bisa dipakai oleh siapa pun selain admin, dan
// tidak bisa menyentuh akun admin — termasuk lewat uid yang ditebak. Endpoint
// ini memegang kunci service account: satu pemeriksaan yang lupa dipasang
// berarti pengangkatan peran gratis untuk siapa saja.
//
// Jalankan:
//   firebase emulators:start --only firestore,auth --project quparkir   (terminal 1)
//   node scripts/admin/uji-kelola-petugas.mjs                           (terminal 2)
// ============================================================
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
// FIREBASE_AUTH_EMULATOR_HOST punya dua tugas sekaligus: membuat
// firebase-admin/auth bicara ke emulator, DAN membuat uidDariToken() melewati
// pemeriksaan tanda tangan (lihat _lib.js) sehingga token uji bisa dirakit di
// sini tanpa kunci apa pun. Klaim lain — aud, iss, exp, iat, sub — tetap
// diperiksa penuh.
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
// Proyek sendiri: emulator memisahkan datanya per projectId, jadi uji ini
// tidak menyentuh (dan tidak dirusak oleh) uji lain yang sedang jalan.
process.env.FB_PROJECT_ID ||= "quparkir-uji-petugas";

const { app, db } = await import("../../netlify/functions/lib/_lib.js");
const kelola = (await import("../../netlify/functions/kelola-petugas.js")).default;
const auth = (await import("firebase-admin/auth")).getAuth(app);

const PROYEK = process.env.FB_PROJECT_ID;
const ADMIN = "uid-admin-uji", PELANGGAN = "uid-pelanggan-uji";
const EMAIL_PETUGAS = "petugas-uji@quparkir.test";
const EMAIL_ADMIN = "admin-uji@quparkir.test";

let pass = 0, fail = 0;
function t(nama, syarat, keterangan = "") {
  if (syarat) { console.log("  ✔", nama); pass++; }
  else { console.log("  ✘", nama, keterangan ? "→ " + keterangan : ""); fail++; }
}

// Emulator menyimpan data antar-jalan. Tanpa membersihkannya, "petugas
// terdaftar 1 orang" akan menghitung sisa percobaan sebelumnya — kegagalan
// palsu yang paling membuang waktu.
async function bersihkan() {
  const fs = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROYEK}/databases/(default)/documents`;
  const auth = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROYEK}/accounts`;
  for (const url of [fs, auth]) {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) throw new Error("Gagal membersihkan emulator: HTTP " + res.status + " " + url);
  }
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function tokenUntuk(uid) {
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: "none", typ: "JWT" }) + "." + b64({
    iss: "https://securetoken.google.com/" + PROYEK, aud: PROYEK,
    sub: uid, user_id: uid, auth_time: now, iat: now, exp: now + 3600,
    firebase: { identities: {}, sign_in_provider: "custom" },
  }) + ".";
}

// `tanpaToken` menguji jalur 401 — bukan sekadar 403 dengan pesan lain.
async function panggil(muatan, { uid = ADMIN, tanpaToken = false } = {}) {
  const res = await kelola(new Request("http://localhost/.netlify/functions/kelola-petugas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(tanpaToken ? {} : { authorization: "Bearer " + tokenUntuk(uid) }),
    },
    body: JSON.stringify(muatan),
  }));
  let body = {};
  try { body = await res.json(); } catch { /* tanpa body */ }
  return { status: res.status, body };
}

// Keadaan akun MENURUT AUTH, bukan menurut dokumen Firestore-nya. Yang
// diperiksa: akunnya ada, terkunci atau tidak, dan sandi apa yang tersimpan.
//
// Sandi dibaca dari passwordHash, bukan dengan login sungguhan: emulator
// menyimpannya apa adanya ("fakeHash:salt=…:password=…"), dan endpoint
// signInWithPassword miliknya SELALU menuju proyek bawaan emulator — bukan
// proyek terpisah yang dipakai uji ini, jadi login dari sini selalu berbalas
// EMAIL_NOT_FOUND betapa pun benarnya sandinya. Membandingkan hash palsu itu
// membuktikan hal yang sama: sandi yang dikirim panel benar-benar sampai ke
// akun yang benar.
async function akunAuth(email) {
  const { users } = await auth.listUsers(1000);
  return users.find((u) => u.email === email) || null;
}
const sandiTersimpan = (u) => (u?.passwordHash || "").split(":password=")[1] ?? null;

const peranDi = async (uid) => (await db.collection("users").doc(uid).get()).data()?.role ?? "(tak ada dokumen)";

await bersihkan();

// Dua akun pemanggil: yang satu admin, yang satu pelanggan biasa. Keduanya
// hanya perlu dokumen users — peran dibaca dari sana, sama seperti rules.
await db.collection("users").doc(ADMIN).set({ role: "admin", email: EMAIL_ADMIN, name: "Admin Uji" });
await db.collection("users").doc(PELANGGAN).set({ role: "pelanggan", email: "pelanggan@quparkir.test" });

console.log("\n1. Gerbang: siapa yang boleh memanggil");
{
  const a = await panggil({ aksi: "daftar" }, { tanpaToken: true });
  t("tanpa token → 401", a.status === 401, a.status + " " + JSON.stringify(a.body));

  const b = await panggil({ aksi: "daftar" }, { uid: PELANGGAN });
  t("pelanggan → 403", b.status === 403, b.status + " " + JSON.stringify(b.body));

  const c = await panggil({ aksi: "buat", email: "curang@quparkir.test", sandi: "rahasia123" }, { uid: PELANGGAN });
  t("pelanggan tidak bisa membuat petugas", c.status === 403, c.status + " " + JSON.stringify(c.body));
  const masih = await db.collection("users").where("role", "==", "petugas").get();
  t("tidak ada petugas yang lahir dari panggilan itu", masih.empty, masih.size + " dokumen");

  const d = await panggil({ aksi: "entah-apa" });
  t("aksi tak dikenal → 400", d.status === 400 && d.body.error === "aksi_tak_dikenal", JSON.stringify(d.body));
}

console.log("\n2. Membuat akun petugas");
let uidPetugas = null;
{
  const pendek = await panggil({ aksi: "buat", email: EMAIL_PETUGAS, sandi: "12345" });
  t("sandi < 6 karakter ditolak", pendek.status === 400 && pendek.body.error === "sandi_pendek", JSON.stringify(pendek.body));

  const salahEmail = await panggil({ aksi: "buat", email: "bukan-email", sandi: "rahasia123" });
  t("email tidak sah ditolak", salahEmail.status === 400 && salahEmail.body.error === "email_invalid", JSON.stringify(salahEmail.body));

  const ok = await panggil({ aksi: "buat", email: EMAIL_PETUGAS, sandi: "rahasia123", nama: "Petugas Uji" });
  t("admin membuat petugas → 200", ok.status === 200 && ok.body.baru === true, JSON.stringify(ok.body));
  uidPetugas = ok.body.uid;

  t("peran tertulis 'petugas' di Firestore", (await peranDi(uidPetugas)) === "petugas");
  const akun = await akunAuth(EMAIL_PETUGAS);
  t("akun Auth-nya sungguh dibuat", !!akun && akun.uid === uidPetugas);
  t("sandi yang diketik admin yang tersimpan", sandiTersimpan(akun) === "rahasia123", sandiTersimpan(akun));
  t("nama tampilannya ikut terpasang", akun?.displayName === "Petugas Uji", akun?.displayName);

  const lagi = await panggil({ aksi: "buat", email: EMAIL_PETUGAS, sandi: "rahasia456" });
  t("email yang sudah dipakai → 409 (bukan diam-diam menimpa sandi)",
    lagi.status === 409 && lagi.body.error === "email_terpakai", JSON.stringify(lagi.body));
  t("sandi lamanya memang tidak berubah",
    sandiTersimpan(await akunAuth(EMAIL_PETUGAS)) === "rahasia123");
}

console.log("\n3. Akun admin tidak bisa disentuh dari panel ini");
{
  // Admin uji perlu akun Auth sungguhan supaya jalur "email sudah dipakai"
  // benar-benar melewati getUserByEmail, bukan berhenti di dokumen Firestore.
  const akunAdmin = await auth.createUser({ uid: ADMIN, email: EMAIL_ADMIN, password: "rahasia-admin" });

  const a = await panggil({ aksi: "buat", email: EMAIL_ADMIN, sandi: "sandi-baru", pakaiYangAda: true });
  t("membuat ulang email admin ditolak", a.status === 409 && a.body.error === "email_admin", JSON.stringify(a.body));
  t("sandi admin tidak berubah", sandiTersimpan(await akunAuth(EMAIL_ADMIN)) === "rahasia-admin");

  for (const aksi of ["ubah", "nonaktif", "cabut", "hapus"]) {
    const r = await panggil({ aksi, uid: akunAdmin.uid, nama: "X", sandi: "sandi-baru", nonaktif: true });
    t(`'${aksi}' terhadap akun admin ditolak`, r.status === 400 && r.body.error === "target_admin", JSON.stringify(r.body));
  }
  t("admin tetap admin", (await peranDi(ADMIN)) === "admin");

  const hantu = await panggil({ aksi: "ubah", uid: "uid-yang-tidak-ada", nama: "X" });
  t("uid tak dikenal ditolak", hantu.status === 400 && hantu.body.error === "target_tak_ada", JSON.stringify(hantu.body));
}

console.log("\n4. Daftar, ubah, nonaktifkan");
{
  const d = await panggil({ aksi: "daftar" });
  const baris = d.body.list?.find((x) => x.uid === uidPetugas);
  t("daftar berisi petugas tadi", !!baris, JSON.stringify(d.body).slice(0, 200));
  t("namanya ikut terbaca", baris?.nama === "Petugas Uji", baris?.nama);
  t("statusnya aktif", baris?.nonaktif === false && baris?.yatim === false, JSON.stringify(baris));
  t("admin TIDAK ikut terdaftar sebagai petugas", !d.body.list?.some((x) => x.uid === ADMIN));

  const u = await panggil({ aksi: "ubah", uid: uidPetugas, nama: "Petugas Baru", sandi: "sandi-baru-9" });
  t("ubah nama + sandi → 200", u.status === 200, JSON.stringify(u.body));
  t("nama tersimpan di Firestore", (await db.collection("users").doc(uidPetugas).get()).data().name === "Petugas Baru");
  const sesudah = await akunAuth(EMAIL_PETUGAS);
  t("sandi barunya yang tersimpan", sandiTersimpan(sesudah) === "sandi-baru-9", sandiTersimpan(sesudah));
  t("nama tampilan di Auth ikut berubah", sesudah?.displayName === "Petugas Baru", sesudah?.displayName);

  const kosong = await panggil({ aksi: "ubah", uid: uidPetugas });
  t("ubah tanpa perubahan apa pun ditolak", kosong.status === 400 && kosong.body.error === "tidak_ada_perubahan", JSON.stringify(kosong.body));

  const off = await panggil({ aksi: "nonaktif", uid: uidPetugas, nonaktif: true });
  t("nonaktifkan → 200", off.status === 200, JSON.stringify(off.body));
  // disabled DI AUTH, bukan sekadar penanda di Firestore: itu yang membuat
  // Firebase menolak login dan berhenti menyegarkan token yang masih hidup.
  t("akunnya terkunci di Auth", (await akunAuth(EMAIL_PETUGAS))?.disabled === true);
  const d2 = await panggil({ aksi: "daftar" });
  t("daftar menandainya nonaktif", d2.body.list?.find((x) => x.uid === uidPetugas)?.nonaktif === true);

  const on = await panggil({ aksi: "nonaktif", uid: uidPetugas, nonaktif: false });
  t("aktifkan lagi → kuncinya terbuka", on.status === 200 && (await akunAuth(EMAIL_PETUGAS))?.disabled === false);
}

console.log("\n5. Cabut peran & hapus akun");
{
  const c = await panggil({ aksi: "cabut", uid: uidPetugas });
  t("cabut → 200", c.status === 200, JSON.stringify(c.body));
  t("perannya jadi pelanggan", (await peranDi(uidPetugas)) === "pelanggan");
  t("akun Auth-nya masih hidup & tidak terkunci", (await akunAuth(EMAIL_PETUGAS))?.disabled === false);

  const h = await panggil({ aksi: "hapus", uid: uidPetugas });
  t("hapus terhadap yang bukan petugas ditolak",
    h.status === 400 && h.body.error === "target_bukan_petugas", JSON.stringify(h.body));

  const angkat = await panggil({ aksi: "buat", email: EMAIL_PETUGAS, sandi: "sandi-baru-9", pakaiYangAda: true });
  t("mengangkat akun yang sudah ada jadi petugas", angkat.status === 200 && angkat.body.baru === false, JSON.stringify(angkat.body));
  t("uid-nya sama, bukan akun kedua", angkat.body.uid === uidPetugas);
  t("perannya petugas lagi", (await peranDi(uidPetugas)) === "petugas");

  const h2 = await panggil({ aksi: "hapus", uid: uidPetugas });
  t("hapus → 200", h2.status === 200, JSON.stringify(h2.body));
  t("dokumen perannya ikut hilang", (await peranDi(uidPetugas)) === "(tak ada dokumen)");
  t("akun Auth-nya sudah tidak ada", (await akunAuth(EMAIL_PETUGAS)) === null);
  const d = await panggil({ aksi: "daftar" });
  t("daftar kembali kosong", (d.body.list || []).length === 0, JSON.stringify(d.body.list));
}

console.log("\n6. Jejak audit");
{
  const snap = await db.collection("auditPetugas").get();
  const aksi = snap.docs.map((x) => x.data().aksi);
  t("setiap perubahan tercatat", snap.size >= 6, aksi.join(","));
  t("mencatat siapa yang melakukannya", snap.docs.every((x) => x.data().oleh === ADMIN));
  t("aksi hapus tercatat", aksi.includes("hapus"), aksi.join(","));
}

console.log(`\n${fail ? "❌" : "✅"} ${pass} lulus, ${fail} gagal\n`);
process.exit(fail ? 1 : 0);

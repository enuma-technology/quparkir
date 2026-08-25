// ============================================================
// Uji midtrans-webhook TANPA deploy dan TANPA menyentuh data produksi.
//
// Kenapa ada: tiga skenario terpenting di PAYMENT-SETUP.md §8 — tanda tangan
// palsu ditolak, notifikasi ganda tidak menutup sesi dua kali, dan nominal yang
// tidak cocok tidak meluluskan pembayaran — semuanya soal perilaku SERVER.
// Menguji lewat deploy berulang membakar 15 kredit Netlify sekali jalan;
// menguji di sini gratis dan berjalan dalam hitungan detik.
//
// Yang diuji adalah berkas function yang sungguhan (diimpor apa adanya), bukan
// tiruannya. Yang dipalsukan hanya dua: alamat Firestore (diarahkan ke
// emulator) dan Server Key (diisi nilai uji) — jadi tidak ada satu pun kunci
// asli yang perlu dibuka, disalin, atau dibaca berkasnya.
//
// Jalankan:
//   firebase emulators:start --only firestore --project quparkir   (terminal 1)
//   node scripts/midtrans/uji-webhook.mjs                          (terminal 2)
// ============================================================
import crypto from "node:crypto";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FB_PROJECT_ID ||= "quparkir-uji-webhook";
// Kunci uji, sengaja dipasang SEBELUM function diimpor. Kunci sungguhan tidak
// pernah dipakai di sini — dan memang tidak boleh.
process.env.MIDTRANS_SERVER_KEY = "kunci-uji-lokal";

const { db } = await import("../../netlify/functions/lib/_lib.js");
const webhook = (await import("../../netlify/functions/midtrans-webhook.js")).default;

// Emulator menyimpan data antar-jalan. Tanpa membersihkannya, hitungan seperti
// "transaksi tercatat 1×" akan menghitung sisa percobaan sebelumnya dan uji
// yang benar terlihat gagal — kegagalan palsu yang paling membuang waktu.
async function bersihkanEmulator(proyek) {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${proyek}/databases/(default)/documents`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Gagal membersihkan emulator: HTTP " + res.status);
}
await bersihkanEmulator(process.env.FB_PROJECT_ID);

const KUNCI = process.env.MIDTRANS_SERVER_KEY;
const JAM = 3600000;

let pass = 0, fail = 0;
function t(nama, syarat, keterangan = "") {
  if (syarat) { console.log("  ✔", nama); pass++; }
  else { console.log("  ✘", nama, keterangan ? "→ " + keterangan : ""); fail++; }
}

const tandaTangan = (orderId, statusCode, gross) =>
  crypto.createHash("sha512").update(orderId + statusCode + gross + KUNCI).digest("hex");

const notifikasi = (orderId, { status = "settlement", gross = "6000", kode = "200", tandaTanganPalsu = false } = {}) => ({
  order_id: orderId,
  status_code: kode,
  gross_amount: gross,
  transaction_status: status,
  fraud_status: "accept",
  transaction_id: "trx-" + orderId,
  payment_type: "qris",
  signature_key: tandaTanganPalsu ? "0".repeat(128) : tandaTangan(orderId, kode, gross),
});

const kirim = (body) =>
  webhook(new Request("http://localhost/.netlify/functions/midtrans-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));

// ---------- Data uji ----------
const UID = "uid-uji";
const LOC = "loc-uji";

async function siapkan(kode, { amount = 6000, statusSesi = "active" } = {}) {
  const sessionId = "sesi-" + kode;
  const orderId = "QP-" + kode;
  await db.collection("locations").doc(LOC).set({
    name: "Lokasi Uji", capMotor: 10, occMotor: 3, capCar: 5, occCar: 1 });
  await db.collection("sessions").doc(sessionId).set({
    uid: UID, vehicle: { type: "motor", plate: "AD 1234 XX" },
    locationId: LOC, locationName: "Lokasi Uji",
    checkinAt: Date.now() - 5 * JAM, status: statusSesi, verified: false });
  await db.collection("users").doc(UID).set({ name: "Penguji", activeSession: sessionId });
  await db.collection("orders").doc(orderId).set({
    uid: UID, sessionId, amount, status: "pending", createdAt: new Date() });
  return { sessionId, orderId };
}

const ambil = async (kol, id) => (await db.collection(kol).doc(id).get()).data();
const jumlahTransaksi = async (sessionId) =>
  (await db.collection("transactions").where("sessionId", "==", sessionId).get()).size;

// ---------- Skenario ----------
console.log("\n— TANDA TANGAN —");
{
  const { orderId, sessionId } = await siapkan("ttd");
  const res = await kirim(notifikasi(orderId, { tandaTanganPalsu: true }));
  t("tanda tangan palsu → 403", res.status === 403, "status " + res.status);
  t("order tetap pending", (await ambil("orders", orderId)).status === "pending");
  t("sesi tidak ikut tertutup", (await ambil("sessions", sessionId)).status === "active");
}

console.log("\n— PEMBAYARAN LUNAS —");
let lunas;
{
  lunas = await siapkan("lunas");
  const res = await kirim(notifikasi(lunas.orderId));
  const o = await ambil("orders", lunas.orderId);
  const s = await ambil("sessions", lunas.sessionId);
  const loc = await ambil("locations", LOC);
  const u = await ambil("users", UID);
  t("dibalas 200", res.status === 200, "status " + res.status);
  t("order jadi paid", o.status === "paid", o.status);
  t("sesi jadi done", s.status === "done", s.status);
  t("nominal sesi = nominal order", s.amount === 6000, String(s.amount));
  t("transaksi tercatat 1×", (await jumlahTransaksi(lunas.sessionId)) === 1);
  t("slot motor dikembalikan (3 → 2)", loc.occMotor === 2, String(loc.occMotor));
  t("kunci anti double-parking dilepas", u.activeSession === null, String(u.activeSession));
}

console.log("\n— NOTIFIKASI GANDA (idempotensi) —");
{
  const res = await kirim(notifikasi(lunas.orderId));
  t("dibalas 200", res.status === 200, "status " + res.status);
  t("transaksi tetap 1×, tidak dobel", (await jumlahTransaksi(lunas.sessionId)) === 1);
  t("slot tidak dikurangi dua kali", (await ambil("locations", LOC)).occMotor === 2);
}

console.log("\n— NOMINAL TIDAK COCOK —");
{
  const { orderId, sessionId } = await siapkan("beda");
  const res = await kirim(notifikasi(orderId, { gross: "1000" }));
  t("dibalas 200 (tidak diulang Midtrans)", res.status === 200, "status " + res.status);
  t("order ditandai mismatch", (await ambil("orders", orderId)).status === "mismatch");
  t("sesi TETAP aktif — belum dianggap lunas", (await ambil("sessions", sessionId)).status === "active");
  t("tidak ada transaksi tercatat", (await jumlahTransaksi(sessionId)) === 0);
}

console.log("\n— KEDALUWARSA —");
{
  const { orderId, sessionId } = await siapkan("kadaluarsa");
  await kirim(notifikasi(orderId, { status: "expire", kode: "407" }));
  t("order jadi failed", (await ambil("orders", orderId)).status === "failed");
  t("sesi tetap aktif", (await ambil("sessions", sessionId)).status === "active");
}

console.log("\n— ORDER TAK DIKENAL —");
{
  const res = await kirim(notifikasi("QP-tidak-ada"));
  // 200, bukan 500: mengulanginya tidak akan pernah mengubah apa pun, dan
  // Midtrans akan mengetuk berjam-jam kalau dibalas galat.
  t("dibalas 200 tanpa membuat apa pun", res.status === 200, "status " + res.status);
  t("tidak ada dokumen order baru", !(await db.collection("orders").doc("QP-tidak-ada").get()).exists);
}

console.log("\n— TOP UP LEWAT GATEWAY —");
// Order top up tidak punya sesi parkir: yang bertambah adalah saldo, dan
// pertambahannya HARUS datang dari webhook — bukan dari tombol di browser.
{
  const orderId = "TU-uji";
  await db.collection("users").doc(UID).set({ name: "Penguji", wallet: 25000 });
  await db.collection("orders").doc(orderId).set({
    uid: UID, jenis: "topup", amount: 50000, status: "pending", createdAt: new Date() });

  const res = await kirim(notifikasi(orderId, { gross: "50000" }));
  const u = await ambil("users", UID);
  const catatan = await db.collection("topups").where("orderId", "==", orderId).get();
  t("dibalas 200", res.status === 200, "status " + res.status);
  t("order jadi paid", (await ambil("orders", orderId)).status === "paid");
  t("saldo bertambah 25.000 → 75.000", u.wallet === 75000, String(u.wallet));
  t("tercatat di /topups sebagai approved", catatan.size === 1 && catatan.docs[0].data().status === "approved");
  t("penyetujunya sistem, bukan petugas", catatan.docs[0]?.data().handledBy === "sistem");

  // Midtrans memang mengirim ulang notifikasi; saldo tidak boleh ikut berlipat.
  await kirim(notifikasi(orderId, { gross: "50000" }));
  t("notifikasi ganda: saldo TETAP 75.000", (await ambil("users", UID)).wallet === 75000, String((await ambil("users", UID)).wallet));
  t("notifikasi ganda: catatan /topups tetap 1", (await db.collection("topups").where("orderId", "==", orderId).get()).size === 1);
}

{
  const orderId = "TU-beda";
  await db.collection("users").doc(UID).set({ name: "Penguji", wallet: 10000 });
  await db.collection("orders").doc(orderId).set({
    uid: UID, jenis: "topup", amount: 50000, status: "pending", createdAt: new Date() });
  await kirim(notifikasi(orderId, { gross: "1000" }));
  t("bayar 1.000 utk top up 50.000 → mismatch", (await ambil("orders", orderId)).status === "mismatch");
  t("saldo tidak bertambah sepeser pun", (await ambil("users", UID)).wallet === 10000);
}

console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
process.exit(fail ? 1 : 0);

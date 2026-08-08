// E2E: jalankan APLIKASI NYATA (hosting emulator) terhadap Auth + Firestore emulator,
// dengan firestore.rules produksi aktif. Membuktikan data benar-benar masuk Firestore.
import { chromium } from "playwright";

const APP = "http://127.0.0.1:5000/app?emu=1";
const FS = "http://127.0.0.1:8080/v1/projects/quparkir/databases/(default)/documents";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const SHOT = process.env.QP_SHOTS || "./.test-shots";

const steps = [];
const ok = (n, extra = "") => { steps.push(["✅", n, extra]); console.log("✅", n, extra); };
const bad = (n, e) => { steps.push(["❌", n, e]); console.log("❌", n, e); };

const api = async (path, init) => {
  const r = await fetch(FS + path, { headers: OWNER, ...init });
  if (!r.ok) throw new Error(path + " → " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
};
const listDocs = async (col) => (await api("/" + col).catch(() => ({}))).documents || [];
const val = (f) => f && (f.stringValue ?? (f.integerValue != null ? Number(f.integerValue) : undefined)
  ?? f.doubleValue ?? f.booleanValue ?? (f.nullValue !== undefined ? null : undefined)
  ?? (f.mapValue ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, val(v)])) : undefined));
const waitFor = async (fn, label, ms = 15000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timeout menunggu: " + label);
    await new Promise(r => setTimeout(r, 400));
  }
};
const flat = (d) => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, val(v)]));

// bersihkan state emulator
await fetch("http://127.0.0.1:8080/emulator/v1/projects/quparkir/databases/(default)/documents", { method: "DELETE" });
await fetch("http://127.0.0.1:9099/emulator/v1/projects/quparkir/accounts", { method: "DELETE" });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  const line = m.type() + ": " + m.text().slice(0, 300);
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300));
  if (process.env.QP_DEBUG) console.log("   [browser]", line);
});

const daftar = async (nama, email) => {
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".auth-card", { timeout: 20000 });
  if (!(await page.locator("text=Buat akun").count())) await page.click("text=Daftar sekarang");
  await page.waitForSelector("text=Buat akun");
  const inp = page.locator(".auth-form input");
  await inp.nth(0).fill(nama);
  await inp.nth(1).fill(email);
  await inp.nth(2).fill("rahasia123");
  await inp.nth(3).fill("rahasia123");
  await page.click("button:has-text('Buat Akun')");
  await page.waitForSelector("#tabbar:not([hidden])", { timeout: 20000 });
};

const masuk = async (email) => {
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".auth-card", { timeout: 20000 });
  if (await page.locator("text=Buat akun").count()) await page.click("text=Masuk di sini");
  const inp = page.locator(".auth-form input");
  await inp.nth(0).fill(email);
  await inp.nth(1).fill("rahasia123");
  await page.click("button:has-text('Masuk')");
  await page.waitForSelector("#tabbar:not([hidden])", { timeout: 20000 });
};

const keluar = async () => {
  await page.evaluate(() => (location.hash = "#/akun"));
  await page.click("button:has-text('Keluar')");
  await page.waitForSelector(".auth-card", { timeout: 15000 });
};

try {
  // ---------- 1. Registrasi (Firebase Auth emulator) ----------
  await daftar("Admin Uji", "admin@quparkir.test");
  const users = await waitFor(async () => {
    const u = await listDocs("users"); return u.length ? u : null;
  }, "dokumen users/{uid} dibuat saat registrasi");
  const adminUid = users[0]?.name.split("/").pop();
  ok("Registrasi email → profil tersimpan di Firestore", "users/" + adminUid + " " + JSON.stringify(flat(users[0])));

  // ---------- 2. Bootstrap admin (setara: Console → users/{uid}.role = admin) ----------
  await api(`/users/${adminUid}?updateMask.fieldPaths=role`, {
    method: "PATCH", body: JSON.stringify({ fields: { role: { stringValue: "admin" } } }),
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#tabbar:not([hidden])", { timeout: 20000 });
  ok("Role admin dibaca app dari Firestore (users/{uid}.role)");

  // ---------- 3. Seeding lokasi dari Dashboard Admin ----------
  await page.evaluate(() => (location.hash = "#/admin"));
  await page.waitForSelector("text=Dashboard Admin", { timeout: 15000 });
  // ensureSeed() otomatis jalan setelah admin login; kalau koleksi masih kosong
  // pakai tombol manual di dashboard.
  const tombol = page.locator("button:has-text('Muat 6 lokasi awal')");
  const locs = await waitFor(async () => {
    const l = await listDocs("locations");
    if (l.length >= 6) return l;
    if (await tombol.count()) await tombol.click().catch(() => {});
    return null;
  }, "6 lokasi ter-seed ke Firestore", 45000);
  if (locs.length !== 6) throw new Error("locations = " + locs.length + ", harusnya 6");
  ok("Seeding kantong parkir → koleksi locations", locs.map(l => flat(l).name).join(", "));
  await page.screenshot({ path: SHOT + "/1-admin.png" });

  // ---------- 4. Alur pelanggan biasa (BUKAN admin → rules diuji sungguhan) ----------
  await page.evaluate(() => (location.hash = "#/akun"));
  await page.click("button:has-text('Keluar')");
  await page.waitForSelector(".auth-card", { timeout: 15000 });
  ok("Logout kembali ke halaman masuk");

  await daftar("Pelanggan Uji", "pelanggan@quparkir.test");
  const uid = await waitFor(async () =>
    (await listDocs("users")).map(d => d.name.split("/").pop()).find(x => x !== adminUid),
    "dokumen users/{uid} pelanggan baru");
  ok("Pelanggan baru terdaftar", "uid=" + uid);
  await page.screenshot({ path: SHOT + "/2-home.png" });

  // Home menampilkan lokasi live dari Firestore
  await page.waitForSelector(".pcard", { timeout: 15000 });
  ok("Home menampilkan kartu 'Parkir Terdekat' dari Firestore (onSnapshot)");

  // Kendaraan
  await page.evaluate(() => (location.hash = "#/kendaraan"));
  await page.click("button:has-text('Tambah Kendaraan')");
  await page.fill("input[placeholder='AD 1234 XY']", "ad 1234 xy");
  await page.fill("input[placeholder='mis. Vario merah (opsional)']", "Vario merah");
  await page.click("button:has-text('Simpan Kendaraan')");
  await page.waitForSelector(".li .t:has-text('AD 1234 XY')", { timeout: 15000 });
  const veh = await waitFor(async () => {
    const v = await listDocs(`users/${uid}/vehicles`); return v.length ? v : null;
  }, "kendaraan tersimpan di users/{uid}/vehicles");
  ok("Tambah kendaraan → users/{uid}/vehicles", JSON.stringify(flat(veh[0])));

  // Cari parkir (peta + daftar live)
  await page.evaluate(() => (location.hash = "#/cari"));
  await page.waitForSelector("button:has-text('Check-in')", { timeout: 20000 });
  ok("Halaman Cari menampilkan live slot dari Firestore");
  await page.screenshot({ path: SHOT + "/3-cari.png" });

  const before = flat((await listDocs("locations")).find(l => l.name.endsWith("loc-square")));

  // Check-in
  await page.evaluate(() => (location.hash = "#/checkin"));
  await page.waitForSelector("#doCheckin", { timeout: 10000 });
  await page.selectOption("select.input", "loc-square");
  await page.click("#doCheckin");
  await page.waitForSelector(".timer", { timeout: 20000 });
  const ses = (await listDocs("sessions")).map(flat);
  if (ses.length !== 1 || ses[0].status !== "active") throw new Error("sesi aktif tidak tercatat: " + JSON.stringify(ses));
  ok("Check-in → sessions dibuat (transaksi atomik)", JSON.stringify({ plat: ses[0].vehicle.plate, lokasi: ses[0].locationName, status: ses[0].status }));

  const afterIn = flat((await listDocs("locations")).find(l => l.name.endsWith("loc-square")));
  if (afterIn.occMotor !== before.occMotor + 1) throw new Error(`occMotor ${before.occMotor} → ${afterIn.occMotor}, harusnya +1`);
  ok("Keterisian lokasi bertambah 1 di transaksi yang sama", `occMotor ${before.occMotor} → ${afterIn.occMotor}`);

  const userDoc = flat(await api(`/users/${uid}`));
  if (!userDoc.activeSession) throw new Error("users/{uid}.activeSession tidak diset (guard anti double-parking)");
  ok("Guard anti double-parking tersimpan", "activeSession=" + userDoc.activeSession);

  // E-ticket QR tampil
  await page.waitForFunction(() => { const q = document.querySelector(".qrbox"); return q && q.children.length > 0; }, null, { timeout: 20000 });
  ok("E-Ticket QR ter-render di halaman Status");
  await page.screenshot({ path: SHOT + "/4-status.png" });

  // Anti double-parking dari UI
  await page.evaluate(() => (location.hash = "#/checkin"));
  await page.waitForSelector("#doCheckin");
  // bersihkan toast lama supaya yang dibaca benar-benar hasil klik ini
  await page.evaluate(() => { const t = document.querySelector("#toast"); t.className = "toast"; t.textContent = ""; });
  await page.click("#doCheckin");
  await page.waitForFunction(() => document.querySelector("#toast")?.textContent.trim().length > 0, null, { timeout: 15000 });
  const pesan = await page.textContent(".toast");
  if (!/double-parking/i.test(pesan)) throw new Error("check-in kedua tidak ditolak: " + pesan);
  if ((await listDocs("sessions")).length !== 1) throw new Error("sesi ganda terbuat!");
  ok("Check-in kedua ditolak", pesan.trim());

  // ---------- Fase PETUGAS: verifikasi e-ticket milik pelanggan lain ----------
  const sesId = (await listDocs("sessions"))[0].name.split("/").pop();
  await keluar();
  await masuk("admin@quparkir.test");           // role admin ⊃ akses petugas
  await page.evaluate(() => (location.hash = "#/petugas"));
  await page.waitForSelector("text=Dashboard Petugas", { timeout: 15000 });
  await page.waitForSelector(".li .t:has-text('AD 1234 XY')", { timeout: 20000 });
  ok("Petugas melihat kendaraan aktif milik pelanggan (rules isPetugas)");
  await page.click("button:has-text('Verifikasi')");
  const ver = await waitFor(async () => {
    const d = flat(await api("/sessions/" + sesId)); return d.verified ? d : null;
  }, "sesi terverifikasi petugas");
  ok("Petugas verifikasi e-ticket → sessions.verified=true", "verifiedBy=" + ver.verifiedBy);
  await page.screenshot({ path: SHOT + "/7-petugas.png" });

  await keluar();
  await masuk("pelanggan@quparkir.test");

  // Check-out + bayar QRIS
  await page.evaluate(() => (location.hash = "#/status"));
  await page.waitForSelector("button:has-text('Check-out & Bayar')", { timeout: 15000 });
  await page.click("button:has-text('Check-out & Bayar')");
  await page.waitForSelector(".modal .t:has-text('QRIS')", { timeout: 10000 });
  await page.click(".modal button:has(.t:text-is('QRIS'))");
  await page.waitForSelector("button:has-text('Saya sudah bayar')", { timeout: 15000 });
  await page.click("button:has-text('Saya sudah bayar')");
  await page.waitForSelector("text=Pembayaran Berhasil", { timeout: 20000 });
  await page.screenshot({ path: SHOT + "/5-struk.png" });

  const ses2 = (await listDocs("sessions")).map(flat)[0];
  if (ses2.status !== "done" || !ses2.amount) throw new Error("sesi tidak selesai: " + JSON.stringify(ses2));
  ok("Check-out → sessions.status=done + tarif dihitung", "Rp " + ses2.amount + " · " + ses2.method);

  const tx = (await listDocs("transactions")).map(flat);
  if (tx.length !== 1 || tx[0].amount !== ses2.amount || tx[0].uid !== uid)
    throw new Error("transaksi tidak tercatat benar: " + JSON.stringify(tx));
  ok("Transaksi pendapatan tercatat atomik", JSON.stringify(tx[0]));

  const afterOut = flat((await listDocs("locations")).find(l => l.name.endsWith("loc-square")));
  if (afterOut.occMotor !== before.occMotor) throw new Error(`occMotor tidak dikembalikan: ${afterOut.occMotor}`);
  ok("Keterisian lokasi dikembalikan saat check-out", `occMotor ${afterIn.occMotor} → ${afterOut.occMotor}`);

  // Riwayat
  await page.click("button:has-text('Lihat Riwayat')");
  await page.waitForSelector(".rolebar", { timeout: 10000 });
  await page.click(".rolebar button:has-text('History')");
  await page.waitForSelector(".li .t", { timeout: 15000 });
  ok("Riwayat menampilkan transaksi selesai dari Firestore");
  await page.screenshot({ path: SHOT + "/6-riwayat.png" });

  // Top up QuPay → wallet di Firestore
  await page.evaluate(() => (location.hash = "#/akun"));
  await page.waitForSelector("button:has-text('Top Up')", { timeout: 10000 });
  await page.click("button:has-text('Top Up')");
  await page.click(".modal button.btn:has-text('Lanjut Bayar'), .modal button.btn:has-text('Top Up')");
  await page.waitForSelector("button:has-text('Saya sudah bayar')", { timeout: 15000 });
  await page.click("button:has-text('Saya sudah bayar')");
  await page.waitForTimeout(2500);
  const w = flat(await api(`/users/${uid}`)).wallet;
  if (!w) throw new Error("wallet tidak tersimpan di users/{uid}");
  ok("Top up QuPay → saldo tersimpan di users/{uid}.wallet", "Rp " + w);

  // Guard peran: pelanggan dilarang membuka dashboard admin
  await page.evaluate(() => (location.hash = "#/admin"));
  await page.waitForTimeout(1200);
  if (await page.locator("text=Rekap Transaksi").count()) throw new Error("pelanggan bisa membuka Dashboard Admin!");
  ok("Guard peran: pelanggan ditolak dari Dashboard Admin");

} catch (e) {
  bad("GAGAL", e.message);
  await page.screenshot({ path: SHOT + "/error.png" }).catch(() => {});
} finally {
  const real = errors.filter(e => !/favicon|manifest|Failed to load resource.*404|sw\.js/i.test(e));
  console.log("\n--- error konsol browser ---");
  console.log(real.length ? real.join("\n") : "(tidak ada)");
  const fails = steps.filter(s => s[0] === "❌").length;
  console.log(`\n${steps.length - fails}/${steps.length} langkah lolos`);
  await browser.close();
  process.exit(fails || real.length ? 1 : 0);
}

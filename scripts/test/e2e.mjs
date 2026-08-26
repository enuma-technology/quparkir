// E2E: jalankan APLIKASI NYATA (hosting emulator) terhadap Auth + Firestore emulator,
// dengan firestore.rules produksi aktif. Membuktikan data benar-benar masuk Firestore.
import { chromium } from "playwright";

const APP = "http://127.0.0.1:5000/app?emu=1";
// Panel admin berdiri sendiri: sejak persetujuan top up jadi hak admin saja,
// e2e harus benar-benar membukanya, bukan menirunya dari app.
const ADMIN = "http://127.0.0.1:5000/admin?emu=1";
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

// Membuat akun langsung di Auth emulator, tanpa lewat UI. Dipakai untuk akun
// PERAN (petugas/admin) yang memang tidak pernah dibuat lewat form pendaftaran.
const AUTH_EMU = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=palsu";
const buatAkunPeran = async (email, nama, peran) => {
  const r = await fetch(AUTH_EMU, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "rahasia123", returnSecureToken: true }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error("buat akun " + email + " gagal: " + JSON.stringify(b).slice(0, 200));
  await api(`/users/${b.localId}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { name: { stringValue: nama }, email: { stringValue: email }, role: { stringValue: peran } } }),
  });
  return b.localId;
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

  // Akun yang sama, sekarang ber-role admin, memuat ulang app pelanggan.
  // Yang benar: app TIDAK terbuka sama sekali — akun admin dialihkan ke
  // /admin. Tab-bar yang sempat muncul di sini berarti admin masih bisa
  // memakai app pelanggan, persis yang ditutup.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/admin(\?|#|$)/, { timeout: 20000 });
  if (await page.locator("#tabbar:not([hidden])").count())
    throw new Error("tab-bar app sempat tergambar untuk akun admin");
  ok("Akun admin dialihkan keluar dari app pelanggan → /admin");
  if (!/dari=app/.test(page.url())) throw new Error("penanda ?dari=app hilang: " + page.url());
  await page.waitForSelector(".auth-notice", { timeout: 15000 });
  ok("Gerbang panel menjelaskan kenapa halamannya berpindah");

  // ---------- 3. Masuk Panel Admin & seeding lokasi ----------
  // Gerbangnya kini Firebase Auth + role admin — akun yang SAMA yang dipakai
  // Firestore Rules untuk memutuskan hak tulis. Sebelumnya di sini ada sandi
  // statis yang tertulis di admin-panel.js dan terbaca siapa pun di DevTools.
  await page.waitForSelector(".auth-card", { timeout: 20000 });
  await page.fill("input[type='email']", "admin@quparkir.test");
  await page.fill("input[placeholder='Kata sandi']", "rahasia123");
  await page.click("button:has-text('Masuk')");
  await page.waitForSelector(".admin-tabs", { timeout: 20000 });
  ok("Admin masuk Panel Admin dengan akun Firebase-nya sendiri");
  await page.click(".admin-tabs button:has-text('Lokasi')");
  await page.waitForSelector("h2:has-text('Lokasi Parkir')", { timeout: 10000 });
  // ensureSeed() otomatis jalan (fire-and-forget) begitu SIAPA PUN login —
  // baik sesi pelanggan di app.html maupun panel admin di sini — dan begitu
  // koleksi berisi 1 dokumen saja, tombol "Muat 6 lokasi awal" langsung
  // sembunyi (hanya tampil untuk koleksi yang BENAR-BENAR kosong). Kalau dua
  // pemicu itu bersamaan menabrak koleksi yang baru diperiksa dalam kondisi
  // sama-sama kosong, hasilnya bisa 1 dokumen "nyangkut" tanpa tombol untuk
  // melanjutkan. Makanya di sini TIDAK hanya mengandalkan klik tombol —
  // begitu ditemukan macet begini, panggil DB.locations.seed() langsung
  // (fungsi yang sama yang dipanggil tombolnya) untuk memastikan progres.
  const tombol = page.locator("button:has-text('Muat 6 lokasi awal')");
  const locs = await waitFor(async () => {
    const l = await listDocs("locations");
    if (l.length >= 6) return l;
    if (await tombol.count()) await tombol.click().catch(() => {});
    else await page.evaluate(async () => { const { DB } = await import("./js/data.js"); await DB.locations.seed(); }).catch(() => {});
    return null;
  }, "6 lokasi ter-seed ke Firestore", 45000);
  if (locs.length !== 6) throw new Error("locations = " + locs.length + ", harusnya 6");
  ok("Seeding kantong parkir → koleksi locations", locs.map(l => flat(l).name).join(", "));
  await page.screenshot({ path: SHOT + "/1-admin.png" });

  // Akun petugas disiapkan sekarang, langsung di Auth emulator: akun PERAN
  // tidak pernah lahir dari form pendaftaran (rules melarang klien menulis
  // `role`), jadi membuatnya lewat UI hanya akan meniru sesuatu yang tidak
  // pernah terjadi.
  const petugasUid = await buatAkunPeran("petugas@quparkir.test", "Petugas Uji", "petugas");
  ok("Akun petugas disiapkan", "uid=" + petugasUid);

  // ---------- 4. Alur pelanggan biasa (BUKAN admin → rules diuji sungguhan) ----------
  // Keluar dari sesi admin lewat panel, bukan lewat app: app tidak bisa dibuka
  // akun admin sama sekali sekarang.
  await page.click(".adm-top button:has-text('Keluar'), button:has-text('Keluar')");
  await page.waitForSelector(".auth-card", { timeout: 20000 });
  ok("Logout dari Panel Admin kembali ke gerbangnya");
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".auth-card", { timeout: 20000 });

  await daftar("Pelanggan Uji", "pelanggan@quparkir.test");
  const uid = await waitFor(async () =>
    (await listDocs("users")).map(d => d.name.split("/").pop()).find(x => x !== adminUid && x !== petugasUid),
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
  // Kendaraan terpilih baru muncul setelah snapshot Firestore pertama tiba
  // (async) — tanpa menunggu ini, klik terlalu cepat kena validasi "Pilih
  // kendaraan" duluan, bukan pesan anti double-parking yang mau diuji.
  await page.waitForSelector(".seg button.active", { timeout: 10000 });
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
  // Akun PETUGAS, bukan admin: sejak akun admin dialihkan keluar dari app,
  // dashboard petugas hanya bisa dicapai oleh peran petugas.
  await masuk("petugas@quparkir.test");
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
  // Judul modalnya "Struk Parkir" sejak v13 — kartu sukses biasa diganti struk
  // yang memuat plat, jam masuk/keluar, dan nomor rujukan, karena itulah yang
  // ditanyakan petugas di lapangan.
  await page.waitForSelector(".modal:has-text('Struk Parkir') .struk .lunas", { timeout: 20000 });
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
  await page.click(".modal .struk ~ div button:has-text('Riwayat'), .modal button.btn:has-text('Riwayat')");
  await page.waitForSelector(".rolebar", { timeout: 10000 });
  await page.click(".rolebar button:has-text('History')");
  await page.waitForSelector(".li .t", { timeout: 15000 });
  ok("Riwayat menampilkan transaksi selesai dari Firestore");
  await page.screenshot({ path: SHOT + "/6-riwayat.png" });

  // ---------- Top up QuPay: permintaan → persetujuan admin → saldo ----------
  //
  // Yang dibuktikan di sini bukan "saldo bertambah", tapi URUTANNYA. Menekan
  // "Saya sudah bayar" TIDAK boleh menambah saldo sepeser pun: QRIS statis
  // tidak memberi tahu aplikasi kapan uang masuk, jadi tombol itu adalah
  // pernyataan pengguna, bukan bukti. Saldo hanya boleh naik setelah admin
  // mencocokkan mutasi di aplikasi GoPay merchant lalu menyetujui.
  const saldoAwal = flat(await api(`/users/${uid}`)).wallet ?? 0;

  await page.evaluate(() => (location.hash = "#/akun"));
  await page.waitForSelector("button:has-text('Top Up')", { timeout: 10000 });
  await page.click("button:has-text('Top Up')");
  await page.waitForSelector(".modal .topup-pad", { timeout: 15000 });

  // Modal dibuka pada NOL, dan "Lanjut Bayar" mati sampai nominalnya sah.
  // Dulu kolomnya terisi 50000 sejak awal — satu klik dan QR Rp 50.000 sudah
  // terbuka tanpa nominalnya pernah dipilih siapa pun.
  const lanjut = page.locator(".modal button.btn:has-text('Lanjut Bayar')");
  if ((await page.textContent(".modal .topup-amt")).replace(/\D/g, "") !== "0")
    throw new Error("nominal awal bukan nol: " + await page.textContent(".modal .topup-amt"));
  if (await lanjut.isEnabled()) throw new Error("'Lanjut Bayar' hidup padahal nominal masih nol");
  ok("Modal top up mulai dari Rp 0, tombol lanjut mati");

  // Di bawah minimal juga harus tetap mati — dan alasannya disebut, bukan
  // ditahan sampai tombolnya ditekan.
  for (const d of ["3", "0", "0", "0"]) await page.click(`.modal .topup-key[aria-label="${d}"]`);
  if (await lanjut.isEnabled()) throw new Error("Rp 3.000 diterima padahal di bawah minimal");
  if (!/Kurang dari minimal/i.test(await page.textContent(".modal .topup-hint")))
    throw new Error("tidak ada peringatan minimal: " + await page.textContent(".modal .topup-hint"));
  ok("Nominal di bawah minimal ditolak sambil menyebut alasannya");

  // Papan angka: hapus semuanya lalu ketik 50000 digit demi digit.
  for (let i = 0; i < 4; i++) await page.click('.modal .topup-key[aria-label="Hapus satu angka"]');
  await page.click('.modal .topup-key[aria-label="5"]');
  await page.click('.modal .topup-key[aria-label="0"]');
  await page.click('.modal .topup-key[aria-label="tiga nol"]');
  if ((await page.textContent(".modal .topup-amt")).replace(/\D/g, "") !== "50000")
    throw new Error("papan angka salah hitung: " + await page.textContent(".modal .topup-amt"));
  ok("Papan angka menyusun nominal Rp 50.000 (5 · 0 · 000)");

  await lanjut.click();

  // QR yang tampil harus QRIS merchant SUNGGUHAN. Kalau simulator sempat
  // muncul di jalur top up, saldo bisa lahir dari QR palsu — justru itu yang
  // ditutup, jadi kehadirannya di sini adalah kegagalan.
  // JANGAN menunggu <canvas> atau <img> tertentu terlihat: qrcodejs membuat
  // KEDUANYA lalu menyembunyikan salah satu (canvas digambar, lalu diubah jadi
  // data-URL di <img>), dan mana yang disembunyikan berbeda antar-jalankan.
  // Menunggu elemen pertama yang cocok karena itu kadang menunggu simpul yang
  // memang sengaja display:none — gagal acak tanpa ada yang rusak.
  await page.waitForSelector(".modal .qrbox", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => {
    const b = document.querySelector(".modal .qrbox");
    return !!b && b.querySelectorAll("canvas, img, svg").length > 0;
  }, null, { timeout: 15000 });
  if (await page.locator(".modal:has-text('MODE SIMULASI')").count())
    throw new Error("top up jatuh ke simulator — seharusnya QRIS merchant asli");
  ok("Top up memakai QRIS merchant asli, bukan simulator");
  await page.screenshot({ path: SHOT + "/7-topup-qris.png" });

  await page.click("button:has-text('Saya sudah bayar')");
  await page.waitForSelector("text=Menunggu Konfirmasi", { timeout: 15000 });

  const minta = await waitFor(async () => {
    const l = (await listDocs("topups")).map(flat).filter(t => t.uid === uid && t.status === "pending");
    return l.length ? l[0] : null;
  }, "permintaan top up tercatat pending");
  ok("Permintaan top up tercatat pending, bukan saldo", "Rp " + minta.amount);

  const saldoSetelahMinta = flat(await api(`/users/${uid}`)).wallet ?? 0;
  if (saldoSetelahMinta !== saldoAwal)
    throw new Error(`saldo berubah tanpa persetujuan: ${saldoAwal} → ${saldoSetelahMinta}`);
  ok("Menekan 'Saya sudah bayar' TIDAK menambah saldo", "tetap Rp " + saldoAwal);

  // Permintaan yang menunggu harus terlihat pengguna di kartu saldo — tanpa
  // penanda itu, jeda persetujuan terbaca sebagai "top up gagal" dan orang
  // membayar untuk kedua kalinya.
  await page.click(".modal button.btn:has-text('Mengerti')");
  await page.waitForSelector(".acc-topup-wait:not([hidden])", { timeout: 15000 });
  ok("Kartu saldo menandai permintaan yang menunggu konfirmasi");
  await page.screenshot({ path: SHOT + "/8-topup-menunggu.png" });

  // ---------- Fase PETUGAS: MELIHAT antrean, tapi TIDAK bisa menyetujui ----------
  // Menyetujui top up berarti menambah saldo, dan saldo itu uang. Petugas
  // lapangan hanya memantau supaya bisa menjawab pengguna yang bertanya;
  // yang menyetujui hanya admin, di panel /admin.
  await keluar();
  await masuk("petugas@quparkir.test");
  // Lewat MENU, bukan dengan mengetik hash — kalau barisnya hilang, permintaan
  // top up menggantung tanpa ada yang tahu.
  await page.evaluate(() => (location.hash = "#/akun"));
  const menuTopUp = page.locator(".acc-item:has-text('Antrean Top Up')");
  await menuTopUp.waitFor({ timeout: 15000 });
  await page.waitForSelector(".acc-item.acc-antre:has-text('permintaan menunggu admin')", { timeout: 15000 });
  ok("Menu petugas menandai ada permintaan top up menunggu admin");
  await menuTopUp.click();
  await page.waitForSelector("text=Antrean Top Up", { timeout: 15000 });
  await page.waitForSelector(`.li .t:has-text('${minta.amount.toLocaleString("id-ID")}')`, { timeout: 20000 });
  ok("Petugas melihat permintaan top up yang menunggu");
  await page.screenshot({ path: SHOT + "/9-topup-petugas.png" });

  if (await page.locator(".li button:has-text('Setujui'), .li button:has-text('Tolak')").count())
    throw new Error("tombol persetujuan masih tergambar di halaman petugas");
  await page.waitForSelector(".li .pill:has-text('Menunggu admin')", { timeout: 10000 });
  ok("Halaman petugas tidak menawarkan tombol Setujui/Tolak");

  // Tombol yang hilang BUKAN pagar: console peramban melewatinya dalam satu
  // baris. Yang benar-benar menutup pintu adalah rules — dibuktikan dengan
  // memanggil DB.topups.approve persis seperti panel admin memanggilnya.
  const tuId = (await listDocs("topups")).find(d => flat(d).uid === uid).name.split("/").pop();
  const lewatConsole = await page.evaluate(async (id) => {
    const { DB } = await import("./js/data.js");
    try { await DB.topups.approve(id, "petugas-nakal"); return "BERHASIL"; }
    catch (e) { return "ditolak: " + (e.code || e.message || ""); }
  }, tuId);
  if (lewatConsole === "BERHASIL") throw new Error("petugas menyetujui top up lewat console — rules bocor");
  ok("Petugas menyetujui lewat console → ditolak rules", lewatConsole.slice(0, 60));

  const saldoUsahaPetugas = flat(await api(`/users/${uid}`)).wallet ?? 0;
  if (saldoUsahaPetugas !== saldoAwal)
    throw new Error(`saldo berubah oleh petugas: ${saldoAwal} → ${saldoUsahaPetugas}`);
  ok("Saldo pengguna tidak bergerak sedikit pun oleh petugas", "tetap Rp " + saldoAwal);

  // ---------- Fase ADMIN: satu-satunya yang menyetujui, lewat panel /admin ----------
  await keluar();
  await page.goto(ADMIN, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".auth-card", { timeout: 20000 });
  await page.fill("input[type='email']", "admin@quparkir.test");
  await page.fill("input[placeholder='Kata sandi']", "rahasia123");
  await page.click("button:has-text('Masuk')");
  await page.waitForSelector(".admin-tabs", { timeout: 20000 });
  await page.click(".admin-tabs button:has-text('Top Up')");
  await page.waitForSelector("h2:has-text('Konfirmasi Top Up')", { timeout: 15000 });
  await page.waitForSelector(`.adm-item:has-text('${minta.amount.toLocaleString("id-ID")}')`, { timeout: 20000 });
  ok("Admin melihat permintaan yang sama di panel /admin");
  await page.screenshot({ path: SHOT + "/9-topup-admin.png" });
  await page.click("button:has-text('Setujui')");

  const sesudah = await waitFor(async () => {
    const w = flat(await api(`/users/${uid}`)).wallet ?? 0;
    return w === saldoAwal + minta.amount ? w : null;
  }, "saldo bertambah setelah persetujuan admin");
  ok("Admin menyetujui → saldo bertambah", `Rp ${saldoAwal} → Rp ${sesudah}`);

  const tuntas = (await listDocs("topups")).map(flat).find(t => t.uid === uid);
  if (tuntas.status !== "approved") throw new Error("permintaan tidak ditandai approved: " + tuntas.status);
  ok("Permintaan ditandai approved + penyetujunya tercatat", "handledBy=" + tuntas.handledBy);

  await page.click(".adm-top button:has-text('Keluar'), button:has-text('Keluar')");
  await page.waitForSelector(".auth-card", { timeout: 20000 });
  await masuk("pelanggan@quparkir.test");

  // Tautan/bookmark lama #/admin diarahkan ke Panel Admin berdiri sendiri
  // (admin.html) — lihat komentar redirect di app.js. Panel itu punya gerbang
  // sandinya sendiri (per-tab, sengaja terpisah dari role Firebase — lihat
  // catatan keamanan di admin-panel.js); yang benar-benar menolak tulisan
  // data non-admin adalah Firestore Rules, sudah diuji tuntas di rules.mjs
  // ("locations/promos/banners: pelanggan TIDAK bisa menulis").
  await page.evaluate(() => (location.hash = "#/admin"));
  await page.waitForURL(/\/admin(\?|$)/, { timeout: 10000 });
  ok("Tautan lama #/admin diarahkan ke Panel Admin (admin.html)");

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

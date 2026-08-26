// Uji: tab panel admin bertahan setelah refresh (bukan lompat ke Ringkasan),
// dan kerangka (skeleton) yang tergambar SEBELUM admin-panel.js selesai
// memuat sudah menandai TAB YANG BENAR sebagai aktif — bukan selalu Ringkasan.
import { chromium } from "playwright";
// ?emu=1 WAJIB: tanpa ini, di context browser baru (localStorage kosong)
// config.js jatuh ke Firebase PRODUKSI sungguhan, bukan emulator lokal.
const APP = "http://127.0.0.1:5000/admin?emu=1";
const SHOT = "/tmp/claude-1000/-mnt-01DCAFA2D1032800-1Works-quarkir/37b41ace-1270-4b9b-9e5d-e898081ebd3b/scratchpad/shots";

const results = [];
const ok = (n, extra = "") => { results.push(["PASS", n, extra]); console.log("✅", n, extra); };
const bad = (n, e) => { results.push(["FAIL", n, e]); console.log("❌", n, e); };
const t = async (name, fn) => { try { await fn(); ok(name); } catch (e) { bad(name, e.message); } };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });

// Sampel tiap frame SEJAK dokumen dibuat (berlaku di reload berikutnya juga):
// merekam index tab mana yang ditandai aktif di KERANGKA (.skel-admtab.active),
// lalu 'real' begitu DOM sungguhan (.admin-tabs button.active) menggantikannya.
await page.addInitScript(() => {
  window.__tabFrames = [];
  const tik = () => {
    const view = document.getElementById("view");
    // #view belum ada = HTML belum diurai sejauh itu — bukan "flash kosong"
    // yang ingin diuji (itu murni waktu unduh dokumen, universal di semua
    // halaman), jadi belum dihitung sebagai sampel sampai elemennya ada.
    if (view) {
      const skelActive = view.querySelector(".skel-admtab.active");
      const realActive = view.querySelector(".admin-tabs button.active");
      let sample = "KOSONG";
      if (skelActive) sample = "skel:" + [...view.querySelectorAll(".skel-admtab")].indexOf(skelActive);
      else if (realActive) sample = "real";
      else if (view.children.length) sample = "lain"; // #view terisi tapi bukan skeleton/tab (mis. gerbang)
      window.__tabFrames.push(sample);
    }
    if (window.__tabFrames.length < 600) requestAnimationFrame(tik);
  };
  requestAnimationFrame(tik);
});

// Gerbang panel kini Firebase Auth + role admin (bukan lagi sandi statis yang
// tertulis di admin-panel.js), jadi akunnya harus benar-benar ada di emulator
// Auth DAN punya users/{uid}.role = "admin". Peran sengaja tidak bisa dibuat
// dari klien — rules melarangnya — jadi ditulis lewat REST emulator, setara
// dengan menyetelnya lewat Firebase Console.
const FS = "http://127.0.0.1:8080/v1/projects/quparkir/databases/(default)/documents";
const AUTH_EMU = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=palsu";
const EMAIL = "admin-tab@quparkir.test", SANDI = "rahasia123";

await fetch("http://127.0.0.1:8080/emulator/v1/projects/quparkir/databases/(default)/documents", { method: "DELETE" });
await fetch("http://127.0.0.1:9099/emulator/v1/projects/quparkir/accounts", { method: "DELETE" });

const daftar = await fetch(AUTH_EMU, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: SANDI, returnSecureToken: true }),
}).then(r => r.json());
if (!daftar.localId) throw new Error("gagal membuat akun admin uji: " + JSON.stringify(daftar).slice(0, 200));
await fetch(`${FS}/users/${daftar.localId}`, {
  method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { name: { stringValue: "Admin Tab" }, email: { stringValue: EMAIL }, role: { stringValue: "admin" } } }),
});

// Akun petugas — dipakai membuktikan gerbangnya menolak peran lain.
const PETUGAS = "petugas-tab@quparkir.test";
const ptg = await fetch(AUTH_EMU, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: PETUGAS, password: SANDI, returnSecureToken: true }),
}).then(r => r.json());
await fetch(`${FS}/users/${ptg.localId}`, {
  method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { name: { stringValue: "Petugas Tab" }, email: { stringValue: PETUGAS }, role: { stringValue: "petugas" } } }),
});

await page.goto(APP, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".auth-card", { timeout: 20000 });

// --- gerbang menolak peran selain admin ---
// Kredensialnya BENAR; yang salah perannya. Kalau panel tetap terbuka, petugas
// bisa menyunting lokasi & promo — dan menyetujui top up-nya sendiri.
await page.fill("input[type='email']", PETUGAS);
await page.fill("input[placeholder='Kata sandi']", SANDI);
await page.click("button:has-text('Masuk')");
await t("Akun petugas dengan sandi BENAR ditolak di gerbang panel", async () => {
  await page.waitForSelector(".fld-err, .err", { timeout: 15000 }).catch(() => {});
  const teks = await page.textContent(".auth-card");
  if (!/bukan admin/i.test(teks)) throw new Error("tidak ada pesan penolakan: " + teks.slice(0, 160));
  if (await page.locator(".admin-tabs").count()) throw new Error("panel malah terbuka untuk petugas");
});
await t("Sesi petugas ikut diputus, tidak ditinggal hidup", async () => {
  const masih = await page.evaluate(async () => {
    const { Auth } = await import("./js/auth.js");
    return !!Auth?.current?.();
  });
  if (masih) throw new Error("sesi Firebase masih terpasang setelah ditolak");
});

await page.fill("input[type='email']", EMAIL);
await page.fill("input[placeholder='Kata sandi']", SANDI);
await page.click("button:has-text('Masuk')");
await page.waitForSelector(".admin-tabs", { timeout: 20000 });
await page.waitForSelector(".admin-tabs button.active", { timeout: 10000 });

await t("Login → hash default #ringkasan (tab pertama)", async () => {
  const h = await page.evaluate(() => location.hash);
  if (h !== "" && h !== "#ringkasan") throw new Error("hash = " + h);
});

// --- klik tab Lokasi → hash berubah, tanpa reload ---
await page.click(".admin-tabs button:has-text('Lokasi')");
await page.waitForSelector("h2:has-text('Lokasi Parkir')", { timeout: 10000 });
await t("Klik tab Lokasi → hash jadi #lokasi", async () => {
  const h = await page.evaluate(() => location.hash);
  if (h !== "#lokasi") throw new Error("hash = " + h);
});

// Reload lokal (module sudah di-cache browser + emulator di localhost) bisa
// SANGAT cepat — kadang konten sungguhan menggantikan kerangka dalam satu
// frame, sehingga kerangka tak sempat "tersampel". Itu bukan cacat (tidak
// ada yang sempat terlihat salah); yang WAJIB diperiksa di tiap reload
// hanyalah: tidak pernah ada frame kosong, dan tidak pernah ada kerangka
// yang salah tab. Bukti bahwa kerangka tab-yang-benar SEMPAT tampil
// dikumpulkan lintas semua reload lalu diperiksa satu kali di akhir.
let pernahTampilKerangkaBenar = false;
// Posisi tab TIDAK ditulis di sini. Dulu tiap pemanggilan menyebut indeksnya
// (Lokasi 1, Promo 2, …) dan seluruh uji ini langsung merah begitu satu tab
// baru disisipkan — bukan karena ada yang rusak, tapi karena angkanya basi.
// Sekarang dibaca dari tab-bar yang sedang tampil, yang urutannya berasal dari
// ADMIN_TABS — sumber yang sama dengan kerangkanya.
async function refreshDanPeriksa(label, judul) {
  const expectIndex = await page.evaluate((l) =>
    [...document.querySelectorAll(".admin-tabs button")].findIndex(b => b.textContent.includes(l)), label);
  if (expectIndex < 0) throw new Error("tab tidak ditemukan di tab-bar: " + label);
  await page.reload({ waitUntil: "commit" });
  await page.waitForSelector("h2:has-text('" + judul + "')", { timeout: 20000 });

  const frames = await page.evaluate(() => window.__tabFrames || []);

  // KOSONG yang mendahului gambar pertama BUKAN kedipan — itu jeda antara HTML
  // selesai diurai (#view sudah ada, masih kosong) dan admin-boot.js sempat
  // dijalankan. Panjangnya mengikuti beban mesin, jadi menghitungnya membuat
  // uji ini merah-hijau acak: pada mesin yang sama, tanpa satu pun perubahan
  // kode, angkanya berayun 1–5 antar-jalankan.
  //
  // Yang benar-benar cacat adalah KOSONG SETELAH sesuatu sempat tergambar —
  // layar yang sudah terisi lalu berkedip jadi putih. Itulah yang dihitung.
  const mulai = frames.findIndex(x => x !== "KOSONG");
  const kosong = mulai < 0 ? 0 : frames.slice(mulai).filter(x => x === "KOSONG").length;
  const munculSkelSalah = frames.some(x => typeof x === "string" && x.startsWith("skel:") && x !== "skel:" + expectIndex);
  if (frames.includes("skel:" + expectIndex)) pernahTampilKerangkaBenar = true;

  await t(`Refresh di tab ${label} → kerangka TIDAK PERNAH menandai tab lain sebagai aktif`, async () => {
    if (munculSkelSalah) throw new Error("kerangka sempat menandai tab LAIN aktif: " + [...new Set(frames.filter(x => x?.startsWith?.("skel:")))].join(","));
  });
  await t(`Refresh di tab ${label} → tidak berkedip kosong setelah tergambar (dari ${frames.length} sampel)`, async () => {
    if (kosong !== 0) throw new Error(kosong + " frame kosong SETELAH tergambar, dari " + frames.length);
  });
  await t(`Refresh di tab ${label} → konten akhir tetap di tab ${label}`, async () => {
    const h = await page.evaluate(() => location.hash);
    const active = await page.textContent(".admin-tabs button.active");
    if (!active.includes(label)) throw new Error("tab aktif = " + active);
  });
}

await refreshDanPeriksa("Lokasi", "Lokasi Parkir");
await page.screenshot({ path: SHOT + "/admin-refresh-lokasi-final.png" });

await page.click(".admin-tabs button:has-text('Top Up')");
await page.waitForSelector("h2:has-text('Konfirmasi Top Up')", { timeout: 10000 });
await refreshDanPeriksa("Top Up", "Konfirmasi Top Up");

await page.click(".admin-tabs button:has-text('Promo')");
await page.waitForSelector("h2:has-text('Promo Beranda')", { timeout: 10000 });
await refreshDanPeriksa("Promo", "Promo Beranda");

await page.click(".admin-tabs button:has-text('Banner')");
await page.waitForSelector("h2:has-text('Banner Beranda')", { timeout: 10000 });
await refreshDanPeriksa("Banner", "Banner Beranda");

await page.click(".admin-tabs button:has-text('Export QRIS')");
await page.waitForSelector("h2:has-text('QR Check-in per Lokasi')", { timeout: 10000 });
await refreshDanPeriksa("Export QRIS", "QR Check-in per Lokasi");
await page.screenshot({ path: SHOT + "/admin-refresh-qris-final.png" });

// --- hash tak dikenal → jatuh ke Ringkasan tanpa error ---
await page.evaluate(() => (location.hash = "#tidak-ada"));
await page.reload({ waitUntil: "commit" });
await page.waitForSelector("h2:has-text('Ringkasan')", { timeout: 20000 });
await t("Hash tak dikenal → jatuh ke Ringkasan tanpa error", async () => {
  const active = await page.textContent(".admin-tabs button.active");
  if (!active.includes("Ringkasan")) throw new Error("tab aktif = " + active);
});

// --- klik tab TIDAK boleh menumpuk riwayat (replaceState, bukan pushState) ---
await t("Klik tab berkali-kali TIDAK menambah entri riwayat", async () => {
  const sebelum = await page.evaluate(() => history.length);
  await page.click(".admin-tabs button:has-text('Lokasi')");
  await page.waitForSelector("h2:has-text('Lokasi Parkir')");
  await page.click(".admin-tabs button:has-text('Promo')");
  await page.waitForSelector("h2:has-text('Promo Beranda')");
  await page.click(".admin-tabs button:has-text('Ringkasan')");
  await page.waitForSelector("h2:has-text('Ringkasan')");
  const sesudah = await page.evaluate(() => history.length);
  if (sesudah !== sebelum) throw new Error(`history.length ${sebelum} → ${sesudah} (harusnya tetap sama)`);
});

// --- navigasi via hashchange TANPA reload (mis. tombol back/forward, tautan luar) ---
await t("location.hash= dari luar (tanpa reload) memindah tab lewat listener hashchange", async () => {
  await page.click(".admin-tabs button:has-text('Lokasi')");
  await page.waitForSelector("h2:has-text('Lokasi Parkir')");
  await page.evaluate(() => { location.hash = "#banner"; });
  await page.waitForSelector("h2:has-text('Banner Beranda')", { timeout: 5000 });
  const active = await page.textContent(".admin-tabs button.active");
  if (!active.includes("Banner")) throw new Error("tab aktif = " + active);
});

await t("Sepanjang semua reload, kerangka tab-yang-benar SEMPAT tersampel setidaknya sekali (bukti mekanisme benar-benar aktif, bukan cuma final state)", async () => {
  if (!pernahTampilKerangkaBenar) throw new Error("tidak pernah tertangkap sama sekali di semua percobaan reload");
});

// --- persetujuan top up dikerjakan DARI PANEL ---
// Sejak akun admin dialihkan keluar dari app pelanggan, #/topup di app tidak
// lagi terjangkau olehnya. Tanpa tab ini, admin tidak punya cara apa pun untuk
// menyetujui top up — dan permintaan orang menggantung selamanya.
const PEL = "pel-tab@quparkir.test";
const pel = await fetch(AUTH_EMU, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: PEL, password: SANDI, returnSecureToken: true }),
}).then(r => r.json());
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };
await fetch(`${FS}/users/${pel.localId}`, { method: "PATCH", headers: OWNER,
  body: JSON.stringify({ fields: { name: { stringValue: "Pelanggan Tab" }, email: { stringValue: PEL } } }) });
await fetch(`${FS}/topups?documentId=tu-uji`, { method: "POST", headers: OWNER,
  body: JSON.stringify({ fields: {
    uid: { stringValue: pel.localId }, name: { stringValue: "Pelanggan Tab" },
    amount: { integerValue: "50000" }, method: { stringValue: "qris" },
    status: { stringValue: "pending" }, createdAt: { integerValue: String(Date.now()) },
  } }) });

await t("Admin melihat permintaan top up di tab panel", async () => {
  await page.click(".admin-tabs button:has-text('Top Up')");
  await page.waitForSelector(".adm-item:has-text('Pelanggan Tab')", { timeout: 20000 });
});

await t("Admin menyetujui dari panel → saldo pelanggan bertambah", async () => {
  await page.click(".adm-item:has-text('Pelanggan Tab') button:has-text('Setujui')");
  const t0 = Date.now();
  for (;;) {
    const d = await fetch(`${FS}/users/${pel.localId}`, { headers: OWNER }).then(r => r.json());
    const w = Number(d.fields?.wallet?.integerValue ?? 0);
    if (w === 50000) return;
    if (Date.now() - t0 > 15000) throw new Error("saldo = " + w + ", harusnya 50000");
    await new Promise(r => setTimeout(r, 400));
  }
});

await t("Permintaan ditandai approved oleh admin", async () => {
  const d = await fetch(`${FS}/topups/tu-uji`, { headers: OWNER }).then(r => r.json());
  const st = d.fields?.status?.stringValue;
  if (st !== "approved") throw new Error("status = " + st);
  if (d.fields?.handledBy?.stringValue !== daftar.localId) throw new Error("handledBy = " + d.fields?.handledBy?.stringValue);
});

console.log("\nerror konsol:", errors.length ? errors.join(" | ") : "(tidak ada)");
const fail = results.filter(r => r[0] === "FAIL").length;
console.log(`\n${results.length - fail}/${results.length} lolos`);
await b.close();
process.exit(fail || errors.length ? 1 : 0);

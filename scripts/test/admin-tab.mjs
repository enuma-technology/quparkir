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

await page.goto(APP, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".auth-card", { timeout: 20000 });
await page.fill("input[placeholder='admin']", "admin");
await page.fill("input[placeholder='Kata sandi']", "admin234156");
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
async function refreshDanPeriksa(label, judul, expectIndex) {
  await page.reload({ waitUntil: "commit" });
  await page.waitForSelector("h2:has-text('" + judul + "')", { timeout: 20000 });

  const frames = await page.evaluate(() => window.__tabFrames || []);
  const kosong = frames.filter(x => x === "KOSONG").length;
  const munculSkelSalah = frames.some(x => typeof x === "string" && x.startsWith("skel:") && x !== "skel:" + expectIndex);
  if (frames.includes("skel:" + expectIndex)) pernahTampilKerangkaBenar = true;

  await t(`Refresh di tab ${label} → kerangka TIDAK PERNAH menandai tab lain sebagai aktif`, async () => {
    if (munculSkelSalah) throw new Error("kerangka sempat menandai tab LAIN aktif: " + [...new Set(frames.filter(x => x?.startsWith?.("skel:")))].join(","));
  });
  await t(`Refresh di tab ${label} → 0 frame layar kosong (dari ${frames.length} sampel)`, async () => {
    if (kosong !== 0) throw new Error(kosong + " frame kosong dari " + frames.length);
  });
  await t(`Refresh di tab ${label} → konten akhir tetap di tab ${label}`, async () => {
    const h = await page.evaluate(() => location.hash);
    const active = await page.textContent(".admin-tabs button.active");
    if (!active.includes(label)) throw new Error("tab aktif = " + active);
  });
}

await refreshDanPeriksa("Lokasi", "Lokasi Parkir", 1);
await page.screenshot({ path: SHOT + "/admin-refresh-lokasi-final.png" });

await page.click(".admin-tabs button:has-text('Promo')");
await page.waitForSelector("h2:has-text('Promo Beranda')", { timeout: 10000 });
await refreshDanPeriksa("Promo", "Promo Beranda", 2);

await page.click(".admin-tabs button:has-text('Banner')");
await page.waitForSelector("h2:has-text('Banner Beranda')", { timeout: 10000 });
await refreshDanPeriksa("Banner", "Banner Beranda", 3);

await page.click(".admin-tabs button:has-text('Export QRIS')");
await page.waitForSelector("h2:has-text('QR Check-in per Lokasi')", { timeout: 10000 });
await refreshDanPeriksa("Export QRIS", "QR Check-in per Lokasi", 4);
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

console.log("\nerror konsol:", errors.length ? errors.join(" | ") : "(tidak ada)");
const fail = results.filter(r => r[0] === "FAIL").length;
console.log(`\n${results.length - fail}/${results.length} lolos`);
await b.close();
process.exit(fail || errors.length ? 1 : 0);

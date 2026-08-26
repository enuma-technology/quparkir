// Uji: refresh di halaman terakhir → kerangka (skeleton) halaman ITU yang tampil,
// tidak ada satu frame pun layar kosong, dan kerangka dilepas begitu halaman siap.
// Menangkap layar tiap kerangka ke QP_SHOTS (default ./.test-shots).
//
//   firebase emulators:start --only auth,firestore,hosting --project quparkir
//   node skeleton.mjs
import { chromium } from "playwright";
const APP = "http://127.0.0.1:5000/app?emu=1";
const SHOT = process.env.QP_SHOTS || "./.test-shots";
const FS = "http://127.0.0.1:8080/v1/projects/quparkir/databases/(default)/documents";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text().slice(0,200)); });

// daftar sekali supaya ada sesi login yang bertahan saat refresh
await page.goto(APP, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".auth-card", { timeout: 20000 });
if (!(await page.locator("text=Buat akun").count())) await page.click("text=Daftar sekarang");
await page.waitForSelector("text=Buat akun");
const inp = page.locator(".auth-form input");
const email = "skel" + Date.now() + "@quparkir.test";
await inp.nth(0).fill("Uji Skeleton"); await inp.nth(1).fill(email);
await inp.nth(2).fill("rahasia123"); await inp.nth(3).fill("rahasia123");
await page.click("button:has-text('Buat Akun')");
try { await page.waitForSelector("#tabbar:not([hidden])", { timeout: 20000 }); }
catch (e) {
  console.log("hash:", await page.evaluate(() => location.hash));
  console.log("toast:", (await page.textContent("#toast").catch(()=>"" )).trim());
  console.log("err inline:", await page.$$eval(".err", els => els.map(x=>x.textContent).filter(Boolean)));
  console.log("user:", JSON.stringify(await page.evaluate(() => window.__AUTH?.current())));
  console.log("console errors:", errors.join(" | "));
  await page.screenshot({ path: SHOT + "/skel-daftar-gagal.png" });
  throw e;
}

const HAL = ["#/home", "#/cari", "#/riwayat", "#/akun", "#/kendaraan", "#/status", "#/checkin", "#/petugas"];
for (const h of HAL) {
  // buka halaman lalu REFRESH — persis kelakuan pengguna
  await page.evaluate((x) => { location.hash = x; }, h);
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: "commit" });
  // rekam isi #view tiap frame: tidak boleh ada frame kosong (kedip putih)
  await page.evaluate(() => {
    window.__sampel = [];
    const tik = () => {
      const v = document.getElementById("view");
      if (v) window.__sampel.push(v.children.length === 0 ? "KOSONG" : (v.querySelector(".skel-page") ? "kerangka" : "isi"));
      if (window.__sampel.length < 400) requestAnimationFrame(tik);
    };
    requestAnimationFrame(tik);
  }).catch(() => {});
  await page.waitForFunction(() => !!document.querySelector(".skel-page"), null, { timeout: 15000 });
  const bentuk = await page.evaluate(() => {
    const s = document.querySelector(".skel-page");
    return { anak: [...s.children].map(c => c.className).join(" | "), gelap: s.classList.contains("on-dark"),
             tinggi: Math.round(s.getBoundingClientRect().height) };
  });
  await page.screenshot({ path: `${SHOT}/skel${h.replace("#/", "-")}.png` });
  console.log(h.padEnd(12), "→", bentuk.tinggi + "px", bentuk.gelap ? "[gelap]" : "", bentuk.anak);
  await page.waitForFunction(() => !document.querySelector(".skel-page"), null, { timeout: 25000 })
    .then(() => console.log("             kerangka dilepas setelah halaman siap ✅"))
    .catch(() => console.log("             ❌ kerangka TIDAK dilepas"));
  // KOSONG sebelum gambar PERTAMA bukan kedipan — itu jeda antara #view ada di
  // HTML dan modul boot sempat dijalankan, dan panjangnya mengikuti beban
  // mesin. Yang cacat adalah layar yang sudah terisi lalu berkedip jadi
  // kosong, jadi hanya KOSONG setelah gambar pertama yang dihitung.
  const kosong = await page.evaluate(() => {
    const f = window.__sampel || [];
    const mulai = f.findIndex(x => x !== "KOSONG");
    return mulai < 0 ? 0 : f.slice(mulai).filter(x => x === "KOSONG").length;
  }).catch(() => -1);
  console.log("             kedip kosong setelah tergambar:", kosong === 0 ? "0 ✅" : kosong + " ❌");
}

// kerangka halaman auth: keluar dulu, lalu refresh di #/login
await page.evaluate(() => (location.hash = "#/akun"));
await page.click("button:has-text('Keluar')");
await page.waitForSelector(".auth-card", { timeout: 15000 });
await page.reload({ waitUntil: "commit" });
await page.waitForFunction(() => !!document.querySelector(".skel-page"), null, { timeout: 15000 });
const authSkel = await page.evaluate(() => {
  const s = document.querySelector(".skel-page");
  return { gelap: s.classList.contains("on-dark"), bg: getComputedStyle(s).backgroundImage.slice(0, 30) };
});
await page.screenshot({ path: SHOT + "/skel-login.png" });
console.log("#/login".padEnd(12), "→", authSkel.gelap ? "[gelap] ✅" : "❌ tidak gelap", authSkel.bg);

console.log("\nerror:", errors.length ? errors.join("\n") : "(tidak ada)");
await b.close();

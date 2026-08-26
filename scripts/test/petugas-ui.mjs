// ============================================================
// Uji tab "Petugas" di panel admin, DARI PERAMBAN.
//
// uji-kelola-petugas.mjs sudah membuktikan endpoint-nya benar; yang ini
// membuktikan panelnya benar-benar tersambung ke sana: tab tergambar, form
// tambah membuat akun sungguhan, status nonaktif terlihat, dan Hapus
// menghilangkan barisnya — tanpa satu pun galat konsol.
//
// Netlify Function-nya dijalankan LOKAL di dalam proses uji ini (server kecil
// di :8899) lalu apiBase di halaman diarahkan ke sana. Tanpa itu, panel akan
// menembak https://quparkir-pay.netlify.app — jaringan sungguhan, dan versi
// yang belum tentu memuat kode yang sedang diuji.
//
// Jalankan:
//   firebase emulators:start --only firestore,auth,hosting --project quparkir
//   node scripts/test/petugas-ui.mjs
//
// Emulator SENGAJA tidak dibersihkan: uji lain bisa sedang memakainya. Akun
// yang dibuat di sini dihapus lagi di akhir.
// ============================================================
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
// WAJIB "quparkir": token yang diterbitkan emulator untuk app memakai project
// id ini sebagai aud/iss, dan uidDariToken membandingkannya dengan FB_PROJECT_ID.
process.env.FB_PROJECT_ID ||= "quparkir";

import { createServer } from "node:http";
import { chromium } from "playwright";

const { db } = await import("../../netlify/functions/lib/_lib.js");
const kelola = (await import("../../netlify/functions/kelola-petugas.js")).default;
const auth = (await import("firebase-admin/auth")).getAuth();

const PORT = 8899;
const APP = "http://127.0.0.1:5000/admin?emu=1";
const SHOT = "/tmp/claude-1000/-mnt-01DCAFA2D1032800-1Works-quarkir/dee4d401-ab79-4e08-bc47-e549b10fbb48/scratchpad";
const SANDI = "rahasia123";
const cap = Date.now().toString(36);          // nama unik: emulator dipakai bersama
const EMAIL_ADMIN = `admin-ui-${cap}@quparkir.test`;
const EMAIL_PETUGAS = `petugas-ui-${cap}@quparkir.test`;

let pass = 0, fail = 0;
const t = async (nama, fn) => {
  try { await fn(); console.log("  ✔", nama); pass++; }
  catch (e) { console.log("  ✘", nama, "→", e.message); fail++; }
};

// ---------- function lokal ----------
// Handler Netlify (Request → Response standar) dibungkus jadi server node
// biasa. Beda origin dengan halaman (5000 vs 8899), jadi preflight OPTIONS
// ikut lewat sini — dan itu memang bagian yang diuji: corsHeaders() harus
// mengizinkan 127.0.0.1:5000.
const server = createServer(async (req, res) => {
  const potongan = [];
  for await (const c of req) potongan.push(c);
  const body = ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : Buffer.concat(potongan);
  const out = await kelola(new Request("http://127.0.0.1:" + PORT + req.url, { method: req.method, headers: req.headers, body }));
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

// ---------- akun admin untuk masuk panel ----------
const admin = await auth.createUser({ email: EMAIL_ADMIN, password: SANDI, displayName: "Admin UI" });
await db.collection("users").doc(admin.uid).set({ role: "admin", email: EMAIL_ADMIN, name: "Admin UI" });

const bersihkan = async () => {
  server.close();
  for (const email of [EMAIL_ADMIN, EMAIL_PETUGAS]) {
    try {
      const u = await auth.getUserByEmail(email);
      await auth.deleteUser(u.uid);
      await db.collection("users").doc(u.uid).delete();
    } catch { /* memang sudah tidak ada */ }
  }
};

const b = await chromium.launch();
// bypassCSP HANYA karena function-nya dijalankan di port lokal yang memang
// tidak (dan tidak boleh) ada di CSP produksi. Supaya kelonggaran ini tidak
// menutupi cacat sungguhan, CSP admin.html diperiksa terpisah di bawah:
// tanpa host Netlify Functions di connect-src, panel akan diblokir peramban
// di produksi meski seluruh uji lain hijau.
const page = await (await b.newContext({ viewport: { width: 1100, height: 950 }, bypassCSP: true })).newPage();
const galat = [];
page.on("pageerror", (e) => galat.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") galat.push("console: " + m.text().slice(0, 200)); });

try {
  console.log("\n0. Syarat produksi");
  await t("CSP admin.html mengizinkan host Netlify Functions", async () => {
    const { readFileSync } = await import("node:fs");
    const html = readFileSync(new URL("../../public/admin.html", import.meta.url), "utf8");
    const csp = (html.match(/connect-src[^;"]*/) || [""])[0];
    if (!csp.includes("https://quparkir-pay.netlify.app"))
      throw new Error("connect-src tanpa host function → fetch diblokir peramban: " + csp.slice(0, 120));
  });

  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".auth-card", { timeout: 30000 });
  await page.fill("input[type='email']", EMAIL_ADMIN);
  await page.fill("input[placeholder='Kata sandi']", SANDI);
  await page.click("button:has-text('Masuk')");
  await page.waitForSelector(".admin-tabs", { timeout: 30000 });

  // paymentConfig adalah objek modul yang sama yang dipakai admin-petugas.js
  // (modul ESM di-cache per halaman), jadi menambalnya di sini mengalihkan
  // seluruh panggilan panel ke function lokal di atas.
  await page.evaluate(async (port) => {
    const m = await import("./js/config.js");
    m.paymentConfig.apiBase = "http://127.0.0.1:" + port;
  }, PORT);

  console.log("\n1. Tab & daftar");
  await t("tab 'Petugas' ada di panel", async () => {
    if (!(await page.locator(".admin-tabs button:has-text('Petugas')").count())) throw new Error("tab tidak ada");
  });
  await page.click(".admin-tabs button:has-text('Petugas')");
  await page.waitForSelector("h2:has-text('Akun Petugas')", { timeout: 15000 });
  await t("hash pindah ke #petugas", async () => {
    const hash = await page.evaluate(() => location.hash);
    if (hash !== "#petugas") throw new Error("hash = " + hash);
  });
  await t("daftar termuat tanpa pesan galat", async () => {
    await page.waitForSelector(".adm-item, .empty", { timeout: 15000 });
    const teks = await page.textContent(".section:has(h2:has-text('Akun Petugas'))");
    if (/Tidak bisa menghubungi|Gagal|HTTP \d/.test(teks)) throw new Error(teks.replace(/\s+/g, " ").slice(0, 160));
  });

  console.log("\n2. Menambah akun petugas");
  await page.click("a:has-text('+ Tambah')");
  await page.waitForSelector(".modal:has-text('Tambah Petugas')", { timeout: 10000 });
  await page.fill(".modal input[type='text']", "Petugas UI");
  await page.fill(".modal input[type='email']", EMAIL_PETUGAS);
  await page.fill(".modal input[type='password']", SANDI);
  await page.click(".modal button:has-text('Buat Akun Petugas')");

  await t("barisnya muncul di daftar", async () => {
    await page.waitForSelector(`.adm-item:has-text('${EMAIL_PETUGAS}')`, { timeout: 20000 });
  });
  await t("akun Auth-nya sungguh ada", async () => {
    const u = await auth.getUserByEmail(EMAIL_PETUGAS);
    if (u.displayName !== "Petugas UI") throw new Error("displayName = " + u.displayName);
  });
  await t("perannya 'petugas' di Firestore", async () => {
    const u = await auth.getUserByEmail(EMAIL_PETUGAS);
    const peran = (await db.collection("users").doc(u.uid).get()).data()?.role;
    if (peran !== "petugas") throw new Error("role = " + peran);
  });
  await t("statusnya Aktif", async () => {
    const pill = await page.textContent(`.adm-item:has-text('${EMAIL_PETUGAS}') .pill`);
    if (pill.trim() !== "Aktif") throw new Error("pill = " + pill);
  });
  await page.screenshot({ path: SHOT + "/admin-petugas.png" });

  console.log("\n3. Nonaktifkan & hapus");
  await page.click(`.adm-item:has-text('${EMAIL_PETUGAS}') button:has-text('Nonaktifkan')`);
  await page.click(".modal button:has-text('Nonaktifkan')");
  await t("pill berubah jadi Nonaktif", async () => {
    await page.waitForSelector(`.adm-item:has-text('${EMAIL_PETUGAS}') .pill:has-text('Nonaktif')`, { timeout: 20000 });
  });
  await t("akunnya terkunci di Auth", async () => {
    const u = await auth.getUserByEmail(EMAIL_PETUGAS);
    if (!u.disabled) throw new Error("disabled = false");
  });

  await page.click(`.adm-item:has-text('${EMAIL_PETUGAS}') button:has-text('Hapus')`);
  await page.click(".modal button:has-text('Hapus')");
  await t("barisnya hilang dari daftar", async () => {
    await page.waitForSelector(`.adm-item:has-text('${EMAIL_PETUGAS}')`, { state: "detached", timeout: 20000 });
  });
  await t("akunnya benar-benar terhapus dari Auth", async () => {
    try { await auth.getUserByEmail(EMAIL_PETUGAS); throw new Error("masih ada"); }
    catch (e) { if (e.code !== "auth/user-not-found") throw e; }
  });

  console.log("\n4. Kebersihan konsol");
  await t("tidak ada galat konsol/JS", () => {
    if (galat.length) throw new Error(galat.join(" | ").slice(0, 300));
  });
} finally {
  await b.close();
  await bersihkan();
}

console.log(`\n${fail ? "❌" : "✅"} ${pass} lulus, ${fail} gagal`);
console.log("Tangkapan layar:", SHOT + "/admin-petugas.png\n");
process.exit(fail ? 1 : 0);

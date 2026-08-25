// ============================================================
// Bootstrap QuParkir
// ============================================================
import { initData } from "./data.js";
import { initAuth } from "./auth.js";
import { route, setNotFound, startRouter, render, current, go } from "./router.js";
import { $, $$, toast, fetchVersion } from "./util.js";

import loginPage from "./pages/login.js";
import registerPage from "./pages/register.js";
import homePage from "./pages/home.js";
import cariPage from "./pages/cari.js";
import kendaraanPage from "./pages/kendaraan.js";
import checkinPage from "./pages/checkin.js";
import statusPage from "./pages/status.js";
import riwayatPage from "./pages/riwayat.js";
import akunPage from "./pages/akun.js";
import petugasPage from "./pages/petugas.js";
// Dashboard admin kini berdiri sendiri di admin.html (js/admin-panel.js) —
// rute #/admin dihapus agar tidak ada dua panel yang harus disamakan.

// ---- chrome (tabbar) ----
const AUTH_PAGES = ["#/login", "#/register"];
function updateChrome() {
  const path = current();
  const u = window.__AUTH?.current();
  const tab = $("#tabbar");
  const authPage = AUTH_PAGES.includes(path);
  tab.hidden = authPage || !u;
  $$("#tabbar > button[data-go]").forEach(b => b.classList.toggle("active", b.dataset.go === path));
  $("#view").classList.toggle("noTab", tab.hidden);
}

function wireNav() {
  $$("#tabbar > button[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
  $("#fabScan").addEventListener("click", () => go("#/checkin"));
}

// ---- ingatan halaman tujuan (bertahan lewat redirect Google) ----
const REDIRECT_KEY = "quparkir_redirect_v1";
const rememberRedirect = (hash) => { try { sessionStorage.setItem(REDIRECT_KEY, hash); } catch {} };
function takeRedirect() {
  try {
    const v = sessionStorage.getItem(REDIRECT_KEY);
    sessionStorage.removeItem(REDIRECT_KEY);
    return v && !AUTH_PAGES.includes(v.split("?")[0]) ? v : null;
  } catch { return null; }
}

// ---- guard ----
function guard(fn, { roles } = {}) {
  return async (view) => {
    const u = window.__AUTH.current();
    if (!u) { rememberRedirect(location.hash || "#/home"); go("#/login"); return; }
    if (roles && !roles.includes(u.role)) { toast("Akses khusus " + roles.join("/")); go("#/home"); return; }
    return fn(view);
  };
}

async function main() {
  fetchVersion();   // hanya log ke console — buat memastikan build mana yang live
  await Promise.all([initAuth(), initData()]);
  const { Auth } = await import("./auth.js");
  window.__AUTH = Auth;

  // routes
  route("#/login", loginPage);
  route("#/register", registerPage);
  route("#/home", guard(homePage));
  route("#/cari", guard(cariPage));
  route("#/kendaraan", guard(kendaraanPage));
  route("#/checkin", guard(checkinPage));
  route("#/status", guard(statusPage));
  route("#/riwayat", guard(riwayatPage));
  route("#/akun", guard(akunPage));
  route("#/petugas", guard(petugasPage, { roles: ["petugas", "admin"] }));
  // #/admin sengaja tidak didaftarkan lagi — panel admin pindah ke admin.html.
  // Tautan/bookmark lama diarahkan ke sana lewat redirect di bawah.
  route("#/admin", () => { location.replace("admin.html"); });
  setNotFound((v) => { v.innerHTML = '<div class="empty"><div class="ic">🤔</div><p>Halaman tidak ditemukan</p></div>'; });

  wireNav();
  window.addEventListener("hashchange", updateChrome);
  window.addEventListener("auth:changed", () => { updateChrome(); });

  if (!location.hash) location.hash = "#/home";

  // Halaman awal menurut peran. Petugas bekerja di lapangan: yang dibutuhkan
  // begitu masuk adalah layar verifikasi, bukan promo dan kartu saldo.
  //
  // Perannya dibaca dari users/{uid}.role di Firestore — BUKAN dicocokkan dari
  // alamat email. Mencocokkan email berarti daftar petugas ikut terbaca siapa
  // pun yang membuka JavaScript-nya, dan mengganti petugas berarti deploy
  // ulang. Peran disetel lewat scripts/admin/set-role.mjs.
  //
  // Tujuan yang tersimpan (deep link sebelum login) tetap menang: kalau
  // petugas mengetuk tautan e-ticket, dia harus mendarat di sana.
  const berandaPeran = (u) => (u?.role === "petugas" ? "#/petugas" : "#/home");

  // Tunggu status auth pertama (Firebase memulihkan sesi dari IndexedDB) SEBELUM
  // router jalan. Tanpa ini, refresh selalu terbaca "belum login" sesaat → guard
  // melempar ke #/login lalu memantul balik ke halaman semula.
  // Selama menunggu, kerangka halaman yang digambar js/boot.js tetap tampil.
  // batas 6 dtk supaya app tidak tertahan di loading kalau jaringan/SDK bermasalah
  await Promise.race([Auth.ready, new Promise((r) => setTimeout(r, 6000))]);

  // Tentukan halaman awal SEBELUM render pertama (replaceState: tidak memicu
  // hashchange & tidak menumpuk riwayat, jadi tak ada kedipan halaman auth).
  const u0 = Auth.current();
  const p0 = current();
  if (!u0 && !AUTH_PAGES.includes(p0)) {
    rememberRedirect(location.hash || "#/home");
    history.replaceState(null, "", "#/login");
  } else if (u0 && AUTH_PAGES.includes(p0)) {
    history.replaceState(null, "", takeRedirect() || berandaPeran(u0));
  }

  // reaktif: kalau status auth berubah (login/logout/sesi kedaluwarsa), arahkan
  let seeded = false;
  Auth.onChange(async (u) => {
    const path = current();
    if (u && !seeded) { seeded = true; const { DB } = await import("./data.js"); DB.ensureSeed && DB.ensureSeed(); }
    // logout / sesi habis → ke login (tanpa menyimpan tujuan: mulai bersih)
    if (!u && !AUTH_PAGES.includes(path)) go("#/login");
    if (u && AUTH_PAGES.includes(path)) go(takeRedirect() || berandaPeran(u));
    updateChrome();
  });

  startRouter();
  updateChrome();

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

main();

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
import petugasPage, { topupPetugasPage } from "./pages/petugas.js";
// Dashboard admin kini berdiri sendiri di admin.html (js/admin-panel.js) —
// rute #/admin dihapus agar tidak ada dua panel yang harus disamakan.

// ---- chrome (tabbar) ----
const AUTH_PAGES = ["#/login", "#/register"];
// Isi tab-bar menurut peran. Petugas dan pelanggan memakai app yang sama tapi
// mengerjakan hal yang sama sekali berbeda: pelanggan mencari parkir dan
// membayar, petugas memverifikasi kendaraan dan mencocokkan top up. Menyodorkan
// "Cari Parkir" dan kartu saldo kepada petugas bukan sekadar mubazir — itu
// membuat pekerjaan yang sebenarnya (verifikasi) tenggelam di antara menu yang
// tidak pernah dia sentuh.
const TAB = {
  pelanggan: [
    { go: "#/home", ic: "🏠", t: "Home" },
    { go: "#/riwayat", ic: "🕘", t: "Aktivitas" },
    null,                                   // slot FAB
    { go: "#/cari", ic: "🗺️", t: "Cari" },
    { go: "#/akun", ic: "👤", t: "Akun" },
  ],
  petugas: [
    { go: "#/petugas", ic: "🦺", t: "Petugas" },
    // "Antrean", bukan "Konfirmasi": petugas hanya memantau — yang menyetujui
    // top up hanya admin, di panel /admin.
    { go: "#/topup", ic: "💠", t: "Antrean" },
    null,
    { go: "#/cari", ic: "🗺️", t: "Lokasi" },
    { go: "#/akun", ic: "👤", t: "Akun" },
  ],
};

// Admin tidak pernah sampai ke sini — ia dialihkan ke admin.html (lihat
// alihkanAdmin). Yang tersisa: petugas atau pelanggan.
const tabUntuk = (u) => (u?.role === "petugas" ? "petugas" : "pelanggan");

// ---- admin bukan pengguna app ini ----
//
// Panel admin berdiri sendiri di /admin, dan di sanalah akun admin masuk.
// Membiarkannya juga memakai app pelanggan berarti dua pintu masuk untuk satu
// akun yang boleh menyunting lokasi, promo, dan menyetujui top up.
//
// Dialihkan, BUKAN di-logout. Firebase menyimpan sesi per-origin, jadi
// admin.html dan app.html berbagi sesi yang sama: logout di sini akan ikut
// memutus sesi panel yang mungkin sedang terbuka di tab lain. Mengalihkan
// menutup akses ke app tanpa merusak apa pun.
//
// `?dari=app` hanya penanda supaya gerbang panel bisa menjelaskan kenapa
// pengguna tiba-tiba pindah halaman setelah menekan Masuk.
let mengalihkan = false;
function alihkanAdmin(u) {
  if (u?.role !== "admin" || mengalihkan) return false;
  mengalihkan = true;
  location.replace("admin.html?dari=app");
  return true;
}

let tabTerpasang = null;
function paintTabbar(u) {
  const jenis = tabUntuk(u);
  if (tabTerpasang === jenis) return;
  const tab = $("#tabbar");
  const fab = tab.querySelector(".fab-slot");     // dipertahankan, bukan dibuat ulang
  tab.innerHTML = "";
  TAB[jenis].forEach((item) => {
    if (!item) { tab.append(fab); return; }
    const b = document.createElement("button");
    b.dataset.go = item.go;
    b.innerHTML = "<span></span><small></small>";
    b.firstChild.textContent = item.ic;
    b.lastChild.textContent = item.t;
    b.addEventListener("click", () => go(item.go));
    tab.append(b);
  });
  const fabBtn = $("#fabScan");
  const label = jenis === "petugas" ? "Pindai e-ticket kendaraan" : "Scan QRIS untuk check-in";
  fabBtn.title = label;
  fabBtn.setAttribute("aria-label", label);
  tabTerpasang = jenis;
}

function updateChrome() {
  const path = current();
  const u = window.__AUTH?.current();
  if (alihkanAdmin(u)) return;
  const tab = $("#tabbar");
  const authPage = AUTH_PAGES.includes(path);
  tab.hidden = authPage || !u;
  if (u) paintTabbar(u);
  $$("#tabbar > button[data-go]").forEach(b => b.classList.toggle("active", b.dataset.go === path));
  $("#view").classList.toggle("noTab", tab.hidden);
}

function wireNav() {
  // Tombol pindai berarti dua hal berbeda menurut peran: pelanggan memindai QR
  // lokasi untuk check-in, petugas memindai e-ticket untuk verifikasi. Perannya
  // dibaca saat DITEKAN, bukan saat dipasang — peran bisa berubah setelah
  // login/logout tanpa halaman dimuat ulang.
  $("#fabScan").addEventListener("click", () => {
    const u = window.__AUTH?.current();
    go(u?.role === "petugas" ? "#/petugas?scan=1" : "#/checkin");
  });
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
    // Lapis kedua: kalau sebuah rute sempat dirender sebelum pengalihan di
    // updateChrome() berjalan, halaman pelanggan tidak boleh ikut tergambar.
    if (alihkanAdmin(u)) return;
    if (roles && !roles.includes(u.role)) {
      // Pesan dan tujuannya disesuaikan peran. Melempar petugas ke "#/home"
      // dengan pesan "Akses khusus pelanggan" membingungkan: dia bukan
      // pengguna yang kurang izin, dia pengguna yang salah aplikasi.
      const kePetugas = u.role === "petugas";
      toast(kePetugas ? "Halaman ini untuk pelanggan" : "Akses khusus " + roles.join("/"));
      go(kePetugas ? "#/petugas" : "#/home");
      return;
    }
    return fn(view);
  };
}

async function main() {
  fetchVersion();   // hanya log ke console — buat memastikan build mana yang live
  await Promise.all([initAuth(), initData()]);
  const { Auth } = await import("./auth.js");
  window.__AUTH = Auth;

  // routes
  // "admin" sengaja TIDAK tercantum di satu pun daftar peran: akun admin
  // dialihkan keluar dari app sebelum rute mana pun sempat dirender (lihat
  // alihkanAdmin). Mencantumkannya hanya akan menyiratkan jalur yang tidak ada.
  route("#/login", loginPage);
  route("#/register", registerPage);
  // Beranda pelanggan tidak pernah jadi milik petugas: kalaupun dibuka lewat
  // tautan lama atau riwayat peramban, petugas dialihkan ke dashboard-nya.
  route("#/home", guard(async (view) => {
    const u = window.__AUTH.current();
    if (u?.role === "petugas") { go("#/petugas"); return; }
    return homePage(view);
  }));
  route("#/cari", guard(cariPage));
  route("#/kendaraan", guard(kendaraanPage, { roles: ["pelanggan"] }));
  route("#/checkin", guard(checkinPage, { roles: ["pelanggan"] }));
  route("#/status", guard(statusPage, { roles: ["pelanggan"] }));
  route("#/riwayat", guard(riwayatPage));
  route("#/akun", guard(akunPage));
  route("#/petugas", guard(petugasPage, { roles: ["petugas"] }));
  route("#/topup", guard(topupPetugasPage, { roles: ["petugas"] }));
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
  if (alihkanAdmin(u0)) return;
  if (!u0 && !AUTH_PAGES.includes(p0)) {
    rememberRedirect(location.hash || "#/home");
    history.replaceState(null, "", "#/login");
  } else if (u0 && AUTH_PAGES.includes(p0)) {
    history.replaceState(null, "", takeRedirect() || berandaPeran(u0));
  }

  // reaktif: kalau status auth berubah (login/logout/sesi kedaluwarsa), arahkan
  let seeded = false;
  Auth.onChange(async (u) => {
    // Paling awal: sebelum ensureSeed, sebelum navigasi apa pun. Inilah yang
    // menangkap "akun admin mengetik sandinya di halaman masuk pelanggan" —
    // login-nya sendiri berhasil di Firebase, tapi app tidak pernah terbuka.
    if (alihkanAdmin(u)) return;
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

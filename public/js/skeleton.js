// ============================================================
// Skeleton loader per halaman.
//
// Dipakai dua kali:
//  1. saat aplikasi dibuka/di-refresh — bentuknya mengikuti halaman terakhir
//     yang dibuka (hash di URL), jadi yang tampil selama menunggu status auth
//     adalah kerangka halaman itu sendiri, bukan splash generik;
//  2. saat pindah halaman — selama modul halaman menyiapkan datanya.
//
// Ukuran tiap potongan MENGIKUTI ukuran elemen asli di app.css (header 195px,
// kartu QuPay 85px, tile 56px, kartu lokasi 46px ikon, dst) supaya tidak ada
// pergeseran tata letak begitu isi asli menggantikan kerangka.
// Semua fungsi di sini murni menghasilkan markup; tidak menyentuh data/auth.
// ============================================================

const line = (w) => `<div class="skel skel-line${w ? " " + w : ""}"></div>`;
const box = (cls) => `<div class="skel ${cls}"></div>`;
const many = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join("");

// --- potongan yang dipakai berulang -------------------------------------
const header = (jenis = "") => box("skel-header" + (jenis ? " " + jenis : ""));

// .section → padding 14/16/4 dengan judul + aksi di kanan
const section = (isi) => `<section class="skel-section">${isi}</section>`;
const head = () => `<div class="skel-head">${line("w40")}${box("skel-chip")}</div>`;

// .li → ikon 46 + dua baris + blok kanan
const li = (aksi = true) => `
  <div class="skel-li">
    <div class="skel skel-ic"></div>
    <div class="skel-body">${line("w60")}${line("w40")}</div>
    ${aksi ? box("skel-act") : ""}
  </div>`;

// .lot (kartu lokasi di halaman Cari) → identitas + chip + bar + tombol
const lot = () => `
  <div class="skel-lot">
    <div class="skel-lot-top">
      <div class="skel skel-ic"></div>
      <div class="skel-body">${line("w75")}${line()}${line("w60")}</div>
      <div class="skel skel-slot"></div>
    </div>
    <div class="skel-chips">${box("skel-pill")}${box("skel-pill")}${box("skel-pill")}</div>
    ${box("skel-bar")}
    <div class="skel-lot-act">${box("skel-btn")}${box("skel-btn ghost")}</div>
  </div>`;

// .acc-item (menu di halaman Akun) → ikon 44 + dua baris + chevron
const accItem = () => `
  <div class="skel-acc-item">
    <div class="skel skel-ic sm"></div>
    <div class="skel-body">${line("w60")}${line("w40")}</div>
    <div class="skel skel-go"></div>
  </div>`;

const stats = () => `<div class="skel-stats">${many(3, () => box("skel-stat"))}</div>`;
const field = () => `<div class="skel-field">${line("w40")}${box("skel-input")}</div>`;

const PAGES = {
  // header + kartu QuPay (menumpuk -44px) + 8 tile + promo + parkir terdekat
  "#/home": () => `
    ${header()}
    <div class="skel-wallet-slot">
      <div class="skel-wallet">
        <div class="skel skel-wlogo"></div>
        <div class="skel-body">${line("w60")}${line("w75")}</div>
        <div class="skel-body end">${line()}${line()}</div>
      </div>
    </div>
    <div class="skel-grid">${many(8, () => `
      <div class="skel-tile">${box("skel-tile-ic")}${line()}</div>`)}</div>
    ${section(`${head()}<div class="skel-carousel">${many(2, () => box("skel-promo"))}</div>
      <div class="skel-dots">${many(3, () => box("skel-dot"))}</div>`)}
    ${section(`${head()}<div class="skel-carousel">${many(2, () => box("skel-pcard"))}</div>`)}`,

  // header ringkas + peta + daftar kantong parkir
  "#/cari": () => `
    ${header("simple")}
    ${box("skel-map")}
    ${section(head())}
    <div class="skel-pad lots">${many(2, () => lot())}</div>`,

  "#/riwayat": () => `
    ${header()}
    <div class="skel-tabs">${box("skel-tab")}${box("skel-tab")}</div>
    <div class="skel-pad list">${many(4, () => li(false))}</div>`,

  "#/akun": () => `
    ${header("compact")}
    <div class="skel-pad">
      ${box("skel-balance")}
      ${line("w40")}
      <div class="skel-pad-inner list">${many(4, () => accItem())}</div>
    </div>`,

  "#/kendaraan": () => `
    ${header("simple")}
    <div class="skel-pad">${box("skel-btn")}</div>
    <div class="skel-pad list">${many(2, () => li())}</div>`,

  "#/checkin": () => `
    ${header("simple")}
    <div class="skel-pad">
      ${line("w40")}
      <div class="skel-seg">${box("skel-seg-item")}${box("skel-seg-item")}</div>
      ${field()}
      ${box("skel-btn ghost")}
      ${box("skel-btn")}
    </div>`,

  "#/status": () => `
    ${header("simple")}
    <div class="skel-pad">
      <div class="skel-card">
        <div class="skel-row">${line("w60")}${box("skel-chip")}</div>
        ${line("w75")}${line("w40")}
        ${box("skel-timer")}
        ${box("skel-amt")}
      </div>
      <div class="skel-card center">${line("w40")}${box("skel-qr")}${line("w60")}</div>
      ${box("skel-btn")}
    </div>`,

  "#/petugas": () => `
    ${header("simple")}
    <div class="skel-pad">${stats()}<div class="skel-card center">${line("w40")}${box("skel-qr sm")}</div></div>
    ${section(head())}
    <div class="skel-pad list">${many(3, () => li())}</div>`,

  // Halaman auth berlatar gelap — kerangkanya ikut gelap supaya tidak berkedip putih.
  "#/login": () => auth(2, true),
  "#/register": () => auth(4, false),
};

// Kartu masuk/daftar: brand → kartu (judul, field, tombol) → penyedia login
const auth = (jumlahField, penyedia) => `
  <div class="skel-auth">
    <div class="skel-auth-brand">${box("skel-mark")}<div class="skel-body">${line()}${line("w60")}</div></div>
    <div class="skel-auth-card">
      ${line("w40")}${line("w75")}
      ${many(jumlahField, () => field())}
      ${box("skel-btn")}
      ${penyedia ? `${box("skel-sep")}${box("skel-provider")}${box("skel-provider")}` : ""}
    </div>
    ${line("w60")}
  </div>`;

// ============================================================
// Panel admin (admin.html) — bukan rute SPA, jadi dipisah dari PAGES.
//
// Kerangkanya memakai ULANG kelas tata letak aslinya (.admin-head,
// .admin-topbar, .adm-shell, .admin-tabs, .qr-grid) dan hanya mengisi
// bagian dalamnya dengan kotak .skel. Dengan begitu tingginya dihitung
// oleh CSS yang sama dengan isi sungguhan — termasuk saat titik ubah
// 640px membuat baris CRUD berubah arah — sehingga tidak ada lompatan
// tata letak ketika data tiba.
// ============================================================

// mirip .adm-item: isi + blok aksi (menumpuk di ponsel, sebaris ≥640px)
const admItem = () => `
  <div class="skel-admitem">
    <div class="top">
      <div class="skel skel-ic"></div>
      <div class="skel-body">${line("w60")}${line("w40")}</div>
    </div>
    <div class="act">${box("skel")}${box("skel")}</div>
  </div>`;

// mirip .qr-card: kotak QR + judul + kode + tombol unduh
const admQr = () => `
  <div class="skel-admqr">
    <div class="skel q"></div>
    ${line("w60")}${line("w40")}
    <div class="skel b"></div>
  </div>`;

const admStats = (n = 4) => `<div class="skel-admstats">${many(n, () => box("skel-stat"))}</div>`;
// `aksi` = ada tautan "+ Tambah" di kanan judul
const admHead = (aksi = false) => `<div class="skel-head">${line("w40")}${aksi ? box("skel-chip") : ""}</div>`;

// kop tetap: topbar + strip tab (selalu sama di semua tab)
const admChrome = () => `
  <div class="admin-head">
    <div class="admin-topbar">
      <div class="adm-shell adm-bar">
        <div class="skel-admbrand">${line()}${line()}</div>
        <div class="skel skel-admlogout"></div>
      </div>
    </div>
    <div class="admin-tabwrap">
      <nav class="admin-tabs">${many(5, () => box("skel skel-admtab"))}</nav>
    </div>
  </div>`;

// Potongan untuk DALAM tab — dipakai saat menunggu snapshot Firestore pertama.
const ADMIN_PARTS = {
  list: (n = 3) => many(n, () => admItem()),
  qr: (n = 3) => `<div class="skel-admqrgrid">${many(n, () => admQr())}</div>`,
  stats: (n = 4) => admStats(n),
};

export function adminPartHTML(jenis, n) {
  const build = ADMIN_PARTS[jenis];
  return build ? build(n) : ADMIN_PARTS.list(n);
}

export function adminPartNode(jenis, n) {
  const el = document.createElement("div");
  el.className = "skel-admpart";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = adminPartHTML(jenis, n);
  return el;
}

// Kerangka layar penuh saat halaman pertama dibuka.
//   "gate"      → kartu masuk (latar gelap, 2 field, tanpa tombol penyedia)
//   "dashboard" → kop + strip status + Ringkasan (tab awal)
export function adminSkeletonHTML(jenis) {
  if (jenis === "gate") return auth(2, false);
  // Tab awal adalah Ringkasan: statistik lalu dua daftar yang berdampingan
  // mulai 1024px, persis seperti .adm-cols di renderRingkasan().
  return `
    ${admChrome()}
    <div class="adm-shell adm-statuswrap">${box("skel skel-admstatus")}</div>
    <div class="adm-shell">
      <section class="skel-section">${admHead()}${admStats(4)}</section>
      <div class="skel-admcols">
        <section class="skel-section">${admHead()}${many(3, () => admItem())}</section>
        <section class="skel-section">${admHead()}${many(2, () => admItem())}</section>
      </div>
    </div>`;
}

export function adminSkeletonNode(jenis) {
  const el = document.createElement("div");
  el.className = "skel-page skel-admin" + (jenis === "gate" ? " on-dark" : "");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = adminSkeletonHTML(jenis);
  return el;
}

export const AUTH_SKELETONS = ["#/login", "#/register"];

// Markup kerangka untuk sebuah rute. Rute tak dikenal → kerangka netral.
export function skeletonHTML(path) {
  const build = PAGES[path];
  if (build) return build();
  return `${header("simple")}<div class="skel-pad list">${many(3, () => li())}</div>`;
}

// Elemen kerangka siap pakai. `overlay: true` menutupi isi #view yang sedang
// digambar halaman di baliknya, lalu tinggal di-remove saat halaman siap.
export function skeletonNode(path, { overlay = false } = {}) {
  const el = document.createElement("div");
  el.className = "skel-page" + (overlay ? " skel-overlay" : "")
    + (AUTH_SKELETONS.includes(path) ? " on-dark" : "");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = skeletonHTML(path);
  return el;
}

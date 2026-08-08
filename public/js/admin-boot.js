// ============================================================
// Boot panel admin: gambar kerangka yang BENAR secepatnya.
//
// Sepadan dengan js/boot.js milik aplikasi. Dimuat sebelum admin-panel.js
// dan hanya bergantung pada skeleton.js, jadi kerangka sudah tampil sebelum
// seluruh modul (util, parts, data, auth, qr) selesai diunduh.
//
// Status sesi admin ada di sessionStorage — terbaca SINKRON, jadi kita sudah
// tahu sejak sekarang apakah yang akan digambar itu gerbang masuk atau
// dashboard, dan kerangkanya bisa langsung dicocokkan. Tanpa ini, pengguna
// melihat kerangka dashboard lalu berkedip berganti kartu login.
// ============================================================
import { adminSkeletonNode } from "./skeleton.js";

// dipakai bersama admin-panel.js supaya kuncinya tidak ditulis dua kali
export const SESSION_KEY = "qp_admin_session_v1";

export const adminMasuk = () => {
  try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
};

const view = document.getElementById("view");
if (view) {
  const masuk = adminMasuk();
  // dashboard memakai kolom lebar; gerbang tetap kolom ponsel berlatar gelap
  document.getElementById("app")?.classList.toggle("wide", masuk);
  view.classList.toggle("authView", !masuk);
  view.replaceChildren(adminSkeletonNode(masuk ? "dashboard" : "gate"));
}

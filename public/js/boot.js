// ============================================================
// Boot: gambar kerangka (skeleton) halaman TERAKHIR yang dibuka secepatnya.
//
// Dimuat sebelum app.js dan hanya bergantung pada skeleton.js, jadi kerangka
// sudah tampil sebelum seluruh modul halaman + Firebase SDK selesai diunduh.
// Efeknya: refresh di #/riwayat memperlihatkan kerangka Aktivitas, refresh di
// #/cari memperlihatkan kerangka peta — bukan splash yang sama untuk semua.
// ============================================================
import { skeletonNode, AUTH_SKELETONS } from "./skeleton.js";

const path = (location.hash || "#/home").split("?")[0];
const view = document.getElementById("view");
if (view) {
  // halaman auth memakai kolom penuh tanpa padding tabbar — kerangkanya juga,
  // supaya latar gelapnya tidak menyisakan strip terang di bawah
  if (AUTH_SKELETONS.includes(path)) view.classList.add("authView");
  view.replaceChildren(skeletonNode(path));
}

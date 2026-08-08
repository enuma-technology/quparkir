// ============================================================
// Router — hash sederhana (#/home, #/cari, ...)
// ============================================================
import { skeletonNode, AUTH_SKELETONS } from "./skeleton.js";

const routes = {};
let notFound, currentCleanup;

export function route(path, handler) { routes[path] = handler; }
export function setNotFound(fn) { notFound = fn; }
export function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

export function current() { return (location.hash || "#/home").split("?")[0]; }
export function queryParam(k) {
  const q = (location.hash.split("?")[1] || ""); return new URLSearchParams(q).get(k);
}

export async function render() {
  const path = current();
  const handler = routes[path] || notFound;
  if (currentCleanup) { try { currentCleanup(); } catch {} currentCleanup = null; }
  const view = document.getElementById("view");
  view.innerHTML = "";
  view.scrollTop = 0;

  // Kerangka halaman tujuan menutupi #view selama handler menyiapkan datanya
  // (saldo, sesi aktif, lokasi …), lalu dilepas. Overlay, bukan sisipan biasa,
  // supaya halaman bisa menggambar di baliknya tanpa isi bertumpuk. Dipasang
  // tepat setelah #view dikosongkan agar tidak ada satu frame pun yang kosong.
  // halaman auth: samakan padding view dengan halaman aslinya (markAuthView)
  if (AUTH_SKELETONS.includes(path)) view.classList.add("authView");
  const skel = skeletonNode(path, { overlay: true });
  view.append(skel);
  try {
    const cleanup = await handler(view);
    if (typeof cleanup === "function") currentCleanup = cleanup;
  } finally {
    skel.remove();
  }
}

export function startRouter() {
  window.addEventListener("hashchange", render);
  render();
}

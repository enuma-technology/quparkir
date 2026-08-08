// ============================================================
// Util: DOM helper (hyperscript), format, toast, modal
// ============================================================

// h('div.card#id', {onclick}, [children]) — pembuat elemen ringkas
export function h(tag, props = {}, children = []) {
  const m = tag.match(/^([a-z0-9]+)?(#[\w-]+)?((?:\.[\w-]+)*)$/i) || [];
  const el = document.createElement(m[1] || "div");
  if (m[2]) el.id = m[2].slice(1);
  if (m[3]) el.className = m[3].split(".").filter(Boolean).join(" ");
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") el.className += " " + v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const rupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");

export function durasiText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const j = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), d = s % 60;
  return [j, m, d].map(x => String(x).padStart(2, "0")).join(":");
}
export function durasiLabel(ms) {
  const menit = Math.floor(ms / 60000);
  const j = Math.floor(menit / 60), m = menit % 60;
  return (j ? `${j} jam ` : "") + `${m} menit`;
}
// poin loyalitas: 10 poin untuk tiap sesi parkir yang sudah selesai (check-out + bayar)
export const POIN_PER_SESI = 10;
export const hitungPoin = (sessions) =>
  (Array.isArray(sessions) ? sessions : []).filter(s => s?.status === "done").length * POIN_PER_SESI;

// tarif: motor 2000 jam pertama lalu 1000/jam; mobil 3000 lalu 2000/jam
export function hitungTarif(type, ms) {
  const jam = Math.max(1, Math.ceil(ms / 3600000));
  if (type === "mobil") return 3000 + (jam - 1) * 2000;
  return 2000 + (jam - 1) * 1000;
}

let toastTimer;
export function toast(msg, kind = "") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast " + kind), 2600);
}

// modal sederhana; resolve(value) saat ditutup
export function modal(title, bodyNode, { okText } = {}) {
  return new Promise((resolve) => {
    const host = $("#modalHost");
    const close = (val) => { host.innerHTML = ""; resolve(val); };
    const card = h(".modal", {}, [
      h(".grab"),
      h("h3", { text: title }),
      bodyNode,
    ]);
    const bg = h(".modal-bg", { onclick: (e) => { if (e.target === bg) close(null); } }, [card]);
    card._close = close;
    host.innerHTML = "";
    host.append(bg);
  });
}

export const fmtDate = (ts) => new Date(ts).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
export const uid = () => Math.random().toString(36).slice(2, 10);

// Baca public/version.json (dinaikkan tiap deploy — lihat scripts/bump-version.mjs)
// dan log ke console. `cache:"no-store"` sengaja dipakai: file ini justru yang
// harus dipercaya sebagai sumber "build mana yang live", jadi tidak boleh ikut
// kena cache sama sekali (beda dari kebijakan no-cache biasa di HTTP header-nya).
let versionPromise;
export function fetchVersion() {
  if (!versionPromise) {
    versionPromise = fetch("version.json", { cache: "no-store" })
      .then(r => r.json())
      .then(v => { console.log(`QuParkir v${v.version} (build ${v.buildDate})`); return v; })
      .catch(() => null);
  }
  return versionPromise;
}

// Tempel " · vN" ke sebuah elemen teks begitu version.json terbaca — dipakai
// panel admin supaya admin bisa memastikan build yang live sudah yang terbaru.
export function showVersion(el) {
  fetchVersion().then(v => { if (v?.version) el.textContent += ` · v${v.version}`; });
}

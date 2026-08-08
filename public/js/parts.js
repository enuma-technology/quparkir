// Komponen header yang dipakai ulang
import { h, $, modal, POIN_PER_SESI } from "./util.js";
import { go } from "./router.js";

function poinModal() {
  modal("Poin QuParkir", h("div", {}, [
    h(".li", {}, [
      h(".ic", { text: "⭐" }),
      h("div", { style: "flex:1" }, [
        h(".t", { text: `+${POIN_PER_SESI} poin tiap sesi parkir selesai` }),
        h(".s", { text: "Poin bertambah otomatis setelah Anda check-out dan menyelesaikan pembayaran." }),
      ]),
    ]),
    h(".li", {}, [
      h(".ic", { text: "🎁" }),
      h("div", { style: "flex:1" }, [
        h(".t", { text: "Penukaran hadiah" }),
        h(".s", { text: "Tukar poin dengan potongan tarif akan hadir di pembaruan berikutnya." }),
      ]),
    ]),
  ]));
}

function notifModal() {
  modal("Notifikasi", h(".empty", {}, [
    h(".ic", { text: "🔕" }),
    h("p", { text: "Belum ada notifikasi baru." }),
    h(".s", { text: "Pengingat durasi parkir akan hadir di pembaruan berikutnya." }),
  ]));
}

// `points`: angka untuk ditampilkan, atau null bila nilainya belum diketahui
// (badge tampil "—" alih-alih 0 palsu). Halaman memperbarui lewat el.setPoints(n).
export function appHeader({ title, sub, points, icons = true }) {
  const badge = points === undefined ? null
    : h("button.points", { type: "button", onclick: poinModal, title: "Cara mendapatkan poin" });

  const el = h(".header", {}, [
    h(".topline", {}, [
      h(".brand", {}, [
        h("img.brand-logo", { src: "assets/logo/logo-mark-white.png", alt: "", width: 22, height: 22 }),
        "QuParkir",
      ]),
      icons ? h(".h-icons", {}, [
        h("button", { title: "Notifikasi", onclick: notifModal }, "🔔"),
      ]) : null,
    ]),
    h(".greet", {}, [
      h("div", {}, [h("h1", { text: title }), sub ? h("p", { text: sub }) : null]),
      badge,
    ]),
  ]);

  if (badge) {
    el.setPoints = (n) => {
      const ada = Number.isFinite(n);
      badge.textContent = "⭐ Poin : " + (ada ? n.toLocaleString("id-ID") : "—");
      badge.classList.toggle("pending", !ada);
      badge.setAttribute("aria-label", ada ? `${n} poin. Ketuk untuk info poin` : "Poin belum termuat");
    };
    el.setPoints(points);
  }
  return el;
}

// ============================================================
// Komponen halaman auth (login & register) — satu bahasa desain
// ============================================================

const GOOGLE_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
<path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l-.1.3 6.5 5 .5.1c4.1-3.8 6.6-9.4 6.6-15.7"/>
<path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-.3.1-6.8 5.2-.1.3C7.9 41 15.4 46 24 46"/>
<path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-.3l-6.9-5.3-.2.1C2.9 17 2 20.4 2 24s.9 7 2.4 10z"/>
<path fill="#EA4335" d="M24 10.6c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.5 29.9 2 24 2 15.4 2 7.9 7 4.4 14l7.1 5.5c1.8-5.3 6.7-9 12.5-9"/>
</svg>`;

// Tautan bawah bawaan (halaman pelanggan). Halaman internal mengoper `links`
// sendiri — atau `links: []` untuk meniadakannya.
const AUTH_LINKS = [
  { href: "index.html", text: "Tentang QuParkir" },
  { href: "index.html#faq", text: "Bantuan" },
];

// Kerangka halaman auth: brand → kartu → tautan bawah
// `card` = isi form (submit via Enter/tombol type=submit), `alt` = blok
// alternatif di bawah pemisah (tombol penyedia), `foot` = tautan di luar kartu,
// `badge` = label kecil di atas judul, `brand` = { name, tag } penanda konteks,
// `note` = string biasa ATAU node siap pakai bila butuh tata letak sendiri.
export function authShell({ title, sub, badge = null, brand = null, onsubmit,
  card = [], alt = null, foot = null, links = AUTH_LINKS, note = null }) {
  const { name = "QuParkir", tag = "Parkir Digital" } = brand || {};
  const body = onsubmit
    ? h("form.auth-form", { novalidate: true, onsubmit: (e) => { e.preventDefault(); onsubmit(); } }, card)
    : h(".auth-form", {}, card);

  return h(".auth", {}, [
    h(".auth-inner", {}, [
      h(".auth-brand", {}, [
        h("span.mark", {}, [h("img", { src: "assets/logo/logo-mark-white.png", alt: "", width: 44, height: 44 })]),
        h("span", {}, [h("b", { text: name }), h("small", { text: tag })]),
      ]),
      h("section.auth-card", {}, [
        h("header.auth-head", {}, [
          badge ? h("span.auth-badge", { text: badge }) : null,
          h("h1", { text: title }),
          sub ? h("p.lead", { text: sub }) : null,
        ]),
        body,
        alt ? h(".auth-alt", {}, [authSep(), ...[].concat(alt)]) : null,
      ]),
      foot,
      links?.length ? h("nav.auth-links", { "aria-label": "Tautan bantuan" },
        links.map(l => h("a", { href: l.href, text: l.text }))) : null,
      note ? (note.nodeType ? note : h("p.auth-note", { text: note })) : null,
    ]),
  ]);
}

// Field berlabel + slot pesan galat inline (aksesibel)
let fieldSeq = 0;
export function field(label, input, { hint, toggle } = {}) {
  const id = input.id || ("f" + (++fieldSeq));
  input.id = id;
  const err = h("span.err", { id: id + "-err", role: "alert" });
  const box = h(".box", {}, [input]);

  if (toggle) {
    input.classList.add("has-toggle");
    const eye = h("button.eye", {
      type: "button", "aria-label": "Tampilkan kata sandi", "aria-pressed": "false",
      onclick: () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        eye.textContent = show ? "🙈" : "👁️";
        eye.setAttribute("aria-pressed", show ? "true" : "false");
        eye.setAttribute("aria-label", show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi");
        input.focus();
      },
    }, "👁️");
    box.append(eye);
  }

  const wrap = h(".fld", {}, [
    h("label.lbl", { for: id, text: label }),
    box,
    hint ? h("span.hint", { text: hint }) : null,
    err,
  ]);
  input.__fld = wrap;
  input.addEventListener("input", () => clearError(input));
  return wrap;
}

export function setError(input, msg) {
  const wrap = input.__fld;
  if (!wrap) return false;
  wrap.classList.add("bad");
  wrap.querySelector(".err").textContent = msg;
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-describedby", input.id + "-err");
  input.focus();
  return false;
}

export function clearError(input) {
  const wrap = input.__fld;
  if (!wrap) return;
  wrap.classList.remove("bad");
  wrap.querySelector(".err").textContent = "";
  input.removeAttribute("aria-invalid");
  input.removeAttribute("aria-describedby");
}

// Tombol dengan status memuat
export function busy(btn, on, label) {
  btn.disabled = on;
  btn.classList.toggle("loading", on);
  if (label != null) btn.textContent = label;
}

// Tombol penyedia login (Google / tamu)
export function providerButton({ icon, svg, title, sub, onclick }) {
  return h("button.login", { type: "button", onclick }, [
    h("span.e", svg ? { html: GOOGLE_SVG } : { text: icon }),
    h("span", {}, [h("b", { text: title }), h("small", { text: sub })]),
  ]);
}

export const authSep = (t = "atau") => h(".sep", { text: t });

// Halaman auth memakai kolom penuh tanpa padding tabbar
export function markAuthView() {
  const v = $("#view");
  v.classList.add("noTab", "authView");
  return () => v.classList.remove("authView");
}

export function pageHeader(title, { back = "#/home" } = {}) {
  return h(".header.simple", {}, [
    h(".topline", {}, [
      h("button.back", { onclick: () => go(back) }, "‹"),
      h("h1.title", { text: title }),
    ]),
  ]);
}

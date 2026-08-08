import { h, rupiah, modal, hitungPoin } from "../util.js";
import { DB, DEFAULT_PROMOS } from "../data.js";
import { Auth } from "../auth.js";
import { appHeader } from "../parts.js";
import { go } from "../router.js";

const QUICK = [
  { e: "📷", t: "Scan QR", go: "#/checkin", accent: true },
  { e: "🅿️", t: "Cari Parkir", go: "#/cari" },
  { e: "🚗", t: "Kendaraan", go: "#/kendaraan" },
  { e: "🎫", t: "E-Ticket", go: "#/status" },
  { e: "🧾", t: "Riwayat", go: "#/riwayat" },
  { e: "💳", t: "Top Up", go: "#/akun" },
  { e: "🎁", t: "Promo", act: () => promoModal() },
  { e: "🆘", t: "Bantuan", act: bantuanModal },
];

// Diperbarui oleh langganan DB.promos di homePage(); dipakai sebagai isi
// default modal "Promo" tile (mis. saat dipanggil sebelum data live tiba).
let livePromos = DEFAULT_PROMOS;

function promoModal(list = livePromos) {
  modal("Promo", h("div", {}, [
    ...(list.length ? list.map(p => h(".li", {}, [
      h(".ic", { text: "🎁" }),
      h("div", { style: "flex:1" }, [h(".t", { text: p.title }), h(".s", { text: p.desc })]),
      h(".end", {}, [p.tag ? h("span.pill", { text: p.tag }) : null]),
    ])) : [h(".empty", {}, [h(".ic", { text: "🎁" }), h("p", { text: "Belum ada promo aktif." })])]),
    h(".s", { style: "margin-top:10px;text-align:center", text: "Syarat & ketentuan berlaku" }),
  ]));
}

// ---- saldo bisa disembunyikan (pilihan tersimpan antar-sesi) ----
const HIDE_KEY = "quparkir_hide_balance_v1";
const isHidden = () => { try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } };
const setHidden = (v) => { try { localStorage.setItem(HIDE_KEY, v ? "1" : "0"); } catch { /* mode privat */ } };

const EYE_ON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M10.7 6.2A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17.2 17.2 0 0 1-3 3.7"/>
  <path d="M6.7 7.9A16.8 16.8 0 0 0 2.5 12S6 18 12 18a10 10 0 0 0 3.4-.6"/>
  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/></svg>`;

// Lambang dompet QuPay. Sebelumnya kotak 40px ini diisi teks "QuPay" yang
// tidak muat dan meluber; namanya toh sudah tertulis di sebelahnya.
const WALLET_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M20 8.5V7.5A2.5 2.5 0 0 0 17.5 5H5.5A2.5 2.5 0 0 0 3 7.5v9A2.5 2.5 0 0 0 5.5 19h12a2.5 2.5 0 0 0 2.5-2.5v-1"/>
  <path d="M21 9.5h-4.1a2.5 2.5 0 0 0 0 5H21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1Z"/>
  <circle cx="16.9" cy="12" r="1" fill="currentColor" stroke="none"/></svg>`;

// Kartu QuPay: nominal + tombol mata untuk menyamarkannya
function walletCard(bal) {
  let hidden = isHidden();
  const amount = h("b");
  const eye = h("button.bal-eye", { type: "button" });

  function paint() {
    amount.textContent = hidden ? "Rp ••••••" : rupiah(bal);
    amount.classList.toggle("masked", hidden);
    eye.innerHTML = hidden ? EYE_OFF : EYE_ON;
    eye.setAttribute("aria-pressed", hidden ? "true" : "false");
    eye.setAttribute("aria-label", hidden ? "Tampilkan saldo" : "Sembunyikan saldo");
    eye.title = eye.getAttribute("aria-label");
  }
  eye.addEventListener("click", (e) => {
    e.stopPropagation();               // jangan ikut membuka halaman akun
    hidden = !hidden; setHidden(hidden); paint();
  });
  paint();

  return h(".wallet", {}, [
    h(".wlogo", { html: WALLET_ICON }),
    h(".wname", {}, [document.createTextNode("QuPay"), h("small", { text: "Saldo parkir cashless" })]),
    h(".bal", { onclick: () => go("#/akun") }, [
      h("small", { text: "Saldo" }),
      h(".bal-row", {}, [amount, eye]),
    ]),
  ]);
}

function bantuanModal() {
  const langkah = [
    ["1️⃣", "Scan QR lokasi", "Pindai kode QR di gerbang masuk lokasi parkir."],
    ["2️⃣", "Parkir", "Parkirkan kendaraan Anda di slot yang tersedia."],
    ["3️⃣", "Check-out & bayar", "Selesaikan sesi lalu bayar dengan QuPay atau QRIS."],
  ];
  modal("Bantuan", h("div", {}, [
    ...langkah.map(([ic, t, s]) => h(".li", {}, [
      h(".ic", { text: ic }),
      h("div", { style: "flex:1" }, [h(".t", { text: t }), h(".s", { text: s })]),
    ])),
    h(".s", { style: "margin-top:10px", text: "Kendala di lapangan? Hubungi petugas berseragam QuParkir di lokasi." }),
    h(".s", { style: "margin-top:4px", text: "Dishub Kota Surakarta" }),
  ]));
}

export default async function homePage(view) {
  const u = Auth.current();
  const bal = await Promise.resolve(DB.wallet.get(u.uid));

  const bannerWrap = h("div");           // pengumuman dari admin (opsional, tersembunyi bila kosong)
  const activeSlot = h("div");           // banner sesi aktif
  const promoWrap = h("section.section");
  const nearby = h(".cards");            // kartu terdekat
  // points:null → badge tampil "—" sampai data sesi tiba (bukan "0" yang menyesatkan)
  const header = appHeader({ title: `Hi, ${u.name} 👋`, sub: "Mau parkir di mana hari ini?", points: null });

  view.append(
    header,
    walletCard(bal),
    bannerWrap,
    activeSlot,
    h("nav.grid", {}, QUICK.map(q =>
      h("button.tile", { onclick: () => q.act ? q.act() : go(q.go) }, [h("span.ic" + (q.accent ? ".accent" : ""), { text: q.e }), h("span", { text: q.t })])
    )),
    promoWrap,
    h("section.section", {}, [
      h(".head", {}, [h("h2", { text: "Parkir Terdekat" }), h("a", { onclick: () => go("#/cari") }, "Peta")]),
      nearby,
    ]),
  );

  // Satu langganan untuk dua hal yang sumbernya sama: poin (dari sesi selesai)
  // dan banner sesi aktif. Keduanya ikut berubah begitu check-out tercatat.
  const unsubS = DB.sessions.subscribeFor(u.uid, (list) => {
    header.setPoints(hitungPoin(list));

    const s = list.find(z => z.status === "active") || null;
    activeSlot.innerHTML = "";
    if (!s) return;
    activeSlot.append(h("section.section", {}, [
      h(".li", { style: "background:linear-gradient(135deg,var(--blue-600),var(--cyan-500));color:#fff;cursor:pointer", onclick: () => go("#/status") }, [
        h(".ic", { style: "background:rgba(255,255,255,.25)", text: "⏱️" }),
        h("div", {}, [h(".t", { style: "color:#fff", text: "Parkir aktif · " + s.locationName }),
          h(".s", { style: "color:rgba(255,255,255,.85)", text: s.vehicle.plate + " · ketuk untuk lihat status" })]),
        h(".end", {}, [h("span", { style: "font-size:1.4rem", text: "›" })]),
      ]),
    ]));
  });

  // lokasi terdekat (live)
  const unsubL = DB.locations.subscribe((locs) => {
    nearby.innerHTML = "";
    locs.slice(0, 5).forEach((l, i) => {
      const avail = ((l.capMotor || 0) - (l.occMotor || 0)) + ((l.capCar || 0) - (l.occCar || 0));
      nearby.append(h(".pcard", { onclick: () => go("#/cari") }, [
        h(".thumb", {}, [document.createTextNode(["🏬", "🛍️", "🏯", "🏛️", "🎓"][i % 5]),
          h("span.badge", { text: avail > 5 ? "TERSEDIA" : (avail > 0 ? "TERBATAS" : "PENUH") })]),
        h(".body", {}, [h("h4", { text: l.name }),
          h(".meta", {}, [h("span", { text: "🅿️ " + avail + " slot" }), h("span.price", { text: rupiah(l.tarif?.motor) + "/jam" })])]),
      ]));
    });
  });

  // promo & banner (isi diatur lewat admin.html) — UI dibentuk otomatis dari teks
  const unsubP = DB.promos.subscribe((list) => { livePromos = list.length ? list : DEFAULT_PROMOS; paintPromos(promoWrap, livePromos); });
  const unsubB = DB.banners.subscribe((list) => paintBanners(bannerWrap, list));

  return () => { unsubS && unsubS(); unsubL && unsubL(); unsubP && unsubP(); unsubB && unsubB(); };
}

// Pengumuman singkat yang diisi admin (teks polos, tanpa HTML). Tersembunyi
// total bila tak ada banner aktif — tidak menyisakan ruang kosong di layout.
function paintBanners(wrap, banners) {
  wrap.innerHTML = "";
  const active = banners.filter(b => b.active !== false && (b.text || "").trim());
  if (!active.length) return;
  wrap.append(h("section.section", {}, active.map(b => h(".li.banner-item", {}, [
    h(".ic", { text: "📣" }),
    h("div", { style: "flex:1" }, [h(".t", { text: b.text }), b.subtext ? h(".s", { text: b.subtext }) : null]),
  ]))));
}

// Kartu carousel promo dibangun murni dari data — admin cukup isi tag/judul/
// deskripsi, gaya kartu (varian "alt") berselang-seling otomatis per index.
function paintPromos(wrap, promos) {
  wrap.innerHTML = "";
  if (!promos.length) return;
  const dots = h(".dots");
  const car = h(".carousel", {}, promos.map((p, i) =>
    h(".promo" + (i % 2 ? ".alt" : ""), {}, [h("span.blob"), h("span.kik", { text: p.tag || "" }), h("h3", { text: p.title || "" }), h("p", { text: p.desc || "" })])
  ));
  dots.append(...promos.map((_, i) => h("i" + (i === 0 ? ".on" : ""))));
  car.addEventListener("scroll", () => {
    const i = Math.round(car.scrollLeft / (car.scrollWidth / promos.length));
    [...dots.children].forEach((d, n) => d.classList.toggle("on", n === Math.min(i, promos.length - 1)));
  });
  wrap.append(h(".head", {}, [h("h2", { text: "Promo" }), h("a", { onclick: () => promoModal(promos) }, "Lihat semua")]), car, dots);
}

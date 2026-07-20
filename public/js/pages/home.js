import { h, rupiah, modal } from "../util.js";
import { DB } from "../data.js";
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
  { e: "🎁", t: "Promo", act: promoModal },
  { e: "🆘", t: "Bantuan", act: bantuanModal },
];

const PROMOS = [
  { kik: "BARU", t: "Cashback 50%", s: "Semua transaksi parkir pakai QuPay · 27 Feb – 31 Agu 2026" },
  { kik: "HEMAT", t: "Gratis Biaya Admin", s: "Top up QuPay pertama tanpa biaya tambahan" },
  { kik: "POIN", t: "2× Poin", s: "Check-in di kantong parkir favoritmu akhir pekan ini" },
];

function promoModal() {
  modal("Promo", h("div", {}, [
    ...PROMOS.map(p => h(".li", {}, [
      h(".ic", { text: "🎁" }),
      h("div", { style: "flex:1" }, [h(".t", { text: p.t }), h(".s", { text: p.s })]),
      h(".end", {}, [h("span.pill", { text: p.kik })]),
    ])),
    h(".s", { style: "margin-top:10px;text-align:center", text: "Syarat & ketentuan berlaku" }),
  ]));
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

  const activeSlot = h("div");           // banner sesi aktif
  const nearby = h(".cards");            // kartu terdekat
  const dots = h(".dots");
  const header = appHeader({ title: `Hi, ${u.name} 👋`, sub: "Mau parkir di mana hari ini?", points: 0 });

  view.append(
    header,
    h(".wallet", {}, [
      h(".wlogo", { text: "QuPay" }),
      h(".wname", {}, [document.createTextNode("QuPay"), h("small", { text: "Saldo parkir cashless" })]),
      h(".bal", { onclick: () => go("#/akun") }, [h("small", { text: "Saldo" }), document.createTextNode(" "), h("b", { text: rupiah(bal).replace("Rp ", "Rp ") })]),
    ]),
    activeSlot,
    h("nav.grid", {}, QUICK.map(q =>
      h("button.tile", { onclick: () => q.act ? q.act() : go(q.go) }, [h("span.ic" + (q.accent ? ".accent" : ""), { text: q.e }), h("span", { text: q.t })])
    )),
    promoSection(dots),
    h("section.section", {}, [
      h(".head", {}, [h("h2", { text: "Parkir Terdekat" }), h("a", { onclick: () => go("#/cari") }, "Peta")]),
      nearby,
    ]),
  );

  // poin nyata: 10 poin per sesi selesai
  try {
    const sesi = await Promise.resolve(DB.sessions.listFor(u.uid));
    const poin = sesi.filter(s => s.status === "done").length * 10;
    const el = header.querySelector(".points");
    if (el) el.textContent = "⭐ Poin : " + poin;
  } catch { /* abaikan */ }

  // sesi aktif
  const unsubS = DB.sessions.subscribeActive(u.uid, (s) => {
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
      const avail = (l.capMotor - l.occMotor) + (l.capCar - l.occCar);
      nearby.append(h(".pcard", { onclick: () => go("#/cari") }, [
        h(".thumb", {}, [document.createTextNode(["🏬", "🛍️", "🏯", "🏛️", "🎓"][i % 5]),
          h("span.badge", { text: avail > 5 ? "TERSEDIA" : (avail > 0 ? "TERBATAS" : "PENUH") })]),
        h(".body", {}, [h("h4", { text: l.name }),
          h(".meta", {}, [h("span", { text: "🅿️ " + avail + " slot" }), h("span.price", { text: rupiah(l.tarif.motor) + "/jam" })])]),
      ]));
    });
  });

  return () => { unsubS && unsubS(); unsubL && unsubL(); };
}

function promoSection(dots) {
  const slides = [
    { kik: "BARU", h: 'Cashback <b>50%</b>', p: "Semua transaksi parkir pakai QuPay · 27 Feb – 31 Agu 2026" },
    { kik: "HEMAT", h: 'Gratis Biaya<br>Admin', p: "Top up QuPay pertama tanpa biaya tambahan", alt: true },
    { kik: "POIN", h: '2× Poin', p: "Check-in di kantong parkir favoritmu akhir pekan ini" },
  ];
  const car = h(".carousel", {}, slides.map(s =>
    h(".promo" + (s.alt ? ".alt" : ""), {}, [h("span.blob"), h("span.kik", { text: s.kik }), h("h3", { html: s.h }), h("p", { text: s.p })])
  ));
  dots.append(...slides.map((_, i) => h("i" + (i === 0 ? ".on" : ""))));
  car.addEventListener("scroll", () => {
    const i = Math.round(car.scrollLeft / (car.scrollWidth / slides.length));
    [...dots.children].forEach((d, n) => d.classList.toggle("on", n === Math.min(i, slides.length - 1)));
  });
  return h("section.section", {}, [h(".head", {}, [h("h2", { text: "Promo" }), h("a", { onclick: promoModal }, "Lihat semua")]), car, dots]);
}

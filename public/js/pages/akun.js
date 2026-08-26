import { h, $, rupiah, toast, modal } from "../util.js";
import { DB, MODE } from "../data.js";
import { Auth } from "../auth.js";
import { appHeader } from "../parts.js";
import { go, render } from "../router.js";
import { payQRIS, topUpGateway, siapkanGateway } from "../pay.js";

const ROLES = ["pelanggan", "petugas", "admin"];
const PROVIDER = { google: "Google", email: "Email", anonymous: "Tamu" };
const TOPUP_MIN = 10000, TOPUP_MAX = 1000000;
const NOMINAL = [25000, 50000, 100000, 200000];

const titel = (s) => (s || "").charAt(0).toUpperCase() + (s || "").slice(1);
const providerLabel = (u) => PROVIDER[u.provider] || (u.anon ? "Tamu" : (u.email ? "Email" : "—"));

// Avatar: foto profil Google jika ada (photoURL), gugur ke huruf inisial kalau gambar gagal dimuat.
function avatar(u) {
  const el = h(".acc-avatar", { text: (u.name || "U")[0].toUpperCase() });
  if (u.photoURL) {
    const img = h("img", { src: u.photoURL, alt: "", referrerpolicy: "no-referrer" });
    img.addEventListener("error", () => img.remove(), { once: true });
    el.append(img);
  }
  return el;
}

// Judul kelompok menu
const group = (title, items) =>
  h("section.section", {}, [h(".head", {}, [h("h2", { text: title })]), ...[].concat(items)]);

// Baris menu: ikon → judul/keterangan → chevron. `href` membuatnya jadi tautan.
function item({ ic, t, s, href, onclick, kind = "" }) {
  const tag = (href ? "a" : "button") + ".acc-item" + (kind ? "." + kind : "");
  return h(tag, href ? { href } : { type: "button", onclick }, [
    h(".ic", { text: ic }),
    h("div", { style: "flex:1;min-width:0" }, [h(".t", { text: t }), s ? h(".s", { text: s }) : null]),
    h("span.go", { "aria-hidden": "true", text: "›" }),
  ]);
}

// Modal top up: pilihan nominal cepat + nominal bebas, lalu bayar via QRIS.
function topUpModal(u) {
  const inp = h("input.input", { type: "number", inputmode: "numeric", min: TOPUP_MIN, max: TOPUP_MAX, placeholder: "50000", value: "50000" });
  const chips = h(".topup-chips");
  const paint = () => [...chips.children].forEach(c => {
    const on = c.dataset.v === inp.value;
    c.classList.toggle("active", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
  });

  NOMINAL.forEach(n => chips.append(
    h("button", { type: "button", dataset: { v: String(n) }, text: rupiah(n), onclick: () => { inp.value = String(n); paint(); } })
  ));
  inp.addEventListener("input", paint);
  paint();

  const submit = async () => {
    const amount = Number(inp.value);
    if (!Number.isInteger(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX)
      return toast(`Nominal harus bilangan bulat ${rupiah(TOPUP_MIN)} – ${rupiah(TOPUP_MAX)}`, "err");
    $("#modalHost").innerHTML = "";

    // Jalur gateway: saldo bertambah sendiri setelah Midtrans memastikan
    // uangnya masuk — tidak ada tombol "saya sudah bayar", dan tidak ada
    // petugas yang perlu menunggu.
    const via = await topUpGateway({ amount });
    if (via.server) {
      return modal("Top Up Berhasil", h("div", { style: "text-align:center" }, [
        h(".center", { style: "font-size:46px" }, "✅"),
        h(".big-amt", { style: "margin:6px 0 10px", text: rupiah(via.amount ?? amount) }),
        h("p.muted", { html: "<small>Saldo QuPay Anda sudah bertambah.</small>" }),
        h("button.btn", { style: "margin-top:16px", onclick: () => { $("#modalHost").innerHTML = ""; render(); } }, "Selesai"),
      ]));
    }
    // topUpGateway() memulangkan false kalau pengguna menutup Snap tanpa bayar,
    // dan { mundur: true } kalau gateway memang tidak tersedia. Hanya yang
    // kedua yang boleh lanjut ke jalur cadangan.
    if (!via.mundur) return toast("Top up dibatalkan", "err");

    // Jalur cadangan: gateway tidak tersedia. Saldo TIDAK ditambah di sini —
    // QRIS statis tidak memberi tahu aplikasi kapan uang masuk, jadi menambah
    // saldo atas dasar tombol "sudah bayar" sama dengan membagikan saldo
    // gratis. Yang dicatat adalah PERMINTAAN; petugas mencocokkannya ke
    // aplikasi merchant lalu menyetujui.
    const ok = await payQRIS({ amount, title: "Top Up QuPay" });
    if (!ok) return toast("Top up dibatalkan", "err");
    try {
      await DB.topups.create(u.uid, { amount, name: u.name || "" });
    } catch (e) {
      return toast(e.message || "Gagal mengirim permintaan top up", "err");
    }
    modal("Menunggu Konfirmasi", h("div", { style: "text-align:center" }, [
      h(".center", { style: "font-size:46px" }, "⏳"),
      h(".big-amt", { style: "margin:6px 0 10px", text: rupiah(amount) }),
      h("p.muted", { html: "<small>Permintaan top up sudah dikirim. Saldo bertambah setelah petugas mencocokkan pembayaran Anda di aplikasi merchant.</small>" }),
      h("button.btn", { style: "margin-top:16px", onclick: () => { $("#modalHost").innerHTML = ""; render(); } }, "Mengerti"),
    ]));
  };

  modal("Top Up QuPay", h("div", {}, [
    h("p.muted", { style: "font-size:.8rem;font-weight:700;margin:2px 0 10px", text: "Pilih nominal" }),
    chips,
    h("label.field", {}, [h("span", { text: `Nominal lain (${rupiah(TOPUP_MIN)} – ${rupiah(TOPUP_MAX)})` }), inp]),
    h("button.btn", { onclick: submit }, "Lanjut Bayar"),
    h("p.center.muted", { style: "margin-top:10px", html: "<small>Pembayaran diproses lewat QRIS & e-wallet</small>" }),
  ]));
}

// Kartu saldo QuPay + aksi cepat.
// Angkanya dipisah jadi simpul sendiri supaya bisa diperbarui langganan tanpa
// menggambar ulang seluruh kartu (tombolnya tidak boleh ikut berkedip).
function balanceCard(u, bal) {
  const amt = h(".amt", { text: rupiah(bal) });
  const kartu = h(".acc-balance", {}, [
    h(".lbl", { text: "Saldo QuPay" }),
    amt,
    h("p.sub", { text: "Untuk pembayaran parkir tanpa uang tunai" }),
    h(".acts", {}, [
      h("button.primary", { type: "button", onclick: () => topUpModal(u) }, "＋ Top Up"),
      h("button", { type: "button", onclick: () => go("#/riwayat") }, "🧾 Riwayat"),
    ]),
  ]);
  kartu.setSaldo = (v) => { amt.textContent = rupiah(v); };
  return kartu;
}

// Pengalih peran — hanya berguna di mode demo (Firebase mengatur role via Firestore)
function roleBar(u) {
  const bar = h(".rolebar");
  ROLES.forEach(r => bar.append(h("button" + (u.role === r ? ".active" : ""), {
    type: "button",
    onclick: () => { Auth.setRole(r); toast("Peran: " + r, "ok"); render(); },
  }, titel(r))));
  return bar;
}

export default async function akunPage(view) {
  // Panaskan gateway sejak halaman dibuka: muat snap.js & konfigurasi sebelum
  // tombol bayar ditekan. Tidak di-await — murni percepatan.
  siapkanGateway();

  const u = Auth.current();

  // Petugas tidak memarkir kendaraan — dia bertugas di lokasi. Menampilkan
  // kartu saldo, "Kendaraan Saya", dan "E-Ticket" kepadanya bukan sekadar
  // mubazir: itu menyiratkan dia punya sesi parkir sendiri, dan menyembunyikan
  // dua pekerjaannya yang sesungguhnya di balik menu yang tidak relevan.
  const petugas = u.role === "petugas";

  // Saldo tidak perlu dibaca sama sekali kalau kartunya tidak ditampilkan.
  const bal = petugas ? 0 : await Promise.resolve(DB.wallet.get(u.uid));
  const kartuSaldo = petugas ? null : balanceCard(u, bal);

  const akunItems = petugas ? [
    item({ ic: "🦺", t: "Dashboard Petugas", s: "Verifikasi kendaraan & KTA digital", onclick: () => go("#/petugas") }),
    item({ ic: "💠", t: "Konfirmasi Top Up", s: "Setujui setelah uang masuk di merchant", onclick: () => go("#/topup") }),
    item({ ic: "🗺️", t: "Lokasi Parkir", s: "Kapasitas & keterisian tiap lokasi", onclick: () => go("#/cari") }),
  ] : [
    item({ ic: "🚗", t: "Kendaraan Saya", s: "Kelola motor & mobil terdaftar", onclick: () => go("#/kendaraan") }),
    item({ ic: "🧾", t: "Riwayat Parkir", s: "Semua sesi & pembayaran", onclick: () => go("#/riwayat") }),
    item({ ic: "🎫", t: "E-Ticket", s: "Tiket sesi parkir aktif", onclick: () => go("#/status") }),
  ];

  const kelolaItems = [
    // Admin memakai tab-bar pelanggan, jadi jalan masuk ke dashboard petugas
    // hanya ada di sini. Petugas sudah punya tab-nya sendiri.
    u.role === "admin" ? item({ ic: "🦺", t: "Dashboard Petugas", s: "Verifikasi kendaraan di lokasi", onclick: () => go("#/petugas") }) : null,
    // panel admin adalah halaman tersendiri (admin.html), bukan rute SPA
    u.role === "admin" ? item({ ic: "🏛️", t: "Panel Admin", s: "Lokasi, promo, banner & QR", onclick: () => location.assign("admin.html") }) : null,
  ].filter(Boolean);

  // view.append() menampilkan `null` sebagai teks — saring dulu bagian bersyaratnya
  view.append(...[
    appHeader({ title: "Akun", sub: "Pengaturan & profil", icons: false }),

    h(".card.acc-profile", {}, [
      avatar(u),
      h(".who", {}, [
        h("h3", { text: u.name || "Pengguna QuParkir" }),
        h(".mail", { text: u.email || (u.anon ? "Akun tamu" : "—") }),
        h(".acc-tags", {}, [
          h("span.pill.info", { text: titel(u.role) }),
          h("span.pill", { text: "Login " + providerLabel(u) }),
        ]),
      ]),
    ]),

    kartuSaldo ? h("div.pad", { style: "padding-bottom:0" }, [kartuSaldo]) : null,

    group(petugas ? "Tugas Saya" : "Akun Saya", akunItems),
    kelolaItems.length ? group("Kelola", kelolaItems) : null,
    MODE === "demo" ? group("Ganti Peran (demo)", roleBar(u)) : null,

    group("Lainnya", [
      item({ ic: "🌐", t: "Tentang QuParkir", s: "Informasi layanan & bantuan", href: "index.html" }),
      item({ ic: "🔒", t: "Kebijakan Privasi", s: "Data yang kami kumpulkan & hak Anda", href: "privasi.html" }),
      item({ ic: "📄", t: "Syarat & Ketentuan", s: "Aturan penggunaan layanan", href: "syarat.html" }),
      item({ ic: "💸", t: "Pengembalian Dana", s: "Kapan & bagaimana refund berlaku", href: "refund.html" }),
      item({ ic: "🚪", t: "Keluar", s: "Akhiri sesi di perangkat ini", kind: "danger", onclick: () => Auth.logout() }),
    ]),

    h("p.acc-foot", { html: "Backend aktif: <b>" + MODE.toUpperCase() + "</b> · QuParkir Surakarta" }),
  ].filter(Boolean));

  // Saldo mengikuti dokumen profil secara langsung: top up lewat gateway
  // ditambahkan webhook di server, jadi tidak ada tulisan dari halaman ini
  // yang bisa dijadikan penanda kapan harus menggambar ulang.
  const unsubSaldo = kartuSaldo ? DB.wallet.subscribe(u.uid, (v) => kartuSaldo.setSaldo(v)) : null;
  return () => { unsubSaldo && unsubSaldo(); };
}

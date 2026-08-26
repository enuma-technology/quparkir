import { h, $, rupiah, toast, modal } from "../util.js";
import { DB, MODE } from "../data.js";
import { Auth } from "../auth.js";
import { appHeader } from "../parts.js";
import { go, render } from "../router.js";
import { bayarTopUp } from "../pay.js";

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

    // QRIS merchant asli, tanpa simulator dan tanpa gateway. Saldo TIDAK
    // ditambah di sini: QRIS statis tidak memberi tahu aplikasi kapan uang
    // masuk, jadi menambah saldo atas dasar tombol "sudah bayar" sama dengan
    // membagikan saldo gratis. Yang dicatat adalah PERMINTAAN; admin
    // mencocokkannya ke aplikasi GoPay merchant lalu menyetujui.
    const bayar = await bayarTopUp({ amount });

    if (bayar.error) {
      // QRIS merchant tidak bisa dipakai. TIDAK membuat permintaan: tidak ada
      // uang yang pernah masuk, jadi admin tidak akan menemukan apa pun untuk
      // dicocokkan — permintaan itu hanya akan menyita perhatiannya.
      console.error("Top up dibatalkan:", bayar.error);
      return toast("QRIS merchant sedang tidak bisa dipakai. Hubungi petugas.", "err");
    }
    if (!bayar.ok) return toast("Top up dibatalkan", "err");

    try {
      await DB.topups.create(u.uid, { amount, name: u.name || "" });
    } catch (e) {
      return toast(e.message || "Gagal mengirim permintaan top up", "err");
    }
    modal("Menunggu Konfirmasi", h("div", { style: "text-align:center" }, [
      h(".center", { style: "font-size:46px" }, "⏳"),
      h(".big-amt", { style: "margin:6px 0 10px", text: rupiah(amount) }),
      h("p.muted", { html: "<small>Permintaan top up sudah dikirim. Saldo bertambah setelah admin mencocokkan pembayaran Anda di aplikasi GoPay merchant.</small>" }),
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
// Saldo awal akun baru adalah NOL (lihat catatan di data.js) — dulu layar
// menjanjikan Rp 25.000 yang tidak pernah ada di dokumen mana pun. Supaya
// Rp 0 tidak terbaca sebagai "saldo saya hilang", subjudulnya ikut berubah.
const SUB_KOSONG = "Belum ada saldo — top up dulu untuk bayar tanpa uang tunai";
const SUB_ADA = "Untuk pembayaran parkir tanpa uang tunai";

function balanceCard(u, bal) {
  const amt = h(".amt", { text: rupiah(bal) });
  const sub = h("p.sub", { text: bal > 0 ? SUB_ADA : SUB_KOSONG });
  // Slot permintaan yang sedang menunggu admin. Kosong (dan tidak memakan
  // ruang) selama tidak ada yang menunggu.
  const tunggu = h(".acc-topup-wait", { hidden: true });
  const tombolTopUp = h("button.primary", { type: "button", onclick: () => topUpModal(u) }, "＋ Top Up");
  const kartu = h(".acc-balance", {}, [
    h(".lbl", { text: "Saldo QuPay" }),
    amt,
    sub,
    tunggu,
    h(".acts", {}, [
      tombolTopUp,
      h("button", { type: "button", onclick: () => go("#/riwayat") }, "🧾 Riwayat"),
    ]),
  ]);
  kartu.setSaldo = (v) => { amt.textContent = rupiah(v); sub.textContent = v > 0 ? SUB_ADA : SUB_KOSONG; };

  // Persetujuan top up manual berarti ada jeda — bisa menit, bisa jam kalau
  // admin sedang tidak membuka aplikasi. Tanpa penanda apa pun di layar, jeda
  // itu terbaca sebagai "top up saya gagal", dan orang membayar untuk kedua
  // kalinya. Karena itu permintaan yang menunggu ditampilkan di kartu saldo,
  // bukan hanya sekali di modal yang sudah tertutup.
  kartu.setMenunggu = (list) => {
    tunggu.innerHTML = "";
    tunggu.hidden = !list.length;
    if (!list.length) { tombolTopUp.textContent = "＋ Top Up"; return; }
    const total = list.reduce((a, t) => a + t.amount, 0);
    tunggu.append(
      h("span.ic", { "aria-hidden": "true", text: "⏳" }),
      h("span", { text: list.length === 1
        ? rupiah(total) + " menunggu konfirmasi admin"
        : list.length + " permintaan (" + rupiah(total) + ") menunggu konfirmasi admin" }),
    );
    tombolTopUp.textContent = "＋ Top Up lagi";
  };
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
  // Halaman ini tidak lagi memanaskan gateway Midtrans: satu-satunya
  // pembayaran di sini adalah top up, dan top up memakai QRIS merchant.
  // Pemanasan tetap ada di halaman Status, tempat bayar parkir bisa lewat Snap.
  const u = Auth.current();

  // Petugas tidak memarkir kendaraan — dia bertugas di lokasi. Menampilkan
  // kartu saldo, "Kendaraan Saya", dan "E-Ticket" kepadanya bukan sekadar
  // mubazir: itu menyiratkan dia punya sesi parkir sendiri, dan menyembunyikan
  // dua pekerjaannya yang sesungguhnya di balik menu yang tidak relevan.
  const petugas = u.role === "petugas";

  // Saldo tidak perlu dibaca sama sekali kalau kartunya tidak ditampilkan.
  const bal = petugas ? 0 : await Promise.resolve(DB.wallet.get(u.uid));
  const kartuSaldo = petugas ? null : balanceCard(u, bal);

  // Satu-satunya pintu masuk ke persetujuan top up. Dibuat sekali lalu
  // ditempatkan di kelompok yang berbeda menurut peran (lihat kelolaItems):
  // saldo pengguna hanya bertambah lewat halaman ini, jadi orang yang berhak
  // menyetujui harus bisa menemukannya tanpa mengetik alamat.
  const konfirmasiTopUp = (petugas || u.role === "admin")
    ? item({ ic: "💠", t: "Konfirmasi Top Up", s: "Setujui setelah uang masuk di merchant", onclick: () => go("#/topup") })
    : null;

  const akunItems = petugas ? [
    item({ ic: "🦺", t: "Dashboard Petugas", s: "Verifikasi kendaraan & KTA digital", onclick: () => go("#/petugas") }),
    konfirmasiTopUp,
    item({ ic: "🗺️", t: "Lokasi Parkir", s: "Kapasitas & keterisian tiap lokasi", onclick: () => go("#/cari") }),
  ].filter(Boolean) : [
    item({ ic: "🚗", t: "Kendaraan Saya", s: "Kelola motor & mobil terdaftar", onclick: () => go("#/kendaraan") }),
    item({ ic: "🧾", t: "Riwayat Parkir", s: "Semua sesi & pembayaran", onclick: () => go("#/riwayat") }),
    item({ ic: "🎫", t: "E-Ticket", s: "Tiket sesi parkir aktif", onclick: () => go("#/status") }),
  ];

  const kelolaItems = [
    // Admin memakai tab-bar pelanggan, jadi jalan masuk ke dashboard petugas
    // hanya ada di sini. Petugas sudah punya tab-nya sendiri.
    u.role === "admin" ? item({ ic: "🦺", t: "Dashboard Petugas", s: "Verifikasi kendaraan di lokasi", onclick: () => go("#/petugas") }) : null,
    // Admin memakai menu pelanggan, jadi tanpa baris ini satu-satunya cara
    // mencapai halaman persetujuan adalah mengetik #/topup — dan permintaan
    // top up menggantung tanpa ada yang tahu.
    u.role === "admin" ? konfirmasiTopUp : null,
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
  const unsubTunggu = kartuSaldo ? DB.topups.subscribeMine(u.uid, (l) => kartuSaldo.setMenunggu(l)) : null;

  // Persetujuan top up itu manual, artinya ada orang yang uangnya sudah keluar
  // sedang menunggu. Jumlahnya ditempel di menu supaya terlihat tanpa harus
  // membuka halamannya lebih dulu.
  const subT = konfirmasiTopUp?.querySelector(".s");
  const unsubAntre = konfirmasiTopUp ? DB.topups.subscribePending((l) => {
    subT.textContent = l.length
      ? l.length + " permintaan menunggu persetujuan"
      : "Setujui setelah uang masuk di merchant";
    konfirmasiTopUp.classList.toggle("acc-antre", l.length > 0);
  }) : null;

  return () => { unsubSaldo && unsubSaldo(); unsubTunggu && unsubTunggu(); unsubAntre && unsubAntre(); };
}

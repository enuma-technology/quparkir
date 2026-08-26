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

// Modal top up: nominal diketik lewat papan angka, lalu bayar via QRIS.
//
// TIDAK ADA nilai bawaan. Dulu kolomnya terisi "50000" sejak modal dibuka:
// angka yang tidak pernah dipilih siapa pun, tapi terbaca seperti pilihan yang
// sudah diambil — cukup menekan "Lanjut Bayar" sekali dan QR Rp 50.000 sudah
// terbuka. Mulai dari nol memaksa nominalnya jadi keputusan sadar, dan itu
// penting justru di sini: yang keluar uang sungguhan, dan salah nominal berarti
// admin menerima mutasi yang tidak cocok dengan permintaan mana pun.
//
// Papan angka dipakai (bukan <input type=number>) karena alasan yang sama
// dengan aplikasi dompet digital: papan ketik ponsel untuk angka menyodorkan
// koma, titik, dan minus yang semuanya tidak sah di sini, dan tinggi papannya
// menutupi nominal yang sedang diketik. Papan sendiri juga membuat "000" bisa
// jadi satu tombol.
const MAKS_DIGIT = String(TOPUP_MAX).length;

function topUpModal(u) {
  let digit = "";
  const nilai = () => Number(digit || "0");

  const layar = h(".topup-amt", { text: rupiah(0) });
  const petunjuk = h("p.topup-hint");
  const lanjut = h("button.btn", { type: "button" }, "Lanjut Bayar");
  const chips = h(".topup-chips");

  function paint() {
    const n = nilai();
    layar.textContent = rupiah(n);
    layar.classList.toggle("nol", n === 0);

    // Pesannya mengikuti apa yang sedang diketik, bukan menunggu tombol
    // ditekan: "minimal Rp 10.000" berguna saat angkanya masih Rp 3.000,
    // percuma kalau baru muncul setelah orang menekan Lanjut.
    let pesan = `Minimal ${rupiah(TOPUP_MIN)} · maksimal ${rupiah(TOPUP_MAX)}`, salah = false;
    if (n > 0 && n < TOPUP_MIN) { pesan = `Kurang dari minimal ${rupiah(TOPUP_MIN)}`; salah = true; }
    else if (n > TOPUP_MAX) { pesan = `Melebihi maksimal ${rupiah(TOPUP_MAX)}`; salah = true; }
    petunjuk.textContent = pesan;
    petunjuk.classList.toggle("err", salah);

    lanjut.disabled = !(n >= TOPUP_MIN && n <= TOPUP_MAX);
    [...chips.children].forEach(c => {
      const on = c.dataset.v === String(n);
      c.classList.toggle("active", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // Nol di depan dibuang supaya "007" tidak mungkin terbentuk, dan panjangnya
  // dibatasi: tanpa itu orang bisa mengetik dua puluh digit dan layar hanya
  // menampilkan angka yang tidak mungkin disetujui.
  const tambah = (t) => { digit = (digit + t).replace(/^0+/, "").slice(0, MAKS_DIGIT); paint(); };
  const hapus = () => { digit = digit.slice(0, -1); paint(); };
  const setNilai = (n) => { digit = String(n); paint(); };

  NOMINAL.forEach(n => chips.append(
    h("button", { type: "button", dataset: { v: String(n) }, text: rupiah(n), onclick: () => setNilai(n) })
  ));

  const tombol = (label, aria, onclick, kelas = "") =>
    h("button.topup-key" + kelas, { type: "button", "aria-label": aria, onclick }, label);

  const pad = h(".topup-pad", {}, [
    ...["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => tombol(d, d, () => tambah(d))),
    tombol("000", "tiga nol", () => tambah("000"), ".sub"),
    tombol("0", "0", () => tambah("0")),
    tombol("⌫", "Hapus satu angka", hapus, ".sub"),
  ]);

  // Papan angka di layar tidak menggantikan papan ketik fisik: di desktop
  // mengetik angka adalah hal pertama yang dicoba orang, dan modal yang
  // mengabaikannya terasa rusak.
  const keydown = (e) => {
    if (e.key >= "0" && e.key <= "9") { tambah(e.key); e.preventDefault(); }
    else if (e.key === "Backspace") { hapus(); e.preventDefault(); }
    else if (e.key === "Enter" && !lanjut.disabled) { lanjut.click(); e.preventDefault(); }
  };
  document.addEventListener("keydown", keydown);

  const submit = async () => {
    const amount = nilai();
    if (!Number.isInteger(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX)
      return toast(`Nominal harus bilangan bulat ${rupiah(TOPUP_MIN)} – ${rupiah(TOPUP_MAX)}`, "err");
    document.removeEventListener("keydown", keydown);
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
  lanjut.onclick = submit;

  paint();
  modal("Top Up QuPay", h("div", {}, [
    h("p.topup-lbl", { text: "Nominal top up" }),
    layar,
    chips,
    pad,
    lanjut,
    petunjuk,
  ]))
    // Modal bisa ditutup lewat backdrop/Esc tanpa melewati submit() — listener
    // papan ketik harus ikut dilepas, kalau tidak setiap angka yang diketik di
    // halaman lain masih menyuntik modal yang sudah tidak ada.
    .then(() => document.removeEventListener("keydown", keydown));
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

  // Antrean top up bagi PETUGAS — PANTAUAN saja, bukan persetujuan. Yang
  // menyetujui hanya admin, di panel /admin (akun admin dialihkan ke sana
  // sebelum app sempat dirender, lihat alihkanAdmin di app.js). Petugas
  // membukanya untuk menjawab pengguna yang bertanya di lapangan.
  const konfirmasiTopUp = petugas
    ? item({ ic: "💠", t: "Antrean Top Up", s: "Pantau permintaan yang menunggu admin", onclick: () => go("#/topup") })
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

  // Kelompok "Kelola" dulu berisi tiga jalan masuk khusus admin (Dashboard
  // Petugas, Konfirmasi Top Up, Panel Admin). Ketiganya dihapus: akun admin
  // tidak pernah membuka halaman ini lagi, jadi baris-baris itu tidak mungkin
  // tergambar — dan membiarkannya menyiratkan admin masih memakai app.
  const kelolaItems = [];

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
  // sedang menunggu admin. Jumlahnya ditempel di menu supaya petugas tahu ada
  // antrean tanpa harus membuka halamannya lebih dulu.
  const subT = konfirmasiTopUp?.querySelector(".s");
  const unsubAntre = konfirmasiTopUp ? DB.topups.subscribePending((l) => {
    subT.textContent = l.length
      ? l.length + " permintaan menunggu admin"
      : "Pantau permintaan yang menunggu admin";
    konfirmasiTopUp.classList.toggle("acc-antre", l.length > 0);
  }) : null;

  return () => { unsubSaldo && unsubSaldo(); unsubTunggu && unsubTunggu(); unsubAntre && unsubAntre(); };
}

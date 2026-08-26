// ============================================================
// Panel Admin (admin.html) — CMS ringan untuk lokasi parkir, promo,
// banner beranda, dan ekspor QR.
//
// Halaman ini adalah SATU-SATUNYA pintu masuk akun admin. app.html
// mengalihkan setiap sesi ber-role admin ke sini (lihat alihkanAdmin di
// app.js), jadi admin tidak punya jalan lain — dan sebaliknya, akun
// non-admin tidak bisa lewat sini.
// ============================================================
import { h, $, rupiah, toast, modal, showVersion } from "./util.js";
import { authShell, field, setError, clearError, busy, markAuthView, admItem, confirmDialog } from "./parts.js";
import { initData, DB, MODE } from "./data.js";
import { initAuth, Auth, tungguSesi } from "./auth.js";
import { renderQR } from "./qr.js";
import { toDynamic, validateQris } from "./qris.js";
import { adminPartNode, ADMIN_TABS } from "./skeleton.js";
import { SESSION_KEY, currentTab } from "./admin-boot.js";
import { resolveLocationInput } from "./geo-input.js";
import renderPetugas from "./admin-petugas.js";

// Gerbangnya adalah Firebase Auth + `users/{uid}.role == "admin"` — akun yang
// sama yang dipakai Firestore Rules untuk memutuskan boleh-tidaknya menulis.
//
// Sebelum 26 Agu 2026 gerbang ini berupa username/password STATIS yang
// tertulis di berkas JS ini, jadi terbaca siapa pun lewat DevTools; hak tulis
// sesungguhnya tetap datang dari akun Firebase yang harus dimasukkan TERPISAH
// lewat app.html#/login di tab lain. Dua kredensial untuk satu pekerjaan, yang
// satu palsu — dan sejak app.html menolak akun admin, jalur itu bahkan tidak
// ada lagi. Sekarang satu login saja, dan yang membukanya persis yang memberi
// hak tulis.
//
// initAuth() tetap WAJIB dipanggil di sini: Firestore mengambil token dari
// instance Auth pada FirebaseApp yang sama. Tanpa itu request berangkat tanpa
// token dan semua rules ber-syarat isSignedIn()/isAdmin() menolaknya (bahkan
// membaca `transactions` gagal, sehingga pendapatan selalu Rp 0).

// sessionStorage (bukan localStorage): panel terkunci lagi saat tab ditutup,
// mengurangi risiko tertinggal terbuka di komputer bersama. Sesi Firebase-nya
// sendiri memang bertahan — yang per-tab hanyalah kunci panel ini.
const isLoggedIn = () => { try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; } };
const setLoggedIn = (v) => { try { v ? sessionStorage.setItem(SESSION_KEY, "1") : sessionStorage.removeItem(SESSION_KEY); } catch {} };

// Kerangka sebelum snapshot pertama tiba. Tanpa ini area daftar tampak kosong
// melompong saat Firestore masih memuat — tak terbedakan dari "memang belum
// ada data". Bentuknya mengikuti isi yang akan menggantikannya, jadi tata
// letak tidak melompat. `jenis`: "list" | "qr" | "stats".
const memuat = (jenis = "list", n = 3) => adminPartNode(jenis, n);

// admItem (baris daftar) & confirmDialog (konfirmasi aksi merusak) tinggal di
// parts.js — dipakai bersama tab Petugas, dan modul panel tidak boleh saling
// mengimpor.

// ============================================================
// Gerbang login
// ============================================================
// dilepas lagi oleh boot(); tanpa ini kartu login tidak meregang setinggi layar
let unmarkAuth = null;
// janji "DB & Auth siap" — gerbang login tampil lebih dulu, jadi submit harus
// menunggunya sebelum boot() menyentuh DB
let siap = Promise.resolve();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function renderLogin(root) {
  $("#app").classList.remove("wide");
  root.innerHTML = "";
  unmarkAuth = markAuthView();

  // Datang dari app.html karena akunnya ternyata admin (lihat alihkanAdmin di
  // app.js). Tanpa penjelasan, berpindah halaman sendiri setelah menekan Masuk
  // terbaca seperti kerusakan.
  const dariApp = new URLSearchParams(location.search).get("dari") === "app";

  const email = h("input.input", { type: "email", placeholder: "admin@quparkir.com", autocomplete: "email", inputmode: "email", autocapitalize: "off", autocorrect: "off" });
  const pass = h("input.input", { type: "password", placeholder: "Kata sandi", autocomplete: "current-password" });
  const btn = h("button.btn", { type: "submit" }, "Masuk");

  async function submit() {
    const e = email.value.trim(), p = pass.value;
    if (!e) return setError(email, "Email wajib diisi");
    if (!EMAIL_RE.test(e)) return setError(email, "Format email tidak valid");
    if (!p) return setError(pass, "Kata sandi wajib diisi");
    clearError(email); clearError(pass);
    busy(btn, true, "Memeriksa…");

    // Gerbang tampil sebelum SDK Firebase selesai diunduh, jadi Auth belum
    // tentu ada saat tombol ditekan.
    await siap;

    try {
      await Auth.loginEmail(e, p);
    } catch (err) {
      busy(btn, false, "Masuk");
      setError(pass, err.message || "Email atau kata sandi salah");
      return;
    }

    // Kredensialnya benar — sekarang perannya. `role` dibaca dari Firestore di
    // dalam onAuthStateChanged, jadi belum tentu terisi tepat setelah login
    // selesai; tungguSesi() menunggu status auth yang benar-benar membawanya.
    const u = await tungguSesi({ email: e });
    if (u?.role !== "admin") {
      // Sesinya diputus: akun non-admin tidak boleh meninggalkan sesi hidup di
      // halaman ini. Sesi Firebase dipakai bersama app.html, dan membiarkannya
      // berarti orang itu masuk ke app tanpa pernah menekan Masuk di sana.
      await Auth.logout().catch(() => {});
      busy(btn, false, "Masuk");
      setError(pass, u
        ? "Akun ini bukan admin. Panel ini khusus akun admin."
        : "Peran akun tidak terbaca — periksa koneksi lalu coba lagi.");
      return;
    }

    setLoggedIn(true);
    toast("Berhasil masuk sebagai admin", "ok");
    boot(root);
  }

  root.append(authShell({
    brand: { tag: "Panel Admin" },
    badge: "🔒 Area terbatas",
    title: "Masuk Panel Admin",
    sub: "Kelola lokasi parkir, promo, banner beranda, dan QR check-in.",
    onsubmit: submit,
    card: [field("Email admin", email), field("Kata sandi", pass, { toggle: true }), btn],
    // tautan pelanggan ("Tentang", "Bantuan") tidak relevan di gerbang internal;
    // yang dibutuhkan justru jalan keluar bagi yang salah membuka halaman ini
    links: [{ href: "app.html", text: "‹ Buka aplikasi QuParkir" }],
    note: h(".auth-notice", {}, [
      h("span.ic", { text: dariApp ? "↪️" : "🔒" }),
      h("p", { text: dariApp
        ? "Akun admin tidak memakai aplikasi pelanggan — Anda diarahkan ke sini. Masuk dengan akun yang sama."
        : "Khusus akun ber-peran admin. Akun pelanggan & petugas tidak bisa masuk di sini." }),
    ]),
  }));
  email.focus();
}

// Memutus keduanya: kunci panel per-tab DAN sesi Firebase. Kalau hanya kunci
// panel yang dilepas, akun admin tetap "masuk" di origin ini — dan pemakai
// berikutnya di komputer yang sama cukup memuat ulang untuk kembali masuk.
async function logout() {
  setLoggedIn(false);
  try { await siap; await Auth.logout(); } catch { /* tetap muat ulang */ }
  location.replace("admin.html");
}

// ============================================================
// Status hak tulis (mode Firebase)
// ============================================================
// Gerbang sandi hanya membuka tampilan; yang menentukan boleh-tidaknya menulis
// adalah role akun Firebase. Tanpa penanda ini, admin menekan Simpan lalu
// hanya mendapat toast "permission-denied" tanpa tahu sebabnya.
function statusStrip() {
  const el = h(".adm-status");
  const paint = () => {
    const u = Auth?.current?.() || null;
    el.innerHTML = "";
    el.className = "adm-status";
    if (MODE !== "firebase") {
      el.classList.add("demo");
      el.append(h("span.ic", { text: "🧪" }), h("p", {}, [
        h("b", { text: "Mode DEMO — " }),
        document.createTextNode("perubahan hanya tersimpan di browser ini (localStorage), tidak ke server."),
      ]));
      return;
    }
    if (u?.role === "admin") {
      el.classList.add("ok");
      el.append(h("span.ic", { text: "✅" }), h("p", {}, [
        document.createTextNode("Terhubung Firebase sebagai "),
        h("b", { text: u.email || u.name || u.uid }),
        document.createTextNode(" (admin) — perubahan tersimpan ke server."),
      ]));
      return;
    }
    // Nyaris tidak mungkin terlihat sejak gerbangnya sendiri menuntut role
    // admin — tapi peran bisa dicabut selagi panel terbuka, dan strip inilah
    // yang menjelaskan kenapa Simpan tiba-tiba ditolak.
    //
    // Tautannya TIDAK boleh ke app.html#/login lagi: app menolak akun admin
    // dan akan memantulkannya kembali ke sini, jadi tombol itu hanya akan
    // memutar-mutar orang. Jalan keluarnya masuk ulang di halaman ini.
    el.classList.add("warn");
    el.append(h("span.ic", { text: "⚠️" }), h("div", {}, [
      h("p", {}, [
        h("b", { text: u ? "Peran akun ini bukan lagi admin. " : "Sesi Firebase terputus. " }),
        document.createTextNode("Menyimpan/menghapus data akan ditolak server, dan rekap transaksi tidak bisa dibaca."),
      ]),
      h("button.btn.sm.ghost", { type: "button", onclick: () => logout() }, "Masuk ulang →"),
    ]));
  };
  paint();
  const unsub = Auth?.onChange?.(paint);
  el._unsub = () => unsub && unsub();
  return el;
}

// ============================================================
// Dashboard: topbar + tab + konten
// ============================================================
// id + label datang dari ADMIN_TABS (skeleton.js) — satu-satunya sumber, juga
// dipakai admin-boot.js untuk menggambar kerangka tab yang benar saat refresh.
// Fungsi render tetap di sini karena butuh DB/Auth yang tidak dimuat admin-boot.js.
const RENDER = { ringkasan: renderRingkasan, lokasi: renderLokasi, petugas: renderPetugas, topup: renderTopup,
  promo: renderPromo, banner: renderBanner, qris: renderQris };
const TABS = ADMIN_TABS.map(t => ({ ...t, render: RENDER[t.id] }));

function boot(root) {
  if (unmarkAuth) { unmarkAuth(); unmarkAuth = null; }
  // admin-boot.js bisa memasang authView sebelum modul ini jalan — lepaskan
  // tanpa bergantung pada unmarkAuth, yang hanya terisi bila lewat renderLogin
  root.classList.remove("authView");
  $("#app").classList.add("wide");
  root.innerHTML = "";

  // .adm-shell membatasi lebar baca di monitor besar & memberi padding konsisten
  const content = h("div.adm-shell");
  const tabbar = h("nav.admin-tabs");
  // Tab awal datang dari hash URL (admin-boot.js sudah membaca yang sama
  // untuk menggambar kerangkanya) — bukan selalu tab pertama — supaya
  // refresh di tab Lokasi tetap di tab Lokasi.
  let active = currentTab(), cleanup = null;

  // Tulis tab aktif ke hash dengan replaceState (BUKAN location.hash=…):
  // tidak menambah entri riwayat per klik tab dan tidak memicu event
  // "hashchange" — yang sengaja dipakai di bawah hanya untuk navigasi DARI
  // LUAR (tombol back/forward, tautan admin.html#lokasi, edit URL manual).
  function pindahTab(id) {
    if (id === active) return;
    active = id;
    history.replaceState(null, "", "#" + id);
    paintTabs(); paintContent();
  }

  function paintTabs() {
    tabbar.innerHTML = "";
    let activeBtn = null;
    TABS.forEach(t => {
      const btn = h("button" + (t.id === active ? ".active" : ""), {
        type: "button",
        "aria-current": t.id === active ? "page" : false,
        onclick: () => pindahTab(t.id),
      }, t.label);
      if (t.id === active) activeBtn = btn;
      tabbar.append(btn);
    });
    // Di ponsel strip tab lebih lebar dari layar; tanpa ini tab yang sedang
    // aktif bisa berada di luar layar dan terasa seperti tak ada yang terpilih.
    activeBtn?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function paintContent() {
    if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
    content.innerHTML = "";
    cleanup = TABS.find(t => t.id === active).render(content);
  }

  window.addEventListener("hashchange", () => {
    const id = currentTab();
    if (id !== active) { active = id; paintTabs(); paintContent(); }
  });

  root.append(
    // topbar + tab satu blok sticky: tingginya tak perlu ditebak lewat offset
    h(".admin-head", {}, [
      h(".admin-topbar", {}, [
        h(".adm-shell.adm-bar", {}, [
          h("img.adm-logo", { src: "assets/logo/logo-mark-white.png", alt: "", width: 34, height: 34 }),
          h(".brandbox", {}, [h("b", { text: "Panel Admin" }), (() => {
            const s = h("small", { text: "QuParkir · Surakarta" });
            showVersion(s);   // async — isi " · vN" begitu public/version.json terbaca
            return s;
          })()]),
          h("button.btn.sm.ghost", { type: "button", onclick: logout }, "Keluar"),
        ]),
      ]),
      h(".admin-tabwrap", {}, [tabbar]),
    ]),
    h(".adm-shell.adm-statuswrap", {}, [statusStrip()]),
    content,
  );
  paintTabs(); paintContent();
}

// ---------- Tab: Ringkasan ----------
function renderRingkasan(root) {
  const statEl = h("div", {}, [memuat("stats", 4)]);
  const locList = h("div", {}, [memuat("list", 3)]);
  const txList = h("div", {}, [memuat("list", 3)]);
  root.append(
    h("section.section", {}, [h(".head", {}, [h("h2", { text: "Ringkasan" })]), statEl]),
    // dua kolom berdampingan di desktop, bertumpuk di mobile
    h(".adm-cols", {}, [
      h("section.section", {}, [h(".head", {}, [h("h2", { text: "Kantong Parkir" })]), locList]),
      h("section.section", {}, [h(".head", {}, [h("h2", { text: "Transaksi Terbaru" })]), txList]),
    ]),
  );

  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  let locs = [], txs = [];

  function paint() {
    const incomeToday = txs.filter(t => t.paidAt >= startToday.getTime()).reduce((a, b) => a + (b.amount || 0), 0);
    const totalCap = locs.reduce((a, l) => a + (l.capMotor || 0) + (l.capCar || 0), 0);
    const totalOcc = locs.reduce((a, l) => a + (l.occMotor || 0) + (l.occCar || 0), 0);
    const occPct = totalCap ? Math.round((totalOcc / totalCap) * 100) : 0;

    // grid .stats dibuat di sini (bukan di statEl) supaya statEl bisa memuat
    // kerangka utuh lebih dulu tanpa ikut terjepit ke dalam sel grid
    statEl.replaceChildren(h(".stats.stats-4", {},
      [["Pendapatan hari ini", rupiah(incomeToday)], ["Kendaraan aktif", String(totalOcc)],
       ["Keterisian", occPct + "%"], ["Lokasi terdaftar", String(locs.length)]]
        .map(([l, n]) => h(".stat", {}, [h(".num", { style: "font-size:1.1rem", text: n }), h(".lbl", { text: l })]))));

    locList.innerHTML = "";
    if (!locs.length) locList.append(h(".empty", {}, [h(".ic", { text: "🅿️" }), h("p", { text: "Belum ada kantong parkir." })]));
    locs.forEach(l => {
      const cap = (l.capMotor || 0) + (l.capCar || 0), occ = (l.occMotor || 0) + (l.occCar || 0);
      const pct = cap ? Math.round((occ / cap) * 100) : 0;
      locList.append(h(".li", {}, [
        h(".ic", { text: "🅿️" }),
        h("div", { style: "flex:1" }, [
          h(".t", { text: l.name }),
          h(".s", { text: "Terisi " + occ + " / " + cap + " (" + pct + "%)" }),
          h(".bar", {}, [h("i" + (pct >= 95 ? ".full" : ""), { style: "width:" + pct + "%" })]),
        ]),
      ]));
    });

    txList.innerHTML = "";
    if (!txs.length) txList.append(h(".empty", {}, [h(".ic", { text: "🧾" }), h("p", { text: "Belum ada transaksi." })]));
    txs.slice(0, 10).forEach(t => {
      const loc = locs.find(l => l.id === t.locationId);
      txList.append(h(".li", {}, [
        h(".ic", { text: "💳" }),
        h("div", { style: "flex:1" }, [h(".t", { text: rupiah(t.amount) }), h(".s", { text: (loc?.name || t.locationId) + " · " + String(t.method || "-").toUpperCase() })]),
        h(".end", {}, [h(".s", { text: new Date(t.paidAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) })]),
      ]));
    });
  }

  const u1 = DB.locations.subscribe(x => { locs = x; paint(); });
  const u2 = DB.transactions.subscribe(x => { txs = x; paint(); });
  return () => { u1 && u1(); u2 && u2(); };
}

// ---------- Tab: Lokasi (CRUD penuh) ----------
function lokasiForm(existing) {
  const nama = h("input.input", { type: "text", value: existing?.name || "", placeholder: "mis. Solo Grand Mall" });
  const alamat = h("input.input", { type: "text", value: existing?.address || "", placeholder: "Jl. Slamet Riyadi No.273, Surakarta" });
  const lat = h("input.input", { type: "number", step: "0.00001", value: existing?.lat ?? "", placeholder: "-7.56628" });
  const lng = h("input.input", { type: "number", step: "0.00001", value: existing?.lng ?? "", placeholder: "110.80754" });
  const capMotor = h("input.input", { type: "number", min: 0, value: existing?.capMotor ?? 50 });
  const capCar = h("input.input", { type: "number", min: 0, value: existing?.capCar ?? 30 });
  const tarifMotor = h("input.input", { type: "number", min: 0, step: 500, value: existing?.tarif?.motor ?? 2000 });
  const tarifMobil = h("input.input", { type: "number", min: 0, step: 500, value: existing?.tarif?.mobil ?? 3000 });

  const cariBtn = h("button.btn.sm.ghost", {
    type: "button",
    onclick: () => {
      const q = (alamat.value || nama.value).trim();
      if (!q) return toast("Isi nama/alamat dulu", "err");
      window.open("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q), "_blank", "noopener");
    },
  }, "🔍 Cari di Google Maps");

  // Isi lat/lng + alamat otomatis dari plus code, URL Google Maps (yang memuat
  // koordinat), atau koordinat mentah — lihat geo-input.js untuk format yang
  // dikenali. Tombol terpisah dari Simpan supaya admin bisa cek hasilnya dulu.
  const lookup = h("input.input", {
    type: "text",
    placeholder: "CRQ6+22 Mangkubumen, Kota Surakarta  —  atau tempel link Google Maps",
  });
  const terapkanBtn = h("button.btn.sm.ghost", { type: "button" }, "📍 Terapkan");
  terapkanBtn.addEventListener("click", async () => {
    busy(terapkanBtn, true, "Mencari…");
    try {
      const r = await resolveLocationInput(lookup.value);
      lat.value = r.lat.toFixed(5);
      lng.value = r.lng.toFixed(5);
      if (r.address) alamat.value = r.address;
      clearError(lat); clearError(lng);
      toast("Titik ditemukan — cek peta sebelum menyimpan", "ok");
    } catch (e) {
      toast(e.message, "err");
    } finally {
      busy(terapkanBtn, false, "📍 Terapkan");
    }
  });

  const simpanBtn = h("button.btn", { type: "button" }, existing ? "Simpan Perubahan" : "Tambah Lokasi");

  simpanBtn.addEventListener("click", async () => {
    const vals = {
      name: nama.value.trim(),
      address: alamat.value.trim(),
      lat: Number(lat.value), lng: Number(lng.value),
      capMotor: Number(capMotor.value), capCar: Number(capCar.value),
      tarif: { motor: Number(tarifMotor.value), mobil: Number(tarifMobil.value) },
    };
    if (!vals.name) return setError(nama, "Nama wajib diisi");
    if (!Number.isFinite(vals.lat) || vals.lat < -90 || vals.lat > 90) return setError(lat, "Latitude tidak valid (-90…90)");
    if (!Number.isFinite(vals.lng) || vals.lng < -180 || vals.lng > 180) return setError(lng, "Longitude tidak valid (-180…180)");
    if (!Number.isInteger(vals.capMotor) || vals.capMotor < 0) return setError(capMotor, "Wajib bilangan bulat ≥ 0");
    if (!Number.isInteger(vals.capCar) || vals.capCar < 0) return setError(capCar, "Wajib bilangan bulat ≥ 0");
    if (!Number.isFinite(vals.tarif.motor) || vals.tarif.motor < 0) return setError(tarifMotor, "Tarif tidak valid");
    if (!Number.isFinite(vals.tarif.mobil) || vals.tarif.mobil < 0) return setError(tarifMobil, "Tarif tidak valid");
    if (existing && (vals.capMotor < (existing.occMotor || 0) || vals.capCar < (existing.occCar || 0)))
      return toast("Kapasitas tidak boleh di bawah keterisian saat ini", "err");

    busy(simpanBtn, true, "Menyimpan…");
    try {
      if (existing) await DB.locations.update(existing.id, vals);
      else await DB.locations.add(vals);
      $("#modalHost").innerHTML = "";
      toast(existing ? "Lokasi diperbarui" : "Lokasi ditambahkan", "ok");
    } catch (e) {
      busy(simpanBtn, false, existing ? "Simpan Perubahan" : "Tambah Lokasi");
      toast("Gagal: " + e.message, "err");
    }
  });

  return h("div.admin-form", {}, [
    field("Nama lokasi", nama),
    field("Plus Code / Link Google Maps (opsional)", lookup, {
      hint: "Tempel plus code (mis. \"CRQ6+22 Mangkubumen, Kota Surakarta\") atau URL Google Maps lengkap yang memuat @lat,lng, lalu klik Terapkan — Alamat & Latitude/Longitude di bawah terisi otomatis.",
    }),
    h(".adm-btnrow", { style: "margin-top:-6px" }, [terapkanBtn]),
    field("Alamat", alamat),
    h(".row2", {}, [field("Latitude", lat), field("Longitude", lng)]),
    h(".adm-hint", {}, [
      cariBtn,
      h("p", { text: "Link pendek (maps.app.goo.gl) tidak bisa dibaca otomatis — buka link-nya dulu, lalu tempel URL lengkap dari address bar. Atau: cari lokasinya, klik-kanan titik yang tepat di Google Maps, lalu salin koordinat yang muncul." }),
    ]),
    h(".row2", {}, [field("Slot Motor", capMotor), field("Slot Mobil", capCar)]),
    h(".row2", {}, [field("Tarif Motor/jam (Rp)", tarifMotor), field("Tarif Mobil/jam (Rp)", tarifMobil)]),
    simpanBtn,
  ]);
}

function renderLokasi(root) {
  const listEl = h("div", {}, [memuat()]);
  root.append(h("section.section", {}, [
    h(".head", {}, [h("h2", { text: "Lokasi Parkir" }), h("a", { onclick: () => modal("Tambah Lokasi", lokasiForm(null)) }, "+ Tambah")]),
    h("p.s", { style: "margin-bottom:10px", text: "Muncul otomatis di menu Cari Parkir & peta pelanggan begitu disimpan." }),
    listEl,
  ]));

  const unsub = DB.locations.subscribe((locs) => {
    listEl.innerHTML = "";
    if (!locs.length) {
      // Bootstrap koleksi kosong — satu-satunya kemampuan dashboard #/admin
      // lama yang belum ada di sini. Menulis 6 lokasi awal Surakarta; lolos
      // rules hanya bila pemanggil ber-role admin (lihat strip status).
      const seedBtn = h("button.btn", { style: "margin-top:12px", onclick: async () => {
        busy(seedBtn, true, "Memuat…");
        try { await DB.locations.seed(); toast("6 lokasi awal dimuat", "ok"); }
        catch (e) { busy(seedBtn, false, "🌱 Muat 6 lokasi awal (Surakarta)"); toast("Gagal memuat: " + e.message, "err"); }
      } }, "🌱 Muat 6 lokasi awal (Surakarta)");
      listEl.append(h(".empty", {}, [
        h(".ic", { text: "🅿️" }),
        h("p", { text: "Belum ada lokasi. Tambahkan lokasi pertama." }),
        seedBtn,
      ]));
      return;
    }
    locs.forEach(l => {
      const cap = (l.capMotor || 0) + (l.capCar || 0), occ = (l.occMotor || 0) + (l.occCar || 0);
      const pct = cap ? Math.round((occ / cap) * 100) : 0;
      listEl.append(admItem("🅿️", [
        h(".t", { text: l.name }),
        h(".s", { text: (l.address ? l.address + " · " : "") + "Terisi " + occ + "/" + cap + " (" + pct + "%)" }),
        h(".bar", {}, [h("i" + (pct >= 95 ? ".full" : ""), { style: "width:" + pct + "%" })]),
      ], [
        h("button.btn.sm.ghost", { onclick: () => modal("Edit — " + l.name, lokasiForm(l)) }, "Edit"),
        h("button.btn.sm.danger", {
          onclick: async () => {
            if (!(await confirmDialog("Hapus lokasi?", `"${l.name}" akan dihapus permanen dari daftar Cari Parkir. Riwayat sesi/transaksi lama tidak ikut terhapus.`))) return;
            try { await DB.locations.remove(l.id); toast("Lokasi dihapus", "ok"); }
            catch (e) { toast("Gagal: " + e.message, "err"); }
          },
        }, "Hapus"),
      ]));
    });
  });
  return () => unsub && unsub();
}

// ---------- Tab: Top Up (persetujuan permintaan) ----------
//
// SATU-SATUNYA tempat top up disetujui. #/topup di app (pages/petugas.js)
// hanya menampilkan antrean tanpa tombol: menyetujui berarti menambah saldo,
// dan itu hak admin. Pagarnya bukan di tampilan melainkan di firestore.rules
// — /topups hanya boleh di-update isAdmin(), dan users.wallet hanya boleh
// dinaikkan admin — jadi tombol di ponsel petugas pun akan ditolak server.
//
// Jam ditampilkan sampai DETIK dan usianya disebut karena satu-satunya
// pegangan untuk mencocokkan ke aplikasi merchant adalah nominal + jam: QRIS
// statis tidak membawa nomor order.
const jamDetik = (ts) => new Date(ts).toLocaleString("id-ID",
  { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function usiaText(ts) {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 1) return "baru saja";
  if (m < 60) return m + " menit lalu";
  const j = Math.floor(m / 60);
  return j < 24 ? j + " jam lalu" : Math.floor(j / 24) + " hari lalu";
}

function renderTopup(root) {
  const listEl = h("div", {}, [memuat()]);
  root.append(h("section.section", {}, [
    h(".head", {}, [h("h2", { text: "Konfirmasi Top Up" })]),
    h(".adm-note", {}, [
      h("p", {}, [
        h("b", { text: "Sebelum menyetujui: " }),
        document.createTextNode("buka aplikasi merchant GoPay dan pastikan uang dengan nominal yang sama benar-benar masuk. Menyetujui berarti menambah saldo pengguna — dan saldo itu bisa dipakai membayar parkir."),
      ]),
    ]),
    listEl,
  ]));

  const unsub = DB.topups.subscribePending((list) => {
    listEl.innerHTML = "";
    if (!list.length) {
      listEl.append(h(".empty", {}, [h(".ic", { text: "💠" }), h("p", { text: "Tidak ada permintaan top up." })]));
      return;
    }

    // Dua permintaan pending bernominal sama tidak bisa dibedakan dari daftar
    // mutasi merchant — satu uang masuk cocok dengan keduanya. Menyetujui yang
    // salah berarti memberi saldo kepada yang belum membayar.
    const jumlahNominal = list.reduce((m, t) => (m[t.amount] = (m[t.amount] || 0) + 1, m), {});

    list.forEach(t => {
      const kembar = jumlahNominal[t.amount] > 1;
      const setuju = h("button.btn.sm", { type: "button" }, "Setujui");
      const tolak = h("button.btn.sm.ghost", { type: "button" }, "Tolak");
      const jalankan = async (fn, pesan) => {
        setuju.disabled = tolak.disabled = true;   // cegah klik ganda menambah saldo dua kali
        try { await fn(t.id, Auth.current()?.uid); toast(pesan, "ok"); }
        catch (e) { toast(e.message || "Gagal memproses", "err"); setuju.disabled = tolak.disabled = false; }
      };
      setuju.onclick = () => jalankan(DB.topups.approve, "Top Up " + rupiah(t.amount) + " disetujui");
      tolak.onclick = () => jalankan(DB.topups.reject, "Permintaan ditolak");

      listEl.append(admItem("💠", [
        h(".t", { text: rupiah(t.amount) + " · " + (t.name || t.uid.slice(0, 8)) }),
        h(".s", { text: "QRIS · " + jamDetik(t.createdAt) + " · " + usiaText(t.createdAt) }),
        kembar ? h(".s", { style: "color:var(--danger,#ef4444);font-weight:700",
          text: "⚠️ Ada permintaan lain dengan nominal sama — pastikan Anda mencocokkan mutasi yang benar" }) : null,
      ].filter(Boolean), [setuju, tolak]));
    });
  });
  return () => unsub && unsub();
}

// ---------- Tab: Promo (CRUD, UI kartu dibuat otomatis dari teks) ----------
function promoForm(existing) {
  const tag = h("input.input", { type: "text", value: existing?.tag || "", placeholder: "BARU / HEMAT / POIN" });
  const title = h("input.input", { type: "text", value: existing?.title || "", placeholder: "Cashback 50%" });
  const desc = h("textarea.input", { rows: 3, text: existing?.desc || "", placeholder: "Semua transaksi parkir pakai QuPay · 27 Feb – 31 Agu 2026" });
  const simpanBtn = h("button.btn", { type: "button" }, existing ? "Simpan Perubahan" : "Tambah Promo");

  simpanBtn.addEventListener("click", async () => {
    const t = title.value.trim(), d = desc.value.trim();
    if (!t) return setError(title, "Judul wajib diisi");
    if (!d) return setError(desc, "Deskripsi wajib diisi");
    busy(simpanBtn, true, "Menyimpan…");
    try {
      const vals = { tag: tag.value.trim(), title: t, desc: d };
      if (existing) await DB.promos.update(existing.id, vals);
      else await DB.promos.add(vals);
      $("#modalHost").innerHTML = "";
      toast(existing ? "Promo diperbarui" : "Promo ditambahkan", "ok");
    } catch (e) {
      busy(simpanBtn, false, existing ? "Simpan Perubahan" : "Tambah Promo");
      toast("Gagal: " + e.message, "err");
    }
  });

  return h("div.admin-form", {}, [
    field("Label badge (opsional)", tag, { hint: "Teks kecil di pojok kartu, mis. BARU" }),
    field("Judul", title),
    field("Deskripsi", desc),
    simpanBtn,
  ]);
}

function renderPromo(root) {
  const listEl = h("div", {}, [memuat()]);
  root.append(h("section.section", {}, [
    h(".head", {}, [h("h2", { text: "Promo Beranda" }), h("a", { onclick: () => modal("Tambah Promo", promoForm(null)) }, "+ Tambah")]),
    h("p.s", { style: "margin-bottom:10px", text: "Tampil sebagai carousel & modal Promo di beranda pelanggan — isi teksnya saja, kartunya dibuat otomatis." }),
    listEl,
  ]));

  const unsub = DB.promos.subscribe((list) => {
    listEl.innerHTML = "";
    if (!list.length) { listEl.append(h(".empty", {}, [h(".ic", { text: "🎁" }), h("p", { text: "Belum ada promo." })])); return; }
    list.forEach(p => listEl.append(admItem("🎁",
      [h(".t", { text: p.title }), h(".s", { text: p.desc })],
      [
        h("button.btn.sm.ghost", { onclick: () => modal("Edit Promo", promoForm(p)) }, "Edit"),
        h("button.btn.sm.danger", {
          onclick: async () => {
            if (!(await confirmDialog("Hapus promo?", `Promo "${p.title}" akan dihapus dari beranda.`))) return;
            try { await DB.promos.remove(p.id); toast("Promo dihapus", "ok"); }
            catch (e) { toast("Gagal: " + e.message, "err"); }
          },
        }, "Hapus"),
      ],
      p.tag ? h("span.pill.info", { text: p.tag }) : null,
    )));
  });
  return () => unsub && unsub();
}

// ---------- Tab: Banner (CRUD, teks polos) ----------
function bannerForm(existing) {
  const text = h("input.input", { type: "text", value: existing?.text || "", placeholder: "mis. Pemeliharaan sistem 10 Agu 2026, 00.00–02.00" });
  const sub = h("input.input", { type: "text", value: existing?.subtext || "", placeholder: "Keterangan tambahan (opsional)" });
  const active = h("input", { type: "checkbox", checked: existing ? existing.active !== false : true });
  const simpanBtn = h("button.btn", { type: "button" }, existing ? "Simpan Perubahan" : "Tambah Banner");

  simpanBtn.addEventListener("click", async () => {
    const t = text.value.trim();
    if (!t) return setError(text, "Teks wajib diisi");
    busy(simpanBtn, true, "Menyimpan…");
    try {
      const vals = { text: t, subtext: sub.value.trim(), active: active.checked };
      if (existing) await DB.banners.update(existing.id, vals);
      else await DB.banners.add(vals);
      $("#modalHost").innerHTML = "";
      toast(existing ? "Banner diperbarui" : "Banner ditambahkan", "ok");
    } catch (e) {
      busy(simpanBtn, false, existing ? "Simpan Perubahan" : "Tambah Banner");
      toast("Gagal: " + e.message, "err");
    }
  });

  return h("div.admin-form", {}, [
    field("Teks utama", text),
    field("Sub-teks (opsional)", sub),
    h("label.chk", {}, [active, h("span", { text: "Tampilkan di beranda" })]),
    simpanBtn,
  ]);
}

function renderBanner(root) {
  const listEl = h("div", {}, [memuat()]);
  root.append(h("section.section", {}, [
    h(".head", {}, [h("h2", { text: "Banner Beranda" }), h("a", { onclick: () => modal("Tambah Banner", bannerForm(null)) }, "+ Tambah")]),
    h("p.s", { style: "margin-bottom:10px", text: "Pengumuman di puncak beranda pelanggan. Nonaktifkan sementara lewat sakelar tanpa perlu menghapus." }),
    listEl,
  ]));

  const unsub = DB.banners.subscribe((list) => {
    listEl.innerHTML = "";
    if (!list.length) { listEl.append(h(".empty", {}, [h(".ic", { text: "📣" }), h("p", { text: "Belum ada banner." })])); return; }
    list.forEach(b => {
      const aktif = b.active !== false;
      listEl.append(admItem("📣",
        [h(".t", { text: b.text }), h(".s", { text: b.subtext || (aktif ? "Tampil di beranda" : "Disembunyikan") })],
        [
          h("button.btn.sm.ghost", { onclick: () => modal("Edit Banner", bannerForm(b)) }, "Edit"),
          h("button.btn.sm.danger", {
            onclick: async () => {
              if (!(await confirmDialog("Hapus banner?", "Banner ini akan dihapus."))) return;
              try { await DB.banners.remove(b.id); toast("Banner dihapus", "ok"); }
              catch (e) { toast("Gagal: " + e.message, "err"); }
            },
          }, "Hapus"),
        ],
        h("span.pill" + (aktif ? ".ok" : ".warn"), { text: aktif ? "Aktif" : "Nonaktif" }),
      ));
    });
  });
  return () => unsub && unsub();
}

// ---------- Tab: Export QRIS ----------
// Unduh PNG dari elemen hasil renderQR(): qrcodejs (jalur normal) menggambar
// <canvas> yang bisa langsung diekspor via toDataURL; jalur fallback (qr.js,
// saat CDN gagal dimuat) memasang <img> ber-src qrserver.com yang diambil
// sebagai blob supaya tetap terunduh sebagai berkas, bukan sekadar terbuka.
async function unduhQR(el, filename) {
  const canvas = el.querySelector("canvas");
  if (canvas) {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = filename;
    a.click();
    return;
  }
  const img = el.querySelector("img");
  if (!img) return toast("QR belum siap, coba lagi", "err");
  try {
    const blob = await (await fetch(img.src)).blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  } catch {
    // offline/CORS ke qrserver bisa gagal — buka tab agar tetap bisa disimpan manual
    window.open(img.src, "_blank", "noopener");
  }
}

function renderQris(root) {
  const locWrap = h("div", {}, [memuat("qr", 3)]);
  const custom = h("div");
  root.append(
    h("section.section", {}, [
      h(".head", {}, [h("h2", { text: "QR Check-in per Lokasi" })]),
      h("p.s", { style: "margin-bottom:10px", text: "Kode ini yang dipindai pelanggan lewat menu Scan QR di aplikasi — cetak & pasang di gerbang masuk lokasi." }),
      locWrap,
    ]),
    h("section.section", {}, [
      h(".head", {}, [h("h2", { text: "QR Kustom / QRIS Statis" })]),
      h("p.s", { style: "margin-bottom:10px", text: "Tempel string QRIS merchant (atau teks/tautan lain) untuk dijadikan QR yang bisa diunduh. Isi nominal untuk mengubah QRIS statis jadi dinamis — nominalnya terkunci di aplikasi pembayar." }),
      custom,
    ]),
  );

  const unsub = DB.locations.subscribe((locs) => {
    if (!locs.length) {
      locWrap.replaceChildren(h(".empty", {}, [h(".ic", { text: "🅿️" }), h("p", { text: "Belum ada lokasi." })]));
      return;
    }
    // grid dibuat di sini, bukan di locWrap, agar kerangka tidak terjepit sel
    const grid = h(".qr-grid");
    locWrap.replaceChildren(grid);
    locs.forEach(l => {
      const box = h(".qrbox");
      renderQR(box, "QP-LOC:" + l.id, 160);
      grid.append(h(".qr-card", {}, [
        box,
        h(".t", { text: l.name }),
        h(".s", { text: "QP-LOC:" + l.id }),
        h("button.btn.sm.ghost", { onclick: () => unduhQR(box, "qr-" + l.id + ".png") }, "⬇️ Unduh PNG"),
      ]));
    });
  });

  const txt = h("textarea.input", { rows: 3, placeholder: "Tempel string QRIS atau teks lain di sini…" });
  const nom = h("input.input", { type: "number", min: "1", placeholder: "Nominal (opsional) — mis. 2000" });
  const info = h("p.s", { style: "margin:8px 0" });
  const prevBox = h(".qrbox", { style: "min-height:196px" });

  const buat = () => {
    const v = txt.value.trim();
    if (!v) return toast("Isi teksnya dulu", "err");
    const jumlah = Number(nom.value);

    // Tanpa nominal: perlakukan apa adanya — teks/tautan bebas, seperti semula
    if (!jumlah) {
      const cek = validateQris(v);
      info.textContent = cek.ok
        ? `QRIS ${cek.statis ? "statis" : "dinamis"} — ${cek.merchant}${cek.kota ? ", " + cek.kota : ""}. Isi nominal untuk menguncinya.`
        : "";
      return renderQR(prevBox, v, 200);
    }

    // Dengan nominal: wajib QRIS yang sah, karena hasilnya akan dipindai orang
    try {
      const dinamis = toDynamic(v, jumlah);
      const cek = validateQris(dinamis);
      renderQR(prevBox, dinamis, 200);
      info.textContent = `✅ QRIS dinamis ${rupiah(jumlah)} — ${cek.merchant}${cek.kota ? ", " + cek.kota : ""}`;
    } catch (e) {
      info.textContent = "";
      prevBox.innerHTML = "";
      toast(e.message, "err");
    }
  };

  const genBtn = h("button.btn.sm", { onclick: buat }, "Buat QR");
  const dlBtn = h("button.btn.sm.ghost", { onclick: () => unduhQR(prevBox, "qr-kustom.png") }, "⬇️ Unduh PNG");
  custom.append(txt, nom, h(".adm-btnrow", {}, [genBtn, dlBtn]), info, prevBox);

  return () => unsub && unsub();
}

// ============================================================
// Bootstrap
// ============================================================
async function main() {
  const view = $("#view");

  // initAuth() HARUS mendahului initData(): Firestore mengambil token dari
  // instance Auth pada FirebaseApp yang sama. Kalau modul auth tak pernah
  // diinisialisasi, request Firestore berangkat tanpa token dan semua rules
  // ber-syarat isSignedIn()/isAdmin() menolaknya.
  siap = (async () => {
    await initAuth();
    await initData();
    DB.ensureSeed && DB.ensureSeed().catch(() => {});
    // tunggu status auth pertama (Firebase memulihkan sesi dari IndexedDB)
    // supaya strip status tidak berkedip "belum masuk" padahal sudah
    await Promise.race([Auth.ready, new Promise(r => setTimeout(r, 5000))]);
  })();

  // Gerbang digambar lebih dulu, tidak menunggu SDK Firebase selesai diunduh —
  // kalau tidak, layar hanya menampilkan kerangka selama beberapa detik.
  // submit()-nya sendiri menunggu `siap` sebelum menyentuh Auth.
  if (!isLoggedIn()) { renderLogin(view); return; }

  // Kunci per-tab bilang "tab ini sudah pernah membuka panel". Itu TIDAK cukup
  // untuk membuka lagi: perannya bisa dicabut sejak terakhir kali, atau sesi
  // Firebase-nya berakhir/berganti akun di tab lain (sesinya dipakai bersama
  // seluruh origin). Yang menentukan tetap role yang sedang berlaku.
  await siap;
  const u = Auth?.current?.();
  if (MODE === "firebase" && u?.role !== "admin") {
    setLoggedIn(false);
    if (u) await Auth.logout().catch(() => {});
    renderLogin(view);
    return;
  }
  boot(view);
}
main();

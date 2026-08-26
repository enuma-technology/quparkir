// ============================================================
// Tab "Petugas" di panel admin — membuat & mengelola akun petugas lapangan.
//
// Berbeda dari tab lain di panel ini, yang ini TIDAK menyentuh Firestore
// langsung. Semua pekerjaannya lewat satu Netlify Function
// (/.netlify/functions/kelola-petugas), karena dua hal tidak mungkin
// dikerjakan dari browser:
//
//   • Membuat akun. `createUserWithEmailAndPassword` di Web SDK ikut
//     MENGGANTI SESI yang sedang berjalan — admin yang menambah petugas akan
//     langsung "menjadi" petugas itu dan panelnya menutup diri sendiri.
//   • Menulis `users/{uid}.role`. firestore.rules melarangnya untuk SEMUA
//     klien tanpa kecuali (anti privilege-escalation); melonggarkannya untuk
//     admin berarti siapa pun yang berhasil memalsukan sesi admin bisa
//     mengangkat dirinya sendiri. Peran hanya lahir dari Admin SDK.
//
// Sebelum ini, satu-satunya jalan adalah `scripts/admin/buat-akun.mjs` di
// komputer yang memegang .env — jadi menambah petugas menuntut akses repo.
//
// Yang TIDAK ada di sini, dan memang disengaja: membuat akun admin. Endpoint
// menolak setiap aksi terhadap akun ber-peran admin, termasuk milik sendiri.
// Admin baru tetap lewat scripts/admin/buat-akun.mjs.
// ============================================================
import { h, $, toast, modal } from "./util.js";
import { field, setError, clearError, busy, admItem, confirmDialog } from "./parts.js";
import { paymentConfig } from "./config.js";
import { Auth } from "./auth.js";
import { MODE } from "./data.js";
import { adminPartNode } from "./skeleton.js";

const SANDI_MIN = 6;   // batas keras Firebase Auth — sama dengan di server
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Kode galat dari server → kalimat yang bisa ditindaklanjuti admin. Kode yang
// tidak dikenal ditampilkan apa adanya: lebih baik terbaca aneh daripada
// hilang, karena kode itulah satu-satunya petunjuk saat ada yang tak beres.
const PESAN = {
  unauthenticated: "Sesi Firebase berakhir — keluar lalu masuk ulang.",
  forbidden: "Peran akun ini bukan admin lagi.",
  auth_sdk: "Server tidak bisa memuat modul akun Firebase. Panel lain tetap jalan; laporkan galat ini.",
  email_invalid: "Format email tidak sah.",
  sandi_pendek: `Kata sandi minimal ${SANDI_MIN} karakter.`,
  email_admin: "Email itu milik akun admin — tidak bisa disentuh dari tab ini.",
  target_admin: "Akun admin tidak bisa diubah dari tab ini.",
  target_bukan_petugas: "Akun itu bukan petugas lagi — daftarnya sudah usang, muat ulang.",
  target_tak_ada: "Akunnya sudah tidak ada — daftarnya sudah usang, muat ulang.",
  tidak_ada_perubahan: "Tidak ada yang diubah.",
  uid_kosong: "Akun tujuan tidak jelas — muat ulang daftarnya.",
  internal: "Server gagal memproses permintaan ini.",
  "auth/email-already-exists": "Email sudah terdaftar.",
  "auth/invalid-password": `Kata sandi tidak diterima Firebase (minimal ${SANDI_MIN} karakter).`,
  "auth/invalid-email": "Format email tidak sah.",
};

// Satu pintu ke server. Galat dibungkus jadi Error ber-`kode` supaya pemanggil
// bisa membedakan kasus yang perlu ditindaklanjuti (mis. email_terpakai, yang
// bukan kegagalan melainkan pertanyaan) dari kegagalan biasa.
async function panggil(aksi, muatan = {}) {
  const token = await Auth.idToken();
  let res;
  try {
    res = await fetch(paymentConfig.apiBase + "/kelola-petugas", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ aksi, ...muatan }),
    });
  } catch {
    // Function belum ter-deploy, atau jaringan mati. Dibedakan dari galat
    // server karena tindakannya berbeda sama sekali.
    const e = new Error("Tidak bisa menghubungi server pengelola akun. Pastikan function kelola-petugas sudah ter-deploy di Netlify.");
    e.kode = "jaringan";
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(PESAN[data.error] || ("Gagal: " + (data.error || "HTTP " + res.status)));
    e.kode = data.error;
    e.data = data;
    throw e;
  }
  return data;
}

const titel = (s) => (s || "").charAt(0).toUpperCase() + (s || "").slice(1);

// Auth mengembalikan waktu sebagai string UTC ("Tue, 26 Aug 2026 …").
const waktu = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d) ? null : d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// ---------- formulir tambah ----------
function formTambah(muatUlang) {
  const nama = h("input.input", { type: "text", placeholder: "Budi Santoso", autocomplete: "off" });
  const email = h("input.input", { type: "email", placeholder: "petugas2@quparkir.com", autocomplete: "off" });
  const sandi = h("input.input", { type: "password", placeholder: "minimal " + SANDI_MIN + " karakter", autocomplete: "new-password" });
  const simpan = h("button.btn", { type: "button" }, "Buat Akun Petugas");

  const kirim = async (pakaiYangAda = false) => {
    const e = email.value.trim().toLowerCase(), s = sandi.value, n = nama.value.trim();
    clearError(email); clearError(sandi);
    if (!EMAIL_RE.test(e)) return setError(email, "Email tidak sah");
    if (s.length < SANDI_MIN) return setError(sandi, `Minimal ${SANDI_MIN} karakter`);

    busy(simpan, true, "Menyimpan…");
    try {
      const r = await panggil("buat", { email: e, sandi: s, nama: n, pakaiYangAda });
      $("#modalHost").innerHTML = "";
      toast(r.baru ? "Akun petugas dibuat" : "Akun yang sudah ada diangkat jadi petugas", "ok");
      muatUlang();
    } catch (err) {
      busy(simpan, false, "Buat Akun Petugas");
      // Email sudah dipakai akun NON-admin: bukan kegagalan, tapi keputusan
      // yang harus diambil admin secara sadar. Server sengaja menolak yang
      // pertama supaya salah ketik email milik pelanggan lain tidak diam-diam
      // mengganti sandinya dan mengangkatnya jadi petugas.
      if (err.kode === "email_terpakai") {
        const peran = err.data?.peran || "pelanggan";
        const ya = await confirmDialog("Email sudah terdaftar",
          `Sudah ada akun ${e} dengan peran ${peran}. Jadikan akun itu petugas sekaligus ganti sandinya dengan yang Anda ketik?`,
          { okText: "Ya, jadikan petugas", danger: false });
        if (ya) await kirim(true);
        return;
      }
      toast(err.message, "err");
    }
  };
  simpan.addEventListener("click", () => kirim(false));

  return h("div.admin-form", {}, [
    field("Nama petugas", nama, { hint: "Tampil di KTA digital & daftar ini" }),
    field("Email", email, { hint: "Dipakai untuk masuk ke aplikasi" }),
    field("Kata sandi", sandi, { toggle: true, hint: "Serahkan langsung ke orangnya, jangan lewat chat grup" }),
    simpan,
  ]);
}

// ---------- formulir edit ----------
function formEdit(p, muatUlang) {
  const nama = h("input.input", { type: "text", value: p.nama || "", autocomplete: "off" });
  const sandi = h("input.input", { type: "password", placeholder: "kosongkan bila tidak diganti", autocomplete: "new-password" });
  const simpan = h("button.btn", { type: "button" }, "Simpan Perubahan");

  simpan.addEventListener("click", async () => {
    const n = nama.value.trim(), s = sandi.value;
    clearError(nama); clearError(sandi);
    if (!n && !s) return setError(nama, "Isi nama baru atau kata sandi baru");
    if (s && s.length < SANDI_MIN) return setError(sandi, `Minimal ${SANDI_MIN} karakter`);

    busy(simpan, true, "Menyimpan…");
    try {
      await panggil("ubah", { uid: p.uid, nama: n, sandi: s || null });
      $("#modalHost").innerHTML = "";
      toast(s ? "Tersimpan — beri tahu sandi barunya" : "Tersimpan", "ok");
      muatUlang();
    } catch (err) {
      busy(simpan, false, "Simpan Perubahan");
      toast(err.message, "err");
    }
  });

  // Mencabut peran BUKAN menghapus akun: orangnya tetap bisa masuk sebagai
  // pelanggan biasa. Letaknya di sini, bukan sebagai tombol di baris daftar,
  // supaya tidak berdesakan dengan Hapus yang akibatnya jauh berbeda.
  const cabut = h("button.btn.ghost", { type: "button" }, "Cabut peran petugas");
  cabut.addEventListener("click", async () => {
    const ya = await confirmDialog("Cabut peran petugas?",
      `${p.nama || p.email} kembali jadi pelanggan biasa. Akunnya tidak dihapus dan dia tetap bisa masuk ke aplikasi — hanya kehilangan menu petugas.`,
      { okText: "Cabut peran", danger: false });
    if (!ya) return;
    try {
      await panggil("cabut", { uid: p.uid });
      $("#modalHost").innerHTML = "";
      toast("Peran petugas dicabut", "ok");
      muatUlang();
    } catch (err) { toast(err.message, "err"); }
  });

  return h("div.admin-form", {}, [
    h("p.s", { style: "margin-bottom:4px", text: p.email }),
    field("Nama petugas", nama),
    field("Kata sandi baru", sandi, { toggle: true, hint: "Kosongkan kalau sandinya tidak diganti" }),
    simpan,
    h("hr", { style: "border:0;border-top:1px solid var(--line,#e5e7eb);margin:16px 0 12px" }),
    cabut,
  ]);
}

// ---------- tab ----------
export default function renderPetugas(root) {
  // Mode DEMO tidak punya server maupun Firebase Auth — tidak ada akun yang
  // bisa dibuat. Dikatakan apa adanya, bukan menampilkan daftar kosong yang
  // menyiratkan "belum ada petugas".
  if (MODE !== "firebase") {
    root.append(h("section.section", {}, [
      h(".head", {}, [h("h2", { text: "Akun Petugas" })]),
      h(".empty", {}, [
        h(".ic", { text: "🦺" }),
        h("p", { text: "Pengelolaan akun petugas hanya tersedia di mode Firebase." }),
        h(".s", { text: "Mode DEMO menyimpan data di browser ini saja — tidak ada akun Firebase yang bisa dibuat." }),
      ]),
    ]));
    return () => {};
  }

  const listEl = h("div", {}, [adminPartNode("list", 3)]);
  let hidup = true;      // tab bisa ditinggalkan selagi permintaan berjalan

  const muat = async () => {
    try {
      const { list, terpotong, batas } = await panggil("daftar");
      if (!hidup) return;
      gambar(list, terpotong, batas);
    } catch (err) {
      if (!hidup) return;
      listEl.replaceChildren(h(".empty", {}, [
        h(".ic", { text: "⚠️" }),
        h("p", { text: err.message }),
        h("button.btn.sm.ghost", { style: "margin-top:10px", onclick: () => { listEl.replaceChildren(adminPartNode("list", 3)); muat(); } }, "Coba lagi"),
      ]));
    }
  };

  function gambar(list, terpotong, batas) {
    listEl.innerHTML = "";
    if (!list.length) {
      listEl.append(h(".empty", {}, [
        h(".ic", { text: "🦺" }),
        h("p", { text: "Belum ada akun petugas." }),
        h(".s", { text: "Tekan “+ Tambah” untuk membuat akun pertama." }),
      ]));
      return;
    }

    list.forEach((p) => {
      const aksi = [];
      const rinci = [];
      if (p.yatim) {
        // Dokumen peran tanpa akun Auth: uid ini masih dianggap petugas oleh
        // firestore.rules, jadi harus terlihat dan bisa dibereskan.
        rinci.push(h(".s", { style: "color:var(--danger,#ef4444);font-weight:700",
          text: "⚠️ Akun Firebase-nya sudah tidak ada — perannya masih tertinggal di database. Hapus untuk membereskan." }));
      } else {
        aksi.push(h("button.btn.sm.ghost", { onclick: () => modal("Edit Petugas", formEdit(p, muat)) }, "Edit"));
        aksi.push(h("button.btn.sm.ghost", {
          onclick: async () => {
            const ya = await confirmDialog(
              p.nonaktif ? "Aktifkan kembali?" : "Nonaktifkan akun?",
              p.nonaktif
                ? `${p.nama || p.email} bisa masuk lagi dan kembali menjalankan tugas petugas.`
                : `${p.nama || p.email} langsung tidak bisa masuk — sesi yang sedang berjalan pun berhenti. Akunnya tidak dihapus, tinggal diaktifkan lagi kapan saja.`,
              { okText: p.nonaktif ? "Aktifkan" : "Nonaktifkan", danger: !p.nonaktif });
            if (!ya) return;
            try {
              await panggil("nonaktif", { uid: p.uid, nonaktif: !p.nonaktif });
              toast(p.nonaktif ? "Akun diaktifkan" : "Akun dinonaktifkan", "ok");
              muat();
            } catch (err) { toast(err.message, "err"); }
          },
        }, p.nonaktif ? "Aktifkan" : "Nonaktifkan"));
      }

      aksi.push(h("button.btn.sm.danger", {
        onclick: async () => {
          const ya = await confirmDialog("Hapus akun petugas?",
            `Akun ${p.email} dihapus permanen dari Firebase — tidak bisa dikembalikan. Kalau hanya ingin menghentikan tugasnya, pakai “Nonaktifkan” atau cabut perannya lewat Edit.`);
          if (!ya) return;
          try {
            await panggil("hapus", { uid: p.uid });
            toast("Akun dihapus", "ok");
            muat();
          } catch (err) { toast(err.message, "err"); }
        },
      }, "Hapus"));

      const masuk = waktu(p.terakhirMasuk);
      listEl.append(admItem("🦺", [
        h(".t", { text: p.nama || p.email || p.uid.slice(0, 8) }),
        h(".s", { text: p.email || "(tanpa email)" }),
        h(".s", { text: masuk ? "Terakhir masuk " + masuk : "Belum pernah masuk" }),
        ...rinci,
      ],
        aksi,
        h("span.pill" + (p.yatim ? ".warn" : (p.nonaktif ? ".warn" : ".ok")),
          { text: p.yatim ? "Yatim" : (p.nonaktif ? "Nonaktif" : "Aktif") }),
      ));
    });

    if (terpotong) {
      listEl.append(h("p.s", { style: "margin-top:10px",
        text: `Hanya ${batas} akun pertama yang ditampilkan.` }));
    }
  }

  root.append(h("section.section", {}, [
    h(".head", {}, [
      h("h2", { text: "Akun Petugas" }),
      h("a", { onclick: () => modal("Tambah Petugas", formTambah(muat)) }, "+ Tambah"),
    ]),
    h("p.s", { style: "margin-bottom:10px", text: "Akun yang dibuat di sini langsung bisa masuk ke aplikasi dan mendapat menu petugas: verifikasi e-ticket kendaraan, KTA digital, dan pantauan antrean top up." }),
    h(".adm-note", {}, [
      h("p", {}, [
        h("b", { text: "Sandi yang Anda ketik = akses ke akun itu. " }),
        document.createTextNode("Serahkan langsung ke orangnya dan minta diganti setelah dipakai. Menyetujui top up tetap hanya bisa dilakukan admin — petugas tidak bisa menambah saldo siapa pun."),
      ]),
    ]),
    listEl,
  ]));

  muat();
  return () => { hidup = false; };
}

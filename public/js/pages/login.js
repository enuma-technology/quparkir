import { h, toast } from "../util.js";
import { Auth } from "../auth.js";
import { go } from "../router.js";
import { USE_FIREBASE, firebaseConfig } from "../config.js";
import { authShell, field, setError, clearError, busy, providerButton, markAuthView } from "../parts.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// map kode error Firebase Auth → pesan Indonesia (dipakai resetPassword;
// login/register sudah dapat pesan ramah dari friendly() di auth.js)
function mapAuthError(e) {
  const code = e?.code || "";
  const M = {
    "auth/invalid-credential": "Email atau kata sandi salah",
    "auth/user-not-found": "Email belum terdaftar",
    "auth/invalid-email": "Format email tidak valid",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba beberapa saat lagi",
    "auth/network-request-failed": "Jaringan bermasalah. Periksa koneksi",
  };
  return M[code] || e?.message || "Terjadi kesalahan";
}

// FEAT-003 — kirim tautan reset kata sandi
async function resetPassword(email) {
  if (!email) return toast("Masukkan email dulu untuk reset sandi", "err");
  if (!USE_FIREBASE) return toast("Mode demo: reset disimulasikan", "ok");
  try {
    const [{ initializeApp, getApps }, { getAuth, sendPasswordResetEmail }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"),
    ]);
    const auth = getAuth(getApps()[0] || initializeApp(firebaseConfig));
    await sendPasswordResetEmail(auth, email);
    toast("Tautan reset dikirim ke " + email, "ok");
  } catch (e) { toast(mapAuthError(e), "err"); }
}

export default function loginPage(view) {
  const email = h("input.input", { type: "email", placeholder: "email@contoh.com", autocomplete: "email", inputmode: "email" });
  const pass = h("input.input", { type: "password", placeholder: "Kata sandi", autocomplete: "current-password" });
  const btn = h("button.btn", { type: "submit" }, "Masuk");

  async function masuk() {
    const e = email.value.trim(), p = pass.value;
    if (!e) return setError(email, "Email wajib diisi");
    if (!EMAIL_RE.test(e)) return setError(email, "Format email tidak valid");
    if (!p) return setError(pass, "Kata sandi wajib diisi");
    clearError(email); clearError(pass);

    busy(btn, true, "Memproses…");
    try {
      await Auth.loginEmail(e, p);
      toast("Berhasil masuk", "ok");
    } catch (err) {
      busy(btn, false, "Masuk");
      setError(pass, err.message || "Gagal masuk");
    }
  }

  async function quick(btnEl, fn, label) {
    btnEl.disabled = true;
    try { await fn(); toast("Berhasil masuk", "ok"); }
    catch (err) { btnEl.disabled = false; toast(err.message || "Gagal: " + label, "err"); }
  }

  const gBtn = providerButton({
    svg: true, title: "Lanjut dengan Google", sub: "Masuk sekali klik",
    onclick: () => quick(gBtn, () => Auth.loginGoogle(), "Google"),
  });
  const tBtn = providerButton({
    icon: "👤", title: "Masuk sebagai Tamu", sub: "Coba dulu tanpa daftar",
    onclick: () => quick(tBtn, () => Auth.loginAnon(), "Tamu"),
  });

  view.append(authShell({
    title: "Masuk",
    sub: "Selamat datang kembali. Lanjutkan parkir digital Anda.",
    onsubmit: masuk,
    card: [
      field("Email", email),
      field("Kata sandi", pass, { toggle: true }),
      h(".fld-aux", {}, [
        h("button.linkbtn", { type: "button", onclick: () => resetPassword(email.value.trim()) }, "Lupa sandi?"),
      ]),
      btn,
    ],
    alt: [gBtn, tBtn],
    foot: h("p.auth-foot", {}, [
      document.createTextNode("Belum punya akun? "),
      h("a", { onclick: () => go("#/register"), text: "Daftar sekarang" }),
    ]),
    note: "© 2026 QuParkir · Kota Surakarta",
  }));

  return markAuthView();
}

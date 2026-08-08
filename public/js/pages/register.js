import { h, toast } from "../util.js";
import { Auth } from "../auth.js";
import { MODE } from "../data.js";
import { go } from "../router.js";
import { authShell, field, setError, clearError, busy, markAuthView } from "../parts.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 0 lemah · 1 sedang · 2 kuat — panjang + ragam karakter
function strength(p) {
  if (p.length < 6) return 0;
  const ragam = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(re => re.test(p)).length;
  if (p.length >= 10 && ragam >= 3) return 2;
  return 1;
}

export default function registerPage(view) {
  const name = h("input.input", { placeholder: "Nama lengkap", autocomplete: "name" });
  const email = h("input.input", { type: "email", placeholder: "email@contoh.com", autocomplete: "email", inputmode: "email" });
  const pass = h("input.input", { type: "password", placeholder: "Minimal 6 karakter", autocomplete: "new-password" });
  const conf = h("input.input", { type: "password", placeholder: "Ulangi kata sandi", autocomplete: "new-password" });
  const btn = h("button.btn", { type: "submit" }, "Buat Akun");

  // indikator kekuatan sandi
  const bar = h(".pwbar", {}, [h("i"), h("i"), h("i")]);
  const barHint = h("span.hint", { text: "Gunakan kombinasi huruf, angka, dan simbol." });
  pass.addEventListener("input", () => {
    const lv = pass.value ? strength(pass.value) + 1 : 0;
    bar.className = "pwbar" + (lv ? " l" + lv : "");
    barHint.textContent = ["Gunakan kombinasi huruf, angka, dan simbol.",
      "Kekuatan: lemah", "Kekuatan: sedang", "Kekuatan: kuat"][lv];
  });

  async function daftar() {
    const n = name.value.trim(), e = email.value.trim(), p = pass.value, c = conf.value;
    if (!n) return setError(name, "Nama wajib diisi");
    if (!EMAIL_RE.test(e)) return setError(email, e ? "Format email tidak valid" : "Email wajib diisi");
    if (p.length < 6) return setError(pass, "Kata sandi minimal 6 karakter");
    if (p !== c) return setError(conf, "Konfirmasi kata sandi tidak cocok");
    [name, email, pass, conf].forEach(clearError);

    busy(btn, true, "Membuat akun…");
    try {
      await Auth.register(e, p, n);
      toast("Akun berhasil dibuat 🎉", "ok");
    } catch (err) {
      busy(btn, false, "Buat Akun");
      const msg = err.message || "Gagal mendaftar";
      setError(/terdaftar|email/i.test(msg) ? email : pass, msg);
    }
  }

  const pwField = field("Kata sandi", pass, { toggle: true });
  pwField.insertBefore(bar, pwField.querySelector(".err"));
  pwField.insertBefore(barHint, pwField.querySelector(".err"));

  view.append(authShell({
    title: "Buat akun",
    sub: "Satu akun untuk cari parkir, e-ticket, dan pembayaran cashless.",
    onsubmit: daftar,
    card: [
      field("Nama", name),
      field("Email", email),
      pwField,
      field("Konfirmasi kata sandi", conf, { toggle: true }),
      btn,
    ],
    foot: h("p.auth-foot", {}, [
      document.createTextNode("Sudah punya akun? "),
      h("a", { onclick: () => go("#/login"), text: "Masuk di sini" }),
    ]),
    note: MODE === "demo"
      ? "Mode demo — data akun tersimpan di perangkat ini (localStorage)."
      : "Dengan mendaftar, Anda menyetujui ketentuan layanan QuParkir.",
  }));

  return markAuthView();
}

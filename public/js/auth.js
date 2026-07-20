// ============================================================
// Auth — DEMO (localStorage) + Firebase Authentication
// Mendukung: Google, Email/Password, Anonymous (sesuai console quparkir)
// ============================================================
import { firebaseConfig, USE_FIREBASE } from "./config.js";
import { uid as randId } from "./util.js";

export let Auth;

function demoAuth() {
  const KEY = "quparkir_user_v1";
  const ACC = "quparkir_accounts_v1";
  let user = JSON.parse(localStorage.getItem(KEY) || "null");
  const subs = new Set();
  const set = (u) => { user = u; u ? localStorage.setItem(KEY, JSON.stringify(u)) : localStorage.removeItem(KEY); subs.forEach(f => f(u)); };
  const accounts = () => JSON.parse(localStorage.getItem(ACC) || "{}");
  const saveAccounts = (a) => localStorage.setItem(ACC, JSON.stringify(a));
  const hash = (s) => btoa(unescape(encodeURIComponent(s)));  // demo only, BUKAN hashing aman
  const mk = (over) => ({ uid: over.uid || "demo-" + randId(), name: "Pengguna QuParkir", role: "pelanggan", ...over });
  return {
    mode: "demo",
    current: () => user,
    onChange: (cb) => { subs.add(cb); cb(user); return () => subs.delete(cb); },
    async loginGoogle() { set(mk({ uid: "g-awigna", name: "Awigna", email: "awigna@gmail.com", provider: "google" })); },
    async loginEmail(email, password) {
      const key = String(email).toLowerCase().trim();
      const acc = accounts()[key];
      if (!acc) throw new Error("Email belum terdaftar. Silakan daftar dulu.");
      if (acc.pass !== hash(password)) throw new Error("Kata sandi salah.");
      set(mk({ uid: acc.uid, name: acc.name, email: acc.email, role: acc.role || "pelanggan", provider: "email" }));
    },
    async register(email, password, name) {
      const key = String(email).toLowerCase().trim();
      if (!key || !password) throw new Error("Email & kata sandi wajib diisi.");
      const a = accounts();
      if (a[key]) throw new Error("Email sudah terdaftar. Silakan masuk.");
      const acc = { uid: "e-" + randId(), name: name || key.split("@")[0], email: key, pass: hash(password), role: "pelanggan" };
      a[key] = acc; saveAccounts(a);
      set(mk({ uid: acc.uid, name: acc.name, email: acc.email, provider: "email" }));
    },
    async loginAnon() { set(mk({ uid: "anon-" + randId(), name: "Tamu", provider: "anonymous", anon: true })); },
    async logout() { set(null); },
    setRole(role) {
      if (!user) return;
      set({ ...user, role });
      const a = accounts(); if (user.email && a[user.email]) { a[user.email].role = role; saveAccounts(a); }
    },
  };
}

const FRIENDLY = {
  "auth/invalid-credential": "Email atau kata sandi salah.",
  "auth/wrong-password": "Kata sandi salah.",
  "auth/user-not-found": "Email belum terdaftar. Silakan daftar dulu.",
  "auth/email-already-in-use": "Email sudah terdaftar. Silakan masuk.",
  "auth/weak-password": "Kata sandi minimal 6 karakter.",
  "auth/invalid-email": "Format email tidak valid.",
  "auth/popup-closed-by-user": "Popup ditutup sebelum selesai.",
  "auth/network-request-failed": "Jaringan bermasalah. Coba lagi.",
  "auth/unauthorized-domain": "Domain ini belum diizinkan untuk Google sign-in (cek Authorized domains).",
  "auth/operation-not-allowed": "Metode login ini belum diaktifkan di Firebase Console.",
};
const friendly = (e) => { const err = new Error(FRIENDLY[e.code] || e.message || "Gagal"); err.code = e.code; return err; };

async function firebaseAuth() {
  const [{ initializeApp, getApps }, a, fs] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"),
  ]);
  const app = getApps()[0] || initializeApp(firebaseConfig);
  const auth = a.getAuth(app);
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
    signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, updateProfile, signOut } = a;
  const { getFirestore, doc, getDoc, setDoc } = fs;
  const db = getFirestore(app);

  // selesaikan login Google via redirect (untuk mobile/popup diblokir)
  getRedirectResult(auth).catch(() => {});

  let cur = null;
  const nameOf = (u) => u.displayName || (u.isAnonymous ? "Tamu" : (u.email || "").split("@")[0]);

  const POPUP_FAIL = ["auth/popup-blocked", "auth/operation-not-supported-in-this-environment",
    "auth/cancelled-popup-request", "auth/popup-closed-by-user"];

  return {
    mode: "firebase",
    current: () => cur,
    onChange: (cb) => onAuthStateChanged(auth, async (u) => {
      if (!u) { cur = null; cb(null); return; }
      // Sinkron profil fire-and-forget (TANPA role/wallet — dilindungi rules).
      // JANGAN di-await: setDoc menggantung saat offline dan akan mem-blok login.
      setDoc(doc(db, "users", u.uid), { name: u.displayName || null, email: u.email || null }, { merge: true })
        .catch((e) => console.warn("Sinkron profil gagal:", e));
      // Baca role NYATA dari Firestore, dengan batas waktu 4 dtk agar offline tetap masuk sebagai 'pelanggan'.
      let role = "pelanggan";
      try {
        const snap = await Promise.race([
          getDoc(doc(db, "users", u.uid)),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
        ]);
        role = (snap.exists() && snap.data().role) || "pelanggan";
      } catch (e) { console.warn("Baca role gagal:", e); }
      cur = { uid: u.uid, name: nameOf(u), email: u.email, anon: u.isAnonymous, role };
      cb(cur);
    }),
    async loginGoogle() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try { await signInWithPopup(auth, provider); }
      catch (e) {
        if (POPUP_FAIL.includes(e.code)) { await signInWithRedirect(auth, provider); return; }
        throw friendly(e);
      }
    },
    async loginEmail(e, p) { try { await signInWithEmailAndPassword(auth, e, p); } catch (err) { throw friendly(err); } },
    async register(e, p, name) {
      try { const r = await createUserWithEmailAndPassword(auth, e, p); if (name) await updateProfile(r.user, { displayName: name }); }
      catch (err) { throw friendly(err); }
    },
    async loginAnon() { try { await signInAnonymously(auth); } catch (err) { throw friendly(err); } },
    logout: () => signOut(auth),
    setRole() { console.warn("setRole diabaikan: role diatur admin via Firestore (users/{uid}.role)."); },
  };
}

export async function initAuth() {
  if (USE_FIREBASE) { try { Auth = await firebaseAuth(); return; } catch (e) { console.warn("Firebase Auth gagal, DEMO:", e); } }
  Auth = demoAuth();
}

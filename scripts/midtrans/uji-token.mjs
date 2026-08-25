// ============================================================
// Uji verifikasi token Firebase di _lib.js.
//
// Verifikasi ini ditulis sendiri memakai crypto bawaan Node (bukan
// firebase-admin/auth), jadi ia HARUS diuji seketat mungkin: kalau salah satu
// syarat terlewat, token buatan siapa pun bisa lolos dan siapa pun bisa
// membelanjakan saldo orang lain.
//
// Bagian A jalan tanpa jaringan maupun kunci (mode emulator, token tanpa
// tanda tangan). Bagian B menerbitkan token SUNGGUHAN lewat .env + Identity
// Toolkit untuk menguji jalur RS256 — dilewati otomatis kalau .env tidak ada.
//
//   node scripts/midtrans/uji-token.mjs
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import dns from "node:dns";

// Beberapa jaringan (termasuk komputer ini) menggantung di percobaan IPv6
// sampai batas waktu, dan fetch bawaan Node mencobanya lebih dulu. curl tidak
// terpengaruh, jadi gejalanya membingungkan: "jaringan mati" padahal hanya
// urutan resolusinya. Tidak diterapkan di production — jaringan Netlify sehat.
dns.setDefaultResultOrder("ipv4first");

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";   // cukup diset, tak perlu jalan
process.env.FB_PROJECT_ID = "quparkir";

let pass = 0, fail = 0;
const t = (nama, syarat, ket = "") => {
  if (syarat) { console.log("  ✔", nama); pass++; }
  else { console.log("  ✘", nama, ket ? "→ " + ket : ""); fail++; }
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const detik = () => Math.floor(Date.now() / 1000);
function tokenPalsu(ubah = {}) {
  const n = detik();
  const isi = { iss: "https://securetoken.google.com/quparkir", aud: "quparkir",
    sub: "uid-palsu", iat: n, exp: n + 3600, ...ubah };
  return b64({ alg: "none", typ: "JWT" }) + "." + b64(isi) + ".";
}
const minta = (token) => new Request("http://x", token ? { headers: { authorization: "Bearer " + token } } : {});

// ---------- A. Tanpa jaringan (mode emulator) ----------
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const { uidDariToken } = await import("../../netlify/functions/lib/_lib.js");

console.log("\n— KLAIM TOKEN —");
t("token sah → uid", await uidDariToken(minta(tokenPalsu())) === "uid-palsu");
t("tanpa header Authorization → null", await uidDariToken(minta(null)) === null);
t("bukan JWT → null", await uidDariToken(minta("bukan-token")) === null);
t("aud proyek lain → null", await uidDariToken(minta(tokenPalsu({ aud: "proyek-lain" }))) === null);
t("iss proyek lain → null", await uidDariToken(minta(tokenPalsu({ iss: "https://securetoken.google.com/lain" }))) === null);
t("sudah kedaluwarsa → null", await uidDariToken(minta(tokenPalsu({ exp: detik() - 600 }))) === null);
t("iat di masa depan → null", await uidDariToken(minta(tokenPalsu({ iat: detik() + 600 }))) === null);
t("sub kosong → null", await uidDariToken(minta(tokenPalsu({ sub: "" }))) === null);

// ---------- B. Jalur RS256 sungguhan ----------
if (!existsSync(".env")) {
  console.log("\n— TANDA TANGAN RS256 — dilewati (.env tidak ada)");
} else {
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;   // paksa jalur tanda tangan
  console.log("\n— TANDA TANGAN RS256 —");

  const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const app = initializeApp({ credential: cert({
    projectId: env.FB_PROJECT_ID, clientEmail: env.FB_CLIENT_EMAIL,
    privateKey: env.FB_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/^"|"$/g, "") }) }, "uji-token");

  const custom = await getAuth(app).createCustomToken("uji-token-claude");
  const res = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyCLwEYcjjfqllzOaTmoLj0X71e9rRw-5RA",
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: custom, returnSecureToken: true }) });
  const { idToken } = await res.json();

  t("ID token asli → uid", await uidDariToken(minta(idToken)) === "uji-token-claude");

  // Tanda tangan diubah satu karakter: harus gugur. Inilah satu-satunya uji
  // yang membuktikan tanda tangannya benar-benar diperiksa, bukan sekadar
  // klaimnya dibaca.
  const b = idToken.split(".");
  const rusak = b[0] + "." + b[1] + "." + (b[2][0] === "A" ? "B" : "A") + b[2].slice(1);
  t("tanda tangan diubah → null", await uidDariToken(minta(rusak)) === null);

  // Isi ditukar tapi tanda tangan lama dipertahankan (serangan klasik).
  const isiPalsu = Buffer.from(JSON.stringify({
    ...JSON.parse(Buffer.from(b[1].replace(/-/g,"+").replace(/_/g,"/"), "base64").toString()),
    sub: "uid-korban" })).toString("base64url");
  t("isi ditukar, tanda tangan lama → null",
    await uidDariToken(minta(b[0] + "." + isiPalsu + "." + b[2])) === null);
}

console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
process.exit(fail ? 1 : 0);

// ============================================================
// Uji preflight CORS untuk semua endpoint yang dipanggil peramban.
//
// Ada karena satu bug yang lolos dua deploy: preflight membalas
// `new Response("", { status: 204 })`, yang MELEMPAR TypeError (status 204
// tidak boleh punya body). Netlify lalu membalas 502 tanpa header CORS, dan
// pesan di peramban menyesatkan — "No 'Access-Control-Allow-Origin' header",
// seolah daftar origin-nya yang salah. Seluruh jalur gateway diam-diam mundur
// ke QRIS merchant, dan tidak ada satu uji pun yang menangkapnya karena semua
// uji lain memanggil handler dengan method POST.
//
// Emulator tidak perlu JALAN, tapi FIRESTORE_EMULATOR_HOST tetap diset:
// tanpa itu _lib.js memanggil cert() saat diimpor dan menuntut kunci asli.
// OPTIONS ditangani sebelum Firestore disentuh, jadi tidak ada koneksi apa pun.
// ============================================================
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FB_PROJECT_ID ||= "quparkir-uji-cors";
process.env.ALLOWED_ORIGIN ||= "https://quparkir.web.app";

const ENDPOINT = ["payment-config", "create-payment", "create-topup", "wallet-checkout", "reconcile"];

let pass = 0, fail = 0;
const t = (nama, syarat, ket = "") => {
  if (syarat) { console.log("  ✔", nama); pass++; }
  else { console.log("  ✘", nama, ket ? "→ " + ket : ""); fail++; }
};

const preflight = (origin) => new Request("http://localhost/x", {
  method: "OPTIONS",
  headers: {
    origin,
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type,authorization",
  },
});

console.log("\n— PREFLIGHT (OPTIONS) —");
for (const nama of ENDPOINT) {
  const f = (await import(`../../netlify/functions/${nama}.js`)).default;

  let res, galat = null;
  try { res = await f(preflight("http://localhost:5000")); } catch (e) { galat = e; }

  t(`${nama}: tidak melempar`, !galat, galat && galat.message);
  if (galat) continue;
  t(`${nama}: status 204`, res.status === 204, "status " + res.status);
  t(`${nama}: mengizinkan localhost:5000`,
    res.headers.get("access-control-allow-origin") === "http://localhost:5000",
    String(res.headers.get("access-control-allow-origin")));

  const prod = await f(preflight("https://quparkir.web.app"));
  t(`${nama}: mengizinkan quparkir.web.app`,
    prod.headers.get("access-control-allow-origin") === "https://quparkir.web.app",
    String(prod.headers.get("access-control-allow-origin")));

  // Origin asing tidak boleh dipantulkan kembali — kalau dipantulkan, situs
  // mana pun bisa memanggil endpoint ini memakai kredensial pengguna.
  const asing = await f(preflight("https://situs-asing.example"));
  t(`${nama}: menolak origin asing`,
    asing.headers.get("access-control-allow-origin") !== "https://situs-asing.example",
    String(asing.headers.get("access-control-allow-origin")));
}

console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
process.exit(fail ? 1 : 0);

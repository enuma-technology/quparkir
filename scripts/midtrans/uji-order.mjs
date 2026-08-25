// ============================================================
// Uji apa yang DIKIRIM create-topup / create-payment ke Midtrans.
//
// Ada karena satu kegagalan yang tidak meninggalkan jejak galat sama sekali:
// top up Rp 10.000 lewat simulator BERHASIL dibayar, tapi saldonya tidak
// pernah bertambah. Ordernya menggantung 'pending' tanpa satu pun notifikasi —
// Midtrans tidak punya alamat untuk memberitahu kita, karena Notification URL
// di dasbor belum diisi dan permintaan kita tidak menyertakannya.
//
// fetch global diganti penadah, jadi tidak ada panggilan sungguhan ke Midtrans.
// ============================================================
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";   // token uji tanpa tanda tangan
process.env.FB_PROJECT_ID = "quparkir-uji-order";
process.env.MIDTRANS_ENABLED = "true";
process.env.MIDTRANS_SERVER_KEY = "kunci-uji-lokal";
process.env.URL = "https://quparkir-pay.netlify.app";

const { db } = await import("../../netlify/functions/lib/_lib.js");
const createTopup = (await import("../../netlify/functions/create-topup.js")).default;

let pass = 0, fail = 0;
const t = (nama, syarat, ket = "") => {
  if (syarat) { console.log("  ✔", nama); pass++; }
  else { console.log("  ✘", nama, ket ? "→ " + ket : ""); fail++; }
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(uid = "uid-order") {
  const n = Math.floor(Date.now() / 1000);
  return b64({ alg: "none", typ: "JWT" }) + "." + b64({
    iss: "https://securetoken.google.com/" + process.env.FB_PROJECT_ID,
    aud: process.env.FB_PROJECT_ID, sub: uid, iat: n, exp: n + 3600 }) + ".";
}
const minta = (body, pakaiToken = true) => new Request("http://localhost/x", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(pakaiToken ? { authorization: "Bearer " + token() } : {}) },
  body: JSON.stringify(body),
});

// Penadah: mencatat permintaan ke Midtrans dan memulangkan token Snap palsu.
const asli = globalThis.fetch;
let terakhir = null;
globalThis.fetch = async (url, opsi = {}) => {
  terakhir = { url: String(url), headers: opsi.headers || {}, body: JSON.parse(opsi.body || "{}") };
  return new Response(JSON.stringify({ token: "snap-token-palsu" }), { status: 200, headers: { "Content-Type": "application/json" } });
};

await db.collection("orders").get().then(s => Promise.all(s.docs.map(d => d.ref.delete())));

console.log("\n— PERMINTAAN KE MIDTRANS —");
{
  const res = await createTopup(minta({ amount: 25000 }));
  const badan = await res.json();
  t("dibalas 200", res.status === 200, "status " + res.status);
  t("token Snap diteruskan ke klien", badan.token === "snap-token-palsu");
  t("menuju endpoint Snap sandbox", terakhir.url.includes("app.sandbox.midtrans.com/snap"), terakhir.url);
  t("membawa X-Override-Notification",
    terakhir.headers["X-Override-Notification"] === "https://quparkir-pay.netlify.app/.netlify/functions/midtrans-webhook",
    String(terakhir.headers["X-Override-Notification"]));
  t("nominal ditagihkan apa adanya", terakhir.body.transaction_details.gross_amount === 25000);
  t("order_id diawali TU-", terakhir.body.transaction_details.order_id.startsWith("TU-"));
  t("order_id maks 50 karakter", terakhir.body.transaction_details.order_id.length <= 50);
}

console.log("\n— NOMINAL TIDAK SAH —");
for (const [nama, amount] of [["di bawah 10.000", 9999], ["di atas 1.000.000", 1000001], ["pecahan", 10000.5], ["bukan angka", "banyak"]]) {
  const res = await createTopup(minta({ amount }));
  t(`${nama} → 400`, res.status === 400, "status " + res.status);
}

console.log("\n— TANPA TOKEN —");
t("dibalas 401", (await createTopup(minta({ amount: 25000 }, false))).status === 401);

console.log("\n— SAKLAR MATI —");
{
  process.env.MIDTRANS_ENABLED = "false";
  const modul = await import("../../netlify/functions/create-topup.js?mati=1");
  t("dibalas 503", (await modul.default(minta({ amount: 25000 }))).status === 503);
  process.env.MIDTRANS_ENABLED = "true";
}

globalThis.fetch = asli;
console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
process.exit(fail ? 1 : 0);

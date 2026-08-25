// ============================================================
// GET /.netlify/functions/payment-config
//
// Memberi tahu klien apakah jalur Midtrans hidup, dan menyerahkan Client Key
// (nilai PUBLIK — memang dipasang di atribut <script> browser).
//
// Kenapa lewat function, bukan ditulis di config.js: dengan begini tidak ada
// satu pun kunci yang perlu disalin tangan ke dalam repo, dan saklarnya cukup
// satu tempat — env var di Netlify. Repo ini publik.
// ============================================================
import { MIDTRANS, midtransAktif, corsHeaders, json, preflight } from "./lib/_lib.js";

export default async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "GET") return json(req, 405, { error: "method_not_allowed" });

  const clientKey = process.env.MIDTRANS_CLIENT_KEY || "";

  // Diagnosis: BENAR/SALAH saja, tidak pernah nilainya. Tanpa ini, "enabled:
  // false" punya tiga sebab yang tidak bisa dibedakan dari luar, dan
  // membedakannya berarti berburu di dasbor Netlify satu per satu — env var
  // di Netlify baru terbaca function setelah deploy, jadi tiap tebakan yang
  // meleset berharga satu deploy (15 kredit).
  const siap = {
    saklar: midtransAktif(),
    serverKey: !!process.env.MIDTRANS_SERVER_KEY,
    clientKey: !!clientKey,
  };

  return new Response(
    JSON.stringify({
      // Klien wajib memakai gabungan ketiganya, bukan salah satunya: saklar
      // menyala tapi client key kosong = Snap tidak akan pernah terbuka.
      enabled: siap.saklar && siap.serverKey && siap.clientKey,
      siap,
      // Bayar parkir dengan saldo QuPay dikerjakan server (wallet-checkout),
      // dan itu TIDAK bergantung pada saklar Midtrans — murni Firestore.
      // Klien memakai bendera ini untuk tahu jalur server tersedia tanpa
      // harus menembak endpoint-nya dulu lalu gagal.
      walletServer: true,
      // Versi Node runtime. Bukan hiasan: NODE_VERSION di netlify.toml bisa
      // kalah oleh pengaturan dasbor, dan versi yang salah pernah membunuh
      // seluruh function lewat rantai jose (lihat catatan di netlify.toml).
      // Satu curl ke endpoint ini sekarang menjawabnya tanpa membuka dasbor.
      runtime: process.version,
      clientKey,
      snapUrl: MIDTRANS.snapUrl,
      isProduction: MIDTRANS.isProd,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Boleh disinggahkan sebentar; saklar tidak perlu berubah dalam hitungan detik.
        "Cache-Control": "public, max-age=60",
        ...corsHeaders(req),
      },
    }
  );
};

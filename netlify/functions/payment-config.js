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
import { MIDTRANS, MIDTRANS_AKTIF, corsHeaders, json, preflight } from "./lib/_lib.js";

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
    saklar: MIDTRANS_AKTIF,
    serverKey: !!process.env.MIDTRANS_SERVER_KEY,
    clientKey: !!clientKey,
  };

  return new Response(
    JSON.stringify({
      // Klien wajib memakai gabungan ketiganya, bukan salah satunya: saklar
      // menyala tapi client key kosong = Snap tidak akan pernah terbuka.
      enabled: siap.saklar && siap.serverKey && siap.clientKey,
      siap,
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

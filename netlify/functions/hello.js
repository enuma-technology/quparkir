// ============================================================
// Function uji — TIDAK menyentuh uang sama sekali.
//
// Tugasnya satu: membuktikan bahwa netlify.toml, package.json, environment
// variable, dan kredensial Firebase sudah benar SEBELUM ada uang terlibat.
// Kalau langkah ini dilewati, setiap kegagalan nanti punya lima kemungkinan
// sebab sekaligus dan hanya bisa ditebak-tebak.
//
// Panggil: /.netlify/functions/hello
// ============================================================
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Kunci di environment variable ditulis dengan "\n" sebagai teks biasa
// (bukan baris sungguhan), jadi harus dipulihkan sebelum dipakai. Ini
// penyebab kegagalan paling sering di seluruh panduan ini.
const privateKey = (process.env.FB_PRIVATE_KEY || "").replace(/\\n/g, "\n");

let app = null;
let initError = null;
try {
  app = getApps()[0] || initializeApp({
    credential: cert({
      projectId: process.env.FB_PROJECT_ID,
      clientEmail: process.env.FB_CLIENT_EMAIL,
      privateKey,
    }),
  });
} catch (e) {
  initError = e.message;
}

export default async () => {
  const hasil = {
    ok: true,
    waktuServer: new Date().toISOString(),
    // Sengaja hanya benar/salah, BUKAN nilainya — jangan pernah menggemakan
    // kunci rahasia ke dalam respons HTTP.
    envTerpasang: {
      FB_PROJECT_ID: !!process.env.FB_PROJECT_ID,
      FB_CLIENT_EMAIL: !!process.env.FB_CLIENT_EMAIL,
      FB_PRIVATE_KEY: !!process.env.FB_PRIVATE_KEY,
    },
  };

  if (initError) {
    hasil.ok = false;
    hasil.firebase = "GAGAL saat init: " + initError;
    return Response.json(hasil, { status: 500 });
  }

  // Variabel yang TERISI tapi salah nilainya adalah kesalahan tersering, dan
  // hanya percobaan baca sungguhan yang bisa membedakannya dari yang benar.
  try {
    const snap = await getFirestore(app).collection("locations").limit(1).get();
    hasil.firestore = "tersambung (" + snap.size + " dokumen terbaca)";
  } catch (e) {
    hasil.ok = false;
    hasil.firestore = "GAGAL: " + e.message;
  }

  return Response.json(hasil, { status: hasil.ok ? 200 : 500 });
};

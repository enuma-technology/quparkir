// ============================================================
// Firebase Web SDK config (AMAN untuk publik — bukan service account).
// Sumber: firebase apps:sdkconfig (Firebase Console > Project settings).
// Selama masih placeholder ("GANTI_"), app berjalan MODE DEMO (localStorage).
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyCLwEYcjjfqllzOaTmoLj0X71e9rRw-5RA",
  authDomain: "quparkir.firebaseapp.com",
  projectId: "quparkir",
  storageBucket: "quparkir.firebasestorage.app",
  messagingSenderId: "336373443238",
  appId: "1:336373443238:web:f8fd43bd147223b531e267"
};

// App otomatis pakai Firebase asli kalau config sudah diisi (tidak ada "GANTI_").
export const USE_FIREBASE = !Object.values(firebaseConfig).some(v => String(v).startsWith("GANTI_"));

// Konfigurasi pembayaran: isi midtransClientKey (Snap sandbox) + ubah provider
// ke "midtrans" untuk gateway nyata; selama kosong, pembayaran QRIS berjalan
// mode simulasi.
export const paymentConfig = { provider: "simulasi", midtransClientKey: "" };

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

// ------------------------------------------------------------
// Mode emulator lokal (Auth + Firestore) untuk uji coba tanpa menyentuh data
// produksi. Aktifkan: buka app.html?emu=1 (pilihan tersimpan), matikan: ?emu=0.
// Jalankan lebih dulu: firebase emulators:start --only auth,firestore,hosting
//
// HANYA berlaku saat app dibuka dari localhost. Di quparkir.web.app flag ini
// diabaikan total, jadi ?emu=1 yang tidak sengaja terbuka (atau tersisa di
// localStorage lalu perangkatnya dipakai online) tidak bisa melumpuhkan app.
// ------------------------------------------------------------
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"];
const _isLocal = LOCAL_HOSTS.includes(location.hostname);
if (_isLocal) {
  const p = new URLSearchParams(location.search).get("emu");
  if (p !== null) { try { localStorage.setItem("qp_emu", p === "0" ? "0" : "1"); } catch {} }
}
export const USE_EMULATOR = (() => {
  if (!_isLocal) return false;
  try { return localStorage.getItem("qp_emu") === "1"; } catch { return false; }
})();
export const EMULATOR = { host: "127.0.0.1", firestorePort: 8080, authUrl: "http://127.0.0.1:9099" };

// Konfigurasi pembayaran. Tiga mode, dipilih otomatis menurut isi berkas ini:
//
//   1. provider "midtrans" + midtransClientKey terisi → gateway nyata (butuh server)
//   2. qrisStatic terisi                              → QRIS merchant asli, nominal
//                                                        disisipkan di browser (tag 54)
//   3. selain itu                                     → simulasi penuh, QR palsu
//
// qrisStatic: tempel STRING QRIS merchant (bukan gambar QR-nya). Cara ambil:
// pindai QRIS cetakan Anda dengan pembaca QR apa pun, lalu salin teks hasilnya
// — diawali "00020101" dan diakhiri "6304" + 4 karakter.
//
// ⚠️ Mode 2 membuat QR-nya nyata dan uang benar-benar masuk ke rekening
// merchant, TAPI aplikasi tidak bisa tahu sendiri kapan lunas — QRIS statis
// tidak membawa order_id. Konfirmasinya manual. Lihat docs/PAYMENT-GOBIZ.md §0.2.
export const paymentConfig = {
  provider: "simulasi",
  midtransClientKey: "",
  // QRIS merchant GoPay — Quparkir, COLOMADU (KARANGANYAR), NMID ID1026577085958.
  // Statis & sah dipublikasikan (memang dicetak untuk umum); nominal disisipkan
  // di browser oleh toDynamic() di qris.js.
  qrisStatic:
    "00020101021126610014COM.GO-JEK.WWW01189360091438437593560210G8437593560303UMI51440014ID.CO.QRIS.WWW0215ID10265770859580303UMI5204478953033605802ID5918Quparkir, COLOMADU6011KARANGANYAR61055717362140703A01110362163042F87",
};

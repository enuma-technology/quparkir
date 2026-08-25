// ============================================================
// Pembayaran — tiga jalur, dipilih otomatis:
//
//   1. Midtrans Snap  → hanya bila SAKLAR KLIEN (paymentConfig.provider) dan
//                       SAKLAR SERVER (env MIDTRANS_ENABLED) sama-sama menyala,
//                       dan pembayarannya punya sessionId. Nominal dihitung
//                       server; sesi ditutup webhook, bukan oleh browser.
//   2. QRIS merchant  → string QRIS statis diubah jadi dinamis di browser.
//                       Sudah terbukti menerima uang sungguhan.
//   3. Simulasi       → QR palsu, untuk mode DEMO.
//
// Urutan mundurnya sengaja satu arah: apa pun yang gagal di jalur 1 selalu
// jatuh ke jalur 2. Jadi menyalakan Midtrans tidak bisa mematikan jalur yang
// sudah berhasil — itu syarat yang disepakati sebelum function ini ditulis.
//
// choosePayment() → pilih metode; payQRIS() → proses bayar non-QuPay.
// ============================================================
import { h, $, rupiah, modal, toast } from "./util.js";
import { renderQR } from "./qr.js";
import { toDynamic } from "./qris.js";
import { paymentConfig } from "./config.js";
import { DB } from "./data.js";

// Modal pilih metode. Resolve 'qupay' | 'qris' | null (batal via backdrop).
export function choosePayment({ amount, balance }) {
  return new Promise((resolve) => {
    const pilih = (m) => { $("#modalHost").innerHTML = ""; resolve(m); };
    const kurang = balance < amount;
    const item = (dis, onclick, ic, t, s) =>
      h("button.li", { disabled: dis, onclick,
        style: "width:100%;border:0;cursor:" + (dis ? "not-allowed" : "pointer") + ";text-align:left;font:inherit;color:inherit" + (dis ? ";opacity:.55" : "") }, [
        h(".ic", { text: ic }),
        h("div", { style: "flex:1" }, [h(".t", { text: t }), h(".s", { text: s })]),
      ]);
    const body = h("div", {}, [
      h("p.center.muted", { text: "Total pembayaran" }),
      h(".center.big-amt", { style: "margin:2px 0 14px", text: rupiah(amount) }),
      item(kurang, () => pilih("qupay"), "💠", "QuPay (Saldo: " + rupiah(balance) + ")",
        kurang ? "Saldo tidak cukup" : "Bayar instan dari saldo"),
      item(false, () => pilih("qris"), "📱", "QRIS", "Scan QR — semua e-wallet & m-banking"),
    ]);
    modal("Pilih Metode Pembayaran", body).then(() => resolve(null));
  });
}

// Bayar non-QuPay.
//
// Hasilnya tiga macam, dan pemanggil WAJIB membedakan ketiganya:
//   false                     → batal / gagal
//   true                      → pengguna menyatakan sudah bayar (QRIS manual);
//                               pemanggil masih harus menutup sesinya sendiri
//   { server: true, amount }  → server sudah menutup sesi & mencatat transaksi;
//                               pemanggil TIDAK boleh memanggil DB.checkout()
export async function payQRIS({ amount, title = "Pembayaran QRIS", sessionId = null } = {}) {
  // Tanpa sessionId (mis. top up saldo) Midtrans tidak dipakai: nominalnya
  // tidak bisa diturunkan dari sesi mana pun, jadi tidak ada yang bisa
  // divalidasi server.
  if (paymentConfig.provider === "midtrans" && sessionId) {
    const hasil = await payMidtrans({ sessionId, title });
    if (hasil !== MUNDUR) return hasil;
  }
  if (paymentConfig.qrisStatic) return qrisMerchant({ amount, title });
  return simulasiQRIS({ amount, title });
}

// QRIS merchant asli: string statis diubah jadi dinamis di browser (tag 54 +
// CRC16 baru), sehingga nominalnya terkunci di aplikasi pembayar dan tidak
// perlu diketik manual.
//
// ⚠️ Batasnya harus jujur: QRIS statis tidak membawa order_id, jadi aplikasi
// TIDAK bisa tahu sendiri uangnya sudah masuk. Tombol konfirmasi di bawah
// adalah pernyataan pengguna, bukan bukti pembayaran — petugas tetap wajib
// mencocokkan ke aplikasi merchant. Untuk rekonsiliasi otomatis dibutuhkan
// QRIS dinamis terbitan PJP + webhook; lihat docs/PAYMENT-GOBIZ.md.
function qrisMerchant({ amount, title }) {
  let payload;
  try {
    payload = toDynamic(paymentConfig.qrisStatic, amount);
  } catch (e) {
    // String QRIS salah salin — jangan tampilkan QR yang pasti ditolak pemindai
    console.error("QRIS statis tidak bisa dipakai:", e);
    toast("QRIS merchant belum benar — memakai mode simulasi.", "err");
    return simulasiQRIS({ amount, title });
  }

  return new Promise((resolve) => {
    const qrEl = h(".qrbox");
    renderQR(qrEl, payload, 220);
    const body = h("div", { style: "text-align:center" }, [
      h(".big-amt", { style: "margin:4px 0 12px", text: rupiah(amount) }),
      qrEl,
      h("p.muted", { style: "margin-top:8px",
        html: "<small>Pindai dengan GoPay, DANA, OVO, ShopeePay, atau m-banking apa pun.<br>Nominal sudah terkunci — periksa angkanya sebelum menekan bayar.</small>" }),
      h("button.btn", { style: "margin-top:14px", onclick: () => { $("#modalHost").innerHTML = ""; resolve(true); } },
        "✅ Saya sudah bayar"),
      h("p.muted", { style: "margin-top:6px",
        html: "<small>Petugas mencocokkan pembayaran di aplikasi merchant.</small>" }),
    ]);
    modal(title, body).then(() => resolve(false));
  });
}

// ============================================================
// Jalur Midtrans
// ============================================================

// Penanda "jalur ini tidak bisa dipakai, silakan mundur". Sengaja Symbol, bukan
// null/false — supaya tidak mungkin tertukar dengan "pembayaran dibatalkan".
const MUNDUR = Symbol("midtrans-tidak-tersedia");

// Saklar server ditanyakan sekali per muat halaman.
let cfgServer;
async function konfigServer() {
  if (cfgServer !== undefined) return cfgServer;
  try {
    const res = await fetch(paymentConfig.apiBase + "/payment-config");
    cfgServer = res.ok ? await res.json() : { enabled: false };
  } catch (e) {
    // Function mati, situs Netlify ditangguhkan, atau perangkat offline —
    // ketiganya sama artinya bagi pengguna: pakai jalur QRIS saja.
    console.warn("payment-config tidak terjangkau:", e.message);
    cfgServer = { enabled: false };
  }
  return cfgServer;
}

let snapReady;
function loadSnap(cfg) {
  if (snapReady) return snapReady;
  snapReady = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = cfg.snapUrl;
    s.setAttribute("data-client-key", cfg.clientKey);
    s.onload = resolve;
    // Penyebab tersering: domain Midtrans belum masuk CSP di app.html —
    // popupnya lalu diam total tanpa pesan galat apa pun.
    s.onerror = () => { snapReady = null; reject(new Error("Gagal memuat Snap")); };
    document.head.append(s);
  });
  return snapReady;
}

async function idTokenFirebase() {
  const [{ getApps }, a] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"),
  ]);
  const app = getApps()[0];
  const u = app && a.getAuth(app).currentUser;
  if (!u) throw new Error("Belum masuk");
  return u.getIdToken();
}

async function payMidtrans({ sessionId, title }) {
  // Mode DEMO tidak punya Firestore sama sekali — tidak ada yang bisa ditunggu.
  if (DB?.mode !== "firebase" || !DB._db) return MUNDUR;

  const cfg = await konfigServer();
  if (!cfg.enabled) return MUNDUR;

  let orderId, token, amount;
  try {
    await loadSnap(cfg);
    const idToken = await idTokenFirebase();
    const res = await fetch(paymentConfig.apiBase + "/create-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + idToken },
      body: JSON.stringify({ sessionId }),        // ← nominal TIDAK dikirim
    });
    if (res.status === 503) { cfgServer = { enabled: false }; return MUNDUR; }
    if (!res.ok) throw new Error("HTTP " + res.status);
    ({ orderId, token, amount } = await res.json());
    if (!token) throw new Error("token kosong");
  } catch (e) {
    // Apa pun yang gagal SEBELUM Snap terbuka masih aman untuk dimundurkan:
    // belum ada uang yang berpindah. Setelah Snap terbuka, tidak lagi.
    console.warn("Midtrans tidak bisa dipakai:", e.message);
    toast("Gateway sedang tidak bisa dipakai — memakai QRIS merchant.");
    return MUNDUR;
  }

  return new Promise((resolve) => {
    let selesai = false;
    const tutup = (hasil) => { if (!selesai) { selesai = true; resolve(hasil); } };

    // Kebenaran datang dari webhook lewat dokumen orders, BUKAN dari callback
    // Snap: pengguna bisa menutup browser tepat setelah membayar.
    const berhenti = tungguLunas(orderId, (status) => {
      if (status === "paid") { berhenti(); tutup({ server: true, amount }); }
      if (status === "failed" || status === "mismatch") { berhenti(); tutup(false); }
    });

    window.snap.pay(token, {
      onSuccess: () => toast("Pembayaran diterima, menunggu konfirmasi…"),
      onPending: () => toast("Menunggu pembayaran diselesaikan…"),
      onError: () => { berhenti(); toast("Pembayaran gagal", "err"); tutup(false); },
      onClose: () => {
        // Popup ditutup ≠ tidak jadi bayar: notifikasi webhook biasanya datang
        // beberapa detik setelahnya. Beri tenggang sebelum menyerah, dan biarkan
        // order tetap 'pending' — reconcile yang membereskan sisanya.
        setTimeout(() => { berhenti(); tutup(false); }, 20000);
      },
    });
  });
}

// Langganan satu dokumen order. Mengembalikan fungsi penghenti.
function tungguLunas(orderId, cb) {
  let unsub = null, batal = false;
  (async () => {
    const fs = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    if (batal) return;
    unsub = fs.onSnapshot(
      fs.doc(DB._db, "orders", orderId),
      (snap) => cb(snap.data()?.status),
      (e) => console.warn("Langganan order gagal:", e.code || e.message),
    );
  })();
  return () => { batal = true; unsub && unsub(); };
}

// SIMULASI: modal QR palsu + tombol konfirmasi manual.
function simulasiQRIS({ amount, title }) {
  return new Promise((resolve) => {
    const qrEl = h(".qrbox");
    renderQR(qrEl, "QRIS-SIM|" + amount + "|" + crypto.randomUUID().slice(0, 8), 180);
    const body = h("div", { style: "text-align:center" }, [
      h(".big-amt", { style: "margin:4px 0 12px", text: rupiah(amount) }),
      qrEl,
      h("p.muted", { style: "margin-top:8px", html: "<small>MODE SIMULASI — QR ini bukan QRIS nyata</small>" }),
      h("button.btn", { style: "margin-top:14px", onclick: () => { $("#modalHost").innerHTML = ""; resolve(true); } },
        "✅ Saya sudah bayar (simulasi)"),
    ]);
    modal(title, body).then(() => resolve(false));
  });
}

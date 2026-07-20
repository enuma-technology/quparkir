// ============================================================
// Pembayaran — gateway-ready: SIMULASI (default) / Midtrans (stub).
// choosePayment() → pilih metode; payQRIS() → proses bayar QRIS.
// ============================================================
import { h, $, rupiah, modal, toast } from "./util.js";
import { renderQR } from "./qr.js";
import { paymentConfig } from "./config.js";

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

// Bayar via QRIS. Resolve true (lunas) / false (batal).
export async function payQRIS({ amount, title = "Pembayaran QRIS" } = {}) {
  if (paymentConfig.provider === "midtrans" && paymentConfig.midtransClientKey)
    return payMidtrans({ amount, title });
  return simulasiQRIS({ amount, title });
}

// STUB integrasi Midtrans Snap (sandbox). Langkah integrasi nyata:
// 1) SERVER (wajib): buat token via Snap API `POST https://app.sandbox.midtrans.com/snap/v1/transactions`
//    memakai Server Key (jangan pernah di client) → response berisi `token`.
// 2) CLIENT: muat script https://app.sandbox.midtrans.com/snap/snap.js
//    dengan atribut data-client-key = paymentConfig.midtransClientKey.
// 3) Panggil window.snap.pay(token, { onSuccess, onPending, onError, onClose }).
// 4) Tandai lunas HANYA setelah HTTP notification/webhook Midtrans diverifikasi di server.
async function payMidtrans({ amount, title }) {
  toast("Midtrans belum tersambung ke server token — memakai mode simulasi.");
  return simulasiQRIS({ amount, title });
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

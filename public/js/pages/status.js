import { h, $, rupiah, durasiText, hitungTarif, fmtDate, modal, toast } from "../util.js";
import { DB } from "../data.js";
import { Auth } from "../auth.js";
import { pageHeader } from "../parts.js";
import { go } from "../router.js";
import { renderQR } from "../qr.js";
import { choosePayment, payQRIS, bayarSaldo } from "../pay.js";

export default async function statusPage(view) {
  const u = Auth.current();
  const body = h("div.pad");
  view.append(pageHeader("Status Parkir", { back: "#/home" }), body);

  let tick;
  const unsub = DB.sessions.subscribeActive(u.uid, (s) => {
    clearTimeout(tick);
    body.innerHTML = "";
    if (!s) {
      body.append(h(".empty", {}, [h(".ic", { text: "🅿️" }),
        h("p", { text: "Belum ada parkir aktif." }),
        h("button.btn", { style: "margin-top:14px", onclick: () => go("#/cari") }, "Cari Parkir")]));
      return;
    }
    const timer = h(".timer");
    const amt = h(".big-amt");
    const qrEl = h(".qrbox");
    renderQR(qrEl, s.qrToken, 150);

    body.append(
      h(".card.pad", { style: "margin-bottom:14px" }, [
        h(".row", {}, [h("h3", { style: "flex:1", text: s.locationName }),
          s.verified ? h("span.pill.ok", { html: "✔ Terverifikasi" }) : h("span.pill.warn", { html: "● Belum verifikasi" })]),
        h("p.muted", { style: "margin-top:4px", text: s.vehicle.plate + " · " + s.vehicle.type + (s.vehicle.name ? " · " + s.vehicle.name : "") }),
        h("p.muted", { style: "margin-top:2px", text: "Masuk: " + fmtDate(s.checkinAt) }),
        h("div", { style: "text-align:center;margin:18px 0 6px" }, [h("div.muted", { text: "Durasi parkir" }), timer]),
        h("div", { style: "text-align:center;margin-bottom:8px" }, [h("div.muted", { text: "Estimasi biaya" }), amt]),
      ]),
      h(".card.pad", { style: "margin-bottom:14px;text-align:center" }, [
        h("h4", { style: "margin-bottom:10px", text: "E-Ticket QR" }), qrEl,
        h("p.muted", { style: "margin-top:8px", html: "<small>Tunjukkan ke petugas untuk verifikasi · " + s.qrToken + "</small>" }),
      ]),
      h("button.btn.danger", { onclick: () => doCheckout(s) }, "🚪 Check-out & Bayar"),
    );

    const update = () => {
      const dur = Date.now() - s.checkinAt;
      timer.textContent = durasiText(dur);
      amt.textContent = rupiah(hitungTarif(s.vehicle.type, dur));
      tick = setTimeout(update, 1000);
    };
    update();
  });

  // Struk. Dipisah karena empat jalur pembayaran berakhir di sini, dan dulu
  // salinannya sempat berbeda-beda antar jalur.
  //
  // Bentuknya sengaja meniru struk kertas — pengguna memakainya untuk
  // membuktikan pembayaran ke petugas di lapangan, dan "kartu sukses" biasa
  // tidak memuat hal yang ditanyakan petugas: plat, jam masuk, jam keluar,
  // dan nomor rujukan.
  function struk(s, { amount, method, sisa = null, ref = null }) {
    const keluar = Date.now();
    const baris = (k, v) => h(".baris", {}, [h("span.k", { text: k }), h("span.v", { text: v })]);
    const pisah = () => h(".pisah");

    const isi = h(".struk", {}, [
      h(".kop", {}, [
        h(".merek", { text: "QUPARKIR" }),
        h(".sub", { text: "Parkir Digital Surakarta" }),
        h(".lunas", { text: "✓ LUNAS" }),
      ]),
      pisah(),
      baris("Lokasi", s.locationName || "—"),
      baris("Kendaraan", s.vehicle.plate + " · " + s.vehicle.type),
      baris("Masuk", fmtDate(s.checkinAt)),
      baris("Keluar", fmtDate(keluar)),
      baris("Durasi", durasiText(keluar - s.checkinAt)),
      pisah(),
      baris("Tarif parkir", rupiah(amount)),
      h(".total", {}, [h("span.k", { text: "TOTAL" }), h("span.v", { text: rupiah(amount) })]),
      baris("Metode", method === "qupay" ? "QuPay (saldo)" : "QRIS / e-wallet"),
      sisa !== null ? baris("Sisa saldo", rupiah(sisa)) : null,
      pisah(),
      // Nomor rujukan: order gateway kalau ada (itu yang bisa dicari di dasbor
      // Midtrans), kalau tidak, id sesi — keduanya cukup untuk melacak satu
      // pembayaran sampai ke dokumen Firestore-nya.
      baris("No. Rujukan", (ref || s.id || "").slice(0, 24).toUpperCase()),
      baris("Terverifikasi", s.verified ? "Ya, oleh petugas" : "Belum"),
      h(".kaki", { html: "Terima kasih telah memarkir dengan tertib.<br>Simpan struk ini sebagai bukti pembayaran." }),
      h(".gerigi"),
    ]);

    const body = h("div", {}, [
      isi,
      h("div", { style: "display:flex;gap:10px;margin-top:16px" }, [
        h("button.btn.ghost", { style: "flex:1", onclick: () => window.print() }, "🖨 Cetak"),
        h("button.btn", { style: "flex:1", onclick: () => { $("#modalHost").innerHTML = ""; go("#/riwayat"); } }, "Riwayat"),
      ]),
    ]);
    modal("Struk Parkir", body);
  }

  async function doCheckout(s) {
    try {
      const bal = await Promise.resolve(DB.wallet.get(u.uid));
      const preview = hitungTarif(s.vehicle.type, Date.now() - s.checkinAt);
      let method = await choosePayment({ amount: preview, balance: bal });
      if (!method) return;

      // ---- QuPay: dikerjakan server dalam satu transaksi ----
      // Dulu browser menutup sesi lalu menulis saldo baru sebagai dua langkah
      // terpisah; kalau langkah kedua tidak dijalankan, parkirnya gratis.
      if (method === "qupay") {
        const hasil = await bayarSaldo({ sessionId: s.id });
        if (hasil.ok) return struk(s, { amount: hasil.amount, method, sisa: hasil.sisa });
        if (hasil.error === "session_not_active") return toast("Sesi sudah selesai.", "err");
        if (hasil.error === "saldo_kurang") {
          // Angkanya dari server, bukan dari saldo yang mungkin sudah basi di layar.
          toast("Saldo " + rupiah(hasil.saldo) + " tidak cukup — selesaikan via QRIS", "err");
          method = "qris";
        }
        // hasil.mundur → function tak terjangkau; lanjut ke jalur lama di bawah
      }

      let z = null, sisa = null;
      if (method === "qris") {
        const hasil = await payQRIS({ amount: preview, title: "Bayar Parkir — QRIS", sessionId: s.id });
        if (!hasil) return toast("Pembayaran dibatalkan", "err");
        // hasil.server = pembayaran lewat gateway: webhook di server SUDAH
        // menutup sesi, mencatat transaksi, dan mengembalikan slot lokasi.
        // Memanggil DB.checkout() lagi di sini akan menutupnya dua kali — dan
        // tulisannya pasti ditolak rules karena sesinya bukan 'active' lagi.
        if (hasil.server) return struk(s, { amount: hasil.amount, method, ref: hasil.orderId });
      }

      // ---- Jalur lama: browser yang menutup sesi ----
      // Tersisa untuk mode DEMO dan untuk saat function tak terjangkau.
      z = await DB.checkout(s.id, { method });
      if (method === "qupay") {
        // Baca ulang saldo TERBARU tepat sebelum debit (hindari lost-update dari tab lain).
        const fresh = await Promise.resolve(DB.wallet.get(u.uid));
        if (fresh < z.amount) {
          toast("Saldo berubah & tidak cukup — selesaikan via QRIS", "err");
          const ok = await payQRIS({ amount: z.amount, title: "Bayar Parkir — QRIS" });
          if (!ok) toast("Tagihan " + rupiah(z.amount) + " belum terbayar", "err");
        } else {
          sisa = fresh - z.amount;
          await DB.wallet.set(u.uid, sisa);
        }
      }
      struk(s, { amount: z.amount, method, sisa });
    } catch (e) { toast(e.message, "err"); }
  }

  return () => { clearTimeout(tick); unsub && unsub(); };
}

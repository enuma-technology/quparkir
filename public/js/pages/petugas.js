import { h, durasiLabel, rupiah, fmtDate, toast } from "../util.js";
import { DB } from "../data.js";
import { Auth } from "../auth.js";
import { pageHeader } from "../parts.js";
import { renderQR, startScanner } from "../qr.js";

export default async function petugasPage(view) {
  const u = Auth.current();
  const statEl = h(".stats");
  const listEl = h("div.pad");
  const preaderWrap = h("div", { id: "preaderWrap", style: "margin:0 0 8px" });
  const topupEl = h("div.pad");
  const topupHead = h("section.section", {}, [h(".head", {}, [h("h2", { text: "Konfirmasi Top Up" })])]);
  const ktaQr = h(".qrbox");
  renderQR(ktaQr, "QP-KTA:" + u.uid, 130);

  view.append(
    pageHeader("Dashboard Petugas", { back: "#/akun" }),
    h("div.pad", {}, [statEl,
      h(".card.pad", { style: "margin-top:14px;text-align:center" }, [
        h("h4", { style: "margin-bottom:2px", text: "KTA Digital Saya" }),
        h("h3", { style: "margin-bottom:2px", text: u.name }),
        h("p.muted", { style: "margin-bottom:10px", html: "<small>Kartu Tanda Anggota Petugas</small>" }), ktaQr,
      ]),
    ]),
    h("section.section", {}, [h(".head", {}, [h("h2", { text: "Kendaraan Aktif" })])]),
    h("div.pad", { style: "padding-bottom:0" }, [
      h("button.btn.ghost", { onclick: scanTicket }, "📷 Scan E-Ticket"), preaderWrap,
    ]),
    listEl,
    topupHead, topupEl,
  );

  let active = []; // sessions aktif terakhir (untuk handler scan)
  let stopScan;
  async function scanTicket() {
    if (stopScan) { stopScan(); stopScan = null; }  // matikan kamera lama bila tombol ditekan lagi
    preaderWrap.innerHTML = '<div id="preader"></div>';
    try {
      stopScan = await startScanner("preader", async (txt) => {
        const token = String(txt).trim();
        const s = active.find(x => x.qrToken === token);
        if (!s) { toast("E-ticket tidak ditemukan / tidak aktif", "err"); return; }
        try {
          if (s.verified) toast("Sudah terverifikasi");
          else { await DB.verify(s.id, u.uid); toast("✔ " + s.vehicle.plate + " terverifikasi", "ok"); }
        } catch (e) { toast(e.message, "err"); }
        if (stopScan) stopScan(); preaderWrap.innerHTML = "";
      });
    } catch (e) { preaderWrap.innerHTML = ""; toast(e.message, "err"); }
  }

  // Permintaan top up. Pengguna sudah membayar lewat QRIS merchant, tapi QRIS
  // statis tidak memberi tahu aplikasi kapan uang masuk — jadi petugaslah yang
  // mencocokkan ke aplikasi merchant sebelum saldo bertambah. Persetujuan
  // menaikkan saldo dalam satu transaksi (lihat DB.topups.approve).
  const unsubTop = DB.topups.subscribePending((list) => {
    topupEl.innerHTML = "";
    if (!list.length) {
      topupEl.append(h(".empty", {}, [h(".ic", { text: "💠" }), h("p", { text: "Tidak ada permintaan top up." })]));
      return;
    }
    list.forEach(t => {
      const setuju = h("button.btn.sm", {}, "Setujui");
      const tolak = h("button.btn.sm.ghost", { style: "margin-left:6px" }, "Tolak");
      const jalankan = async (fn, pesan) => {
        setuju.disabled = tolak.disabled = true;   // cegah klik ganda menambah saldo dua kali
        try { await fn(t.id, u.uid); toast(pesan, "ok"); }
        catch (e) { toast(e.message || "Gagal memproses", "err"); setuju.disabled = tolak.disabled = false; }
      };
      setuju.onclick = () => jalankan(DB.topups.approve, "Top Up " + rupiah(t.amount) + " disetujui");
      tolak.onclick = () => jalankan(DB.topups.reject, "Permintaan ditolak");
      topupEl.append(h(".li", {}, [
        h(".ic", { style: "background:rgba(59,130,246,.18)", text: "💠" }),
        h("div", { style: "flex:1;min-width:0" }, [
          h(".t", { text: rupiah(t.amount) + " · " + (t.name || t.uid.slice(0, 8)) }),
          h(".s", { text: "QRIS · " + fmtDate(t.createdAt) }),
        ]),
        h("div", { style: "display:flex;align-items:center" }, [setuju, tolak]),
      ]));
    });
  });

  let tick;
  const unsub = DB.sessions.subscribeAllActive((sessions) => {
    active = sessions;
    const verified = sessions.filter(s => s.verified).length;
    statEl.innerHTML = "";
    [["Aktif", sessions.length], ["Terverifikasi", verified], ["Belum", sessions.length - verified]]
      .forEach(([l, n]) => statEl.append(h(".stat", {}, [h(".num", { text: String(n) }), h(".lbl", { text: l })])));

    const draw = () => {
      listEl.innerHTML = "";
      if (!sessions.length) { listEl.append(h(".empty", {}, [h(".ic", { text: "🚗" }), h("p", { text: "Tidak ada kendaraan parkir saat ini." })])); return; }
      sessions.forEach(s => listEl.append(h(".li", {}, [
        h(".ic", { style: s.verified ? "background:rgba(34,197,94,.18)" : "background:rgba(245,158,11,.18)", text: s.vehicle.type === "mobil" ? "🚙" : "🏍️" }),
        h("div", { style: "flex:1" }, [
          h(".t", { text: s.vehicle.plate + " · " + s.locationName }),
          h(".s", { text: "Durasi " + durasiLabel(Date.now() - s.checkinAt) + " · " + s.qrToken }),
        ]),
        s.verified
          ? h("span.pill.ok", { html: "✔ OK" })
          : h("button.btn.sm", { onclick: async () => { await DB.verify(s.id, u.uid); toast("Kendaraan diverifikasi", "ok"); } }, "Verifikasi"),
      ])));
    };
    draw();
    clearTimeout(tick); tick = setTimeout(function loop() { draw(); tick = setTimeout(loop, 5000); }, 5000);
  });

  return () => { clearTimeout(tick); unsub && unsub(); unsubTop && unsubTop(); stopScan && stopScan(); };
}

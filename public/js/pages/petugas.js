import { h, durasiLabel, rupiah, toast } from "../util.js";
import { DB } from "../data.js";
import { Auth } from "../auth.js";
import { appHeader } from "../parts.js";
import { queryParam } from "../router.js";
import { renderQR, startScanner } from "../qr.js";

export default async function petugasPage(view) {
  const u = Auth.current();
  const statEl = h(".stats");
  const listEl = h("div.pad");
  const preaderWrap = h("div", { id: "preaderWrap", style: "margin:0 0 8px" });
  const ktaQr = h(".qrbox");
  renderQR(ktaQr, "QP-KTA:" + u.uid, 130);

  view.append(
    // appHeader, bukan pageHeader: petugas punya tab-bar sendiri, jadi tidak
    // ada "kembali ke" yang masuk akal — dashboard inilah berandanya.
    appHeader({ title: "Dashboard Petugas", sub: u.name || "Petugas lapangan", icons: false }),
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
  );

  let active = []; // sessions aktif terakhir (untuk handler scan)
  let stopScan;

  // Tombol pindai di tab-bar membuka halaman ini dengan ?scan=1 supaya kamera
  // langsung menyala — petugas di lapangan tidak perlu mengetuk dua kali
  // sambil memegang kendaraan orang.
  if (queryParam("scan") === "1") setTimeout(() => scanTicket(), 60);
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

  return () => { clearTimeout(tick); unsub && unsub(); stopScan && stopScan(); };
}


// ============================================================
// Halaman tersendiri: antrean top up — HANYA PANTAUAN.
//
// Menyetujui top up berarti menambah saldo, dan saldo itu uang: pekerjaan itu
// milik admin, di panel /admin. Petugas lapangan tidak memegangnya — dulu ia
// bisa, dan itu berarti setiap ponsel petugas adalah tombol cetak saldo yang
// berjalan-jalan di parkiran.
//
// Halamannya tidak dihapus karena petugaslah yang berdiri di depan pengguna
// saat pengguna bertanya "top up saya kok belum masuk?". Di sini ia bisa
// melihat permintaannya memang tercatat dan sedang menunggu admin — tanpa
// bisa menyentuhnya. Pagar sesungguhnya ada di firestore.rules (/topups
// hanya boleh di-update isAdmin(), users.wallet hanya boleh dinaikkan admin);
// layar ini sekadar tidak menawarkan tombol yang pasti ditolak server.
// ============================================================
// Jam:menit:detik + tanggal singkat — sama dengan yang dibaca admin, supaya
// petugas dan admin menyebut permintaan yang sama dengan patokan yang sama.
const jamDetik = (ts) => new Date(ts).toLocaleString("id-ID",
  { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

// "3 menit lalu" — yang menua patut disebutkan ke admin, karena di ujung sana
// ada orang yang uangnya sudah keluar tapi saldonya belum bertambah.
function usia(ts) {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 1) return "baru saja";
  if (m < 60) return m + " menit lalu";
  const j = Math.floor(m / 60);
  return j < 24 ? j + " jam lalu" : Math.floor(j / 24) + " hari lalu";
}

export async function topupPetugasPage(view) {
  const listEl = h("div.pad");

  view.append(
    appHeader({ title: "Antrean Top Up", sub: "Pantauan — disetujui oleh admin", icons: false }),
    h("div.pad", { style: "padding-bottom:0" }, [
      h(".card.pad", { style: "background:rgba(59,130,246,.10)" }, [
        h("p", { style: "font-size:.82rem;line-height:1.6", html:
          "<b>Hanya admin yang menyetujui top up.</b> Halaman ini menampilkan permintaan yang sedang " +
          "menunggu supaya Anda bisa memastikan permintaan pengguna sudah tercatat. Bila sudah lama " +
          "menunggu, teruskan ke admin — pencocokan mutasi merchant dilakukan di panel admin." }),
      ]),
    ]),
    listEl,
  );

  const unsub = DB.topups.subscribePending((list) => {
    listEl.innerHTML = "";
    if (!list.length) {
      listEl.append(h(".empty", {}, [h(".ic", { text: "💠" }), h("p", { text: "Tidak ada permintaan top up yang menunggu." })]));
      return;
    }

    list.forEach(t => listEl.append(h(".li", {}, [
      h(".ic", { style: "background:rgba(59,130,246,.18)", text: "💠" }),
      h("div", { style: "flex:1;min-width:0" }, [
        h(".t", { text: rupiah(t.amount) + " · " + (t.name || t.uid.slice(0, 8)) }),
        h(".s", { text: "QRIS · " + jamDetik(t.createdAt) + " · " + usia(t.createdAt) }),
      ]),
      // .warn, bukan pill polos: "menunggu" adalah keadaan yang harus terbaca
      // sekilas — dan nowrap supaya labelnya tidak pecah dua baris di ponsel.
      h("span.pill.warn", { style: "flex:0 0 auto;white-space:nowrap;font-size:.78rem", text: "Menunggu admin" }),
    ])));
  });

  return () => { unsub && unsub(); };
}

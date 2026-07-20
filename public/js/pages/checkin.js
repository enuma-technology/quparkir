import { h, $, toast } from "../util.js";
import { DB } from "../data.js";
import { Auth } from "../auth.js";
import { pageHeader } from "../parts.js";
import { go, queryParam } from "../router.js";
import { startScanner } from "../qr.js";

export default async function checkinPage(view) {
  const u = Auth.current();
  let vehicles = [], locs = [];
  let selVeh = null, selLoc = queryParam("loc");

  const vehWrap = h(".seg");
  const locSel = h("select.input");
  const readerWrap = h("div", { style: "margin-top:12px" });

  view.append(
    pageHeader("Check-in Parkir"),
    h("div.pad", {}, [
      h("h3", { style: "margin-bottom:10px", text: "1. Pilih Kendaraan" }), vehWrap,
      h("h3", { style: "margin:18px 0 8px", text: "2. Pilih Lokasi Parkir" }),
      h("label.field", {}, [h("span", { text: "Kantong parkir" }), locSel]),
      h("button.btn.ghost", { onclick: scan }, "📷 Scan QR Lokasi (opsional)"), readerWrap,
      h("button.btn", { id: "doCheckin", style: "margin-top:18px", onclick: submit }, "🅿️ Check-in Sekarang"),
      h("p.center.muted", { html: "<small>Sistem akan menolak jika Anda masih punya sesi parkir aktif (anti double-parking).</small>" }),
    ]),
  );

  // muat data
  const unsubV = DB.vehicles.subscribe(u.uid, (vs) => { vehicles = vs; renderVeh(); });
  const unsubL = DB.locations.subscribe((ls) => { locs = ls; renderLoc(); });

  function renderVeh() {
    vehWrap.innerHTML = "";
    if (!vehicles.length) {
      vehWrap.append(h("div", {}, [h("p.muted", { text: "Belum ada kendaraan." }),
        h("button.btn.sm", { onclick: () => go("#/kendaraan") }, "Tambah kendaraan dulu")]));
      return;
    }
    if (!selVeh) selVeh = vehicles[0].id;
    vehicles.forEach(v => vehWrap.append(
      h("button" + (v.id === selVeh ? ".active" : ""), { onclick: () => { selVeh = v.id; renderVeh(); } },
        [h("span.e", { text: v.type === "mobil" ? "🚙" : "🏍️" }), h("span", {}, [v.plate, h("small", { text: v.type })])])
    ));
  }
  function renderLoc() {
    locSel.innerHTML = "";
    locs.forEach(l => {
      const avail = (l.capMotor - l.occMotor) + (l.capCar - l.occCar);
      const o = h("option", { value: l.id }, `${l.name} — sisa ${avail}`);
      if (l.id === selLoc) o.selected = true;
      locSel.append(o);
    });
    if (!selLoc && locs[0]) selLoc = locs[0].id;
    locSel.onchange = () => (selLoc = locSel.value);
  }

  let stopScan;
  async function scan() {
    if (stopScan) { stopScan(); stopScan = null; }  // matikan kamera lama bila tombol ditekan lagi
    readerWrap.innerHTML = '<div id="reader"></div>';
    try {
      stopScan = await startScanner("reader", (txt) => {
        const raw = String(txt).trim();
        const id = raw.startsWith("QP-LOC:") ? raw.slice("QP-LOC:".length) : raw;
        const l = locs.find(l => l.id === id);
        if (!l) { toast("QR tidak dikenali sebagai lokasi parkir", "err"); return; }
        selLoc = id; renderLoc();
        toast("Lokasi dipilih: " + l.name, "ok");
        if (stopScan) stopScan(); readerWrap.innerHTML = "";
      });
    } catch (e) { readerWrap.innerHTML = ""; toast(e.message, "err"); }
  }

  async function submit() {
    if (!selVeh) return toast("Pilih kendaraan", "err");
    if (!selLoc) return toast("Pilih lokasi", "err");
    const veh = vehicles.find(v => v.id === selVeh);
    $("#doCheckin").disabled = true;
    try {
      await DB.checkin(u.uid, { vehicle: { plate: veh.plate, type: veh.type, name: veh.name || "" }, locationId: selLoc });
      toast("Check-in berhasil 🅿️", "ok");
      go("#/status");
    } catch (e) { toast(e.message, "err"); $("#doCheckin").disabled = false; }
  }

  return () => { unsubV && unsubV(); unsubL && unsubL(); stopScan && stopScan(); };
}

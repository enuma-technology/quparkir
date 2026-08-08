import { h, $, toast } from "../util.js";
import { DB } from "../data.js";
import { Auth } from "../auth.js";
import { pageHeader } from "../parts.js";
import { go, queryParam } from "../router.js";
import { startScanner } from "../qr.js";

// Prefiks yang sama dipakai admin-panel.js:renderQris() saat membuat QR
// per lokasi ("QP-LOC:" + id). Diekstrak di sini supaya kedua sisi tidak
// bisa diam-diam berbeda format.
const LOC_PREFIX = "QP-LOC:";
const parseLocCode = (raw) => {
  const t = String(raw || "").trim();
  if (!t) return null;
  return t.startsWith(LOC_PREFIX) ? t.slice(LOC_PREFIX.length) : t;
};
const isFull = (l) =>
  (((l.capMotor || 0) - (l.occMotor || 0)) + ((l.capCar || 0) - (l.occCar || 0))) <= 0;

export default async function checkinPage(view) {
  const u = Auth.current();
  let vehicles = [], locs = [];
  let selVeh = null, selLoc = queryParam("loc");

  const vehWrap = h(".seg");
  const locSel = h("select.input");
  const scanBtn = h("button.btn.ghost", { type: "button", onclick: toggleScan }, "📷 Scan QR Lokasi (opsional)");
  const readerWrap = h("div", { style: "margin-top:12px" });
  const codeInput = h("input.input", {
    type: "text", placeholder: "atau ketik kode dari petugas, mis. QP-LOC:loc-square",
    autocapitalize: "off", autocorrect: "off",
  });
  const codeBtn = h("button.btn.sm.ghost", { type: "button", onclick: applyCode }, "Terapkan");

  view.append(
    pageHeader("Check-in Parkir"),
    h("div.pad", {}, [
      h("h3", { style: "margin-bottom:10px", text: "1. Pilih Kendaraan" }), vehWrap,
      h("h3", { style: "margin:18px 0 8px", text: "2. Pilih Lokasi Parkir" }),
      h("label.field", {}, [h("span", { text: "Kantong parkir" }), locSel]),
      scanBtn, readerWrap,
      h(".row", { style: "margin-top:10px" }, [codeInput, codeBtn]),
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
      selVeh = null;
      vehWrap.append(h("div", {}, [h("p.muted", { text: "Belum ada kendaraan." }),
        h("button.btn.sm", { onclick: () => go("#/kendaraan") }, "Tambah kendaraan dulu")]));
      return;
    }
    // kendaraan yang sedang dipilih bisa saja terhapus di tab lain
    if (!selVeh || !vehicles.some(v => v.id === selVeh)) selVeh = vehicles[0].id;
    vehicles.forEach(v => vehWrap.append(
      h("button" + (v.id === selVeh ? ".active" : ""), { onclick: () => { selVeh = v.id; renderVeh(); } },
        [h("span.e", { text: v.type === "mobil" ? "🚙" : "🏍️" }), h("span", {}, [v.plate, h("small", { text: v.type })])])
    ));
  }
  function renderLoc() {
    locSel.innerHTML = "";
    // ?loc= dari halaman Cari bisa menunjuk lokasi yang sudah dihapus → jatuhkan ke pilihan pertama
    if (locs.length && !locs.some(l => l.id === selLoc)) selLoc = locs[0].id;
    locs.forEach(l => {
      const avail = ((l.capMotor || 0) - (l.occMotor || 0)) + ((l.capCar || 0) - (l.occCar || 0));
      const full = avail <= 0;
      // opsi penuh tetap terlihat (transparan) tapi tak bisa dipilih dari dropdown —
      // konsisten dengan tombol Check-in yang dinonaktifkan di halaman Cari
      const o = h("option", { value: l.id, disabled: full }, full ? `${l.name} — penuh` : `${l.name} — sisa ${avail}`);
      if (l.id === selLoc) o.selected = true;
      locSel.append(o);
    });
    locSel.onchange = () => (selLoc = locSel.value);
  }

  // Dipakai baik oleh hasil scan kamera maupun input kode manual, supaya
  // kedua jalur memberi pesan dan validasi (lokasi ada? penuh?) yang sama persis.
  function pilihLokasi(id) {
    const l = locs.find(x => x.id === id);
    if (!l) { toast("Kode tidak dikenali sebagai lokasi parkir terdaftar", "err"); return false; }
    if (isFull(l)) { toast(l.name + " sudah penuh — pilih lokasi lain", "err"); return false; }
    selLoc = id; renderLoc();
    toast("Lokasi dipilih: " + l.name, "ok");
    return true;
  }

  function applyCode() {
    const id = parseLocCode(codeInput.value);
    if (!id) return toast("Isi kode lokasinya dulu", "err");
    if (pilihLokasi(id)) codeInput.value = "";
  }
  codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyCode(); } });

  let stopScan, scanning = false;
  // Kamera memindai berkali-kali per detik selagi menyala; tanpa jeda ini,
  // mengarahkannya ke QR yang salah/sudah dikenali akan membanjiri toast.
  let lastMiss = { code: null, at: 0 };

  async function toggleScan() {
    if (scanning) return stopScanning();
    readerWrap.innerHTML = '<div id="reader"></div>';
    scanning = true;
    scanBtn.textContent = "✖️ Batalkan Scan";
    try {
      stopScan = await startScanner("reader", onScanResult);
    } catch (e) {
      stopScanning();
      toast(e.message, "err");
    }
  }
  function stopScanning() {
    scanning = false;
    scanBtn.textContent = "📷 Scan QR Lokasi (opsional)";
    if (stopScan) { stopScan(); stopScan = null; }
    readerWrap.innerHTML = "";
  }
  function onScanResult(raw) {
    const id = parseLocCode(raw);
    if (!id) return;
    const now = Date.now();
    if (id === lastMiss.code && now - lastMiss.at < 2000) return;   // kode gagal yang sama, masih dalam jeda
    if (pilihLokasi(id)) stopScanning();
    else lastMiss = { code: id, at: now };
  }

  async function submit() {
    if (!selVeh) return toast("Pilih kendaraan", "err");
    if (!selLoc) return toast("Pilih lokasi", "err");
    const veh = vehicles.find(v => v.id === selVeh);
    if (!veh) return toast("Kendaraan tidak ditemukan, pilih ulang", "err");
    $("#doCheckin").disabled = true;
    try {
      await DB.checkin(u.uid, { vehicle: { plate: veh.plate, type: veh.type, name: veh.name || "" }, locationId: selLoc });
      toast("Check-in berhasil 🅿️", "ok");
      go("#/status");
    } catch (e) { toast(e.message, "err"); $("#doCheckin").disabled = false; }
  }

  return () => { unsubV && unsubV(); unsubL && unsubL(); stopScan && stopScan(); };
}

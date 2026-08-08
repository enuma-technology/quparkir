import { h, rupiah, toast } from "../util.js";
import { DB } from "../data.js";
import { pageHeader } from "../parts.js";
import { go } from "../router.js";
import { createMap, lotMarker } from "../map.js";

// Titik presisi 6 desimal (± 0,1 m) — Google Maps memotong presisi berlebih,
// dan format apa adanya (mis. -7.56628000000001) bisa ditolak.
const titik = (lat, lng) => Number(lat).toFixed(6) + "," + Number(lng).toFixed(6);
const koordValid = (o) => o && Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lng));

// URL rute Google Maps Universal — pakai koordinat, bukan nama lokasi, supaya
// tujuan tidak salah tebak. `origin` diisi hanya kalau posisi user sudah
// diketahui; kalau kosong, Google Maps memakai lokasi perangkat sendiri.
function ruteURL(loc, dari) {
  if (!koordValid(loc)) return null;
  const q = new URLSearchParams({ api: "1", destination: titik(loc.lat, loc.lng), travelmode: "driving" });
  // place_id (bila kelak diisi) menang atas koordinat & memberi pin resmi Google
  if (loc.placeId) q.set("destination_place_id", loc.placeId);
  if (koordValid(dari)) q.set("origin", titik(dari.lat, dari.lng));
  return "https://www.google.com/maps/dir/?" + q;
}

// jarak haversine (km)
function haversine(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// di bawah 1 km lebih terbaca dalam meter; desimal pakai koma (id-ID)
const jarakText = (km) => km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1).replace(".", ",") + " km";

const chip = (label, nilai) =>
  h("span.chip", {}, nilai == null ? [label] : [label + " ", h("b", { text: String(nilai) })]);

export default async function cariPage(view) {
  const mapEl = h("#map");
  const list = h("div.pad.lots");
  const nearBtn = h("button.btn.sm.ghost", { type: "button", onclick: dekatSaya }, "📍 Dekat Saya");

  view.append(
    pageHeader("Cari Parkir"),
    h("section.map-wrap", {}, [mapEl]),
    h("section.section", {}, [h(".head", {}, [
      h("h2", { text: "Live Slot Terdekat" }),
      nearBtn,
    ])]),
    list,
  );

  let map, markers = [], userPos = null, userMark = null, lastLocs = [];
  try { map = await createMap(mapEl); } catch { mapEl.innerHTML = '<div class="empty">Peta gagal dimuat (cek koneksi).</div>'; }

  // GPS bisa perlu beberapa detik — tombol harus menunjukkan bahwa proses berjalan
  function dekatSaya() {
    if (!navigator.geolocation) { toast("Perangkat ini tidak mendukung lokasi", "err"); return; }
    nearBtn.disabled = true;
    nearBtn.textContent = "Mencari lokasi…";
    const selesai = (label) => { nearBtn.disabled = false; nearBtn.textContent = label; };

    navigator.geolocation.getCurrentPosition((pos) => {
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (map && window.L) {
        if (userMark) map.removeLayer(userMark);
        userMark = L.circleMarker([userPos.lat, userPos.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#2563eb", fillOpacity: 1 }).addTo(map);
        map.flyTo([userPos.lat, userPos.lng], 14);
      }
      renderList(lastLocs);
      selesai("📍 Perbarui lokasi");
    }, (err) => {
      selesai("📍 Dekat Saya");
      toast(err.code === err.PERMISSION_DENIED
        ? "Izin lokasi ditolak — menampilkan semua lokasi"
        : "Lokasi tidak terbaca — menampilkan semua lokasi", "err");
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  // Tetap sinkron di dalam handler klik — window.open yang tertunda oleh await
  // akan diblokir sebagai popup.
  function bukaRute(loc) {
    const url = ruteURL(loc, userPos);
    if (!url) { toast("Koordinat lokasi ini belum tersedia", "err"); return; }
    window.open(url, "_blank", "noopener");
  }

  function lotCard(l) {
    // dokumen Firestore bisa saja ditulis manual & tidak lengkap → jangan sampai render mati
    const capMotor = l.capMotor || 0, capCar = l.capCar || 0;
    const occMotor = l.occMotor || 0, occCar = l.occCar || 0;
    const sisaMotor = Math.max(0, capMotor - occMotor), sisaCar = Math.max(0, capCar - occCar);
    const avail = sisaMotor + sisaCar;
    const cap = capMotor + capCar, pct = cap ? Math.round(((cap - avail) / cap) * 100) : 0;
    const full = avail <= 0;
    const km = userPos && koordValid(l) ? haversine(userPos, l) : null;

    return h("article.lot" + (full ? ".full" : ""), {}, [
      h(".lot-top", {}, [
        h("span.lot-ic", { text: full ? "🚧" : "🅿️" }),
        h(".lot-id", {}, [
          h("h3", { text: l.name }),
          l.address ? h("p", { text: l.address }) : null,
        ]),
        h(".lot-slot", {}, [h("b", { text: String(avail) }), h("small", { text: "slot" })]),
      ]),
      h(".lot-meta", {}, [
        chip("🏍️ Motor", sisaMotor),
        chip("🚗 Mobil", sisaCar),
        chip(rupiah(l.tarif?.motor) + "/jam"),
        km != null ? chip("📍 " + jarakText(km)) : null,
      ]),
      h(".bar", {}, [h("i" + (full ? ".full" : ""), { style: "width:" + pct + "%" })]),
      h(".lot-act", {}, [
        h("button.btn.sm", { type: "button", disabled: full, onclick: () => go("#/checkin?loc=" + l.id) },
          full ? "Penuh" : "Check-in"),
        h("button.btn.sm.ghost", { type: "button", title: "Rute ke " + (l.address || l.name), onclick: () => bukaRute(l) },
          "🧭 Rute"),
      ]),
    ]);
  }

  function renderList(locs) {
    lastLocs = locs;
    // lokasi tanpa koordinat valid tetap tampil, tapi didorong ke bawah daftar
    const jarakKe = (l) => koordValid(l) ? haversine(userPos, l) : Infinity;
    // tanpa posisi user, urut nama supaya daftar tidak berpindah-pindah tiap snapshot
    const items = userPos
      ? [...locs].sort((a, b) => jarakKe(a) - jarakKe(b))
      : [...locs].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "id"));

    list.innerHTML = "";
    if (!items.length) {
      list.append(h(".empty", {}, [h(".ic", { text: "🗺️" }), h("p", { text: "Belum ada lokasi parkir terdaftar." })]));
      return;
    }
    items.forEach(l => list.append(lotCard(l)));
  }

  const unsub = DB.locations.subscribe((locs) => {
    // markers
    // L.marker melempar bila lat/lng bukan angka — saring dulu agar peta tetap hidup
    if (map) { markers.forEach(m => map.removeLayer(m)); markers = locs.filter(koordValid).map(l => lotMarker(map, l, (lot) => map.flyTo([lot.lat, lot.lng], 17))); }
    // list
    renderList(locs);
  });
  return () => unsub && unsub();
}

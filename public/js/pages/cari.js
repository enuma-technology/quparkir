import { h, rupiah, toast } from "../util.js";
import { DB } from "../data.js";
import { pageHeader } from "../parts.js";
import { go } from "../router.js";
import { createMap, lotMarker } from "../map.js";

// jarak haversine (km, 1 desimal via toFixed di pemakai)
function haversine(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export default async function cariPage(view) {
  const mapEl = h("#map");
  const list = h("div.pad");
  view.append(
    pageHeader("Cari Parkir"),
    h("section.map-wrap", {}, [mapEl]),
    h("section.section", {}, [h(".head", {}, [
      h("h2", { text: "Live Slot Terdekat" }),
      h("button.btn.sm", { onclick: () => dekatSaya() }, "📍 Dekat Saya"),
    ])]),
    list,
  );

  let map, markers = [], userPos = null, userMark = null, lastLocs = [];
  try { map = await createMap(mapEl); } catch { mapEl.innerHTML = '<div class="empty">Peta gagal dimuat (cek koneksi).</div>'; }

  function dekatSaya() {
    if (!navigator.geolocation) { toast("Izin lokasi ditolak — menampilkan semua lokasi", "err"); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (map && window.L) {
        if (userMark) map.removeLayer(userMark);
        userMark = L.circleMarker([userPos.lat, userPos.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#2563eb", fillOpacity: 1 }).addTo(map);
        map.flyTo([userPos.lat, userPos.lng], 14);
      }
      renderList(lastLocs);
    }, () => toast("Izin lokasi ditolak — menampilkan semua lokasi", "err"));
  }

  function renderList(locs) {
    lastLocs = locs;
    const items = userPos ? [...locs].sort((a, b) => haversine(userPos, a) - haversine(userPos, b)) : locs;
    list.innerHTML = "";
    items.forEach(l => {
      const avail = (l.capMotor - l.occMotor) + (l.capCar - l.occCar);
      const cap = l.capMotor + l.capCar, pct = Math.round(((cap - avail) / cap) * 100);
      const full = avail <= 0;
      const jarak = userPos ? " · " + haversine(userPos, l).toFixed(1) + " km" : "";
      list.append(h(".li", {}, [
        h(".ic", { text: full ? "🚧" : "🅿️" }),
        h("div", { style: "flex:1" }, [
          h(".t", { text: l.name }),
          h(".s", { text: "Motor " + (l.capMotor - l.occMotor) + " · Mobil " + (l.capCar - l.occCar) + " · " + rupiah(l.tarif.motor) + "/jam" + jarak }),
          h(".bar", {}, [h("i" + (full ? ".full" : ""), { style: "width:" + pct + "%" })]),
        ]),
        h(".end", {}, [
          h("div", { style: "font-weight:800;color:" + (full ? "var(--danger)" : "var(--blue-700)"), text: String(avail) }),
          h(".s", { text: "slot" }),
          h("button.btn.sm", { style: "margin-top:6px", disabled: full, onclick: () => go("#/checkin?loc=" + l.id) }, full ? "Penuh" : "Check-in"),
          h("button.btn.sm.ghost", { style: "margin-top:6px", onclick: () => window.open("https://www.google.com/maps/dir/?api=1&destination=" + l.lat + "," + l.lng, "_blank", "noopener") }, "🧭 Rute"),
        ]),
      ]));
    });
  }

  const unsub = DB.locations.subscribe((locs) => {
    // markers
    if (map) { markers.forEach(m => map.removeLayer(m)); markers = locs.map(l => lotMarker(map, l, (lot) => map.flyTo([lot.lat, lot.lng], 16))); }
    // list
    renderList(locs);
  });
  return () => unsub && unsub();
}

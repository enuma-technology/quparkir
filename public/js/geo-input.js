// ============================================================
// Resolusi input lokasi bebas-format → { lat, lng, address }.
//
// Dipakai admin-panel.js (form Lokasi) supaya admin cukup menempel salah
// satu dari ini, lalu lat/lng & alamat terisi otomatis:
//   • Plus Code penuh      "6P4GCRQ6+22"
//   • Plus Code pendek     "CRQ6+22 Mangkubumen, Kota Surakarta, Jawa Tengah"
//     (butuh teks kota/kecamatan di belakangnya sebagai titik acuan)
//   • URL Google Maps LENGKAP yang memuat koordinat, mis.
//     https://www.google.com/maps/place/.../@-7.5663,110.8281,17z/...
//   • Koordinat mentah     "-7.5663, 110.8281" (hasil salin "Bagikan titik")
//   • Nama tempat/alamat biasa (dicari lewat Nominatim/OpenStreetMap)
//
// TIDAK didukung: link pendek (maps.app.goo.gl / goo.gl/maps). Google tidak
// mengizinkan redirect-nya dibaca lintas-origin dari browser (CORS) — tak ada
// cara menerjemahkannya di sisi klien tanpa server proxy. Pesannya menuntun
// admin membuka link itu sendiri lalu menempel URL lengkap dari address bar.
//
// Sumber koordinat Plus Code: vendor/openlocationcode.js (Apache-2.0, Google —
// dijalankan 100% lokal, tanpa jaringan). Sumber alamat/pencarian teks:
// Nominatim (OpenStreetMap) — dipanggil hanya saat admin menekan tombol
// "Terapkan" (bukan tiap ketikan), sesuai kebijakan pemakaian wajar mereka.
// ============================================================
import OpenLocationCode from "./vendor/openlocationcode.js";

const NOMINATIM = "https://nominatim.openstreetmap.org";

async function fetchJSON(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Jaringan bermasalah (HTTP " + res.status + ")");
    return await res.json();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Waktu tunggu habis — coba lagi");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Titik → alamat singkat siap ditaruh di kolom Alamat.
async function reverseAddress(lat, lng) {
  const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`;
  const data = await fetchJSON(url);
  return data?.display_name || "";
}

// Teks bebas (nama tempat/kota) → satu titik referensi.
async function forwardGeocode(query) {
  const url = `${NOMINATIM}/search?format=jsonv2&limit=1&countrycodes=id&q=${encodeURIComponent(query)}`;
  const data = await fetchJSON(url);
  if (!data?.length) throw new Error(`Lokasi "${query}" tidak ditemukan`);
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}

// ---- pola teks yang memuat koordinat siap pakai (tanpa perlu jaringan) ----
const COORD_PATTERNS = [
  /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,          // .../@-7.5663,110.8281,17z (URL Google Maps)
  /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,      // .../data=!3d-7.5663!4d110.8281
  /[?&]q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,     // ...?q=-7.5663,110.8281
  /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/,   // "-7.5663, 110.8281" (koordinat mentah)
];

function extractCoords(text) {
  for (const re of COORD_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

const isShortGmapsLink = (text) => /(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(text);

// Ambil token Plus Code di awal teks + sisanya (nama kota/kecamatan, bila ada).
const OLC_CHARS = "23456789CFGHJMPQRVWXcfghjmpqrvwx";
function splitPlusCode(text) {
  const re = new RegExp(`^([${OLC_CHARS}]{2,8}\\+[${OLC_CHARS}]{0,3})\\s*(.*)$`);
  const m = text.trim().match(re);
  if (!m) return null;
  const code = m[1].toUpperCase();
  return OpenLocationCode.isValid(code) ? { code, rest: m[2].trim() } : null;
}

/**
 * @param {string} raw teks dari kolom "Plus Code / Link Google Maps"
 * @returns {Promise<{lat:number, lng:number, address:string}>}
 */
export async function resolveLocationInput(raw) {
  const text = (raw || "").trim();
  if (!text) throw new Error("Tempel plus code, link Google Maps, atau nama lokasi dulu");

  if (isShortGmapsLink(text)) {
    throw new Error(
      "Link pendek (maps.app.goo.gl) tidak bisa dibaca otomatis dari browser (dibatasi Google). " +
      "Buka link itu di tab baru, lalu tempel URL LENGKAP dari address bar (yang memuat @lat,lng)."
    );
  }

  const coord = extractCoords(text);
  if (coord) {
    const address = await reverseAddress(coord.lat, coord.lng).catch(() => "");
    return { ...coord, address };
  }

  const plus = splitPlusCode(text);
  if (plus) {
    let full = plus.code;
    if (OpenLocationCode.isShort(plus.code)) {
      if (!plus.rest) {
        throw new Error(
          `Kode pendek "${plus.code}" butuh nama kota/kecamatan di belakangnya, ` +
          `mis. "${plus.code} Mangkubumen, Kota Surakarta"`
        );
      }
      const ref = await forwardGeocode(plus.rest);
      full = OpenLocationCode.recoverNearest(plus.code, ref.lat, ref.lng);
    } else if (!OpenLocationCode.isFull(plus.code)) {
      throw new Error("Plus code tidak lengkap — sertakan nama kota di belakangnya");
    }
    const area = OpenLocationCode.decode(full);
    const { latitudeCenter: lat, longitudeCenter: lng } = area;
    const address = await reverseAddress(lat, lng).catch(() => plus.rest);
    return { lat, lng, address };
  }

  // Fallback: perlakukan sebagai nama tempat/alamat biasa.
  const ref = await forwardGeocode(text);
  const address = await reverseAddress(ref.lat, ref.lng).catch(() => text);
  return { ...ref, address };
}

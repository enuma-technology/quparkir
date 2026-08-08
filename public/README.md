# QuParkir — Situs & Aplikasi (public/)

Dua entri terpisah dalam satu hosting:

| URL | Berkas | Isi |
|-----|--------|-----|
| `/` | `index.html` | **Company profile** — landing statis (hero, masalah, fitur, cara kerja, peran, riset, teknologi, FAQ, kontak). Tanpa dependensi eksternal. |
| `/app` | `app.html` | **Aplikasi PWA** — shell + bottom nav + mode switcher (hash router `#/home`, `#/cari`, …). |

Tautan lama berformat `/#/home` otomatis dialihkan ke `/app.html#/home` oleh `js/landing.js`.

Frontend native (HTML/CSS/JS modular), Firebase (Auth/Firestore/Hosting), Leaflet+OSM, multimode UI.

## Menjalankan lokal
```bash
firebase serve            # http://localhost:5000
# atau server statis apa pun dari folder public/:
python3 -m http.server 8080
```

## Mode DEMO vs Firebase
- **DEMO (default):** semua data di `localStorage`. App langsung berfungsi penuh tanpa konfigurasi.
- **Firebase:** isi `js/config.js` dengan **Web SDK config** proyek `quparkir`
  (Console → Project settings → Your apps → SDK setup). App otomatis beralih ke
  Firestore + Firebase Auth (Google/Email/Anonymous). Service account TIDAK dipakai di sisi klien.

## Struktur
```
index.html            company profile (landing) — SEO/OG, CSP ketat, tanpa CDN
app.html              shell aplikasi + bottom nav + mode switcher
404.html              halaman tidak ditemukan (satu bahasa desain dgn landing)
assets/css/           tokens.css (palet biru + 3 mode) · app.css (komponen) · landing.css (compro)
assets/icons/         CREDITS.md (atribusi Flaticon)
assets/logo/          identitas visual — logo1.png (lembar sumber) + turunannya:
                      logo-full(-dark).png (lockup) · logo-mark(-white).png (ikon saja)
                      icon-192/512.png · icon-maskable-512.png · apple-touch-icon.png
                      favicon-16/32.png · og-image.png (1200×630)
js/
  landing.js interaksi compro: nav, reveal, tab peran, counter, redirect tautan lama
  config.js  firebase web config (placeholder) + flag USE_FIREBASE
  data.js    data layer (DEMO localStorage + Firestore) — satu antarmuka
  auth.js    auth (DEMO + Firebase): Google/Email/Anonymous
  map.js     Leaflet + OpenStreetMap
  qr.js      generate (qrcodejs) + scan (html5-qrcode), dengan fallback
  router.js  hash router  · util.js helper  · parts.js header
  app.js     bootstrap, guard role, nav
  pages/     login, home, cari, kendaraan, checkin, status, riwayat, akun, petugas, admin
```

## Fitur yang sudah jalan
Pelanggan: login (3 metode) · home dinamis · cari parkir (peta + live slot) · kendaraan (CRUD) ·
check-in (anti double-parking) · status realtime + e-ticket QR + smart tarif · checkout + struk ·
riwayat · top up saldo (demo).
Petugas: monitoring kendaraan aktif + verifikasi.
Admin: pendapatan hari ini · keterisian · kelola kapasitas kantong parkir · rekap transaksi.

> Ganti peran cepat untuk demo: halaman **Akun → Ganti Peran**.

# Uji integrasi QuParkir

Empat skrip yang membuktikan `firestore.rules` dan alur aplikasi (termasuk Panel Admin
di `admin.html`) **benar-benar bekerja** terhadap Firestore (via emulator resmi
Firebase, bukan mock). Terpisah dari `public/` supaya aplikasi produksi tetap tanpa
dependensi npm.

## Pemasangan (sekali saja)

```bash
cd scripts/test
npm install          # juga mengunduh Chromium untuk Playwright
```

## 1) `rules.mjs` — uji firestore.rules

Menjalankan ulang setiap operasi Firestore yang benar-benar dipakai `public/js/data.js`
(checkin/checkout transaksional, top up, verifikasi petugas, dst) lewat
`@firebase/rules-unit-testing`, dan memastikan rules mengizinkan yang seharusnya
diizinkan serta menolak yang seharusnya ditolak (privilege escalation, self-verify,
baca data orang lain, dll).

```bash
firebase emulators:start --only firestore --project quparkir   # terminal 1
npm run test:rules                                              # terminal 2
```

## 2) `e2e.mjs` — uji end-to-end aplikasi nyata

Membuka **aplikasi sungguhan** (bukan tiruan) lewat Firebase Hosting emulator di
Chromium (Playwright), lalu menjalankan alur penuh: daftar → jadi admin → seed lokasi
lewat Panel Admin (`admin.html`) → daftar sebagai pelanggan → tambah kendaraan →
check-in → anti double-parking → petugas verifikasi e-ticket → check-out & bayar QRIS →
riwayat → top up QuPay → tautan lama `#/admin` diarahkan ke Panel Admin. Setiap langkah
diverifikasi lewat REST API Firestore emulator (bukan cuma tampilan UI), jadi ini
membuktikan data betul-betul tersimpan.

```bash
firebase emulators:start --only auth,firestore,hosting --project quparkir   # terminal 1
npm run test:e2e                                                             # terminal 2
```

Tangkapan layar tiap langkah tersimpan ke `scripts/test/.test-shots/` (di-gitignore).
Set `QP_DEBUG=1` untuk melihat log console browser secara penuh.

## 3) `skeleton.mjs` — uji skeleton loader per halaman

Membuka tiap halaman lalu **me-refresh** browser, dan memastikan yang tampil selama
memuat adalah kerangka halaman itu sendiri (bukan splash generik), serta kerangka
tersebut benar-benar dilepas setelah halaman siap. Ikut memotret tiap kerangka.

```bash
firebase emulators:start --only auth,firestore,hosting --project quparkir   # terminal 1
npm run test:skeleton                                                        # terminal 2
```

## 4) `admin-tab.mjs` — uji tab Panel Admin bertahan setelah refresh

Masuk ke Panel Admin (`admin.html`), berpindah ke tiap tab (Lokasi/Promo/Banner/Export
QRIS), lalu **me-refresh** browser di masing-masing dan memastikan: tab yang sama tetap
aktif setelah refresh (bukan lompat ke Ringkasan), kerangka (skeleton) yang tergambar
sebelum modul admin selesai dimuat sudah menandai tab yang benar — bukan sekadar
kelihatan benar di akhir, tidak pernah ada frame layar kosong, tidak ada frame yang
sempat menandai tab LAIN sebagai aktif, klik tab tidak menumpuk riwayat browser
(`history.replaceState`, bukan `pushState`), dan navigasi hash dari luar (tombol
back/forward, tautan `admin.html#lokasi`) tetap memindah tab lewat listener
`hashchange`.

```bash
firebase emulators:start --only auth,firestore,hosting --project quparkir   # terminal 1
npm run test:admin-tab                                                       # terminal 2
```

## Kenapa lewat emulator, bukan mock

`data.js` memutuskan sendiri apakah memakai backend DEMO (localStorage) atau Firebase
berdasarkan `config.js`. Uji ini menyalakan mode Firebase tapi mengarahkannya ke
emulator lokal (`?emu=1` pada `app.html` MAUPUN `admin.html` — lihat `USE_EMULATOR` di
`public/js/config.js`), sehingga kode yang diuji **persis sama** dengan yang jalan di
`quparkir.web.app`, hanya targetnya diarahkan ke instance lokal. Tidak menyentuh data
produksi sama sekali. **Jangan lupakan `?emu=1`** — tanpanya, di context browser baru
(localStorage kosong) `config.js` diam-diam jatuh ke Firebase **produksi** sungguhan.

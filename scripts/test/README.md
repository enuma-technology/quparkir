# Uji integrasi QuParkir

Dua skrip yang membuktikan `firestore.rules` dan alur aplikasi **benar-benar bekerja**
terhadap Firestore (via emulator resmi Firebase, bukan mock). Terpisah dari `public/`
supaya aplikasi produksi tetap tanpa dependensi npm.

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
Chromium (Playwright), lalu menjalankan alur penuh: daftar → jadi admin → seed lokasi →
daftar sebagai pelanggan → tambah kendaraan → check-in → anti double-parking →
petugas verifikasi e-ticket → check-out & bayar QRIS → riwayat → top up QuPay → guard
peran. Setiap langkah diverifikasi lewat REST API Firestore emulator (bukan cuma
tampilan UI), jadi ini membuktikan data betul-betul tersimpan.

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

## Kenapa lewat emulator, bukan mock

`data.js` memutuskan sendiri apakah memakai backend DEMO (localStorage) atau Firebase
berdasarkan `config.js`. Uji ini menyalakan mode Firebase tapi mengarahkannya ke
emulator lokal (`app.html?emu=1` — lihat `USE_EMULATOR` di `public/js/config.js`),
sehingga kode yang diuji **persis sama** dengan yang jalan di `quparkir.web.app`, hanya
targetnya diarahkan ke instance lokal. Tidak menyentuh data produksi sama sekali.

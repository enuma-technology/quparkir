# 📋 Progress Log — QuParkir

> **Implementasi QuParkir: Pengembangan Sistem Parkir Digital Berbasis E-Ticket dan QR Code untuk Meningkatkan Transparansi Retribusi dan Mengurangi Praktik Parkir Ilegal di Kota Surakarta**

Aturan penulisan log (WAJIB dibaca — mencegah konflik git antar device):

1. **Setiap device hanya menulis di SECTION miliknya sendiri.** Device Riset → bagian `🔬 Riset`. Device Developer → bagian `💻 Developer`. Bagian bersama `🤝 Shared` hanya diubah saat sinkronisasi terjadwal.
2. **Selalu `git pull --rebase` sebelum menulis**, dan **commit + push segera setelah selesai**. Jangan menumpuk perubahan progress berhari-hari.
3. Format entri (paling baru di ATAS section masing-masing):
   `- [YYYY-MM-DD HH:MM] (Device <A|B>) <ringkasan singkat> — <branch> — status: ✅done / 🚧wip / ⛔blocked`
4. Jangan mengedit entri orang lain. Tambah saja entri baru.

---

## 🤝 Shared (milestone & keputusan besar)

- [2026-06-17] (Setup) Repo GitHub `Mostoples/quarkir` + Firebase project `quparkir` terhubung. Hosting, Firestore, Auth (Google/Email/Anonymous) aktif di console. — status: ✅done
- [2026-06-17] (Setup) Batch plan dua-device, SOP workflow, dan sample UI dibuat. — status: ✅done
- [2026-06-17] (Setup) **Sample UI DISETUJUI.** Home direvisi mengikuti layout acuan PARKEE (header sapaan+poin, kartu saldo QuPay, grid menu, carousel promo, kartu terdekat, bottom nav + FAB scan) dengan palet biru + multimode. **Gate terbuka → full-stack build boleh dimulai.** — status: ✅done
- [2026-06-19] (Deploy) QuParkir berhasil di-deploy ke Firebase Hosting. Firestore rules dan indexes aktif. URL: https://quparkir.web.app — status: ✅done
- [2026-06-21] (Build batch 2 — FINAL) **App diselesaikan end-to-end & DEPLOYED**: 🔥 Firebase AKTIF (config.js diisi → mode produksi, bukan demo); 🔒 rules aman (role tak bisa ditulis klien, sesi anti self-verify, occ delta ±1, transaksi tervalidasi) — ter-deploy; 💳 **payment**: pay.js (pilih metode QuPay/QRIS, QRIS simulasi + stub Midtrans Snap gateway-ready), debit saldo nyata + guard anti double-checkout transaksional; 📷 QR fungsional (scan lokasi saat check-in, petugas scan e-ticket → verifikasi, admin generate QR lokasi, KTA digital petugas); ✨ UX (skeleton, CSP, reset password, error Indonesia, font/touch target, SW offline); 📍 geolokasi terdekat + rute Maps; poin nyata; placeholder mati dibersihkan. **Bootstrap admin**: login sekali di app → Firebase Console > Firestore > users/{uid} → tambah field `role: "admin"` → buka Dashboard Admin → tombol "Muat 6 lokasi awal". — status: ✅done
- [2026-06-17] (Device A → handoff) **SLR SELESAI** (PRISMA, 34 studi inti). **Tabel Gap→Fitur untuk Developer** (detail: `research/gap-fitur.md`):
  - **G1 Integrasi end-to-end & kemandirian** → Dashboard Admin realtime + Firestore `onSnapshot` (hindari vendor-lock) · Modul Admin A/H. 🔴
  - **G2 Kota menengah & adopsi** → E-ticket QR + check-in/out + live slot + smart tarif · Modul Pelanggan C/D/F/G/H. 🔴
  - **G3 Verifikasi petugas** → QR identitas petugas (KTA) + status verifikasi · Modul Petugas A/B/D/E. 🟠
  - **G4 Anti-fraud + transparansi** → Anti double-parking + validasi checkout + e-ticket unik + monitoring income · Modul Pelanggan E/F, Petugas F, Admin A/E. 🔴
  - **Prinsip novelty (jangan dipecah):** kesatuan end-to-end (transaksi lapangan ⇄ anti-fraud ⇄ transparansi pemerintah realtime) untuk kota menengah. — status: ✅done

---

## 🔬 Riset (Device A — Peneliti / Systematic Literature Review)

<!-- Tulis entri terbaru tepat di bawah baris ini -->
- [2026-06-17 19:10] (Device A) **SELURUH JOBDESK SLR SELESAI.** Ekstraksi teks-lengkap 5 studi prioritas (E18/E19/E30/E33/E34, abstrak terverifikasi). Gap & novelty FINAL di `docs/RESEARCH.md §6–§7`. Naskah **BAB I** (`research/bab1-pendahuluan.md`) & **BAB II** (`research/bab2-tinjauan-pustaka.md`, daftar pustaka APA 13 referensi terverifikasi). Tabel **Gap→Fitur** (`research/gap-fitur.md`) + ringkasan diserahkan ke section Shared untuk Developer B. Deliverable 1–6 ✅. — branch: `riset` — status: ✅done
- [2026-06-17 18:50] (Device A) Langkah 2–3 SLR: korpus nyata dibangun via Crossref (120 terambil → 114 unik). Screening reproducible → **CORE 27 · CONTEXT 31 · EXCLUDED 56**. +7 seed = **34 studi inti**. PRISMA angka nyata di `research/prisma.md`; korpus+screening di `research/korpus-crossref.md`; ekstraksi 7 seed (penuh) + 27 CORE (metadata) di `research/ekstraksi.md`. Berikutnya: teks-lengkap prioritas (E18/E19/E30/E31) lalu finalisasi gap & novelty. — branch: `riset` — status: 🚧wip
- [2026-06-17 18:35] (Device A) Langkah 1 SLR selesai: **7 seed proposal diverifikasi** (6 ✅ nyata + DOI, 1 ⚠️ kandidat = Shao 2025 perlu konfirmasi). Hasil direkam di `research/protokol-slr.md §6`. Lanjut ke pencarian basis data (langkah 2). — branch: `riset` — status: 🚧wip
- [2026-06-17 18:20] (Device A) Setup branch `riset` + folder `research/`. Protokol SLR formal disusun di `research/protokol-slr.md` (RQ1–4, string pencarian 6 basis data, kriteria inklusi/eksklusi, alur PRISMA, template ekstraksi, quality appraisal, rencana eksekusi). Menunggu persetujuan pemilik sebelum eksekusi pencarian. — branch: `riset` — status: 🚧wip
- [2026-06-17] (Device A) Protokol SLR disiapkan di docs/RESEARCH.md (lihat). Belum mulai screening. — branch: `riset` — status: 🚧wip

---

## 💻 Developer (Device B — Full-stack)

<!-- Tulis entri terbaru tepat di bawah baris ini -->
- [2026-08-26] (Device B) **Akun petugas bisa dibuat & dikelola dari panel /admin** — tab baru "🦺 Petugas": tambah akun (nama/email/sandi), ganti nama & sandi, nonaktifkan/aktifkan, cabut peran (turun jadi pelanggan), hapus permanen. Sebelumnya satu-satunya jalan adalah `scripts/admin/buat-akun.mjs` di komputer yang memegang `.env`, jadi menambah petugas menuntut akses repo. Pekerjaannya TIDAK bisa di browser: `createUserWithEmailAndPassword` ikut mengganti sesi admin yang sedang berjalan, dan `users/{uid}.role` dilarang ditulis klien oleh rules — jadi semuanya lewat function baru `netlify/functions/kelola-petugas.js` (Admin SDK, gerbang: token Firebase + `role == admin` menurut Firestore). **Akun admin ditolak di SETIAP aksi** (tidak bisa diturunkan/dikunci/diganti sandinya dari panel, termasuk milik sendiri); tiap perubahan dicatat ke koleksi `auditPetugas` yang tertutup untuk semua klien. Ditemukan saat menguji: CSP di `admin.html` belum mengizinkan host Netlify Functions — panel akan diblokir peramban di produksi meski kodenya benar; sudah ditambahkan. **Uji: 49 kasus endpoint (`npm run petugas:test`, emulator, tanpa kunci asli) + 13 kasus UI di peramban (`scripts/test/petugas-ui.mjs`, function dijalankan lokal) + 2 kasus rules baru, semuanya lulus**; suite panel lama tetap 26/26. Sisa: deploy Netlify (function baru) + deploy hosting. — branch: `main` — status: 🚧wip
- [2026-08-25] (Device B) **Gateway Midtrans LIVE di sandbox & saldo QuPay dipindah ke server.** Uji end-to-end dari localhost berhasil: Snap terbuka, bayar lewat simulator, webhook menutup sesi. Ditemukan saat itu: `NODE_VERSION=20` meruntuhkan semua function yang menyentuh `firebase-admin/auth` (jose ESM tak bisa di-`require`) → dinaikkan ke 22 + Auth dimuat malas. **Dua function baru**: `create-topup.js` (saldo bertambah lewat webhook, bukan lewat tombol "saya sudah bayar") dan `wallet-checkout.js` (bayar parkir pakai saldo dalam SATU transaksi Firestore — dulu browser menutup sesi & memotong saldo sebagai dua operasi terpisah, jadi sesi bisa ditutup tanpa saldo terpotong). Jalur lama tetap jadi cadangan saat function tak terjangkau. **Uji: 30 webhook + 21 saldo + 38 rules, semuanya lulus** tanpa deploy dan tanpa kunci asli (`npm run midtrans:test`). Sisa: struk yang lebih pantas, lalu nyalakan saklar klien di produksi. — branch: `main` — status: 🚧wip
- [2026-08-25] (Device B) **Function pembayaran Midtrans ditulis — semuanya di belakang saklar, jalur QRIS tidak disentuh.** `netlify/functions/`: `lib/_lib.js` (Firebase Admin + tarif sisi server + `terapkanStatus()` idempoten), `payment-config.js` (menyerahkan Client Key publik ke browser — tidak ada kunci yang perlu disalin ke repo publik), `create-payment.js` (nominal dihitung server dari `checkinAt`, order pending dipakai ulang), `midtrans-webhook.js` (verifikasi tanda tangan sha512 + `timingSafeEqual`), `reconcile.js` (jadwal masih dikomentari). **Saklar ganda**: env `MIDTRANS_ENABLED` di Netlify + `paymentConfig.provider` di config.js — mati salah satu, app mundur sendiri ke QRIS merchant; webhook tetap hidup apa pun keadaannya. Rules: koleksi `orders` baca-saja bagi klien. **Uji: 38 kasus rules (32+2+4) lulus, plus 21 kasus webhook lewat `npm run midtrans:test`** — tanda tangan palsu 403, notifikasi ganda tidak dobel-catat, nominal tidak cocok tidak meluluskan, semuanya di emulator tanpa deploy & tanpa kunci asli. Sisa: deploy + daftarkan Notification URL + uji sandbox end-to-end. — branch: `main` — status: 🚧wip
- [2026-06-19] (Device B) **Halaman Login & Register fungsional** + **Google sign-in AKTIF di produksi.** Isi `public/js/config.js` dgn Web SDK config quparkir → app pakai Firebase asli (Auth Google/Email/Anonymous + Firestore). Seeding lokasi non-fatal pasca-login; `firestore.rules` izinkan locations create/update utk signed-in. **Deploy ke https://quparkir.web.app** (hosting + rules). — branch: `dev`/`main` — status: ✅done
- [2026-06-17] (Device B) **APP FULL-STACK SELESAI (batch 1) di public/.** Shell + design system (palet biru, 3 mode), router hash, data layer (DEMO localStorage + Firebase Firestore satu antarmuka), auth (Google/Email/Anonymous), peta OSM. Halaman: login, home, cari, kendaraan, check-in (anti double-parking), status realtime + e-ticket QR + smart tarif, checkout+struk, riwayat, akun (top up + ganti peran), petugas (verifikasi), admin (income/kapasitas/rekap). firestore.rules diperketat. App jalan tanpa config (mode DEMO). 19 modul lolos node --check. — branch: `dev` — status: ✅done
- [2026-06-17] (Device B) TODO berikutnya: isi js/config.js dgn Web SDK config quparkir untuk aktifkan Firebase asli; integrasi ikon Lottie Flaticon; pembayaran QRIS nyata. — branch: `dev` — status: 🚧wip

---

## 🐞 Issues / Blockers aktif

- [2026-06-17] Service account key `7942ffc758` terekspos di chat → **WAJIB di-rotate** di Google Cloud Console sebelum dipakai untuk CI. — status: ⛔blocked (action: user)

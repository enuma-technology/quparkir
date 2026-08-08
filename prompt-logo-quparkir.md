# Prompt Desain Logo — QuParkir

Salin blok **"PROMPT SIAP PAKAI"** di bawah ini dan kirim langsung ke ChatGPT (mode image generation). Bagian-bagian sesudahnya adalah referensi pendukung kalau kamu ingin memodifikasi promptnya sendiri.

---

## 🎯 PROMPT SIAP PAKAI

```
Buatkan desain logo profesional untuk "QuParkir", sebuah aplikasi PWA sistem
parkir digital berbasis e-ticket QR code untuk Kota Surakarta, Indonesia.

TENTANG BRAND
- Nama: QuParkir (satu kata, "Qu" + "Parkir")
- Tagline: "Parkir Digital"
- Produk: aplikasi web/PWA yang menyatukan check-in QR code, e-ticket digital,
  pembayaran cashless (dompet "QuPay" + QRIS), peta slot parkir real-time, dan
  dashboard transparansi retribusi untuk pemerintah kota.
- Pengguna: warga kota (pelanggan), petugas parkir lapangan, dan dinas
  pemerintah kota (admin/pengawas retribusi).
- Nilai brand: transparan, cepat & modern, tepercaya/anti-fraud, berorientasi
  layanan publik (bukan startup konsumer yang playful, tapi juga bukan kaku
  seperti instansi birokrasi klasik).

ARAH GAYA
- Modern, minimalis, geometris, flat/vector — cocok untuk app icon PWA.
- Kesan "civic-tech": profesional dan tepercaya seperti aplikasi pemerintah/
  fintech, tapi tetap terasa digital dan ringan, bukan formal/berat.
- Gabungkan secara kreatif (pilih satu arah simbol paling kuat, jangan
  memaksakan semua sekaligus):
  1) Huruf "Q" atau "P" yang distilisasi,
  2) Motif kode QR (modul kotak-kotak) yang diintegrasikan halus ke bentuk,
  3) Pin lokasi / marker peta,
  4) Simbol parkir "P" klasik yang dimodernkan.
- HINDARI: ikon mobil/motor literal yang klise, gaya clipart/3D norak, gradien
  yang terlalu ramai, detail rumit yang hilang saat diperkecil ke ukuran
  favicon 32x32 px.

PALET WARNA (wajib dipakai, jangan warna lain)
- Biru utama: #1D4ED8, #2563EB, #3B82F6
- Biru navy gelap (untuk background gelap / varian dark): #0B1B4D, #0A1750
- Aksen cyan/tosca: #06B6D4, #22D3EE
- Aksen emas/kuning (dipakai sangat sedikit, untuk highlight/badge saja): #F6C84C
- Netral: putih #FFFFFF, tinta gelap #0B1220

TIPOGRAFI (jika ada wordmark teks "QuParkir")
- Sans-serif modern, tegas, geometris, bold/extra-bold — mirip Segoe UI,
  Inter, atau Poppins. Huruf harus tetap jelas terbaca di ukuran kecil.

REFERENSI ICON LAMA (untuk konteks, BUKAN untuk ditiru mentah-mentah)
- Saat ini app icon sementara hanya kotak biru rounded (#1D4ED8) dengan huruf
  "P" putih tebal di tengah — ini placeholder darurat, bukan logo final.
  Tolong buatkan logo yang jauh lebih matang dan orisinal dari sekadar itu.

DELIVERABLE YANG DIMINTA (buatkan beberapa variasi dalam satu gambar/grid)
1. Logo utama: kombinasi ikon/simbol + wordmark "QuParkir" (horizontal lockup).
2. Versi ikon saja (tanpa teks) dalam bentuk persegi dengan sudut membulat
   (rounded square), untuk dipakai sebagai app icon PWA/favicon — harus tetap
   jelas terbaca pada ukuran sekecil 32x32 px.
3. Versi monokrom/1 warna (hitam di atas putih, dan putih di atas gelap) untuk
   kebutuhan cetak atau watermark.
4. Tampilkan logo di atas dua jenis background: putih/terang, dan biru navy
   gelap (#0B1B4D) — untuk memastikan logo tetap kontras di kedua mode.

FORMAT OUTPUT
- Latar belakang transparan atau putih polos per varian.
- Gaya vector flat, garis bersih, siap dikonversi ke SVG.
- Ukuran kanvas persegi (1:1) untuk versi ikon; landscape untuk versi lockup
  horizontal.
```

---

## 📋 Ringkasan referensi (untuk kamu, kalau mau ubah promptnya)

**Brand**
| Item | Isi |
|---|---|
| Nama | QuParkir |
| Tagline | Parkir Digital |
| Kategori | PWA — sistem parkir digital (e-ticket QR, cashless, dashboard retribusi) |
| Studi kasus | Kota Surakarta |
| Target pengguna | Warga (pelanggan), petugas parkir, pemerintah kota |
| Kepribadian brand | Transparan · cepat/modern · tepercaya · layanan publik |

**Palet warna** (dari `assets/css/tokens.css`)
| Token | Hex | Peran |
|---|---|---|
| `--blue-700` | `#1D4ED8` | Warna utama/brand |
| `--blue-600` | `#2563EB` | Aksen gradasi |
| `--blue-500` | `#3B82F6` | Aksen gradasi |
| `--blue-950/900` | `#0B1B4D` / `#13257A` | Background navy gelap |
| `--cyan-500/400` | `#06B6D4` / `#22D3EE` | Aksen sekunder |
| `--gold` | `#F6C84C` | Aksen highlight (sedikit saja) |
| ink/muted | `#0B1220` / `#5B6B8C` | Teks |

**Ikon placeholder saat ini** (di `manifest.webmanifest`, favicon `index.html`/`app.html`): kotak biru rounded `#1D4ED8` sudut 22%, huruf "P" putih bold di tengah — dipakai sebagai icon app sementara, perlu diganti logo final.

**Kebutuhan file setelah logo jadi**
- SVG master (untuk favicon inline & scalable).
- PNG 512×512 dan 192×192 (app icon PWA, sesuai `manifest.webmanifest`).
- Versi horizontal (icon + wordmark) untuk navbar `index.html`/header app.

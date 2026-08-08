# 🔰 PANDUAN NETLIFY UNTUK PEMULA

**Untuk siapa:** Anda sudah punya akun Netlify, dan belum pernah pakai Netlify sebelumnya.
**Tujuan:** menyambungkan proyek QuParkir ke Netlify, supaya nanti kode pembayaran (dari [`PAYMENT-SETUP.md`](./PAYMENT-SETUP.md)) punya "tempat tinggal" untuk berjalan.
**Gaya panduan ini:** klik-klik lewat website Netlify. Tidak pakai perintah terminal yang rumit, kecuali disebutkan sebagai pilihan.

---

## Dulu, pahami dulu 3 istilah ini

Sebelum mulai, tiga kata ini akan sering muncul. Kalau sudah paham ini, sisanya jauh lebih mudah.

| Istilah | Artinya dalam bahasa sehari-hari |
|---|---|
| **Repository** (repo) | Folder proyek Anda yang tersimpan di GitHub. QuParkir sudah punya ini: `github.com/Mostoples/quarkir` |
| **Deploy** | Proses Netlify "menyalakan" kode Anda supaya bisa diakses lewat internet. Setiap kali Anda mengirim (push) perubahan ke GitHub, Netlify otomatis deploy ulang |
| **Function** (fungsi) | Sepotong kode kecil yang berjalan di server Netlify saat dipanggil — ini yang akan jadi "otak" pembayaran QuParkir (menghitung tarif, memverifikasi Midtrans, dll) |

**Alur besarnya:** Anda menulis kode di komputer → kirim ke GitHub → Netlify otomatis mengambilnya dan menjalankannya. Anda tidak pernah meng-upload apa pun secara manual.

---

## Peta: apa yang sudah dan belum

Supaya tahu sedang di mana:

- [x] Akun Netlify dibuat
- [x] Proyek QuParkir sudah punya repo di GitHub
- [ ] **← Anda di sini.** Repo belum disambungkan ke Netlify
- [ ] Kunci rahasia (Server Key Midtrans, dll) belum disimpan di Netlify
- [ ] Kode fungsi pembayaran belum ditulis (nanti, dari `PAYMENT-SETUP.md` Langkah 5)
- [ ] Belum diuji coba

Panduan ini menyelesaikan tiga baris pertama yang belum tercentang.

---

## Langkah 1 — Sambungkan repo GitHub ke Netlify

1. Buka [app.netlify.com](https://app.netlify.com) dan masuk dengan akun Anda
2. Klik tombol **Add new site** (atau **Add new project**, tergantung versi tampilan) di kanan atas
3. Pilih **Import an existing project**
4. Pilih **Deploy with GitHub**
5. Kalau ini pertama kali, Netlify akan minta izin mengakses akun GitHub Anda — klik **Authorize Netlify**
6. Cari dan klik repo **`Mostoples/quarkir`** dari daftar

> Kalau repo tidak muncul di daftar: klik **Configure the Netlify app on GitHub**, lalu beri izin akses ke repo `quarkir` secara spesifik (atau ke semua repo, lebih simpel untuk sekarang).

### Isi pengaturan deploy

Netlify akan menampilkan form pengaturan. Isi seperti ini:

| Kolom | Isi dengan |
|---|---|
| **Branch to deploy** | `main` |
| **Base directory** | *(kosongkan)* |
| **Build command** | *(kosongkan)* — QuParkir tidak perlu proses build, filenya sudah jadi HTML/CSS/JS biasa |
| **Publish directory** | `public` |
| **Functions directory** | `netlify/functions` |

7. Klik **Deploy quarkir** (atau **Deploy site**)

Tunggu 1–2 menit. Netlify akan menampilkan progress lalu berubah jadi **"Published"** dengan tanda ✅ hijau.

**Cek keberhasilan:** Netlify memberi Anda alamat website acak, misalnya `https://random-name-12345.netlify.app`. Buka alamat itu — harusnya muncul halaman depan QuParkir (`public/index.html`), persis seperti kalau Anda buka `firebase.json` hosting.

> 💡 Alamat acak itu boleh diganti. Di **Site settings → Domain management → Options → Edit site name**, ganti jadi sesuatu yang lebih mudah diingat, misalnya `quparkir-pay`. Alamatnya jadi `https://quparkir-pay.netlify.app` — ini yang nanti dipakai sebagai `apiBase` di `config.js` (lihat `PAYMENT-SETUP.md` Langkah 6a).

---

## Langkah 2 — Simpan kunci rahasia di Netlify

Ini pengganti berkas `.env` yang disebut di `PAYMENT-SETUP.md`. Daripada lewat terminal, kita isi lewat website — lebih cocok untuk pemula, dan lebih aman karena tidak pernah tersimpan di file lokal yang bisa tidak sengaja ter-commit ke Git.

1. Di dashboard Netlify, buka situs `quparkir` (atau nama yang Anda pilih tadi)
2. Klik **Site configuration** (atau **Site settings**) di menu kiri
3. Klik **Environment variables**
4. Klik **Add a variable → Add a single variable**

Ulangi untuk kelima baris ini, satu per satu:

| Key (nama) | Value (isi) | Didapat dari |
|---|---|---|
| `MIDTRANS_SERVER_KEY` | *(kunci rahasia Midtrans)* | Dashboard Midtrans → Settings → Access Keys — lihat `PAYMENT-SETUP.md` Langkah 2 |
| `MIDTRANS_IS_PRODUCTION` | `false` | Ketik manual — `false` selama masih uji coba (sandbox) |
| `FB_PROJECT_ID` | `quparkir` | Sudah pasti ini, sesuai nama proyek Firebase |
| `FB_CLIENT_EMAIL` | *(dari file JSON service account)* | Firebase Console — lihat `PAYMENT-SETUP.md` Langkah 3 |
| `FB_PRIVATE_KEY` | *(dari file JSON service account)* | Sumber yang sama |

**Khusus `FB_PRIVATE_KEY`:** ini nilai yang panjang dan mengandung banyak baris. Buka file JSON service account, salin **seluruh isi** field `"private_key"` — termasuk tulisan `-----BEGIN PRIVATE KEY-----` dan `-----END PRIVATE KEY-----` di awal-akhirnya — lalu tempel apa adanya ke kolom Value di Netlify. Netlify sudah bisa menerima teks bebaris-baris di sini, tidak perlu diubah formatnya.

> ⚠️ Setelah menambah atau mengubah environment variable, deploy yang **sedang berjalan tidak otomatis memakainya**. Nanti setelah semua terisi, klik **Deploys → Trigger deploy → Deploy site** supaya kunci-kunci ini benar-benar terpakai.

**Kenapa harus disimpan di sini, bukan di kode?** Kalau `MIDTRANS_SERVER_KEY` ditulis langsung di file JavaScript lalu file itu ter-push ke GitHub, siapa pun yang membuka repo Anda (repo ini publik) bisa membaca kuncinya dan berpura-pura jadi Midtrans. Environment variable di Netlify hanya bisa dibaca oleh kode yang berjalan di server Netlify, tidak pernah terlihat di GitHub maupun di browser pengunjung.

---

## Langkah 3 — Menulis dan mengirim kode fungsi

Bagian ini **belum bisa dikerjakan lewat website Netlify** — kode fungsinya (`create-payment.js`, `midtrans-webhook.js`, dst) harus ditulis di komputer Anda dulu, karena isinya kode JavaScript yang cukup panjang.

Kodenya sudah lengkap, siap salin-tempel, di **[`PAYMENT-SETUP.md` bagian "Langkah 5 — Tulis fungsi server"](./PAYMENT-SETUP.md#langkah-5--tulis-fungsi-server)**. Setelah berkas-berkas itu dibuat di folder proyek, kirim ke GitHub dengan perintah berikut di terminal (folder proyek QuParkir):

```bash
git add netlify.toml package.json netlify/
git commit -m "Tambah fungsi pembayaran Midtrans"
git push
```

Begitu `git push` selesai, buka lagi dashboard Netlify — dalam beberapa detik akan muncul deploy baru berjalan otomatis. **Anda tidak perlu melakukan apa pun di Netlify untuk memicunya** — itulah gunanya menyambungkan repo di Langkah 1.

**Cek keberhasilan:**
1. Tab **Deploys** di dashboard Netlify → deploy terbaru berstatus **Published**
2. Tab **Functions** di menu kiri → harus muncul tiga baris: `create-payment`, `midtrans-webhook`, `reconcile`

Kalau tab Functions kosong padahal deploy sukses, kemungkinan besar **Functions directory** di Langkah 1 belum diisi `netlify/functions` dengan benar — perbaiki di **Site configuration → Build & deploy → Continuous deployment**.

---

## Langkah 4 — Setelah ini

Setelah tiga langkah di atas selesai (repo tersambung, kunci tersimpan, fungsi ter-deploy), lanjutkan ke `PAYMENT-SETUP.md` mulai dari:

- **Langkah 6** — ubah kode di `public/js/` supaya aplikasi memanggil fungsi-fungsi ini
- **Langkah 7** — daftarkan alamat webhook (`https://nama-situs-anda.netlify.app/.netlify/functions/midtrans-webhook`) di dashboard Midtrans
- **Langkah 8** — uji coba

---

## Kalau ada yang gagal

| Yang terjadi | Kemungkinan sebab | Yang harus dicek |
|---|---|---|
| Deploy gagal, ada tulisan merah "Failed" | Biasanya salah ketik di `netlify.toml`, atau `package.json` belum ada | Klik deploy yang gagal → **Deploy log** → baca baris merahnya, biasanya jelas letak salahnya |
| Tab Functions kosong | Functions directory salah, atau file JS-nya belum ke-push | Cek `git status` — pastikan file di `netlify/functions/` benar-benar sudah ter-commit |
| Function error "Cannot find module 'firebase-admin'" | `package.json` belum menyertakan `firebase-admin`, atau belum di-install saat build | Pastikan `package.json` ada `"firebase-admin"` di `dependencies`, lalu deploy ulang |
| Fungsi jalan tapi Firestore menolak | Environment variable belum lengkap, atau lupa **Trigger deploy** setelah menambahkannya | Ulangi Langkah 2, terutama bagian "trigger deploy" |
| Halaman depan QuParkir tidak muncul sama sekali | Publish directory bukan `public` | **Site configuration → Build & deploy → Edit settings** |

Cara melihat pesan error lebih detail: menu kiri **Functions** → klik salah satu fungsi → tab **Function log**. Setiap kali fungsi itu dipanggil (atau gagal dipanggil), catatannya muncul di sini.

---

## Istilah lain yang mungkin muncul

| Istilah | Artinya |
|---|---|
| **Site** | Sebutan Netlify untuk "satu proyek yang di-deploy". Satu repo GitHub = biasanya satu site |
| **Build** | Proses menyiapkan kode sebelum ditayangkan. QuParkir tidak perlu ini (tidak ada Build command), tapi fungsi tetap "di-build" ringan untuk menyiapkan dependensinya |
| **Publish directory** | Folder mana yang isinya dijadikan halaman web publik. Untuk QuParkir: `public` |
| **Environment variable** | Nilai rahasia/konfigurasi yang disimpan terpisah dari kode, hanya bisa dibaca server |
| **Netlify CLI** | Cara alternatif mengatur Netlify lewat perintah terminal (`netlify` command), bukan lewat website. **Tidak dibutuhkan** untuk mengikuti panduan ini — semua bisa lewat klik di website |
| **Trigger deploy** | Tombol untuk memaksa Netlify men-deploy ulang tanpa harus ada perubahan kode baru — dipakai saat menambah environment variable |

---

**Ringkasan super singkat kalau Anda hanya butuh urutan perintahnya:**

1. Netlify → Add new site → Import from GitHub → pilih `quarkir` → isi Publish directory `public`, Functions directory `netlify/functions` → Deploy
2. Site settings → Environment variables → isi 5 baris di Langkah 2
3. Tulis kode dari `PAYMENT-SETUP.md` Langkah 5 di komputer → `git push`
4. Cek tab Deploys & Functions di Netlify sampai hijau semua
5. Lanjut `PAYMENT-SETUP.md` Langkah 6

# 🔧 NETLIFY LANJUTAN — dari proyek yang sudah jadi ke backend pembayaran

Panduan ini melanjutkan dari keadaan Anda **sekarang**: proyek Netlify sudah ada
dan sudah menerbitkan situs. Yang belum ada adalah satu pun *function*, dan
itulah sebenarnya alasan Netlify dipakai di proyek ini.

**Hubungan dengan dokumen lain — baca ini dulu supaya tidak bolak-balik:**

| Dokumen | Perannya |
|---|---|
| `NETLIFY-PEMULA.md` | Pengenalan istilah & menyambungkan repo. **Sudah Anda lewati.** |
| **`NETLIFY-LANJUTAN.md`** (ini) | Jembatan: dari proyek kosong → pipa function yang terbukti jalan |
| `PAYMENT-SETUP.md` | Kode function pembayaran yang sesungguhnya (Midtrans) |
| `PAYMENT-GOBIZ.md` | Jalur alternatif: GoBiz Open API di merchant GoPay Anda sendiri |
| `PAYMENT-QRIS-STATIS.md` | Yang sudah berjalan hari ini: QRIS statis → dinamis di browser |

---

## 0. Di mana Anda sekarang

Dibaca dari dasbor Netlify Anda:

| Hal | Keadaan |
|---|---|
| Nama proyek | `quparkir-pay` |
| Alamat | `quparkir-pay.netlify.app` |
| Sumber deploy | GitHub, otomatis tiap `push` ke `main` |
| Deploy produksi terakhir | `main@11e80f9` — *"chore: deploy v7"* |
| Kredit tersisa | **240 dari 300** |
| Folder `netlify/functions/` | **belum ada** |
| `package.json` di akar repo | **belum ada** |

Artinya: Netlify Anda saat ini hanyalah **salinan kedua dari situs statis** —
belum mengerjakan apa pun yang tidak bisa dikerjakan Firebase Hosting.

---

## 1. Putuskan dulu: sekarang situs Anda hidup di dua tempat

Ini yang paling penting sebelum menulis kode apa pun.

| Alamat | Isinya | Dideploy oleh |
|---|---|---|
| `quparkir.web.app` | **terbaru** — QRIS merchant, rules baru, top up via petugas | Firebase CLI (dari komputer) |
| `quparkir-pay.netlify.app` | **tertinggal di 9 Agustus** (`11e80f9`) | Netlify, dari `main` di GitHub |

Keduanya menunjuk ke **Firestore yang sama**. Jadi salinan lama di Netlify itu
bukan sekadar usang — ia aplikasi yang bisa dipakai orang, dengan kode sebelum
lubang keamanannya ditambal.

Ada dua sikap yang benar. Pilih satu, jangan menggantung:

**A. Satukan (disarankan).** Commit lalu push pekerjaan Anda. Kedua salinan jadi
identik, dan `quparkir-pay.netlify.app` berubah dari kembaran usang menjadi
cadangan yang sah. Saat sidang, tunjukkan `quparkir.web.app` saja.

**B. Netlify khusus backend.** Ganti direktori terbit ke folder berisi satu
halaman penunjuk, sehingga Netlify hanya melayani `/.netlify/functions/*`.
Lebih bersih secara arsitektur, tapi menambah pekerjaan hari ini.

Panduan ini memakai **A**, karena Anda sedang dikejar tenggat dan A juga
menyelesaikan masalah lain: selama ini `main` di GitHub belum berisi pekerjaan
Anda, jadi siapa pun yang push akan **menimpa** deploy Firebase dengan versi
lama.

---

## 2. Anggaran kredit — 240 tersisa

Kredit Netlify habis terutama karena dua hal, dan yang pertama mengejutkan
banyak orang:

| Kegiatan | Biaya |
|---|---|
| **Deploy produksi** | **15 kredit** sekali |
| Bandwidth | 20 kredit / GB |
| Web request | 2 kredit / 10.000 |

240 kredit ≈ **16 deploy produksi**. Karena proyek Anda auto-deploy tiap push ke
`main`, kebiasaan "push dulu, lihat hasilnya" akan menghabiskannya dalam
sehari.

**Aturan kerja yang menghemat:**

1. Uji function di komputer dengan `netlify dev` (§7). Gratis, tanpa deploy.
2. Kerjakan di branch, bukan langsung `main`. Deploy preview lebih murah
   daripada deploy produksi.
3. Kumpulkan beberapa perubahan jadi satu push.

Kalau kredit habis, situsnya **ditangguhkan sampai akhir bulan kalender** —
bukan ditagih otomatis. Tidak ada risiko tagihan, tapi ada risiko mati saat
sidang. Karena itu jangan diboroskan.

---

## Langkah 1 — Commit & push pekerjaan yang sudah ada

Sebelum menyentuh Netlify, samakan dulu isi GitHub dengan komputer Anda.

**Periksa dulu bahwa kunci rahasia tidak akan terbawa:**

```bash
cd /mnt/01DCAFA2D1032800/1Works/quarkir
git status --short
git check-ignore -v quparkir-firebase-adminsdk-fbsvc-4ab069b984.json
```

Perintah kedua harus **menjawab dengan nama berkasnya** — artinya `.gitignore`
memang menahannya. Kalau tidak menjawab apa pun, **berhenti**: berkas kunci itu
akan ikut ter-commit dan harus diurus dulu.

> Sudah diperiksa: berkas service account Anda belum pernah masuk riwayat git,
> dan `.gitignore` sudah menahan pola `*-adminsdk-*.json`, `.env`, dan
> `node_modules/`. Jadi aman.

```bash
git add -A
git commit -m "feat: QRIS merchant dinamis, top up lewat konfirmasi petugas, rules diperketat"
git push origin main
```

Push ini memicu **dua** deploy sekaligus: GitHub Actions → Firebase Hosting, dan
Netlify → `quparkir-pay.netlify.app`. Biayanya 15 kredit. Setelah ini kedua
alamat menyajikan kode yang sama.

---

## Langkah 2 — Kerangka function

### 2a. `package.json` di akar repo

Netlify menjalankan `npm install` kalau menemukan berkas ini. Repo Anda belum
punya sama sekali.

```bash
cd /mnt/01DCAFA2D1032800/1Works/quarkir
npm init -y
npm i firebase-admin
```

> Ini **tidak** mengganggu Firebase Hosting. `firebase.json` sudah mengabaikan
> `**/node_modules/**`, dan `package.json` ada di akar repo — bukan di dalam
> `public/`, jadi tidak ikut terbit.

### 2b. `netlify.toml` di akar repo

Berkas ini yang memberi tahu Netlify: situsnya ada di `public/`, tidak perlu
di-build, dan function-nya ada di `netlify/functions/`.

```toml
# Netlify: situs statis + function pembayaran.
# Tanpa 'command' karena proyek ini vanilla ES modules — tidak ada build step.
[build]
  publish = "public"
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "20"

# Jaring pengaman: sapu order 'pending' yang webhook-nya tidak pernah sampai.
# Aktif setelah reconcile.js ada (lihat PAYMENT-SETUP.md §5d).
# [functions."reconcile"]
#   schedule = "@hourly"
```

Cocokkan dengan pengaturan yang sudah tersimpan di dasbor: **Project
configuration → Build & deploy → Build settings**. Kalau di sana *publish
directory* masih kosong atau berbeda, `netlify.toml` akan menang — dan itu yang
kita mau, supaya pengaturannya tercatat di repo, bukan hanya di dasbor.

### 2c. Struktur akhirnya

```
quparkir/
├── netlify.toml            ← baru
├── package.json            ← baru
├── netlify/
│   └── functions/
│       ├── hello.js        ← Langkah 4, sekadar pembuktian
│       ├── _lib.js         ← nanti, dari PAYMENT-SETUP.md §5a
│       ├── create-payment.js
│       ├── midtrans-webhook.js
│       └── reconcile.js
└── public/                 ← situs, tidak berubah
```

---

## Langkah 3 — Kunci Firebase ke environment variable

Function perlu menulis ke Firestore **melewati** `firestore.rules` — itulah
gunanya service account. Kuncinya tidak boleh ada di dalam repo; tempatnya di
environment variable Netlify.

Ambil dari berkas `quparkir-firebase-adminsdk-fbsvc-4ab069b984.json` di akar
repo Anda. Buka dengan editor teks, lalu isi tiga variabel ini:

| Nama variabel | Diambil dari field JSON |
|---|---|
| `FB_PROJECT_ID` | `project_id` → `quparkir` |
| `FB_CLIENT_EMAIL` | `client_email` |
| `FB_PRIVATE_KEY` | `private_key` — **seluruhnya**, termasuk baris `-----BEGIN PRIVATE KEY-----` dan `-----END PRIVATE KEY-----` |
| `ALLOWED_ORIGIN` | `https://quparkir.web.app` |

Pasang lewat dasbor: **Project configuration → Environment variables → Add a
variable**. Atau lewat CLI:

```bash
npm i -g netlify-cli
netlify login
netlify link                      # sambungkan folder ini ke proyek quparkir-pay
netlify env:set FB_PROJECT_ID quparkir
netlify env:set FB_CLIENT_EMAIL "firebase-adminsdk-...@quparkir.iam.gserviceaccount.com"
netlify env:set ALLOWED_ORIGIN "https://quparkir.web.app"
```

**Khusus `FB_PRIVATE_KEY`** — isinya panjang dan berbaris-baris. Lewat dasbor,
tempel apa adanya; Netlify menerima teks multibaris. Kalau lewat CLI atau `.env`,
tulis dalam tanda kutip dengan `\n` sebagai penanda baris:

```
FB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

Lalu di dalam kode, pulihkan barisnya:

```js
privateKey: process.env.FB_PRIVATE_KEY.replace(/\\n/g, "\n")
```

> ⚠️ Menambah environment variable **tidak** otomatis dipakai deploy yang sudah
> berjalan. Setelah semua terisi: **Deploys → Trigger deploy → Deploy site**.
> Ini 15 kredit lagi, jadi isi semuanya dulu, baru sekali trigger.

---

## Langkah 4 — Buktikan pipanya jalan sebelum menyentuh uang

Jangan langsung menulis function pembayaran. Buat dulu satu function sepele yang
hanya menjawab "hidup", dan pastikan ia benar-benar bisa dipanggil. Kalau
langkah ini dilewati, setiap kegagalan nanti punya lima kemungkinan sebab dan
Anda akan menebak-nebak.

Berkas `netlify/functions/hello.js`:

```js
// Function uji. Tugasnya cuma satu: membuktikan bahwa netlify.toml,
// package.json, environment variable, dan kredensial Firebase sudah benar
// SEBELUM ada uang yang terlibat.
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = getApps()[0] || initializeApp({
  credential: cert({
    projectId: process.env.FB_PROJECT_ID,
    clientEmail: process.env.FB_CLIENT_EMAIL,
    privateKey: (process.env.FB_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  }),
});

export default async () => {
  const cek = {
    ok: true,
    waktuServer: new Date().toISOString(),
    envTerpasang: {
      FB_PROJECT_ID: !!process.env.FB_PROJECT_ID,
      FB_CLIENT_EMAIL: !!process.env.FB_CLIENT_EMAIL,
      FB_PRIVATE_KEY: !!process.env.FB_PRIVATE_KEY,
    },
  };
  // Baca satu dokumen: bukti bahwa kredensialnya benar-benar diterima Firestore,
  // bukan sekadar variabelnya tidak kosong.
  try {
    const snap = await getFirestore(app).collection("locations").limit(1).get();
    cek.firestore = "tersambung (" + snap.size + " dokumen terbaca)";
  } catch (e) {
    cek.ok = false;
    cek.firestore = "GAGAL: " + e.message;
  }
  return Response.json(cek, { status: cek.ok ? 200 : 500 });
};
```

Perhatikan bahwa ia tidak sekadar memeriksa variabelnya terisi — ia benar-benar
membaca satu dokumen. Variabel yang terisi tapi salah nilainya adalah kesalahan
yang paling sering terjadi, dan hanya percobaan baca yang bisa membedakannya.

---

## Langkah 5 — Uji di komputer dulu (gratis)

```bash
cd /mnt/01DCAFA2D1032800/1Works/quarkir
netlify dev
```

Buka `http://localhost:8888/.netlify/functions/hello`. Yang Anda harapkan:

```json
{
  "ok": true,
  "waktuServer": "2026-08-25T...",
  "envTerpasang": { "FB_PROJECT_ID": true, "FB_CLIENT_EMAIL": true, "FB_PRIVATE_KEY": true },
  "firestore": "tersambung (1 dokumen terbaca)"
}
```

`netlify dev` menarik environment variable dari proyek yang sudah di-`link`,
jadi Anda tidak perlu membuat `.env` — tapi kalau mau, buat `.env` di akar repo
(sudah ada di `.gitignore`).

Baru setelah ini hijau, push dan uji versi daringnya:

```bash
curl -s https://quparkir-pay.netlify.app/.netlify/functions/hello | head -20
```

---

## Langkah 6 — Kunci Midtrans sandbox (bisa hari ini)

Ini bagian yang sering disalahpahami, dan menyangkut Anda langsung:

> **Kunci sandbox tidak menunggu persetujuan siapa pun.** Yang sedang diproses
> Midtrans adalah akun **produksi**. Sandbox bisa Anda ambil sekarang, dan
> alurnya 100% sama — hanya uangnya yang tidak nyata.

1. Masuk ke `dashboard.sandbox.midtrans.com`
2. **Settings → Access Keys**
3. Catat **Client Key** dan **Server Key** (keduanya berawalan `SB-Mid-`)

```bash
netlify env:set MIDTRANS_SERVER_KEY "SB-Mid-server-..."
netlify env:set MIDTRANS_CLIENT_KEY "SB-Mid-client-..."
netlify env:set MIDTRANS_IS_PRODUCTION "false"
```

`MIDTRANS_SERVER_KEY` tidak boleh pernah menyentuh `public/`. Ia hanya hidup di
environment variable Netlify dan hanya dibaca dari dalam function.

Dengan sandbox, aplikasi Anda bisa **benar-benar mendeteksi pembayaran secara
otomatis** — sesuatu yang tidak akan pernah bisa dilakukan QRIS statis. Untuk
naskah, ini jauh lebih kuat: yang Anda demokan adalah arsitektur yang benar,
dengan catatan bahwa kuncinya masih sandbox sambil menunggu persetujuan
produksi.

---

## Langkah 7 — Function pembayaran yang sesungguhnya

Kodenya sudah tertulis lengkap dan tinggal disalin dari `PAYMENT-SETUP.md`:

| Berkas | Bagian | Tugasnya |
|---|---|---|
| `netlify/functions/_lib.js` | §5a | Init Firebase Admin, CORS, verifikasi ID token |
| `netlify/functions/create-payment.js` | §5b | Hitung tarif **di server**, buat order & token Snap |
| `netlify/functions/midtrans-webhook.js` | §5c | Verifikasi tanda tangan, tandai lunas |
| `netlify/functions/reconcile.js` | §5d | Sapu order yang webhook-nya tak sampai |

URL webhook yang didaftarkan di dasbor Midtrans (**Settings → Configuration →
Payment Notification URL**):

```
https://quparkir-pay.netlify.app/.netlify/functions/midtrans-webhook
```

Tiga patokan yang tidak boleh dilanggar, apa pun yang terjadi:

1. **Tarif dihitung di server.** Browser hanya mengirim `sessionId`, tidak
   pernah mengirim nominal.
2. **"Lunas" hanya datang dari webhook yang tanda tangannya terverifikasi.**
   Callback di browser (`onSuccess`) hanya untuk memperbarui tampilan.
3. **Kunci server tidak pernah masuk `public/`.**

---

## 8. Yang sudah tidak perlu Anda kerjakan lagi

`PAYMENT-SETUP.md` **Langkah 1** meminta beberapa perubahan `firestore.rules`.
Sebagian sudah dikerjakan hari ini dengan cara lain — tanpa server sama sekali —
dan sudah ter-deploy serta lulus 33 uji di `scripts/rules-test/`:

| Permintaan di PAYMENT-SETUP.md §1 | Keadaan sekarang |
|---|---|
| 1a — `wallet` jadi tulis-server-saja | **Sudah tertutup dengan cara lain.** Pemilik hanya boleh *mengurangi*; menambah adalah hak petugas lewat `/topups` |
| 1c — `sessions.amount` jangan disentuh klien | **Sudah tertutup.** Rules menghitung sendiri batas bawah tarif dari `checkinAt` + jam server |
| 1b — `transactions` jadi baca-saja | **Sebagian.** Klien masih boleh menulis, tapi nominalnya dicocokkan ke sesi yang dirujuk |
| 1d — koleksi baru `orders` | **Belum.** Ini memang butuh server, kerjakan bersama Langkah 7 |

Kalau nanti `create-payment.js` sudah jalan, 1b baru bisa dijadikan
baca-saja sepenuhnya — saat itu function-lah yang menulis `transactions`,
bukan browser.

---

## 9. Daftar periksa

```
[ ] git status bersih, kunci service account TIDAK ikut ter-commit
[ ] push ke main → Firebase & Netlify menyajikan kode yang sama
[ ] package.json + firebase-admin terpasang
[ ] netlify.toml ada di akar repo, publish = "public"
[ ] 4 environment variable Firebase terpasang di Netlify
[ ] netlify dev → /hello menjawab ok:true DAN firestore tersambung
[ ] versi daring /hello juga ok:true
[ ] kunci Midtrans sandbox terpasang sebagai env var
[ ] _lib.js, create-payment.js, midtrans-webhook.js, reconcile.js disalin
[ ] URL webhook terdaftar di dasbor Midtrans sandbox
[ ] uji bayar sandbox → status jadi lunas TANPA menekan tombol konfirmasi
```

Baris terakhir itu tujuan sesungguhnya dari seluruh dokumen ini: saat status
berubah jadi lunas tanpa ada manusia yang menekan apa pun, barulah pembayaran
Anda benar-benar terekonsiliasi.

---

## 10. Kalau gagal — gejala dan sebabnya

| Gejala | Sebab yang paling sering |
|---|---|
| `404` di `/.netlify/functions/hello` | `netlify.toml` belum ter-push, atau `functions` menunjuk folder yang salah |
| `ok:true` tapi `firestore: "GAGAL: ..."` | `FB_PRIVATE_KEY` barisnya rusak — `\n` belum dipulihkan dengan `.replace()` |
| `envTerpasang` ada yang `false` | Variabel dipasang setelah deploy terakhir. Trigger deploy ulang |
| Jalan di `netlify dev`, mati saat daring | Environment variable hanya ada di `.env` lokal, belum dipasang di dasbor |
| `Cannot find module 'firebase-admin'` | `package.json` belum ter-commit, jadi Netlify tidak menjalankan `npm install` |
| Webhook tidak pernah datang | URL di dasbor Midtrans salah, atau function menolak karena verifikasi tanda tangan gagal |
| Situs Netlify mati mendadak | Kredit habis. Ditangguhkan sampai akhir bulan — lihat §2 |

Untuk melihat apa yang sebenarnya terjadi di dalam function:
**Logs & metrics → Functions** di dasbor Netlify. `console.log` di dalam
function muncul di sana, bukan di console browser.

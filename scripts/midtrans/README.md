# Uji function pembayaran (tanpa deploy)

Menguji `netlify/functions/` yang sungguhan — diimpor apa adanya, bukan
tiruannya — terhadap Firestore & Auth Emulator. Tidak menyentuh data produksi,
tidak memerlukan kunci asli, dan tidak membakar kredit Netlify (satu deploy
produksi = 15 kredit).

## Menjalankan

```bash
# terminal 1
firebase emulators:start --only firestore,auth --project quparkir

# terminal 2
npm run midtrans:test
```

| Berkas | Yang dibuktikan |
|---|---|
| `uji-cors.mjs` (25 kasus) | Preflight OPTIONS tiap endpoint: tidak melempar, 204, mengizinkan `localhost:5000` & `quparkir.web.app`, menolak origin asing. Tidak perlu emulator jalan. |
| `uji-webhook.mjs` (30 kasus) | Tanda tangan palsu ditolak 403 · notifikasi ganda tidak mencatat transaksi/saldo dua kali · nominal tidak cocok tidak meluluskan pembayaran · sesi ditutup, slot kembali, `activeSession` dilepas · top up menambah saldo lewat webhook, bukan lewat tombol |
| `uji-saldo.mjs` (21 kasus) | Bayar parkir pakai saldo: tarif dihitung server · saldo kurang tidak memotong sebagian · bayar dua kali ditolak 409 · sesi orang lain 403 · tanpa token 401 |

## Yang dipalsukan, dan yang tidak

Hanya dua hal yang dipalsukan: alamat Firestore/Auth (diarahkan ke emulator)
dan Server Key Midtrans (diisi nilai uji). Selebihnya kode yang sama persis
dengan yang berjalan di produksi — termasuk verifikasi token, aturan
idempotensi, dan seluruh isi `runTransaction()`.

`FIREBASE_AUTH_EMULATOR_HOST` membuat firebase-admin menerima token tak
bertanda tangan, jadi token uji bisa dirakit tanpa kunci apa pun. Akun ujinya
tetap harus dibuat lebih dulu — Auth emulator menolak token milik pengguna yang
tidak ada, dan itu justru salah satu hal yang ingin dibuktikan.

## Kenapa `uji-cors.mjs` ada

Preflight sempat membalas `new Response("", { status: 204 })`, dan itu
**melempar TypeError** — status 204 tidak boleh punya body. Netlify lalu
membalas 502 tanpa header CORS, dan pesan di peramban menyesatkan total:
"No 'Access-Control-Allow-Origin' header", seolah daftar origin-nya yang salah.

Akibatnya seluruh jalur gateway diam-diam mundur ke QRIS merchant selama dua
deploy — dan tidak ada satu uji pun yang menangkapnya, karena semua uji lain
memanggil handler dengan method POST. Peramban selalu mengirim OPTIONS lebih
dulu; uji harus melakukan hal yang sama.

## Dua jebakan yang pernah memakan waktu

1. **Emulator menyimpan data antar-jalan.** Tanpa `bersihkanEmulator()` di
   awal, hitungan seperti "transaksi tercatat 1×" ikut menghitung sisa
   percobaan sebelumnya, dan uji yang benar terlihat gagal.
2. **`checkinAt` tepat N jam lalu bukan N jam.** Durasinya N jam *lebih
   beberapa milidetik*, dan `hitungTarif()` membulatkan ke atas — jadi 5 jam
   pas menghasilkan tarif 6 jam. Uji memakai setengah jam (4,5) supaya
   pembulatannya tidak ambigu.

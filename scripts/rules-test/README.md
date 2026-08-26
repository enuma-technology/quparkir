# Uji firestore.rules

Menjalankan `firestore.rules` melawan Firestore Emulator dan memastikan
lubang-lubang lama benar-benar tertutup — tarif tidak bisa dikarang dari
browser, saldo tidak bisa dinaikkan sendiri, pengguna tidak bisa memverifikasi
sesinya sendiri, permintaan top up tidak bisa disetujui oleh pemintanya, dan
order pembayaran gateway (`/orders`) tidak bisa disetel 'paid' dari browser,
dan petugas tidak bisa membuat sesi parkir atas nama siapa pun.

## Menjalankan

```bash
# terminal 1
firebase emulators:start --only firestore --project quparkir

# terminal 2
cd scripts/rules-test
npm init -y && npm i @firebase/rules-unit-testing firebase
node rules.test.mjs   # 35 kasus izin
node tx.test.mjs      # checkout nyata: 4 dokumen dalam satu runTransaction
node topup.test.mjs   # persetujuan top up nyata (increment saldo)
```

Ketiganya keluar dengan kode 1 bila ada yang gagal, jadi aman dipakai di CI.

## Kenapa ada tx.test.mjs terpisah

`rules.test.mjs` menguji satu tulisan pada satu waktu. Checkout yang
sesungguhnya menulis **empat** dokumen sekaligus di dalam `runTransaction()`,
dan rules mengevaluasi tiap tulisan terhadap keadaan SEBELUM transaksi.
Aturan `transactions` memanggil `get()` ke dokumen sesi, jadi perilakunya di
dalam transaksi harus dibuktikan terpisah — bukan diandaikan.

## Catatan toleransi 2 menit

`msParkir()` di rules mengurangi 120.000 ms sebelum membandingkan tarif. Jam
peramban dan jam server tidak identik, dan ada jeda antara UI menghitung tarif
dengan Firestore mengevaluasi rule. Tanpa toleransi itu, checkout yang jatuh
persis di pergantian jam bisa ditolak — kegagalan yang sangat sulit ditiru
ulang saat demo.

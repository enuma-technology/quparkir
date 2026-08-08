#!/usr/bin/env bash
# deploy.sh — satu-satunya jalur resmi untuk publish ke Firebase Hosting.
#
# SELALU menaikkan versi app (public/version.json + VER di sw.js) SEBELUM
# deploy — lihat scripts/bump-version.mjs untuk alasannya (cache Service
# Worker & browser tidak boleh menahan build lama). Jangan jalankan
# `firebase deploy` langsung untuk perubahan public/ — lewat sini saja,
# supaya versi tidak pernah lupa dinaikkan.
#
# Pemakaian:  ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "1/3 Menaikkan versi app ..."
node scripts/bump-version.mjs

echo "2/3 Deploy ke Firebase Hosting ..."
firebase deploy --only hosting

echo "3/3 Selesai."
echo "Catatan: public/version.json & public/sw.js baru saja berubah (versi naik)."
echo "Commit & push perubahan ini juga, mis.: ./scripts/sync.sh \"chore: deploy vX\""

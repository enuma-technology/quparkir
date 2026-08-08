# deploy.ps1 — satu-satunya jalur resmi untuk publish ke Firebase Hosting (Windows).
#
# SELALU menaikkan versi app (public/version.json + VER di sw.js) SEBELUM
# deploy — lihat scripts/bump-version.mjs untuk alasannya (cache Service
# Worker & browser tidak boleh menahan build lama). Jangan jalankan
# `firebase deploy` langsung untuk perubahan public/ — lewat sini saja.
#
# Pemakaian:  ./scripts/deploy.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "1/3 Menaikkan versi app ..." -ForegroundColor Yellow
node scripts/bump-version.mjs

Write-Host "2/3 Deploy ke Firebase Hosting ..." -ForegroundColor Yellow
firebase deploy --only hosting

Write-Host "3/3 Selesai." -ForegroundColor Green
Write-Host "Catatan: public/version.json & public/sw.js baru saja berubah (versi naik)." -ForegroundColor DarkGray
Write-Host "Commit & push perubahan ini juga, mis.: ./scripts/sync.ps1 `"chore: deploy vX`"" -ForegroundColor DarkGray

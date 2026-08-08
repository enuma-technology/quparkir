// ============================================================
// bump-version.mjs — satu sumber kebenaran versi app, dinaikkan sebelum
// setiap deploy (lihat scripts/deploy.sh).
//
// Kenapa ini perlu: sw.js menyimpan aset (js/css) di Cache Storage dengan
// nama cache `VER`. Selama nama itu tidak berubah, activate() di sw.js
// tidak pernah membersihkannya — aset lama menumpuk di Cache Storage
// pengguna dan (dulu, sebelum firebase.json dibetulkan) HTTP cache browser
// juga menahan js/css sampai 1 jam. Menaikkan VER di sini memaksa:
//   1. Cache Storage lama dibuang total saat SW baru aktif (lihat activate()
//      di sw.js — menghapus semua key selain VER saat ini).
//   2. public/version.json berubah, sehingga panel admin bisa menampilkan
//      build mana yang sedang live (fetch dengan cache:"no-store").
//
// Pemakaian:
//   node scripts/bump-version.mjs        (dipanggil otomatis oleh deploy.sh)
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const VERSION_JSON = path.join(REPO_ROOT, "public", "version.json");
const SW_JS = path.join(REPO_ROOT, "public", "sw.js");

let current = { version: "0" };
try { current = JSON.parse(readFileSync(VERSION_JSON, "utf8")); } catch { /* file belum ada — mulai dari 0 */ }

const next = String((Number(current.version) || 0) + 1);
const buildDate = new Date().toISOString();

writeFileSync(VERSION_JSON, JSON.stringify({ version: next, buildDate }, null, 2) + "\n");

const swSrc = readFileSync(SW_JS, "utf8");
const swNext = swSrc.replace(/const VER = "qp-v\d+";/, `const VER = "qp-v${next}";`);
if (swSrc === swNext) {
  console.error(`Gagal menemukan baris "const VER = \"qp-vN\";" di ${SW_JS} — perbarui manual.`);
  process.exit(1);
}
writeFileSync(SW_JS, swNext);

console.log(`Versi dinaikkan: v${current.version} → v${next}`);
console.log(`  public/version.json  → version: "${next}", buildDate: "${buildDate}"`);
console.log(`  public/sw.js         → const VER = "qp-v${next}";`);

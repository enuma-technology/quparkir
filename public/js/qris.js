// ============================================================
// QRIS (EMVCo QR) — parse, validasi, dan ubah QRIS STATIS → DINAMIS.
//
// QRIS adalah rangkaian TLV (Tag-Length-Value): setiap ruas ditulis sebagai
// tag 2 digit + panjang 2 digit + nilai sepanjang itu. Mengubah statis jadi
// dinamis berarti tiga hal:
//   1. tag 01 (metode inisiasi)  "11" statis → "12" dinamis
//   2. sisipkan tag 54 (nominal) pada posisi urut yang benar
//   3. hitung ulang tag 63 (CRC16) — tanpa ini seluruh QR ditolak pemindai
//
// ⚠️ Yang TIDAK diselesaikan berkas ini: rekonsiliasi. QRIS statis tidak
// membawa order_id, jadi uang yang masuk tidak bisa dihubungkan otomatis ke
// sesi parkir tertentu. Lihat docs/PAYMENT-GOBIZ.md §0.2.
// ============================================================

// CRC-16/CCITT-FALSE — poli 0x1021, init 0xFFFF, tanpa refleksi & tanpa xorout.
// Nilai uji baku: crc16("123456789") === "29B1".
export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Pecah string EMV jadi daftar {tag, value} berurutan sesuai aslinya.
// Melempar galat bila panjangnya tidak konsisten — itu tanda QR terpotong.
export function parseEMV(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const tag = s.slice(i, i + 2);
    const len = parseInt(s.slice(i + 2, i + 4), 10);
    if (tag.length < 2 || Number.isNaN(len)) throw new Error("Format TLV rusak di posisi " + i);
    const value = s.slice(i + 4, i + 4 + len);
    if (value.length !== len) throw new Error("Panjang tidak cocok pada tag " + tag);
    out.push({ tag, value });
    i += 4 + len;
  }
  return out;
}

const enc = (tag, value) => tag + String(value.length).padStart(2, "0") + value;
const build = (items) => items.map((t) => enc(t.tag, t.value)).join("");

// Rakit ulang + tempel CRC baru. Tag 63 selalu jadi ruas terakhir.
function withCRC(items) {
  const body = build(items.filter((t) => t.tag !== "63")) + "6304";
  return body + crc16(body);
}

// Periksa QRIS yang ditempel pengguna. Tidak melempar — kembalikan hasilnya
// supaya UI bisa menampilkan pesan yang berguna.
export function validateQris(raw) {
  // Buang pembungkus baris hasil salin-tempel — TAPI jangan sentuh spasi di
  // dalam nilai: nama merchant & kota (tag 59/60) sah mengandung spasi, dan
  // membuangnya menggeser seluruh offset TLV.
  const s = String(raw || "").replace(/[\r\n\t]+/g, "").trim();
  if (!s) return { ok: false, error: "String QRIS masih kosong." };

  let items;
  try {
    items = parseEMV(s);
  } catch (e) {
    return { ok: false, error: e.message + " — pastikan seluruh string tersalin utuh." };
  }

  const get = (tag) => items.find((t) => t.tag === tag)?.value;
  if (get("00") !== "01") return { ok: false, error: "Bukan QR EMVCo (tag 00 ≠ 01)." };

  const crcTag = get("63");
  if (!crcTag) return { ok: false, error: "Tidak ada tag 63 (CRC) — string kemungkinan terpotong." };

  // CRC dihitung atas SELURUH isi termasuk "6304", tapi tanpa 4 digit CRC-nya
  const expected = crc16(s.slice(0, s.lastIndexOf("6304") + 4));
  if (expected !== crcTag.toUpperCase()) {
    return { ok: false, error: `CRC tidak cocok (tertulis ${crcTag}, seharusnya ${expected}). String salah salin.` };
  }

  const init = get("01");
  return {
    ok: true,
    dinamis: init === "12",
    statis: init === "11",
    merchant: get("59") || "(nama tidak tercantum)",
    kota: get("60") || "",
    // Nominal yang sudah tertanam — ada hanya pada QRIS yang sudah dinamis
    nominal: get("54") ? Number(get("54")) : null,
  };
}

// QRIS STATIS → DINAMIS.
//   staticQris : string QRIS merchant (dari GoPay Merchant / cetakan QRIS)
//   amount     : nominal rupiah, bilangan bulat
//   opts.fee   : { type: "rupiah" | "persen", value: number } — biaya layanan, opsional
//
// Mengembalikan string QRIS baru yang siap digambar jadi QR.
export function toDynamic(staticQris, amount, opts = {}) {
  const s = String(staticQris || "").replace(/[\r\n\t]+/g, "").trim();
  const cek = validateQris(s);
  if (!cek.ok) throw new Error(cek.error);

  const nominal = Math.round(Number(amount));
  if (!Number.isFinite(nominal) || nominal <= 0) throw new Error("Nominal harus lebih dari 0.");
  // Tag 54 dibatasi 13 karakter oleh spesifikasi EMVCo
  if (String(nominal).length > 13) throw new Error("Nominal melebihi batas 13 digit.");

  // Buang ruas yang akan kita tulis ulang; tag 63 ditambahkan lagi oleh withCRC
  const items = parseEMV(s).filter((t) => !["54", "55", "56", "57", "63"].includes(t.tag));

  // 1) Metode inisiasi → dinamis
  const init = items.find((t) => t.tag === "01");
  if (init) init.value = "12";
  else items.unshift({ tag: "01", value: "12" });

  // 2) Susun ruas baru
  const baru = [{ tag: "54", value: String(nominal) }];
  if (opts.fee && Number(opts.fee.value) > 0) {
    if (opts.fee.type === "persen") {
      baru.push({ tag: "55", value: "03" }, { tag: "57", value: String(opts.fee.value) });
    } else {
      baru.push({ tag: "55", value: "02" }, { tag: "56", value: String(Math.round(opts.fee.value)) });
    }
  }

  // 3) Sisipkan pada posisi urut menaik — tag 54 harus mendahului 58 (kode
  //    negara). Menyisipkan asal di ujung membuat sebagian pemindai menolak.
  const posisi = items.findIndex((t) => Number(t.tag) > 54);
  if (posisi === -1) items.push(...baru);
  else items.splice(posisi, 0, ...baru);

  return withCRC(items);
}

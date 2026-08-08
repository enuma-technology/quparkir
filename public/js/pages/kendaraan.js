import { h, $, toast, modal } from "../util.js";
import { DB } from "../data.js";
import { Auth } from "../auth.js";
import { pageHeader, field, setError, busy } from "../parts.js";

// Konfirmasi hapus — pola sama dengan panel admin: modal() + hook _close()
// bawaannya, tanpa perlu state Promise terpisah.
function confirmHapus(v) {
  return modal("Hapus kendaraan?", h("div", {}, [
    h("p.s", { text: `"${v.plate}" akan dihapus dari daftar kendaraan Anda.` }),
    h("div", { style: "display:flex;gap:10px;margin-top:14px" }, [
      h("button.btn.ghost", { type: "button", style: "flex:1", onclick: (e) => e.target.closest(".modal")._close(false) }, "Batal"),
      h("button.btn.danger", { type: "button", style: "flex:1", onclick: (e) => e.target.closest(".modal")._close(true) }, "Hapus"),
    ]),
  ]));
}

export default async function kendaraanPage(view) {
  const u = Auth.current();
  const listEl = h("div.pad");

  const addForm = () => {
    let type = "motor";
    const plate = h("input.input", { placeholder: "AD 1234 XY", style: "text-transform:uppercase" });
    const name = h("input.input", { placeholder: "mis. Vario merah (opsional)" });
    const seg = h(".seg", {}, ["motor", "mobil"].map(t =>
      h("button" + (t === "motor" ? ".active" : ""), { type: "button", onclick: (e) => { type = t; [...seg.children].forEach(c => c.classList.remove("active")); e.currentTarget.classList.add("active"); } },
        [h("span.e", { text: t === "motor" ? "🏍️" : "🚙" }), h("span", {}, [t[0].toUpperCase() + t.slice(1)])])
    ));
    const simpanBtn = h("button.btn", { type: "button" }, "Simpan Kendaraan");

    simpanBtn.addEventListener("click", async () => {
      if (!plate.value.trim()) return setError(plate, "Nomor polisi wajib diisi");
      busy(simpanBtn, true, "Menyimpan…");
      try {
        await DB.vehicles.add(u.uid, { type, plate: plate.value.toUpperCase().trim(), name: name.value.trim() });
        $("#modalHost").innerHTML = ""; toast("Kendaraan ditambahkan", "ok");
      } catch (e) {
        busy(simpanBtn, false, "Simpan Kendaraan");
        toast("Gagal: " + e.message, "err");
      }
    });

    // .fld (bukan field()) — seg bukan satu <input>, hanya label yang senada
    // dengan field lain di bawahnya
    const body = h("div", {}, [
      h(".fld", {}, [h("label.lbl", { text: "Jenis kendaraan" }), seg]),
      field("Nomor polisi", plate),
      field("Nama kendaraan (opsional)", name),
      simpanBtn,
    ]);
    modal("Tambah Kendaraan", body);
  };

  view.append(
    pageHeader("Kendaraan Saya"),
    h("div.pad", {}, [h("button.btn", { onclick: addForm }, "＋ Tambah Kendaraan")]),
    listEl,
  );

  const unsub = DB.vehicles.subscribe(u.uid, (vs) => {
    listEl.innerHTML = "";
    if (!vs.length) { listEl.append(h(".empty", {}, [h(".ic", { text: "🚗" }), h("p", { text: "Belum ada kendaraan. Tambahkan untuk mempermudah check-in." })])); return; }
    vs.forEach(v => {
      const hapusBtn = h("button.btn.sm.danger", {
        onclick: async () => {
          if (!(await confirmHapus(v))) return;
          busy(hapusBtn, true, "Menghapus…");
          try { await DB.vehicles.remove(u.uid, v.id); toast("Kendaraan dihapus", "ok"); }
          catch (e) { busy(hapusBtn, false, "Hapus"); toast("Gagal: " + e.message, "err"); }
        },
      }, "Hapus");
      listEl.append(h(".li", {}, [
        h(".ic", { text: v.type === "mobil" ? "🚙" : "🏍️" }),
        h("div", { style: "flex:1" }, [h(".t", { text: v.plate }), h(".s", { text: (v.name || "—") + " · " + v.type })]),
        hapusBtn,
      ]));
    });
  });
  return () => unsub && unsub();
}

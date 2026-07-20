import { h, $, rupiah, toast, modal } from "../util.js";
import { DB, MODE } from "../data.js";
import { Auth } from "../auth.js";
import { appHeader } from "../parts.js";
import { go, render } from "../router.js";
import { payQRIS } from "../pay.js";

export default async function akunPage(view) {
  const u = Auth.current();
  const bal = await Promise.resolve(DB.wallet.get(u.uid));

  const roleBar = h(".rolebar");
  ["pelanggan", "petugas", "admin"].forEach(r => roleBar.append(
    h("button" + (u.role === r ? ".active" : ""), { onclick: () => { Auth.setRole(r); toast("Peran: " + r, "ok"); render(); } }, r[0].toUpperCase() + r.slice(1))
  ));

  view.append(
    appHeader({ title: "Akun", sub: "Pengaturan & profil", icons: false }),
    h("div.pad", {}, [
      h(".card.pad", { style: "margin-bottom:14px;display:flex;align-items:center;gap:14px" }, [
        h("div", { style: "width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#93c5fd,#2563eb);display:grid;place-items:center;color:#fff;font-weight:800;font-size:1.3rem", text: (u.name || "U")[0].toUpperCase() }),
        h("div", { style: "flex:1" }, [h("h3", { text: u.name }), h("p.muted", { text: u.email || (u.anon ? "Akun tamu" : "—") }),
          h("span.pill.info", { style: "margin-top:6px", text: "Login: " + (u.provider || "—") })]),
      ]),

      h(".card.pad", { style: "margin-bottom:14px" }, [
        h(".row", {}, [h("div", { style: "flex:1" }, [h("h4", { text: "Saldo QuPay" }), h("p.muted", { text: "Untuk pembayaran cashless" })]),
          h("b", { style: "color:var(--blue-700);font-size:1.3rem", text: rupiah(bal) })]),
        h("button.btn.sm", { style: "margin-top:10px", onclick: async () => {
          const inp = h("input.input", { type: "number", placeholder: "50000", value: "50000" });
          modal("Top Up QuPay", h("div", {}, [h("label.field", {}, [h("span", { text: "Nominal (Rp 10.000 – Rp 1.000.000)" }), inp]),
            h("button.btn", { onclick: async () => {
              const amount = Number(inp.value);
              if (!Number.isInteger(amount) || amount < 10000 || amount > 1000000)
                return toast("Nominal harus bilangan bulat 10.000 – 1.000.000", "err");
              $("#modalHost").innerHTML = "";
              const ok = await payQRIS({ amount, title: "Top Up QuPay" });
              if (!ok) return toast("Top up dibatalkan", "err");
              const cur = await Promise.resolve(DB.wallet.get(u.uid));
              await DB.wallet.set(u.uid, cur + amount);
              toast("Top up berhasil", "ok"); render();
            } }, "Top Up")]));
        } }, "＋ Top Up"),
      ]),

      ...(MODE === "demo" ? [h("h4", { style: "margin:6px 4px 8px", text: "Ganti Peran (demo)" }), roleBar] : []),

      h("div", { style: "margin-top:14px" }, [
        u.role !== "pelanggan" ? h("button.btn.ghost", { style: "margin-bottom:10px", onclick: () => go("#/petugas") }, "🦺 Dashboard Petugas") : null,
        u.role === "admin" ? h("button.btn.ghost", { style: "margin-bottom:10px", onclick: () => go("#/admin") }, "🏛️ Dashboard Admin") : null,
        h("button.btn.ghost", { style: "margin-bottom:10px", onclick: () => go("#/kendaraan") }, "🚗 Kendaraan Saya"),
        h("button.btn.danger", { onclick: async () => { await Auth.logout(); } }, "Keluar"),
      ]),
      h("p.center.muted", { style: "margin-top:14px", html: "<small>Backend aktif: <b>" + MODE.toUpperCase() + "</b> · QuParkir Surakarta</small>" }),
    ]),
  );
}

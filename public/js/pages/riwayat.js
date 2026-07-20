import { h, rupiah, durasiLabel, fmtDate } from "../util.js";
import { DB } from "../data.js";
import { Auth } from "../auth.js";
import { appHeader } from "../parts.js";
import { go } from "../router.js";

export default async function riwayatPage(view) {
  const u = Auth.current();
  let tab = "aktivitas";
  const tabs = h(".rolebar");
  const listEl = h("div.pad");
  view.append(appHeader({ title: "Aktivitas", sub: "Riwayat & sesi parkir Anda", icons: true }), tabs, listEl);

  const btns = {};
  ["aktivitas", "history"].forEach(t => {
    btns[t] = h("button" + (t === tab ? ".active" : ""), { onclick: () => setTab(t) }, t === "aktivitas" ? "Aktivitas" : "History");
    tabs.append(btns[t]);
  });
  function setTab(t) {
    tab = t;
    Object.entries(btns).forEach(([k, b]) => b.classList.toggle("active", k === t));
    paint(last);
  }

  let last = [];
  const paint = (sessions) => {
    last = sessions;
    const show = sessions.filter(s => tab === "aktivitas" ? s.status === "active" : s.status === "done");
    listEl.innerHTML = "";
    if (!show.length) {
      listEl.append(h(".empty", {}, [h(".ic", { text: "🗓️" }),
        h("p", { text: tab === "aktivitas" ? "Tidak ada parkir aktif." : "Belum ada riwayat." }),
        tab === "aktivitas" ? h("button.btn", { style: "margin-top:12px", onclick: () => go("#/cari") }, "Cari Parkir") : null]));
      return;
    }
    show.forEach(s => listEl.append(h(".li", { onclick: () => s.status === "active" && go("#/status"), style: s.status === "active" ? "cursor:pointer" : "" }, [
      h(".ic", { text: s.vehicle.type === "mobil" ? "🚙" : "🏍️" }),
      h("div", { style: "flex:1" }, [
        h(".t", { text: s.locationName }),
        h(".s", { text: s.vehicle.plate + " · " + fmtDate(s.checkinAt) }),
        h(".s", { text: s.status === "active" ? "● Sedang berlangsung" : "Durasi " + durasiLabel((s.checkoutAt || Date.now()) - s.checkinAt) }),
      ]),
      h(".end", {}, [
        s.status === "active" ? h("span.pill.warn", { text: "Aktif" }) : h("b", { style: "color:var(--blue-700)", text: rupiah(s.amount || 0) }),
        s.status === "done" && s.method ? h(".s", { text: s.method === "qupay" ? "QuPay" : "QRIS" }) : null,
      ]),
    ])));
  };

  const unsub = DB.sessions.subscribeFor(u.uid, paint);
  return () => unsub && unsub();
}

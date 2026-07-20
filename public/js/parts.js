// Komponen header yang dipakai ulang
import { h, modal } from "./util.js";
import { go } from "./router.js";

function notifModal() {
  modal("Notifikasi", h(".empty", {}, [
    h(".ic", { text: "🔕" }),
    h("p", { text: "Belum ada notifikasi baru." }),
    h(".s", { text: "Pengingat durasi parkir akan hadir di pembaruan berikutnya." }),
  ]));
}

export function appHeader({ title, sub, points, icons = true }) {
  return h(".header", {}, [
    h(".topline", {}, [
      h(".brand", {}, [h("span.pin", { text: "📍" }), "QuParkir"]),
      icons ? h(".h-icons", {}, [
        h("button", { title: "Notifikasi", onclick: notifModal }, "🔔"),
      ]) : null,
    ]),
    h(".greet", {}, [
      h("div", {}, [h("h1", { text: title }), sub ? h("p", { text: sub }) : null]),
      points != null ? h("span.points", { html: "⭐ Poin : " + points }) : null,
    ]),
  ]);
}

export function pageHeader(title, { back = "#/home" } = {}) {
  return h(".header.simple", {}, [
    h(".topline", {}, [
      h("button.back", { onclick: () => go(back) }, "‹"),
      h("h1.title", { text: title }),
    ]),
  ]);
}

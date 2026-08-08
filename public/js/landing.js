// ============================================================
// QuParkir — Company Profile (landing) interactions
// Vanilla JS, tanpa dependensi eksternal. Aman untuk CSP 'self'.
// ============================================================
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---- 0) Kompatibilitas tautan lama: /#/home → /app.html#/home ---------
  // Sebelum ada compro, root adalah aplikasi. Bookmark lama tetap bekerja.
  var APP_ROUTES = ["#/home", "#/login", "#/register", "#/cari", "#/kendaraan",
    "#/checkin", "#/status", "#/riwayat", "#/akun", "#/petugas"];
  var hash = location.hash.split("?")[0];
  if (APP_ROUTES.indexOf(hash) > -1) {
    location.replace("app.html" + location.hash);
    return;
  }

  // ---- 1) Navbar: efek scroll + menu mobile --------------------------------
  var nav = $("#nav");
  var toggle = $("#navToggle");
  var links = $("#navLinks");

  function onScroll() {
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 24);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  function closeMenu() {
    if (!links) return;
    links.classList.remove("open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  if (toggle && links) {
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    $$("a", links).forEach(function (a) { a.addEventListener("click", closeMenu); });
    document.addEventListener("click", function (e) {
      if (links.classList.contains("open") && !links.contains(e.target) && e.target !== toggle) closeMenu();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
    window.addEventListener("resize", function () { if (window.innerWidth > 900) closeMenu(); });
  }

  // ---- 2) Reveal saat scroll ----------------------------------------------
  var revealables = $$(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealables.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var d = parseInt(el.dataset.delay || "0", 10);
        setTimeout(function () { el.classList.add("in"); }, d);
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
    revealables.forEach(function (el) { io.observe(el); });

    // Jaring pengaman: apa pun yang terjadi, konten tidak boleh tersembunyi permanen
    // (mis. viewport sangat tinggi, observer tidak terpicu, atau tab dibuka di background).
    setTimeout(function () {
      revealables.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 1.1) el.classList.add("in");
      });
    }, 2500);
  }

  // ---- 3) Tautan nav aktif mengikuti section ------------------------------
  var navAnchors = $$("#navLinks a[href^='#']");
  var sections = navAnchors
    .map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); })
    .filter(Boolean);

  if (sections.length && "IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navAnchors.forEach(function (a) {
          a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id);
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  // ---- 4) Animasi angka statistik -----------------------------------------
  function animateCount(el) {
    var target = parseFloat(el.dataset.count);
    if (isNaN(target)) return;
    var suffix = el.dataset.suffix || "";
    var decimals = (el.dataset.decimals | 0);
    if (reduceMotion) { el.textContent = target.toFixed(decimals) + suffix; return; }
    var dur = 1400, t0 = null;
    function tick(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  var counters = $$("[data-count]");
  if ("IntersectionObserver" in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        animateCount(en.target);
        cio.unobserve(en.target);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { cio.observe(el); });
  } else {
    counters.forEach(animateCount);
  }

  // ---- 5) Tab peran (Pelanggan / Petugas / Pemerintah) ---------------------
  var tabs = $$("#roleTabs button");
  function selectTab(btn) {
    tabs.forEach(function (b) {
      var on = b === btn;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(b.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
  }
  tabs.forEach(function (btn, i) {
    btn.addEventListener("click", function () { selectTab(btn); });
    btn.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      var next = tabs[(i + d + tabs.length) % tabs.length];
      selectTab(next);
      next.focus();
    });
  });

  // ---- 6) Tahun berjalan di footer ----------------------------------------
  var yr = $("#year");
  if (yr) yr.textContent = new Date().getFullYear();
})();

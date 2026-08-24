// ============================================================
// QuParkir — Company Profile (landing) interactions
// Vanilla JS. Satu-satunya pustaka luar adalah Leaflet untuk peta alamat di
// footer (§7), dan itu pun di-vendor lokal di js/vendor/leaflet/ — jadi
// script-src tetap cukup 'self', tanpa CDN.
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

  // ---- 1.5) Tautan nav aktif mengikuti HALAMAN --------------------------
  // Beda dari #3 di bawah (yang mengikuti SECTION lewat tautan #hash di
  // index.html sendiri): ini untuk tautan antar-berkas (privasi.html,
  // syarat.html, refund.html, index.html) di header yang sama di keempatnya
  // — sebelumnya tak satu pun pernah ditandai aktif.
  //
  // Dicocokkan tanpa ekstensi ".html" karena firebase.json memakai
  // cleanUrls:true — di produksi location.pathname adalah "/privasi", bukan
  // "/privasi.html", walau markup <a href> tetap menulis ekstensinya.
  function pageKey(path) {
    var name = (path.split("/").pop() || "").replace(/\.html$/, "");
    return name || "index";
  }
  if (links) {
    var here = pageKey(location.pathname);
    $$("a[href]", links).forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#") return;   // ditangani scroll-spy #3
      a.classList.toggle("active", pageKey(href.split("#")[0].split("?")[0]) === here);
    });
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

  // ---- 7) Peta alamat di footer (Leaflet + ubin OpenStreetMap) -------------
  // Sengaja BUKAN iframe Google Maps Embed. Embed itu memuat rantai skripnya
  // sendiri (maps.googleapis.com, maps.gstatic.com) dari dalam iframe, dan
  // rantai itu gagal dengan "Permission was denied ... local address space"
  // saat halaman disajikan dari alamat lokal atau saat ada ekstensi peramban
  // yang mengalihkan request Google. Akibatnya kotak peta diam kosong, dan
  // tidak ada yang bisa diperbaiki dari sisi kita — semuanya terjadi di dalam
  // dokumen milik Google.
  //
  // Leaflet di-vendor ke js/vendor/leaflet/ (bukan CDN) supaya script-src
  // tetap 'self'. Satu-satunya request keluar adalah ubin peta OSM berupa
  // <img> biasa dari dokumen kita sendiri — jalur yang jauh lebih pendek dan
  // tidak melibatkan skrip lintas-origin sama sekali. Peta di aplikasi
  // (js/map.js) memakai tumpukan yang sama, jadi ini juga konsisten.
  var mapEl = $("#footMap");

  function mapFailed() {
    mapEl.innerHTML = '<p class="map-fallback">Peta tidak dapat dimuat. ' +
      '<a href="https://maps.app.goo.gl/nmrpRLwFGGMMXayw6" target="_blank" rel="noopener noreferrer">' +
      'Buka di Google Maps</a>.</p>';
  }

  function drawFootMap() {
    var lat = parseFloat(mapEl.getAttribute("data-lat"));
    var lng = parseFloat(mapEl.getAttribute("data-lng"));
    var zoom = parseInt(mapEl.getAttribute("data-zoom") || "16", 10);
    if (isNaN(lat) || isNaN(lng)) { mapFailed(); return; }

    mapEl.innerHTML = "";                 // buang teks "Memuat peta…"
    mapEl.removeAttribute("role");        // kini peta interaktif, bukan gambar statis

    var map = L.map(mapEl, {
      center: [lat, lng], zoom: zoom,
      zoomControl: true, attributionControl: true,
      // Scroll-zoom dimatikan: peta ini duduk di footer, jadi menggulir
      // halaman ke bawah tidak boleh malah men-zoom peta.
      scrollWheelZoom: false
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);
    L.marker([lat, lng]).addTo(map)
      .bindPopup("<b>QuParkir</b><br>Desa Tohudan, Kec. Colomadu");

    // Kotaknya memakai aspect-ratio; ukuran finalnya bisa baru pasti setelah
    // layout footer selesai. invalidateSize mencegah ubin terpotong.
    setTimeout(function () { map.invalidateSize(); }, 200);
  }

  function initFootMap() {
    if (window.L) { drawFootMap(); return; }
    var s = document.createElement("script");
    s.src = "js/vendor/leaflet/leaflet.js";
    s.onload = drawFootMap;
    s.onerror = mapFailed;
    document.head.append(s);
  }

  if (mapEl) {
    // Ditunda sampai footer mendekat: Leaflet ~147 KB dan ubin peta tidak
    // perlu diunduh oleh pengunjung yang tak pernah menggulir sampai bawah.
    if ("IntersectionObserver" in window) {
      var mio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          mio.unobserve(en.target);
          initFootMap();
        });
      }, { rootMargin: "300px 0px" });
      mio.observe(mapEl);
    } else {
      initFootMap();
    }
  }
})();

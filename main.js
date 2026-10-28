/**
 * Pengisi langit + theme toggle.
 * Membuat bintang secara acak, parallax ringan, bintang jatuh,
 * dan pergantian night/day (bulan ↔ matahari).
 */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var THEME_KEY = "glen-theme";

  var LAYERS = [
    { id: "stars-far", count: 140, size: [1.5, 2.6], sparkles: 4, dust: true },
    { id: "stars-mid", count: 72, size: [2, 3.4], sparkles: 5, dust: false },
    { id: "stars-near", count: 24, size: [2.8, 4.2], sparkles: 4, dust: false }
  ];

  var TINTS = ["", "star--gold", "star--aqua"];

  var shootingTimer = null;
  var shootingActive = false;

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  /**
   * Bagian bawah layar tertutup siluet bukit, jadi bintang
   * dipadatkan di dua pertiga atas saja.
   */
  function randomTop() {
    return Math.pow(Math.random(), 1.35) * 72;
  }

  function buildStar(layer, densityScale) {
    var node = document.createElement("span");
    var size = random(layer.size[0], layer.size[1]) * densityScale;
    var isDust = layer.dust && Math.random() < 0.45;

    node.className = "star" + (isDust ? " star--dust" : " " + TINTS[Math.floor(Math.random() * TINTS.length)]);
    node.style.width = size.toFixed(1) + "px";
    node.style.height = size.toFixed(1) + "px";

    if (isDust) {
      node.style.width = node.style.height = random(1, 1.8).toFixed(1) + "px";
    }

    return node;
  }

  function buildSparkle() {
    var node = document.createElement("span");
    node.className = "sparkle" + (Math.random() < 0.5 ? " sparkle--gold" : "");
    var size = random(3.5, 6);
    node.style.width = size.toFixed(1) + "px";
    node.style.height = size.toFixed(1) + "px";
    return node;
  }

  function place(node) {
    node.style.top = randomTop().toFixed(2) + "%";
    node.style.left = random(0, 100).toFixed(2) + "%";
    node.style.animationDelay = random(0, 6).toFixed(2) + "s";
    node.style.animationDuration = random(3.5, 8).toFixed(2) + "s";
  }

  function paintSky() {
    var narrow = window.innerWidth < 720;
    var densityScale = narrow ? 0.8 : 1;

    LAYERS.forEach(function (layer) {
      var host = document.getElementById(layer.id);
      if (!host) return;

      var fragment = document.createDocumentFragment();
      var total = narrow ? Math.round(layer.count * 0.85) : layer.count;

      for (var i = 0; i < total; i++) {
        var star = buildStar(layer, densityScale);
        place(star);
        fragment.appendChild(star);
      }

      for (var j = 0; j < layer.sparkles; j++) {
        var sparkle = buildSparkle();
        place(sparkle);
        fragment.appendChild(sparkle);
      }

      host.replaceChildren(fragment);
    });
  }

  /** Lapisan yang lebih "dekat" bergeser lebih jauh mengikuti kursor. */
  function enableParallax() {
    var layers = Array.prototype.slice.call(document.querySelectorAll(".starfield__layer"));
    if (!layers.length) return;

    window.addEventListener(
      "pointermove",
      function (event) {
        var x = event.clientX / window.innerWidth - 0.5;
        var y = event.clientY / window.innerHeight - 0.5;

        layers.forEach(function (layer) {
          var depth = parseFloat(layer.dataset.depth) || 0;
          layer.style.transform = "translate(" + (-x * depth).toFixed(1) + "px," + (-y * depth).toFixed(1) + "px)";
        });
      },
      { passive: true }
    );
  }

  function isDay() {
    return document.documentElement.getAttribute("data-theme") === "day";
  }

  function clearShootingTimers() {
    if (shootingTimer) {
      window.clearTimeout(shootingTimer);
      shootingTimer = null;
    }
    var node = document.getElementById("shooting-star");
    if (node) node.classList.remove("is-active");
  }

  function scheduleShootingStar() {
    var node = document.getElementById("shooting-star");
    if (!node || shootingActive) return;
    shootingActive = true;

    function launch() {
      if (isDay()) {
        shootingActive = false;
        return;
      }

      node.style.top = random(6, 40).toFixed(1) + "%";
      node.classList.add("is-active");

      shootingTimer = window.setTimeout(function () {
        node.classList.remove("is-active");
        shootingTimer = window.setTimeout(launch, random(7000, 16000));
      }, 1200);
    }

    shootingTimer = window.setTimeout(launch, random(2500, 6000));
  }

  function syncThemeToggle(button) {
    var day = isDay();
    button.setAttribute("aria-pressed", day ? "true" : "false");
    var label = day ? "Switch to night mode" : "Switch to day mode";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  }

  function applyTheme(theme, button) {
    if (theme === "day") {
      document.documentElement.setAttribute("data-theme", "day");
      clearShootingTimers();
      shootingActive = false;
    } else {
      document.documentElement.removeAttribute("data-theme");
      if (!reduceMotion) scheduleShootingStar();
    }

    try {
      window.localStorage.setItem(THEME_KEY, theme === "day" ? "day" : "night");
    } catch (err) {
      /* private mode / blocked storage — ignore */
    }

    if (button) syncThemeToggle(button);
  }

  function enableThemeToggle() {
    var button = document.getElementById("theme-toggle");
    if (!button) return;

    var saved = "night";
    try {
      saved = window.localStorage.getItem(THEME_KEY) || "night";
    } catch (err) {
      saved = "night";
    }

    applyTheme(saved === "day" ? "day" : "night", button);

    button.addEventListener("click", function () {
      applyTheme(isDay() ? "night" : "day", button);
    });
  }

  function stampYear() {
    var slot = document.getElementById("year");
    if (slot) slot.textContent = String(new Date().getFullYear());
  }

  stampYear();
  paintSky();
  enableThemeToggle();

  if (!reduceMotion) {
    enableParallax();
    if (!isDay()) scheduleShootingStar();
  }

  var repaintTimer;
  window.addEventListener("resize", function () {
    window.clearTimeout(repaintTimer);
    repaintTimer = window.setTimeout(paintSky, 350);
  });
})();

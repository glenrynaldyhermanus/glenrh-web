/**
 * Charge Sim: the ShtEV flow, sped up. Pick a charger, scan, pay with a pretend
 * QRIS, plug in within 90 seconds, charge until the quota or a full battery, refund the rest.
 */

const PRICE_PER_KWH = 2500;
const PLUG_TIMEOUT = 90;          // seconds, as in the real system
const PLUG_SPEED = 6;             // the 90 s countdown runs 6x faster here
const SIM_SPEED = 360;            // one real second is six minutes of charging
const BATTERY_KWH = 60;

const CHARGERS = [
  { id: "B2-04", name: "Basement B2, bay 4", place: "Apartemen Taman Sari", kw: 7.4, free: true },
  { id: "L1-01", name: "Lobby, bay 1", place: "Menara Satu office tower", kw: 11, free: true },
  { id: "P3-02", name: "Level 3, bay 2", place: "Mall parking", kw: 7.4, free: false }
];

const AMOUNTS = [25000, 50000, 100000];

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const kwhFmt = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ICON = function (name) { return '<svg class="icon" aria-hidden="true"><use href="/assets/img/icons.svg?v=2#' + name + '"/></svg>'; };

/** A decorative QR-looking grid. It encodes nothing. */
function fakeQr(seed) {
  const n = 25;
  let s = seed;
  const rnd = function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const finder = function (x, y) {
    return '<rect x="' + x + '" y="' + y + '" width="7" height="7" fill="#1d1a2f"/>' +
      '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="5" height="5" fill="#fff"/>' +
      '<rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3" fill="#1d1a2f"/>';
  };
  let cells = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
      if (!inFinder && rnd() > 0.52) cells += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
    }
  }
  return '<svg viewBox="0 0 ' + n + " " + n + '" shape-rendering="crispEdges" aria-hidden="true"><g fill="#1d1a2f">' + cells + "</g>" +
    finder(0, 0) + finder(n - 7, 0) + finder(0, n - 7) + "</svg>";
}

export function mount(main, { narrator }) {
  const app = main.querySelector('[data-app="charge-sim"]');
  if (!app) return;
  const screen = app.querySelector("[data-screen]");
  const walletEl = app.querySelector("[data-wallet]");
  const steps = Array.from(app.querySelectorAll("[data-step]"));

  const st = { wallet: 0, charger: null, amount: 0, session: null };
  let timer = 0;
  let raf = 0;
  let interacted = false;
  screen.addEventListener("click", function () { interacted = true; }, true);

  function stop() { clearTimeout(timer); clearInterval(timer); cancelAnimationFrame(raf); timer = 0; raf = 0; }

  function setStep(name) {
    const order = steps.map(function (s) { return s.dataset.step; });
    const at = order.indexOf(name);
    steps.forEach(function (s, i) {
      s.classList.toggle("is-done", at > i || name === "done");
      if (i === at) s.setAttribute("aria-current", "step");
      else s.removeAttribute("aria-current");
    });
  }

  function wallet(delta) {
    st.wallet += delta;
    walletEl.textContent = rupiah.format(st.wallet);
  }

  function show(html, focusSel) {
    screen.innerHTML = html;
    const f = interacted && screen.querySelector(focusSel || "h3");
    if (f) { if (!f.hasAttribute("tabindex") && f.tagName === "H3") f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); }
  }

  /* 1. Pick a charger */
  function pick() {
    stop();
    setStep("pick");
    show(
      '<h3>Find a charger.</h3><p class="sim__lede">Three wall chargers nearby. One is busy.</p>' +
      '<ul class="chargers">' + CHARGERS.map(function (c) {
        return '<li><button type="button" class="charger" data-charger="' + c.id + '"' + (c.free ? "" : " disabled") + ">" +
          ICON("plug") + "<span><strong>" + c.name + "</strong><small>" + c.place + " \u00b7 " + c.kw + " kW AC</small></span>" +
          '<span class="status">' + (c.free ? "Free" : "In use") + "</span></button></li>";
      }).join("") + "</ul>"
    );
    screen.querySelectorAll("[data-charger]").forEach(function (b) {
      b.addEventListener("click", function () {
        st.charger = CHARGERS.find(function (c) { return c.id === b.dataset.charger; });
        scan();
      });
    });
    narrator.cue({ pose: "walk", say: "Pick a charger. Not the busy one." });
  }

  /* 2. Scan its QR */
  function scan() {
    stop();
    setStep("scan");
    show(
      "<h3>Scanning the charger&rsquo;s QR&hellip;</h3><p class=\"sim__lede\">Hold steady. Charger " + st.charger.id + ".</p>" +
      '<div class="scanner">' + fakeQr(7 + st.charger.id.length * 13) + "</div>"
    );
    narrator.cue({ pose: "read", say: "Beep boop. Scanning." });
    timer = setTimeout(amount, 1600);
  }

  /* 3a. Choose an amount */
  function amount() {
    stop();
    setStep("pay");
    const c = st.charger;
    show(
      "<h3>" + c.name + "</h3><p class=\"sim__lede\">" + c.kw + " kW AC \u00b7 " + rupiah.format(PRICE_PER_KWH) + " per kWh. How much charge?</p>" +
      '<div class="amounts">' + AMOUNTS.map(function (a) {
        return '<button type="button" class="amount" data-amount="' + a + '" aria-pressed="false"><strong>' + rupiah.format(a) + "</strong><small>" + (a / PRICE_PER_KWH) + " kWh</small></button>";
      }).join("") + "</div>" +
      '<div class="form-actions"><button type="button" class="btn btn--primary" data-go disabled>Pay with QRIS</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-back>' + ICON("arrow-left") + " Another charger</button></div>"
    );
    const next = screen.querySelector("[data-go]");
    screen.querySelectorAll("[data-amount]").forEach(function (b) {
      b.addEventListener("click", function () {
        st.amount = Number(b.dataset.amount);
        screen.querySelectorAll("[data-amount]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
        next.disabled = false;
        next.textContent = st.wallet >= st.amount ? "Pay from wallet" : "Pay " + rupiah.format(st.amount) + " with QRIS";
      });
    });
    next.addEventListener("click", function () {
      if (st.wallet >= st.amount) { wallet(-st.amount); plug("Paid from your wallet."); }
      else qris();
    });
    screen.querySelector("[data-back]").addEventListener("click", pick);
  }

  /* 3b. Pretend QRIS */
  function qris() {
    stop();
    show(
      "<h3>Scan to pay.</h3><p class=\"sim__lede\">Any bank or e-wallet app would work here. In this demo, just press the button.</p>" +
      '<div class="qris"><div class="qris__code">' + fakeQr(st.amount) + "</div>" +
      "<dl><div><dt class=\"caps\">Merchant</dt><dd>ShtEV " + st.charger.id + "</dd></div>" +
      "<div><dt class=\"caps\">Amount</dt><dd>" + rupiah.format(st.amount) + "</dd></div>" +
      "<div><dt class=\"caps\">Quota</dt><dd>" + (st.amount / PRICE_PER_KWH) + " kWh</dd></div></dl></div>" +
      '<div class="form-actions"><button type="button" class="btn btn--primary" data-paid>I&rsquo;ve paid (demo)</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-back>' + ICON("arrow-left") + " Change amount</button></div>"
    );
    narrator.cue({ pose: "hey", say: "QRIS. The Indonesian way to pay for anything." });
    const paid = screen.querySelector("[data-paid]");
    paid.addEventListener("click", function () {
      paid.disabled = true;
      paid.textContent = "Confirming\u2026";
      timer = setTimeout(function () { plug("Payment received."); }, 900);
    });
    screen.querySelector("[data-back]").addEventListener("click", amount);
  }

  /* 4. Plug in within 90 seconds */
  function plug(note) {
    stop();
    setStep("plug");
    show(
      "<h3>Plug the cable in.</h3><p class=\"sim__lede\">" + note + " The charger waits " + PLUG_TIMEOUT + " seconds for a cable, then cancels and refunds you.</p>" +
      '<div class="countdown"><div class="countdown__ring" style="--p:100"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="44"/><circle class="fill" cx="50" cy="50" r="44" pathLength="100"/></svg><strong class="tabular" data-left>' + PLUG_TIMEOUT + "</strong></div>" +
      '<p>Seconds left, running ' + PLUG_SPEED + '\u00d7 faster so you don&rsquo;t have to wait.</p></div>' +
      '<div class="form-actions"><button type="button" class="btn btn--primary" data-plug>' + ICON("plug") + " Plug it in</button></div>"
    );
    narrator.cue({ pose: "hey", say: "Quick, plug it in before the timer runs out!" });
    const ring = screen.querySelector(".countdown__ring");
    const left = screen.querySelector("[data-left]");
    const started = performance.now();
    timer = setInterval(function () {
      const elapsed = ((performance.now() - started) / 1000) * PLUG_SPEED;
      const remain = Math.max(0, PLUG_TIMEOUT - elapsed);
      left.textContent = String(Math.ceil(remain));
      ring.style.setProperty("--p", String((remain / PLUG_TIMEOUT) * 100));
      if (remain <= 0) timeout();
    }, 200);
    screen.querySelector("[data-plug]").addEventListener("click", charge);
  }

  function timeout() {
    stop();
    wallet(st.amount);
    setStep("done");
    show(
      "<h3>Cancelled: no cable after " + PLUG_TIMEOUT + " seconds.</h3>" +
      "<p class=\"sim__lede\">Nothing was charged, so the full " + rupiah.format(st.amount) + " went back to your wallet. Next time it pays itself from there.</p>" +
      '<div class="form-actions"><button type="button" class="btn btn--primary" data-again>Try again</button></div>'
    );
    narrator.say("Too slow! Don't worry, the money's back in your wallet.");
    narrator.react("wave");
    screen.querySelector("[data-again]").addEventListener("click", pick);
  }

  /* 5. Charging, with auto-cutoff */
  function charge() {
    stop();
    setStep("charge");
    const quota = st.amount / PRICE_PER_KWH;
    const s = (st.session = { kwh: 0, soc: 28 + Math.round(Math.random() * 30), minutes: 0, speed: 1, live: true });
    const startSoc = s.soc;
    show(
      "<h3>Charging.</h3><p class=\"sim__lede\" data-note>Power stops by itself at " + quota + " kWh or a full battery.</p>" +
      '<div class="gauge"><div class="battery"><div class="battery__fill is-live" style="--soc:' + s.soc + '"></div><span class="battery__label tabular" data-soc>' + s.soc + "%</span></div>" +
      '<div class="quota" aria-hidden="true"><i style="--q:0"></i></div></div>' +
      '<dl class="readout"><div><dt class="caps">Energy</dt><dd data-kwh>0.00 kWh</dd></div><div><dt class="caps">Cost</dt><dd data-cost>' + rupiah.format(0) + '</dd></div><div><dt class="caps">Time</dt><dd data-time>0 min</dd></div></dl>' +
      '<div class="form-actions"><button type="button" class="btn btn--ghost" data-ff aria-pressed="false">Fast-forward</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-unplug>Stop and unplug</button></div>'
    );
    narrator.cue({ pose: "sit", say: "Charging. I'll wait here with a drink." });

    const fill = screen.querySelector(".battery__fill");
    const socEl = screen.querySelector("[data-soc]");
    const q = screen.querySelector(".quota i");
    const kwhEl = screen.querySelector("[data-kwh]");
    const costEl = screen.querySelector("[data-cost]");
    const timeEl = screen.querySelector("[data-time]");
    const ff = screen.querySelector("[data-ff]");

    ff.addEventListener("click", function () {
      s.speed = s.speed === 1 ? 4 : 1;
      ff.setAttribute("aria-pressed", String(s.speed > 1));
      ff.textContent = s.speed > 1 ? "Normal speed" : "Fast-forward";
    });
    screen.querySelector("[data-unplug]").addEventListener("click", function () { finish("unplug"); });

    let last = performance.now();
    function tick(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const simSeconds = dt * SIM_SPEED * s.speed;
      // Slow down above 80% like a real battery.
      const taper = s.soc > 80 ? 0.45 : 1;
      const add = (st.charger.kw * taper * simSeconds) / 3600;
      s.kwh = Math.min(quota, s.kwh + add);
      s.soc = Math.min(100, startSoc + (s.kwh / BATTERY_KWH) * 100);
      s.minutes += simSeconds / 60;

      fill.style.setProperty("--soc", s.soc.toFixed(1));
      socEl.textContent = Math.floor(s.soc) + "%";
      q.style.setProperty("--q", ((s.kwh / quota) * 100).toFixed(1));
      kwhEl.textContent = kwhFmt.format(s.kwh) + " kWh";
      costEl.textContent = rupiah.format(Math.round(s.kwh * PRICE_PER_KWH));
      timeEl.textContent = Math.round(s.minutes) + " min";

      if (s.kwh >= quota - 1e-6) return finish("quota");
      if (s.soc >= 100) return finish("full");
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }

  function finish(reason) {
    stop();
    const s = st.session;
    const cost = Math.min(st.amount, Math.round(s.kwh * PRICE_PER_KWH));
    const refund = st.amount - cost;
    if (refund > 0) wallet(refund);
    setStep("done");
    const title = {
      quota: "Cut off at exactly " + (st.amount / PRICE_PER_KWH) + " kWh.",
      full: "Battery full, power cut off.",
      unplug: "Unplugged early."
    }[reason];
    show(
      "<h3>" + title + "</h3><p class=\"sim__lede\">" +
      (refund > 0 ? "You only pay for what the car took. The rest is in your wallet for next time." : "You got exactly what you paid for, not a watt more.") + "</p>" +
      '<div class="receipt-card"><dl>' +
      "<dt>Paid</dt><dd>" + rupiah.format(st.amount) + "</dd>" +
      "<dt>Energy delivered</dt><dd>" + kwhFmt.format(s.kwh) + " kWh</dd>" +
      "<dt>Battery</dt><dd>" + Math.floor(s.soc) + "%</dd>" +
      "<dt>Charging cost</dt><dd>" + rupiah.format(cost) + "</dd>" +
      '<dt class="is-total">Back to wallet</dt><dd class="is-total">' + rupiah.format(refund) + "</dd>" +
      "</dl></div>" +
      '<div class="form-actions"><button type="button" class="btn btn--primary" data-again>Charge again</button></div>'
    );
    if (reason === "unplug") narrator.cue({ pose: "wave", say: "Leaving already? Your change is in the wallet." });
    else { narrator.say(refund > 0 ? "Full! And you got money back." : "Done. Exactly what you paid for."); narrator.react("dance"); }
    screen.querySelector("[data-again]").addEventListener("click", pick);
  }

  wallet(0);
  pick();
  return stop;
}

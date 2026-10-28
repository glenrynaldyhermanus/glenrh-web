/**
 * Per-page story behaviour: beats that cue the narrator, the ribbon
 * bookmark, footnote popovers, live clocks, copy buttons and the cover.
 * mountStory() returns a cleanup function called before the page turns.
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function makeGhost(node) {
  const g = node.cloneNode(true);
  g.removeAttribute("id");
  g.setAttribute("aria-hidden", "true");
  g.inert = true;
  g.querySelectorAll("[id]").forEach(function (n) { n.removeAttribute("id"); });
  g.querySelectorAll("[data-narrator-slot]").forEach(function (n) { n.removeAttribute("data-narrator-slot"); });
  g.querySelectorAll(".ribbon").forEach(function (n) { n.remove(); });
  g.querySelectorAll(".beat").forEach(function (b) { b.classList.add("is-seen"); });
  g.querySelectorAll("img").forEach(function (n) { n.loading = "eager"; });
  return g;
}

export function mountStory(main, narrator) {
  const cleanups = [];

  /* Beats ---------------------------------------------------------- */
  const beats = Array.from(main.querySelectorAll(".beat, [data-beat]"));
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.classList.add("is-seen");
      if (el.dataset.pose || el.dataset.say) {
        narrator.cue({ pose: el.dataset.pose, say: el.dataset.say });
      }
    });
  }, { rootMargin: "-30% 0px -45% 0px" });
  beats.forEach(function (b) { io.observe(b); });

  // Anything already above the fold reads as seen immediately.
  const seenIo = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) e.target.classList.add("is-seen"); });
  }, { rootMargin: "0px 0px -12% 0px" });
  beats.forEach(function (b) { seenIo.observe(b); });
  cleanups.push(function () { io.disconnect(); seenIo.disconnect(); });

  /* Ribbon bookmark -------------------------------------------------- */
  const ribbon = main.querySelector(".ribbon");
  if (ribbon) {
    let ticking = false;
    const update = function () {
      ticking = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      ribbon.style.setProperty("--progress", p.toFixed(3));
    };
    const onScroll = function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    cleanups.push(function () {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    });
  }

  /* Footnotes: anchor native popovers next to their button. ----------- */
  main.querySelectorAll(".fn-note[popover]").forEach(function (note) {
    const onToggle = function (e) {
      if (e.newState !== "open") return;
      const btn = main.querySelector('[popovertarget="' + note.id + '"]');
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      note.classList.add("is-anchored");
      const w = note.offsetWidth;
      const h = note.offsetHeight;
      let left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
      let top = r.bottom + 10;
      if (top + h > window.innerHeight - 12) top = r.top - h - 10;
      note.style.left = left + "px";
      note.style.top = top + "px";
    };
    note.addEventListener("toggle", onToggle);
    cleanups.push(function () { note.removeEventListener("toggle", onToggle); });
  });

  /* Live Jakarta clocks ---------------------------------------------- */
  const clocks = main.querySelectorAll("[data-clock]");
  if (clocks.length) {
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
    const tick = function () {
      const t = fmt.format(new Date());
      clocks.forEach(function (c) { c.textContent = t; });
    };
    tick();
    const id = setInterval(tick, 20000);
    cleanups.push(function () { clearInterval(id); });
  }

  /* Copy buttons ------------------------------------------------------ */
  main.querySelectorAll("[data-copy]").forEach(function (btn) {
    const label = btn.querySelector("[data-copy-label]") || btn;
    const original = label.textContent;
    const onClick = async function () {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        label.textContent = "Copied to clipboard";
      } catch (_) {
        label.textContent = btn.dataset.copy;
      }
      setTimeout(function () { label.textContent = original; }, 2200);
    };
    btn.addEventListener("click", onClick);
    cleanups.push(function () { btn.removeEventListener("click", onClick); });
  });

  /* The book on the desk -------------------------------------------- */
  const tome = main.querySelector("[data-tome]");
  if (tome) cleanups.push(mountTome(main, tome, narrator));

  return function () { cleanups.forEach(function (fn) { fn(); }); };
}

const clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
const span = function (p, from, to) { return clamp01((p - from) / (to - from)); };
const ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

/* The book on the desk opens as the reader scrolls: the strap slides off,
   the cover swings round the spine until the fold sits mid-screen, then the
   open book grows into the prologue spread tucked underneath it. */
function mountTome(main, tome, narrator) {
  const desk = tome.closest(".desk");
  const stage = tome.querySelector(".tome__stage");
  const book = tome.querySelector(".tome__book");
  const cover = tome.querySelector(".tome__cover");
  const strap = tome.querySelector(".tome__strap");
  const cta = desk.querySelector(".desk__cta");
  const sticky = desk.querySelector(".desk__sticky");
  const slot = tome.querySelector("[data-narrator-slot]");
  const openBtn = main.querySelector("[data-open-book]");
  const target = main.querySelector("#prologue");
  const ribbon = main.querySelector(".ribbon");
  const fine = window.matchMedia("(pointer: fine)").matches;
  const tilt = { x: 0, y: 0 };
  let frame = 0;
  let glide = 0;
  let saidHello = false;
  let wasOpen = null;
  let revealed = false;

  const masthead = function () {
    const m = document.querySelector(".masthead");
    return m ? m.offsetHeight : 0;
  };

  const scrollToStory = function (behavior) {
    const top = target.getBoundingClientRect().top + window.scrollY - masthead() - 16;
    window.scrollTo({ top: top, behavior: behavior || "instant" });
  };

  if (reduceMotion || !target) {
    const onOpen = function (e) {
      if (!target) return;
      e.preventDefault();
      scrollToStory();
    };
    if (openBtn) openBtn.addEventListener("click", onOpen);
    book.addEventListener("click", onOpen);
    return function () {
      if (openBtn) openBtn.removeEventListener("click", onOpen);
      book.removeEventListener("click", onOpen);
    };
  }

  desk.classList.add("is-scrolly");

  // Scroll distance over which the whole opening plays out.
  const range = function () { return desk.offsetHeight - (window.innerHeight - masthead()); };
  const startY = function () { return desk.getBoundingClientRect().top + window.scrollY - masthead(); };

  if (location.hash === "#prologue") window.scrollTo(0, startY() + range());

  // The pages inside the book are the prologue itself, printed at the size
  // the zoom will blow them up from. The left half goes on the inside of the
  // cover, the right half on the first page.
  const block = tome.querySelector(".tome__block");
  const pageR = document.createElement("div");
  const pageL = document.createElement("div");
  pageR.className = pageL.className = "tome__page";
  block.prepend(pageR);
  tome.querySelector(".tome__inside").prepend(pageL);
  const ghostR = makeGhost(target);
  const ghostL = makeGhost(target);
  ghostR.classList.add("tome__ghost");
  ghostL.classList.add("tome__ghost");
  pageR.appendChild(ghostR);
  pageL.appendChild(ghostL);
  let ghostKey = "";

  const placeGhosts = function (wide, s, spreadW, w) {
    const key = wide + ":" + spreadW.toFixed(1) + ":" + w.toFixed(1);
    if (key === ghostKey) return;
    ghostKey = key;
    [ghostL, ghostR].forEach(function (g) {
      g.style.width = spreadW.toFixed(2) + "px";
      g.style.transform = "scale(" + (1 / s).toFixed(5) + ")";
    });
    ghostR.style.left = (wide ? -w : 0) - block.offsetLeft + "px";
    ghostR.style.top = -block.offsetTop + "px";
    pageL.hidden = !wide;
  };

  const render = function () {
    frame = 0;
    const len = Math.max(1, range());
    const p = clamp01((window.scrollY - startY()) / len);

    const strapT = ease(span(p, 0, 0.1));
    const openT = ease(span(p, 0.06, 0.5));
    const zoomT = ease(span(p, 0.5, 1));
    const landed = p > 0.995;

    tome.classList.toggle("is-moving", p > 0.005 && !landed);
    desk.classList.toggle("is-landed", landed);
    slot.toggleAttribute("data-slot-off", p > 0.02);
    cta.style.opacity = String(1 - span(p, 0, 0.06));
    cta.style.visibility = p > 0.06 ? "hidden" : "";

    strap.style.transform = "translateZ(3px) translateX(" + (strapT * 30).toFixed(2) + "%) scaleX(" + (1 - strapT * 0.6).toFixed(3) + ")";
    strap.style.opacity = String(1 - strapT);
    tome.style.setProperty("--strap", strapT.toFixed(3));

    // While closed the book follows the pointer a little; that fades out as it opens.
    const rest = 1 - openT;
    const rx = (14 + tilt.y) * rest + 5 * openT * (1 - zoomT);
    const ry = tilt.x * rest;
    const rz = -3 * rest;
    book.style.transform = "translateX(" + (openT * 50).toFixed(3) + "%) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg) rotateZ(" + rz.toFixed(2) + "deg)";
    cover.style.transform = "rotateY(" + (openT * -180).toFixed(2) + "deg)";

    tome.style.setProperty("--shade-front", span(openT, 0, 0.5).toFixed(3));
    tome.style.setProperty("--shade-inside", (1 - span(openT, 0.5, 1)).toFixed(3));
    tome.style.setProperty("--shade-block", (openT < 0.35 ? openT / 0.35 : 1 - span(openT, 0.35, 1)).toFixed(3));

    // Land the open book where the spread will rest once the pin lets go:
    // same width, spine on the spread's middle.
    const base = tome.getBoundingClientRect();
    const spread = target.getBoundingClientRect();
    const restTop = spread.top - (startY() + len - window.scrollY);
    const wide = window.matchMedia("(min-width: 900px)").matches;
    const s = wide ? spread.width / (base.width * 2) : spread.width / base.width;
    const spine = base.left + base.width / 2;
    const goalX = spread.left + spread.width / 2 - spine - (wide ? 0 : (base.width * s) / 2);
    const goalY = restTop - base.top;
    const k = 1 + (s - 1) * zoomT;
    placeGhosts(wide, s, spread.width, tome.offsetWidth);
    stage.style.transform = "translate(" + (goalX * zoomT).toFixed(1) + "px," + (goalY * zoomT).toFixed(1) + "px) scale(" + k.toFixed(4) + ")";
    tome.querySelector(".tome__back").style.boxShadow = zoomT > 0 ? "none" : "";
    if (ribbon) ribbon.classList.toggle("is-tucked", !landed);

    const open = p >= 0.5;
    if (open !== wasOpen) {
      wasOpen = open;
      document.dispatchEvent(new CustomEvent("book:open", { detail: { open: open } }));
    }

    // The real beats are already shown in the copy, so have them in place
    // before the copy fades away.
    if (p > 0.8 && !revealed) {
      revealed = true;
      target.querySelectorAll(".beat").forEach(function (b) {
        if (b.offsetTop < window.innerHeight) b.classList.add("is-seen");
      });
    }

    if (openT > 0.6 && !saidHello) {
      saidHello = true;
      narrator.cue({ pose: "wave", say: "Come in! This is where my story starts." });
    }
  };

  const schedule = function () { if (!frame) frame = requestAnimationFrame(render); };

  const onMove = function (e) {
    const r = tome.getBoundingClientRect();
    tilt.x = ((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 14;
    tilt.y = -((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * 8;
    schedule();
  };
  if (fine) window.addEventListener("pointermove", onMove, { passive: true });

  // "Open the book" plays the same scroll for you, slowly enough to watch.
  const stopGlide = function () { cancelAnimationFrame(glide); glide = 0; };
  const onOpen = function (e) {
    e.preventDefault();
    stopGlide();
    const from = window.scrollY;
    const to = startY() + range();
    const t0 = performance.now();
    const dur = 2600;
    const step = function (now) {
      const t = Math.min(1, (now - t0) / dur);
      window.scrollTo(0, from + (to - from) * ease(t));
      if (t < 1) glide = requestAnimationFrame(step);
      else {
        glide = 0;
        const h = target.querySelector("h2, h1");
        if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      }
    };
    glide = requestAnimationFrame(step);
  };
  const onUserScroll = function () { if (glide) stopGlide(); };

  if (openBtn) openBtn.addEventListener("click", onOpen);
  book.addEventListener("click", onOpen);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("wheel", onUserScroll, { passive: true });
  window.addEventListener("touchstart", onUserScroll, { passive: true });
  render();

  return function () {
    stopGlide();
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("wheel", onUserScroll);
    window.removeEventListener("touchstart", onUserScroll);
    if (openBtn) openBtn.removeEventListener("click", onOpen);
    book.removeEventListener("click", onOpen);
    if (ribbon) ribbon.classList.remove("is-tucked");
    slot.removeAttribute("data-slot-off");
  };
}

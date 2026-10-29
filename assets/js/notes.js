/**
 * Visitors' sticky notes. notes-api appends each note to its archive and
 * rewrites /notes/top.json, the latest ten, which is all the site reads.
 * Note text comes straight from visitors, so it only ever goes in via textContent.
 *
 * mountCoverNotes() keeps a small stack on the desk; mount() runs the
 * Visitors' Book page: the board and the blank note you write on.
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TOP_URL = "/notes/top.json";
const POST_URL = "/api/notes";
const MINE_KEY = "glen:notes:mine";
const COLORS = ["yellow", "pink", "green", "blue"];
const LIMIT = 10;

export async function loadNotes() {
  try {
    const r = await fetch(TOP_URL, { cache: "no-store" });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data.filter(isNote).slice(0, LIMIT) : [];
  } catch (_) {
    return [];
  }
}

function isNote(n) {
  return n && typeof n.id === "string" && typeof n.name === "string" && typeof n.message === "string";
}

function mine() {
  try { return JSON.parse(localStorage.getItem(MINE_KEY)) || []; } catch (_) { return []; }
}

function rememberMine(id) {
  try { localStorage.setItem(MINE_KEY, JSON.stringify(mine().concat(id).slice(-50))); } catch (_) {}
}

// The same note always gets the same paper and the same tilt.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

export function paintNote(note, opts) {
  opts = opts || {};
  const h = hash(note.id);
  const n = el(opts.tag || "div", "sticky");
  n.dataset.color = COLORS[h % COLORS.length];
  n.style.setProperty("--tilt", (((h >>> 4) % 81) / 10 - 4).toFixed(1) + "deg");
  n.style.setProperty("--sway-delay", "-" + ((h >>> 12) % 50) / 10 + "s");

  n.appendChild(el("p", "sticky__msg", note.message));
  const by = el("p", "sticky__by");
  by.appendChild(el("strong", "", note.name));
  if (note.role) by.appendChild(el("span", "", note.role));
  n.appendChild(by);

  if (opts.mine) n.appendChild(el("span", "sticky__you", "you"));
  if (note.createdAt && opts.date) {
    const d = new Date(note.createdAt);
    if (!isNaN(d)) {
      const t = el("time", "sticky__when", d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }));
      t.dateTime = note.createdAt;
      n.appendChild(t);
    }
  }
  return n;
}

const FIRST = { id: "be-the-first", name: "Glen", role: "Author", message: "This board is waiting for its first note. Will it be yours?" };

/* ---------------- The stack on the cover ---------------- */

// The tilt lives on the wrapper so the peel layers share the note's rotation.
function deskNote(note) {
  const sticky = paintNote(note);
  const w = el("div", "desk__note");
  w.style.setProperty("--tilt", sticky.style.getPropertyValue("--tilt"));
  w.style.setProperty("--sway-delay", sticky.style.getPropertyValue("--sway-delay"));
  w.appendChild(sticky);
  return w;
}

export function mountCoverNotes(stack, narrator) {
  let alive = true;
  let queue = [];
  let show = 0;

  loadNotes().then(function (notes) {
    if (!alive) return;
    queue = notes.length ? notes : [FIRST];
    show = Math.min(queue.length, window.matchMedia("(max-width: 559px)").matches ? 2 : 3);
    stack.replaceChildren.apply(stack, queue.slice(0, show).reverse().map(deskNote));
    stack.setAttribute("aria-label", notes.length
      ? "Notes from readers. Drag one to peel it off, or open the visitors' book."
      : "Leave Glen a note in his visitors' book.");
  });

  // Same idea as the phone: hover the stack and Glen points out what it is.
  const onPoint = function (e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    if (narrator) {
      narrator.cue({
        say: "Readers leave notes on the desk. Click to leave one of your own.",
      });
    }
  };
  stack.addEventListener("pointerenter", onPoint);

  // queue[0] is on top. A peeled note goes to the back of the queue, and
  // whichever note is now show-th slides in at the bottom of the pile.
  const peel = mountPeel(stack, function (top) {
    if (!alive) return;
    top.remove();
    if (!queue.length) {
      stack.prepend(top);
      return;
    }
    queue.push(queue.shift());
    const back = deskNote(queue[show - 1]);
    if (!reduceMotion) back.classList.add("is-landing");
    stack.prepend(back);
  });

  return function () {
    alive = false;
    stack.removeEventListener("pointerenter", onPoint);
    peel();
  };
}

/* ---------------- Peeling a note off the desk ----------------
   Dragging a corner folds it back over a line halfway between where the
   corner was and where the pointer is. The front keeps the part on the far
   side of that line; the lifted part is drawn as the note's back, mirrored
   over the line and pulled in a touch so it reads as a curl, not a crease. */

const CURL = 0.88;

function clipPoly(poly, side) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function polygon(pts) {
  if (pts.length < 3) return "polygon(0 0, 0 0, 0 0)";
  return "polygon(" + pts.map(function (p) { return p.x.toFixed(2) + "px " + p.y.toFixed(2) + "px"; }).join(", ") + ")";
}

const easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
const easeIn = function (t) { return t * t * t; };

function mountPeel(stack, onPeeled) {
  const canHover = window.matchMedia("(hover: hover)").matches;
  let note = null;
  let sticky = null;
  let parts = null;
  let W = 0;
  let H = 0;
  let tilt = 0;
  let corner = null;
  let P = null;
  let press = null;
  let anim = 0;
  let leaving = false;
  let swallowClick = false;
  let hint = 0;

  const top = function () {
    const t = stack.lastElementChild;
    return t && t.classList.contains("desk__note") ? t : null;
  };

  const begin = function (n) {
    if (note === n) return;
    end();
    note = n;
    sticky = n.querySelector(".sticky");
    n.classList.add("is-held");
    W = n.offsetWidth;
    H = n.offsetHeight;
    tilt = (parseFloat(n.style.getPropertyValue("--tilt")) || 0) * Math.PI / 180;

    const under = el("div", "peel-under");
    const underBand = el("div", "peel-band");
    under.appendChild(underBand);
    const flapWrap = el("div", "peel-flap-wrap");
    const flap = el("div", "peel-flap");
    const flapBand = el("div", "peel-band");
    // The back of sticky paper is the same paper, just a shade duller — not
    // a metallic sticker underside.
    const paper = getComputedStyle(sticky).getPropertyValue("--note").trim() || "#f3df7e";
    flap.style.background =
      "linear-gradient(135deg, rgb(255 255 255 / 0.18), transparent 42%)," +
      "linear-gradient(rgb(90 70 30 / 0.14), rgb(90 70 30 / 0.14)), " + paper;
    flap.appendChild(flapBand);
    flapWrap.appendChild(flap);
    n.prepend(under);
    n.appendChild(flapWrap);
    parts = { under: under, underBand: underBand, flapWrap: flapWrap, flap: flap, flapBand: flapBand };
  };

  const end = function () {
    if (!note) return;
    cancelAnimationFrame(anim);
    anim = 0;
    parts.under.remove();
    parts.flapWrap.remove();
    sticky.style.clipPath = "";
    note.classList.remove("is-held", "is-leaving");
    note = sticky = parts = corner = P = null;
  };

  // Client point into the note's own unrotated box.
  const toLocal = function (x, y) {
    const r = note.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    const c = Math.cos(-tilt);
    const s = Math.sin(-tilt);
    return { x: dx * c - dy * s + W / 2, y: dx * s + dy * c + H / 2 };
  };

  const render = function () {
    const dx = P.x - corner.x;
    const dy = P.y - corner.y;
    const len = Math.hypot(dx, dy);
    const flat = len < 0.5;
    parts.under.hidden = parts.flapWrap.hidden = flat;
    if (flat) {
      sticky.style.clipPath = "";
      return;
    }
    const nx = dx / len;
    const ny = dy / len;
    const mx = (corner.x + P.x) / 2;
    const my = (corner.y + P.y) / 2;
    const side = function (p) { return (p.x - mx) * nx + (p.y - my) * ny; };
    const box = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    const lifted = polygon(clipPoly(box, function (p) { return -side(p); }));
    sticky.style.clipPath = polygon(clipPoly(box, side));
    parts.under.style.clipPath = lifted;
    parts.flap.style.clipPath = lifted;

    // Mirror over the fold, then pull back towards it so the flap curls short.
    const map = function (x, y) {
      const d = -side({ x: x, y: y });
      const pull = 2 * d - (1 - CURL) * d;
      return { x: x + pull * nx, y: y + pull * ny };
    };
    const o = map(0, 0);
    const ax = map(1, 0);
    const ay = map(0, 1);
    parts.flap.style.transform = "matrix(" + [ax.x - o.x, ax.y - o.y, ay.x - o.x, ay.y - o.y, o.x, o.y].map(function (v) { return v.toFixed(4); }).join(", ") + ")";

    // Both bands start on the fold and run towards where the corner was.
    const L = 2 * Math.hypot(W, H);
    const band = "translate(" + mx.toFixed(2) + "px, " + my.toFixed(2) + "px) rotate(" + Math.atan2(-ny, -nx).toFixed(4) + "rad) translateY(" + (-L / 2) + "px)";
    const r = Math.max(5, Math.min(18, len * 0.16));
    parts.flapBand.style.width = parts.flapBand.style.height = L + "px";
    parts.underBand.style.width = parts.underBand.style.height = L + "px";
    parts.flapBand.style.transform = band;
    parts.underBand.style.transform = band;
    // Soft paper crease: a thin warm shade into the fold, a faint lift on the
    // flap — no hard white highlight that reads as plastic.
    parts.flapBand.style.background =
      "linear-gradient(to right," +
      " rgb(70 50 20 / 0.22) 0," +
      " rgb(255 250 230 / 0.28) " + (r * 0.35).toFixed(1) + "px," +
      " rgb(90 70 30 / 0.1) " + (r * 1.2).toFixed(1) + "px," +
      " transparent " + (r * 2.6).toFixed(1) + "px)";
    parts.underBand.style.background =
      "linear-gradient(to right," +
      " rgb(40 28 10 / 0.22) 0," +
      " rgb(40 28 10 / 0.08) " + r.toFixed(1) + "px," +
      " transparent " + (r * 2.4).toFixed(1) + "px)";
  };

  const animateTo = function (target, ms, ease, done) {
    cancelAnimationFrame(anim);
    const from = { x: P.x, y: P.y };
    const t0 = performance.now();
    const step = function (now) {
      const t = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      const e = ease(t);
      P = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e };
      render();
      if (t < 1) anim = requestAnimationFrame(step);
      else {
        anim = 0;
        if (done) done();
      }
    };
    anim = requestAnimationFrame(step);
  };

  // Lift the bottom-right corner a little, so the note looks peelable.
  const tease = function () {
    const t = top();
    if (!t || press || leaving) return;
    begin(t);
    if (!corner || corner.x !== W || corner.y !== H) {
      corner = { x: W, y: H };
      P = { x: W, y: H };
    }
    animateTo({ x: W * 0.8, y: H * 0.84 }, reduceMotion ? 0 : 260, easeOut);
  };

  const settle = function () {
    if (!note || press || leaving) return;
    if (canHover && stack.matches(":hover")) {
      tease();
      return;
    }
    animateTo(corner, reduceMotion ? 0 : 300, easeOut, end);
  };

  const peelOff = function () {
    leaving = true;
    const dx = P.x - corner.x;
    const dy = P.y - corner.y;
    const len = Math.hypot(dx, dy) || 1;
    const far = 2.4 * Math.hypot(W, H);
    const n = note;
    n.classList.add("is-leaving");
    animateTo({ x: corner.x + dx / len * far, y: corner.y + dy / len * far }, reduceMotion ? 0 : 560, easeIn, function () {
      end();
      leaving = false;
      onPeeled(n);
    });
  };

  const onDown = function (e) {
    swallowClick = false;
    if (e.button !== 0 || leaving) return;
    const t = top();
    if (!t || !t.contains(e.target)) return;
    e.preventDefault();
    clearTimeout(hint);
    begin(t);
    cancelAnimationFrame(anim);
    anim = 0;
    const p = toLocal(e.clientX, e.clientY);
    const c = { x: p.x < W / 2 ? 0 : W, y: p.y < H / 2 ? 0 : H };
    if (!corner || corner.x !== c.x || corner.y !== c.y) {
      corner = c;
      P = { x: c.x, y: c.y };
    }
    press = { id: e.pointerId, start: p, base: { x: P.x, y: P.y }, moved: false };
    try { stack.setPointerCapture(e.pointerId); } catch (_) {}
  };

  const onMove = function (e) {
    if (!press || e.pointerId !== press.id) return;
    const p = toLocal(e.clientX, e.clientY);
    if (!press.moved && Math.hypot(p.x - press.start.x, p.y - press.start.y) < 5) return;
    press.moved = true;
    stack.classList.add("is-dragging");
    P = { x: press.base.x + p.x - press.start.x, y: press.base.y + p.y - press.start.y };
    render();
  };

  const onUp = function (e) {
    if (!press || e.pointerId !== press.id) return;
    const moved = press.moved;
    press = null;
    stack.classList.remove("is-dragging");
    // A plain click still opens the visitors' book.
    if (!moved) return settle();
    swallowClick = true;
    const pulled = Math.hypot(P.x - corner.x, P.y - corner.y);
    if (e.type !== "pointercancel" && pulled > Math.min(W, H) * 0.45) peelOff();
    else settle();
  };

  const onClick = function (e) {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const onEnter = function (e) { if (e.pointerType === "mouse") tease(); };
  const onLeave = function (e) { if (e.pointerType === "mouse") settle(); };
  const noDrag = function (e) { e.preventDefault(); };

  stack.addEventListener("pointerdown", onDown);
  stack.addEventListener("pointermove", onMove);
  stack.addEventListener("pointerup", onUp);
  stack.addEventListener("pointercancel", onUp);
  stack.addEventListener("pointerenter", onEnter);
  stack.addEventListener("pointerleave", onLeave);
  stack.addEventListener("click", onClick, true);
  stack.addEventListener("dragstart", noDrag);

  // One small lift after the cover settles, for anyone without a hover.
  if (!reduceMotion) {
    hint = setTimeout(function () {
      if (note || press) return;
      tease();
      hint = setTimeout(settle, 1100);
    }, 2600);
  }

  return function () {
    clearTimeout(hint);
    end();
    stack.removeEventListener("pointerdown", onDown);
    stack.removeEventListener("pointermove", onMove);
    stack.removeEventListener("pointerup", onUp);
    stack.removeEventListener("pointercancel", onUp);
    stack.removeEventListener("pointerenter", onEnter);
    stack.removeEventListener("pointerleave", onLeave);
    stack.removeEventListener("click", onClick, true);
    stack.removeEventListener("dragstart", noDrag);
  };
}

/* ---------------- The Visitors' Book page ---------------- */

export function mount(main, { narrator }) {
  const board = main.querySelector("[data-notes-board]");
  const form = main.querySelector("[data-note-form]");
  if (!board || !form) return;

  let alive = true;
  const status = form.querySelector("[data-form-status]");
  const submit = form.querySelector("[type=submit]");
  const message = form.querySelector("#n-msg");
  const count = form.querySelector("[data-count]");
  const max = Number(message.getAttribute("maxlength")) || 280;

  const fill = function (notes) {
    const own = mine();
    let items;
    if (notes.length) {
      items = notes.map(function (n) { return paintNote(n, { tag: "li", date: true, mine: own.includes(n.id) }); });
    } else {
      const first = paintNote(FIRST, { tag: "li" });
      first.dataset.first = "";
      items = [first];
    }
    board.replaceChildren.apply(board, items);
    board.setAttribute("aria-busy", "false");
  };
  loadNotes().then(function (notes) { if (alive) fill(notes); });

  const checks = [
    { input: form.querySelector("#n-name"), err: form.querySelector("#n-name-err") },
    { input: message, err: form.querySelector("#n-msg-err") }
  ];
  const validate = function (c) {
    const good = c.input.value.trim().length > 0;
    c.input.setAttribute("aria-invalid", String(!good));
    c.err.hidden = good;
    return good;
  };
  checks.forEach(function (c) {
    c.input.addEventListener("input", function () { if (c.input.getAttribute("aria-invalid") === "true") validate(c); });
  });

  const onCount = function () {
    const left = max - message.value.length;
    count.textContent = left + " left";
    count.classList.toggle("is-low", left < 30);
  };
  message.addEventListener("input", onCount);
  onCount();

  let started = false;
  const onStart = function () {
    if (started) return;
    started = true;
    narrator.cue({ pose: "read", say: "Ooh, a note. I'm peeking." });
  };
  form.addEventListener("input", onStart);

  const onSubmit = async function (e) {
    e.preventDefault();
    const bad = checks.filter(function (c) { return !validate(c); });
    if (bad.length) {
      bad[0].input.focus();
      status.textContent = "A name and a few words, please.";
      return;
    }

    const data = new FormData(form);
    const body = {
      name: String(data.get("name") || "").trim(),
      role: String(data.get("role") || "").trim(),
      message: String(data.get("message") || "").trim(),
      website: String(data.get("website") || "")
    };

    submit.disabled = true;
    status.textContent = "Sticking it on the board…";
    let res, reply;
    try {
      res = await fetch(POST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      reply = await res.json().catch(function () { return {}; });
    } catch (_) {
      res = null;
    }
    if (!alive) return;
    submit.disabled = false;

    if (!res || !res.ok || !isNote(reply)) {
      status.textContent = (reply && reply.error) || "The board is out of reach right now. Try again in a bit.";
      narrator.cue({ pose: "hey", say: res && res.status === 429 ? "One note a minute, friend." : "Hmm, that one didn't stick." });
      return;
    }

    rememberMine(reply.id);
    board.querySelectorAll("[data-first]").forEach(function (n) { n.remove(); });
    const stuck = paintNote(reply, { tag: "li", date: true, mine: true });
    if (!reduceMotion) stuck.classList.add("is-sticking");
    board.prepend(stuck);
    while (board.children.length > LIMIT) board.lastElementChild.remove();

    form.reset();
    onCount();
    started = false;
    status.textContent = "Stuck! Thanks for the note, " + body.name + ".";
    narrator.say("You left me a note! Thank you.");
    narrator.react("dance");
    stuck.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  };
  form.addEventListener("submit", onSubmit);

  return function () {
    alive = false;
    message.removeEventListener("input", onCount);
    form.removeEventListener("input", onStart);
    form.removeEventListener("submit", onSubmit);
  };
}

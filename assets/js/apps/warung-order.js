/**
 * Warung Order: turns a casual Indonesian order ("dua nasgor pedas sama es teh")
 * into a receipt. Optional voice input through the Web Speech API (id-ID).
 */

const MENU = [
  { id: "nasgor", name: "Nasi goreng", price: 18000, kind: "food", aliases: ["nasi goreng", "nasgor", "nasi gr"] },
  { id: "migor", name: "Mie goreng", price: 16000, kind: "food", aliases: ["mie goreng", "mi goreng", "migor", "indomie goreng"] },
  { id: "mieayam", name: "Mie ayam", price: 15000, kind: "food", aliases: ["mie ayam", "mi ayam", "mieayam"] },
  { id: "sate", name: "Sate ayam, 10 tusuk", price: 25000, kind: "food", aliases: ["sate ayam", "sate", "satai"] },
  { id: "geprek", name: "Ayam geprek", price: 20000, kind: "food", aliases: ["ayam geprek", "geprek"] },
  { id: "uduk", name: "Nasi uduk", price: 12000, kind: "food", aliases: ["nasi uduk", "uduk"] },
  { id: "gado", name: "Gado-gado", price: 15000, kind: "food", aliases: ["gado gado", "gado2", "gado"] },
  { id: "esteh", name: "Es teh manis", price: 5000, kind: "drink", aliases: ["es teh manis", "es teh", "teh manis", "teh anget", "teh"] },
  { id: "jeruk", name: "Es jeruk", price: 7000, kind: "drink", aliases: ["es jeruk", "jeruk anget", "jeruk"] },
  { id: "kopsu", name: "Kopi susu", price: 10000, kind: "drink", aliases: ["kopi susu", "kopsu", "kopi"] },
  { id: "air", name: "Air mineral", price: 4000, kind: "drink", aliases: ["air mineral", "air putih", "aqua", "air"] },
  { id: "kerupuk", name: "Kerupuk", price: 2000, kind: "side", aliases: ["kerupuk", "krupuk", "kerupuknya"] }
];

const EGG = 4000;

const NUMBERS = {
  satu: 1, se: 1, sebiji: 1, sepiring: 1, segelas: 1, seporsi: 1, sebungkus: 1, setusuk: 1,
  dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9,
  sepuluh: 10, sebelas: 11, selusin: 12
};

const NEGATIONS = new Set(["gak", "ga", "nggak", "ngga", "enggak", "tidak", "tdk", "tanpa", "jangan", "no"]);

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

/* Build alias lookup: longest aliases first so "es teh manis" beats "teh". */
const ALIASES = [];
for (const item of MENU) for (const a of item.aliases) ALIASES.push({ words: a.split(" "), item });
ALIASES.sort(function (a, b) { return b.words.length - a.words.length; });

function numberAt(tokens, i) {
  const t = tokens[i];
  if (!t) return null;
  let m = /^(\d{1,2})x?$/.exec(t) || /^x(\d{1,2})$/.exec(t);
  if (m) return { n: Number(m[1]), used: 1, digit: true };
  if (t in NUMBERS) {
    if (tokens[i + 1] === "belas" && NUMBERS[t] < 10) return { n: 10 + NUMBERS[t], used: 2 };
    if (tokens[i + 1] === "puluh" && NUMBERS[t] < 10) return { n: 10 * NUMBERS[t], used: 2 };
    return { n: NUMBERS[t], used: 1 };
  }
  return null;
}

function itemAt(tokens, i) {
  for (const a of ALIASES) {
    let ok = true;
    for (let k = 0; k < a.words.length; k++) {
      if (tokens[i + k] !== a.words[k]) { ok = false; break; }
    }
    if (ok) return { item: a.item, used: a.words.length };
  }
  return null;
}

export function parseOrder(text) {
  const tokens = text
    .toLowerCase()
    .replace(/gado-gado/g, "gado gado")
    .replace(/(\d+)\s*x\b/g, "$1")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const lines = [];
  let pending = null;
  let last = null;
  let takeaway = false;

  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i];

    if (t === "level" || t === "lvl") {
      const num = numberAt(tokens, i + 1);
      if (last && last.item.kind === "food") last.notes.add("pedas level " + (num ? num.n : 1));
      i += num ? 1 + num.used : 1;
      continue;
    }

    const found = itemAt(tokens, i);
    if (found) {
      last = { item: found.item, qty: pending, notes: new Set(), egg: false };
      lines.push(last);
      pending = null;
      i += found.used;
      // "mie ayam 3": a digit right after the item belongs to it.
      const after = numberAt(tokens, i);
      if (after && after.digit && last.qty == null) { last.qty = after.n; i += after.used; }
      continue;
    }

    const num = numberAt(tokens, i);
    if (num) { pending = num.n; i += num.used; continue; }

    const negated = NEGATIONS.has(tokens[i - 1]) || (NEGATIONS.has(tokens[i - 2]) && /^(pake|pakai)$/.test(tokens[i - 1]));
    if (t === "pedas" || t === "pedes") {
      if (last && last.item.kind === "food") {
        last.notes.delete("pedas");
        last.notes.add(negated ? "tidak pedas" : "pedas");
      }
    } else if (t === "sambal" || t === "sambel") {
      if (last && last.item.kind === "food" && negated) last.notes.add("tanpa sambal");
    } else if (t === "telur" || t === "telor") {
      if (last && last.item.kind === "food" && !negated) last.egg = true;
    } else if (t === "es" && negated) {
      if (last && last.item.kind === "drink") last.notes.add("tanpa es");
    } else if (t === "manis" && (tokens[i - 1] === "kurang" || tokens[i - 1] === "less")) {
      if (last && last.item.kind === "drink") last.notes.add("kurang manis");
    } else if (t === "bungkus" || t === "dibungkus" || t === "takeaway") {
      takeaway = true;
    }
    i += 1;
  }

  return {
    takeaway,
    lines: lines.map(function (l) {
      return { item: l.item, qty: Math.max(1, Math.min(l.qty || 1, 50)), notes: [...l.notes], egg: l.egg };
    })
  };
}

export function mount(main, { narrator }) {
  const app = main.querySelector('[data-app="warung"]');
  if (!app) return;
  const form = app.querySelector("[data-order-form]");
  const input = app.querySelector("#order-text");
  const mic = app.querySelector("[data-mic]");
  const menuList = app.querySelector("[data-menu]");
  const linesEl = app.querySelector("[data-lines]");
  const totalEl = app.querySelector("[data-total]");
  const heard = app.querySelector("[data-heard]");
  const status = app.querySelector("[data-status]");

  /** Cart keyed by item + notes so "pedas" and "tidak pedas" stay separate lines. */
  let cart = new Map();
  let takeaway = false;

  for (const item of MENU) {
    const li = document.createElement("li");
    li.innerHTML = '<button type="button"><span class="menu__name"></span><span class="menu__price"></span></button>';
    li.querySelector(".menu__name").textContent = item.name;
    li.querySelector(".menu__price").textContent = rupiah.format(item.price);
    li.querySelector("button").setAttribute("aria-label", "Add one " + item.name + ", " + rupiah.format(item.price));
    li.querySelector("button").addEventListener("click", function () {
      add([{ item, qty: 1, notes: [], egg: false }]);
      heard.textContent = "Tapped: " + item.name + ".";
      announce();
    });
    menuList.append(li);
  }

  function lineKey(l) { return l.item.id + "|" + l.notes.slice().sort().join(",") + "|" + (l.egg ? "egg" : ""); }

  function add(lines) {
    for (const l of lines) {
      const key = lineKey(l);
      const prev = cart.get(key);
      if (prev) prev.qty += l.qty;
      else cart.set(key, { ...l });
    }
    render();
  }

  function total() {
    let sum = 0;
    for (const l of cart.values()) sum += (l.item.price + (l.egg ? EGG : 0)) * l.qty;
    return sum;
  }

  function render() {
    linesEl.replaceChildren();
    for (const l of cart.values()) {
      const li = document.createElement("li");
      const notes = l.notes.slice();
      if (l.egg) notes.push("+ telur");
      li.innerHTML = '<span class="qty"></span><span class="what"><span class="nm"></span><span class="note"></span></span><span class="sum"></span>';
      li.querySelector(".qty").textContent = l.qty + "\u00d7";
      li.querySelector(".nm").textContent = l.item.name;
      li.querySelector(".note").textContent = notes.join(", ");
      li.querySelector(".sum").textContent = rupiah.format((l.item.price + (l.egg ? EGG : 0)) * l.qty);
      linesEl.append(li);
    }
    if (takeaway && cart.size) {
      const li = document.createElement("li");
      li.innerHTML = '<span class="qty"></span><span class="what"><span class="note">Dibungkus, to take away</span></span><span class="sum"></span>';
      linesEl.append(li);
    }
    totalEl.textContent = rupiah.format(total());
  }

  function announce() {
    status.textContent = "Total " + rupiah.format(total());
  }

  function submit(text) {
    const clean = text.trim();
    if (!clean) { input.focus(); return; }
    const order = parseOrder(clean);
    heard.textContent = "\u201c" + clean + "\u201d";
    if (!order.lines.length) {
      status.textContent = "Nothing from the menu found.";
      narrator.cue({ pose: "read", say: "Maaf, that's not on the menu. Try nasi goreng?" });
      return;
    }
    takeaway = takeaway || order.takeaway;
    add(order.lines);
    input.value = "";
    const summary = order.lines.map(function (l) { return l.qty + " " + l.item.name.toLowerCase(); }).join(", ");
    const sum = total();
    status.textContent = "Added " + summary + ". Total " + rupiah.format(sum) + ".";
    if (sum >= 150000) { narrator.say("Wah, " + rupiah.format(sum) + "? Party at the warung!"); narrator.react("dance"); }
    else { narrator.say("Siap! " + summary + "."); narrator.react("wave"); }
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); submit(input.value); });

  app.querySelectorAll("[data-try]").forEach(function (b) {
    b.addEventListener("click", function () { input.value = b.dataset.try; submit(b.dataset.try); });
  });

  app.querySelector("[data-clear]").addEventListener("click", function () {
    cart = new Map();
    takeaway = false;
    render();
    heard.textContent = "Your order will appear here.";
    status.textContent = "Order cleared.";
    input.focus();
  });

  /* Voice input */
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  if (Recognition) {
    mic.hidden = false;
    mic.addEventListener("click", function () {
      if (rec) { rec.stop(); return; }
      rec = new Recognition();
      rec.lang = "id-ID";
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      let finalText = "";
      mic.setAttribute("aria-pressed", "true");
      narrator.say("Ngomong aja, I'm listening.");
      rec.onresult = function (e) {
        let text = "";
        for (const r of e.results) {
          text += r[0].transcript;
          if (r.isFinal) finalText = text;
        }
        input.value = text;
      };
      rec.onerror = function (e) {
        status.textContent = e.error === "not-allowed" ? "Microphone access was blocked." : "Couldn't hear that, try typing.";
        heard.textContent = status.textContent;
      };
      rec.onend = function () {
        mic.setAttribute("aria-pressed", "false");
        rec = null;
        if (finalText) submit(finalText);
      };
      try { rec.start(); } catch (err) { rec = null; mic.setAttribute("aria-pressed", "false"); }
    });
  }

  render();
  return function () { if (rec) { rec.onend = null; rec.abort(); } };
}

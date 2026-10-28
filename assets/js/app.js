/**
 * The book engine. Every page is a real HTML file; with JS we fetch the next
 * page, swap <main> inside a View Transition (the page turn) and keep the
 * narrator alive across pages.
 */

import { createNarrator } from "./narrator.js";
import { mountStory } from "./story.js";
import { CONTENTS } from "./config.js";

const root = document.documentElement;
root.classList.remove("no-js");
root.classList.add("js");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrator = createNarrator();
const cache = new Map();
let cleanups = [];
let navToken = 0;
let currentPath = location.pathname;

/* ---------------- Page lifecycle ---------------- */

function normalise(path) {
  if (path.endsWith("/index.html")) return path.slice(0, -"index.html".length);
  return path;
}

/* ---------------- The island (header) ---------------- */

const island = document.querySelector(".island");
const islandPill = island && island.querySelector(".island__pill");

// The home page is both the cover and the prologue; which one you're on
// depends on how far the book has been opened.
let bookOpen = false;

// Where am I in the book? Returns the part ("Chapter Two"), the title ("HRIS")
// and which part of the book to light up (the cover is dot 0).
function whereAmI(path) {
  if (path === "/") {
    return bookOpen ? { part: "Prologue", title: "Who is Glen?", index: 1 } : { part: "The Book of", title: "Glen", index: 0 };
  }
  for (let i = 0; i < CONTENTS.length; i++) {
    const c = CONTENTS[i];
    const [part, title] = c.label.split(": ");
    const kids = c.children || [];
    for (const k of kids) {
      if (k.href === path) return { part: title, title: k.label, index: i + 1 };
    }
    if (c.href === path) return { part: part, title: title, index: i + 1 };
  }
  return { part: "The Book of", title: "Glen", index: -1 };
}

function setIsland(open) {
  if (!island) return;
  island.classList.toggle("is-open", open);
  island.classList.toggle("is-shut", !open);
  islandPill.setAttribute("aria-expanded", String(open));
  islandPill.querySelector(".visually-hidden").textContent = open ? "Close the chapters" : "Open the chapters";
}

if (island) {
  islandPill.addEventListener("click", function () {
    setIsland(!island.classList.contains("is-open"));
  });
  // A closed island stays closed under the mouse until the pointer leaves.
  island.addEventListener("pointerleave", function (e) {
    if (e.pointerType !== "mouse") return;
    if (island.classList.contains("is-open")) setIsland(false);
    island.classList.remove("is-shut");
  });
  document.addEventListener("pointerdown", function (e) {
    if (!island.contains(e.target) && island.classList.contains("is-open")) setIsland(false);
  });
  island.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { setIsland(false); islandPill.focus(); }
  });
  island.addEventListener("focusout", function (e) {
    if (!island.contains(e.relatedTarget)) island.classList.remove("is-shut", "is-open");
  });

  let ticking = false;
  const read = function () {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    island.style.setProperty("--read", max > 0 ? Math.min(1, window.scrollY / max).toFixed(3) : "0");
  };
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(read); }
  }, { passive: true });
  window.addEventListener("resize", read);
}

function paintIsland(main) {
  const path = normalise(location.pathname);
  document.querySelectorAll(".island__chapters a").forEach(function (a) {
    const href = a.getAttribute("href");
    let active;
    if (href === "/") active = path === "/" && !bookOpen;
    else if (href === "/#prologue") active = path === "/" && bookOpen;
    else active = path.startsWith(href);
    if (active) a.setAttribute("aria-current", path === href || href.startsWith("/#") ? "page" : "true");
    else a.removeAttribute("aria-current");
  });
  if (!island) return;
  const at = whereAmI(path);
  island.querySelector(".island__part").textContent = at.part;
  island.querySelector(".island__title").textContent = at.title;
  const folio = path === "/" && !bookOpen ? "" : main.dataset.folio;
  island.querySelector(".island__folio").textContent = folio ? "p. " + folio : "";
  island.querySelectorAll(".island__dots i").forEach(function (d, i) { d.classList.toggle("is-here", i === at.index); });
}

document.addEventListener("book:open", function (e) {
  if (bookOpen === e.detail.open) return;
  bookOpen = e.detail.open;
  const main = document.querySelector("main#main");
  if (main) paintIsland(main);
});

function updateNav(main) {
  bookOpen = false;
  paintIsland(main);
  if (island) {
    setIsland(false);
    if (!island.matches(":hover")) island.classList.remove("is-shut");
    island.style.setProperty("--read", "0");
  }
  root.dataset.page = main.dataset.page || "";
}

async function enter(main) {
  updateNav(main);
  narrator.setPage(main);
  cleanups = [mountStory(main, narrator)];
  const mod = main.dataset.module;
  if (mod) {
    try {
      const m = await import(mod);
      if (main.isConnected && typeof m.mount === "function") {
        const c = m.mount(main, { narrator });
        if (typeof c === "function") cleanups.push(c);
      }
    } catch (err) {
      console.error("Page module failed", mod, err);
    }
  }
}

function leave() {
  cleanups.forEach(function (fn) { try { fn(); } catch (_) {} });
  cleanups = [];
}

/* ---------------- Fetch + swap ---------------- */

function fetchPage(url) {
  const key = normalise(url.pathname);
  if (!cache.has(key)) {
    const p = fetch(url.pathname, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
    p.catch(function () { cache.delete(key); });
    cache.set(key, p);
  }
  return cache.get(key);
}

function syncHead(doc) {
  document.title = doc.title;
  ["description", "og:title", "og:description", "og:url"].forEach(function (name) {
    const sel = name.startsWith("og:") ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
    const next = doc.querySelector(sel);
    const cur = document.querySelector(sel);
    if (next && cur) cur.setAttribute("content", next.getAttribute("content"));
  });
  const nextCanon = doc.querySelector('link[rel="canonical"]');
  const curCanon = document.querySelector('link[rel="canonical"]');
  if (nextCanon && curCanon) curCanon.href = nextCanon.href;
}

async function navigate(url, opts) {
  opts = opts || {};
  const token = ++navToken;
  let html;
  try {
    html = await fetchPage(url);
  } catch (_) {
    location.href = url.href;
    return;
  }
  if (token !== navToken) return;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const next = doc.querySelector("main#main");
  const prev = document.querySelector("main#main");
  if (!next || !prev) { location.href = url.href; return; }

  const forward = Number(next.dataset.folio || 0) >= Number(prev.dataset.folio || 0);
  root.dataset.turn = forward ? "forward" : "back";
  narrator.turn();

  const swap = function () {
    leave();
    const adopted = document.adoptNode(next);
    prev.replaceWith(adopted);
    syncHead(doc);
    if (opts.push !== false) history.pushState({ path: url.pathname }, "", url.pathname + url.search + url.hash);
    currentPath = location.pathname;
    const anchor = url.hash ? adopted.querySelector(url.hash) : null;
    if (anchor) anchor.scrollIntoView();
    else window.scrollTo(0, 0);
    enter(adopted);
    const heading = adopted.querySelector("[data-focus]") || adopted.querySelector("h1");
    if (heading) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  };

  if (reduceMotion) {
    swap();
  } else if (document.startViewTransition) {
    const vt = document.startViewTransition(swap);
    try { await vt.finished; } catch (_) {}
  } else {
    prev.classList.add("is-leaving");
    await new Promise(function (r) { setTimeout(r, 160); });
    swap();
    next.classList.add("is-entering");
    setTimeout(function () { next.classList.remove("is-entering"); }, 260);
  }
  if (token === navToken) delete root.dataset.turn;
}

/* ---------------- Link interception ---------------- */

function internalUrl(a) {
  if (!a || !a.href) return null;
  if (a.target && a.target !== "_self") return null;
  if (a.hasAttribute("download") || a.dataset.noTurn !== undefined) return null;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return null;
  const last = url.pathname.split("/").pop();
  if (last && last.includes(".") && !last.endsWith(".html")) return null;
  return url;
}

document.addEventListener("click", function (e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest("a");
  const url = internalUrl(a);
  if (!url) return;
  if (normalise(url.pathname) === normalise(location.pathname)) {
    closeContents();
    if (url.hash) {
      // On the home page the prologue is reached by opening the book.
      const opener = url.hash === "#prologue" && document.querySelector("[data-open-book]");
      if (opener && opener !== a) { e.preventDefault(); if (island) setIsland(false); opener.click(); }
      return;
    }
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    return;
  }
  e.preventDefault();
  closeContents();
  navigate(url);
});

function prefetch(e) {
  const a = e.target.closest && e.target.closest("a");
  const url = internalUrl(a);
  if (url && normalise(url.pathname) !== normalise(location.pathname)) fetchPage(url).catch(function () {});
}
document.addEventListener("pointerover", prefetch, { passive: true });
document.addEventListener("focusin", prefetch);

window.addEventListener("popstate", function () {
  if (normalise(location.pathname) === normalise(currentPath)) return;
  navigate(new URL(location.href), { push: false });
});

/* ---------------- Keyboard + swipe page turning ---------------- */

function turnTo(dir) {
  const main = document.querySelector("main#main");
  const href = main && main.dataset[dir];
  if (href) navigate(new URL(href, location.href));
}

function isTyping(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

document.addEventListener("keydown", function (e) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
  if (document.querySelector("dialog[open]")) return;
  if (e.key === "ArrowRight") turnTo("next");
  else if (e.key === "ArrowLeft") turnTo("prev");
});

let touch = null;
document.addEventListener("touchstart", function (e) {
  if (e.touches.length !== 1 || e.target.closest("[data-no-swipe], input, textarea, select, button")) { touch = null; return; }
  touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
document.addEventListener("touchend", function (e) {
  if (!touch) return;
  const dx = e.changedTouches[0].clientX - touch.x;
  const dy = e.changedTouches[0].clientY - touch.y;
  const quick = Date.now() - touch.t < 600;
  touch = null;
  if (quick && Math.abs(dx) > 90 && Math.abs(dy) < 45) turnTo(dx < 0 ? "next" : "prev");
}, { passive: true });

/* ---------------- Contents dialog ---------------- */

const dialog = document.createElement("dialog");
dialog.className = "contents";
dialog.id = "contents";
dialog.setAttribute("aria-labelledby", "contents-title");

function tocItem(item, sub) {
  return '<li class="' + (sub ? "toc__sub" : "toc__part") + '"><a href="' + item.href + '">' +
    '<span class="toc__label">' + item.label + '</span><span class="toc__dots" aria-hidden="true"></span>' +
    '<span class="toc__no"><span class="visually-hidden">page </span>' + item.folio + "</span></a></li>";
}

dialog.innerHTML =
  '<div class="contents__page">' +
  '<div class="contents__head"><div><p class="caps runner">The Book of Glen</p>' +
  '<h2 id="contents-title">Contents</h2></div>' +
  '<form method="dialog"><button class="btn btn--ghost btn--sm" type="submit">Close</button></form></div>' +
  '<ol class="toc">' +
  CONTENTS.map(function (c) {
    return tocItem(c) + (c.children ? c.children.map(function (k) { return tocItem(k, true); }).join("") : "");
  }).join("") +
  "</ol></div>";
document.body.appendChild(dialog);

dialog.addEventListener("click", function (e) {
  if (e.target === dialog) dialog.close();
});

function closeContents() { if (dialog.open) dialog.close(); }

document.addEventListener("click", function (e) {
  if (!e.target.closest("[data-open-contents]")) return;
  const path = normalise(location.pathname);
  dialog.querySelectorAll("a").forEach(function (a) {
    if (a.getAttribute("href") === path) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  dialog.showModal();
});

/* ---------------- Boot ---------------- */

const first = document.querySelector("main#main");
if (first) enter(first);

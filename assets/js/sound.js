/**
 * The book's sound: Tamengetit's theme as background music, real page flips
 * (Kenney's RPG Audio, CC0) and a little game-style voice for the narrator.
 * Browsers only allow sound after the reader's first click, tap or key, so
 * nothing plays before that.
 */

const KEY = "glen:sound";
const THEME_URL = "/assets/audio/theme.mp3";
const MUSIC_LEVEL = 0.2;
const FLIP_LEVEL = 1;
const SAMPLES = {
  flips: ["/assets/audio/flip-1.mp3", "/assets/audio/flip-2.mp3", "/assets/audio/flip-3.mp3"],
  cover: "/assets/audio/cover.mp3"
};

/* ---------------- Effects (pure, so they can be rendered offline too) ---------------- */

// Forward pages travel right to left, so the sound does too.
export function drawFlip(c, buffer, out, t, dir, level) {
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = 0.94 + Math.random() * 0.12;
  const gain = c.createGain();
  gain.gain.value = level;
  src.connect(gain);
  if (c.createStereoPanner && dir !== "cover") {
    const pan = c.createStereoPanner();
    const from = dir === "back" ? -0.35 : 0.35;
    pan.pan.setValueAtTime(from, t);
    pan.pan.linearRampToValueAtTime(-from, t + buffer.duration);
    gain.connect(pan).connect(out);
  } else {
    gain.connect(out);
  }
  src.start(t);
}

// Glen's voice, the way old farming games talk: one soft "bup" per word,
// pitched by its first letter within a narrow range so it hums rather than jumps.
const SCALE = [0, 2, 4];
const ROOT = 523.25;

export function drawBlip(c, out, t, ch) {
  const step = SCALE[ch.toLowerCase().charCodeAt(0) % SCALE.length];
  const f = ROOT * Math.pow(2, step / 12);
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(f * 0.9, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.02);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.11, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.09);
}

/* ---------------- The player ---------------- */

export function createSound() {
  let on = true;
  try { on = localStorage.getItem(KEY) !== "off"; } catch (_) {}
  let ctx = null;
  let fx = null;
  let audio = null;
  let musicGain = null;
  let unlocked = false;
  let hushed = 0;
  let pauseTimer = 0;
  let lastTick = 0;
  let lastFlip = -1;
  let samples = null;
  const buttons = new Set();

  // The flips are tiny, so fetch them up front and decode once there's a context,
  // in time for the first page turn.
  const bytes = function (url) {
    return fetch(url).then(function (r) { return r.arrayBuffer(); });
  };
  const raw = Promise.all([Promise.all(SAMPLES.flips.map(bytes)), bytes(SAMPLES.cover)]);
  raw.catch(function () {});

  function context() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    fx = ctx.createGain();
    fx.connect(ctx.destination);
    const decode = function (b) { return ctx.decodeAudioData(b); };
    raw.then(function (r) {
      return Promise.all([Promise.all(r[0].map(decode)), decode(r[1])]);
    }).then(function (d) {
      samples = { flips: d[0], cover: d[1] };
    }, function () {});
    return ctx;
  }

  function ready() {
    return on && unlocked && ctx && ctx.state === "running";
  }

  function fadeMusic(to, secs) {
    const g = musicGain.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + secs);
  }

  function startMusic() {
    if (!audio) {
      audio = new Audio(THEME_URL);
      audio.loop = true;
      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      ctx.createMediaElementSource(audio).connect(musicGain).connect(ctx.destination);
    }
    clearTimeout(pauseTimer);
    if (audio.paused) audio.play().catch(function () {});
    fadeMusic(MUSIC_LEVEL, 1.8);
  }

  function syncMusic() {
    if (!unlocked) return;
    if (on && hushed === 0 && !document.hidden) {
      startMusic();
    } else if (audio && !audio.paused) {
      fadeMusic(0, 0.5);
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(function () { audio.pause(); }, 550);
    }
  }

  // A touch pointerdown doesn't count as permission yet (touchend does), so
  // keep listening until the context is actually running. Safari wants
  // play() called inside the gesture itself.
  const gestures = ["pointerdown", "keydown", "touchend"];
  function unlock() {
    const c = context();
    if (!c || unlocked) return;
    if (on && hushed === 0) startMusic();
    c.resume().then(function () {
      if (c.state !== "running" || unlocked) return;
      unlocked = true;
      gestures.forEach(function (g) { window.removeEventListener(g, unlock, true); });
      syncMusic();
    }, function () {});
  }
  gestures.forEach(function (g) { window.addEventListener(g, unlock, { capture: true, passive: true }); });

  document.addEventListener("visibilitychange", syncMusic);

  function paint() {
    buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(on)); });
  }

  function set(next) {
    on = next;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (_) {}
    paint();
    if (unlocked) syncMusic();
    else unlock();
  }

  function mountToggle(host) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sound-toggle";
    b.title = "Sound";
    b.innerHTML =
      '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>' +
      '<g class="sound-toggle__on"><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></g>' +
      '<g class="sound-toggle__off"><path d="m22 9-6 6"/><path d="m16 9 6 6"/></g>' +
      '</svg><span class="visually-hidden">Sound</span>';
    b.addEventListener("click", function () { set(!on); });
    host.appendChild(b);
    buttons.add(b);
    paint();
  }

  return {
    mountToggle,
    flip(dir) {
      if (!ready() || !samples) return;
      let buffer = samples.cover;
      if (dir !== "cover") {
        let i = Math.floor(Math.random() * samples.flips.length);
        if (i === lastFlip) i = (i + 1) % samples.flips.length;
        lastFlip = i;
        buffer = samples.flips[i];
      }
      drawFlip(ctx, buffer, fx, ctx.currentTime + 0.01, dir, FLIP_LEVEL);
    },
    // Only the first letter of each word speaks.
    type(ch, prev) {
      const word = /[\p{L}\p{N}]/u;
      if (!ready() || !ch || !word.test(ch) || (prev && word.test(prev))) return;
      const now = ctx.currentTime;
      if (now - lastTick < 0.06) return;
      lastTick = now;
      drawBlip(ctx, fx, now + 0.005, ch);
    },
    // Pages with their own audio (the games) hold the music while they play.
    hush() {
      hushed += 1;
      syncMusic();
      let done = false;
      return function () {
        if (done) return;
        done = true;
        hushed -= 1;
        syncMusic();
      };
    }
  };
}

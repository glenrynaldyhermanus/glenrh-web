/**
 * The book's sound: Tamengetit's theme as background music, plus a paper
 * flip and a soft typing tick drawn with Web Audio. Browsers only allow sound
 * after the reader's first click, tap or key, so nothing plays before that.
 */

const KEY = "glen:sound";
const THEME_URL = "/assets/audio/theme.mp3";
const MUSIC_LEVEL = 0.2;

/* ---------------- Effects (pure, so they can be rendered offline too) ---------------- */

export function makeNoise(c) {
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function burst(c, noise, out, t, len) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.start(t, Math.random() * 0.8);
  src.stop(t + len + 0.05);
  return src;
}

// A sheet sliding across the one beneath it, then landing. Forward pages
// travel right to left, so the sound does too.
export function drawFlip(c, noise, out, t, dir) {
  const heavy = dir === "cover";
  const len = heavy ? 0.78 : 0.52;
  const lo = heavy ? 380 : 750;
  const hi = heavy ? 1900 : 3400;

  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.9;
  band.frequency.setValueAtTime(lo, t);
  band.frequency.exponentialRampToValueAtTime(hi, t + len * 0.45);
  band.frequency.exponentialRampToValueAtTime(lo * 1.4, t + len);

  // Rises fast, falls slowly, and crinkles on the way.
  const gain = c.createGain();
  const steps = 64;
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const x = i / (steps - 1);
    const env = Math.pow(Math.sin(Math.PI * Math.pow(x, 0.6)), 1.6);
    curve[i] = env * (0.5 + Math.random() * 0.5) * (heavy ? 0.85 : 0.7);
  }
  gain.gain.setValueCurveAtTime(curve, t, len);

  let tail = gain;
  if (c.createStereoPanner) {
    const pan = c.createStereoPanner();
    const from = dir === "back" ? -0.45 : 0.45;
    pan.pan.setValueAtTime(from, t);
    pan.pan.linearRampToValueAtTime(-from, t + len);
    gain.connect(pan);
    tail = pan;
  }
  tail.connect(out);
  burst(c, noise, out, t, len).connect(band).connect(gain);

  const land = t + len * 0.8;
  const low = c.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = heavy ? 240 : 480;
  const thud = c.createGain();
  thud.gain.setValueAtTime(0, land);
  thud.gain.linearRampToValueAtTime(heavy ? 0.6 : 0.25, land + 0.006);
  thud.gain.exponentialRampToValueAtTime(0.001, land + (heavy ? 0.14 : 0.09));
  burst(c, noise, out, land, 0.15).connect(low).connect(thud).connect(out);
}

// One key on a soft keyboard. Punctuation lands a little heavier.
export function drawTick(c, noise, out, t, ch) {
  const heavy = /[.,!?:;]/.test(ch);
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 2.2;
  band.frequency.value = (heavy ? 1500 : 2400) + Math.random() * 1400;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(heavy ? 0.34 : 0.22, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.05 : 0.032));
  burst(c, noise, out, t, 0.06).connect(band).connect(gain).connect(out);
}

/* ---------------- The player ---------------- */

export function createSound() {
  let on = true;
  try { on = localStorage.getItem(KEY) !== "off"; } catch (_) {}
  let ctx = null;
  let noise = null;
  let fx = null;
  let audio = null;
  let musicGain = null;
  let unlocked = false;
  let hushed = 0;
  let pauseTimer = 0;
  let lastTick = 0;
  const buttons = new Set();

  function context() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    noise = makeNoise(ctx);
    fx = ctx.createGain();
    fx.connect(ctx.destination);
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
      if (ready()) drawFlip(ctx, noise, fx, ctx.currentTime + 0.01, dir);
    },
    type(ch) {
      if (!ready() || !ch || ch === " ") return;
      const now = ctx.currentTime;
      if (now - lastTick < 0.045) return;
      lastTick = now;
      drawTick(ctx, noise, fx, now + 0.005, ch);
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

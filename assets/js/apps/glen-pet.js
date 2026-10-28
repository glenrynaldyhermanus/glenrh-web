/**
 * Glen Pet: the narrator as a virtual pet. Stats decay over time (even while the
 * tab is closed) and live in localStorage only.
 */

const KEY = "glenrh.pet.v1";
const PER_MIN = { food: -1.4, fun: -1.8, energy: -0.9 };
const SLEEP_ENERGY = 6;

const LINES = {
  feed: ["Nasi padang? You know me.", "Nom. Is there sambal?", "Mmm. Martabak would also be fine.", "Thank you. Coding needs fuel."],
  full: ["I'm full. Seriously.", "One more bite and I can't dance."],
  play: ["Watch this move.", "Okay, one dance. Maybe two.", "I learned this from a YouTube tutorial."],
  tired: ["Too tired to dance. Bed?", "My battery is at one percent."],
  sleep: ["Zzz\u2026 wake me when there's food.", "Goodnight. Don't push to main."],
  wake: ["I'm up, I'm up.", "Was I snoring?"],
  pat: ["Hehe.", "That's nice.", "Again. Again."]
};

const pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };
const clamp = function (v) { return Math.max(0, Math.min(100, v)); };

function fresh() {
  const now = Date.now();
  return { food: 80, fun: 80, energy: 80, asleep: false, born: now, last: now };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s.food === "number") return s;
  } catch (e) { /* storage off or corrupt */ }
  return fresh();
}

function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
}

function decay(s, now) {
  const minutes = Math.max(0, (now - s.last) / 60000);
  s.last = now;
  if (!minutes) return;
  s.food = clamp(s.food + PER_MIN.food * minutes);
  s.fun = clamp(s.fun + PER_MIN.fun * minutes * (s.asleep ? 0.3 : 1));
  s.energy = clamp(s.energy + (s.asleep ? SLEEP_ENERGY : PER_MIN.energy) * minutes);
  if (s.asleep && s.energy >= 100) s.asleep = false;
}

function mood(s) {
  if (s.asleep) return "Asleep";
  const low = Math.min(s.food, s.fun, s.energy);
  if (low < 20) return s.food === low ? "Hungry" : s.energy === low ? "Sleepy" : "Bored";
  if ((s.food + s.fun + s.energy) / 3 > 72) return "Happy";
  return "Okay";
}

function age(s) {
  const days = Math.floor((Date.now() - s.born) / 86400000);
  return days < 1 ? "new today" : days === 1 ? "1 day old" : days + " days old";
}

export function mount(main, { narrator }) {
  const app = main.querySelector('[data-app="glen-pet"]');
  if (!app) return;
  const status = app.querySelector("[data-status]");
  const moodEl = app.querySelector("[data-mood]");
  const ageEl = app.querySelector("[data-age]");
  const buttons = Array.from(app.querySelectorAll("[data-act]"));
  let s = load();
  let busyUntil = 0;

  decay(s, Date.now());
  save(s);

  function idlePose() {
    if (s.asleep) return "read";
    if (s.energy < 25) return "sit";
    return "hey";
  }

  function render() {
    for (const k of ["food", "fun", "energy"]) {
      const v = Math.round(s[k]);
      const meter = app.querySelector('[data-meter="' + k + '"]');
      meter.style.setProperty("--v", (s[k] / 100).toFixed(3));
      meter.setAttribute("aria-valuenow", String(v));
      meter.classList.toggle("is-low", v < 25);
      app.querySelector('[data-value="' + k + '"]').textContent = String(v);
    }
    moodEl.textContent = mood(s);
    ageEl.textContent = age(s);
    const sleepBtn = app.querySelector('[data-act="sleep"] span');
    sleepBtn.textContent = s.asleep ? "Wake" : "Sleep";
  }

  function speak(text, pose) {
    status.textContent = text;
    narrator.say(text);
    if (pose) narrator.react(pose);
    else narrator.cue({ pose: idlePose() });
  }

  function act(kind) {
    const now = Date.now();
    if (now < busyUntil) return;
    decay(s, now);

    if (kind !== "pat" && kind !== "sleep" && s.asleep) {
      s.asleep = false;
      speak(pick(LINES.wake));
      busyUntil = now + 1200;
      save(s); render();
      return;
    }

    if (kind === "feed") {
      if (s.food > 92) { speak(pick(LINES.full)); }
      else {
        s.food = clamp(s.food + 28);
        s.energy = clamp(s.energy + 4);
        speak(pick(LINES.feed));
        narrator.cue({ pose: "sit" });
        busyUntil = now + 1500;
      }
    } else if (kind === "play") {
      if (s.energy < 15) { speak(pick(LINES.tired)); }
      else {
        s.fun = clamp(s.fun + 26);
        s.energy = clamp(s.energy - 12);
        s.food = clamp(s.food - 6);
        speak(pick(LINES.play), "dance");
        busyUntil = now + 2500;
      }
    } else if (kind === "sleep") {
      s.asleep = !s.asleep;
      speak(pick(s.asleep ? LINES.sleep : LINES.wake));
    } else if (kind === "pat") {
      s.fun = clamp(s.fun + 6);
      speak(pick(LINES.pat), s.asleep ? null : "wave");
      busyUntil = now + 900;
    }
    save(s);
    render();
  }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () { act(b.dataset.act); });
  });

  app.querySelector("[data-reset]").addEventListener("click", function () {
    s = fresh();
    save(s);
    render();
    speak("Hi again! I'm new here. Well, newish.", "wave");
  });

  const greet = {
    Hungry: "I'm starving. Did you bring food?",
    Sleepy: "So\u2026 sleepy\u2026",
    Bored: "Finally! I was so bored.",
    Asleep: "Zzz\u2026",
    Happy: "Oh, it's you! I missed you.",
    Okay: "Oh, it's you. Did you bring food?"
  }[mood(s)];
  status.textContent = greet;
  narrator.cue({ pose: idlePose(), say: greet });
  render();

  const tick = setInterval(function () {
    const before = mood(s);
    decay(s, Date.now());
    save(s);
    render();
    const after = mood(s);
    if (after !== before && (after === "Hungry" || after === "Sleepy" || after === "Bored")) {
      speak({ Hungry: "Psst. I'm getting hungry.", Sleepy: "*yawns*", Bored: "Play with me?" }[after]);
    }
  }, 3000);

  return function () { clearInterval(tick); };
}

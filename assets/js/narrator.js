/**
 * Glen, the narrator. One persistent fixed element that follows whichever
 * [data-narrator-slot] is most visible on the current page, a speech bubble,
 * and a lazily loaded Three.js character that changes pose per story beat.
 */

const MODEL_URL = "/glbs/glenv2.min.glb";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Logical poses used in HTML (data-pose) mapped to GLB clips. */
const POSES = {
  sit: { clips: ["Sit_and_Drink"], seat: "books", loop: true, look: 1 },
  read: { clips: ["Sit_Cross_Legged_on_Floor"], seat: "floor", loop: true, look: 1 },
  wave: { clips: ["Big_Wave_Hello"], loop: false, look: 1 },
  hey: { clips: ["Wave_for_Help_3", "Wave_for_Help_4"], loop: false, look: 0.8 },
  walk: { clips: ["Walking"], loop: true, look: 0.5 },
  run: { clips: ["Running", "Run_03"], loop: true, look: 0 },
  dance: { clips: ["Hip_Hop_Dance_1", "Hip_Hop_Dance_3", "Breakdance_1990"], loop: true, look: 0 }
};

const POKE_LINES = [
  "Hey, that tickles.",
  "Yes, I really do dance.",
  "Careful, I bruise easily. I'm made of polygons.",
  "You found the secret button. Well, it's me.",
  "Keep reading, the good part is coming."
];

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

export function createNarrator({ sound } = {}) {
  const el = document.createElement("div");
  el.className = "narrator";
  el.dataset.mode = "spread";
  el.innerHTML =
    '<img class="narrator__poster" src="/assets/img/glen-poster.webp" alt="" width="632" height="719" decoding="async">' +
    '<canvas class="narrator__canvas" aria-hidden="true"></canvas>' +
    '<button type="button" class="narrator__hit" aria-label="Poke Glen"></button>' +
    '<div class="bubble" hidden aria-hidden="true"><p class="bubble__text"></p></div>' +
    '<p class="visually-hidden" aria-live="polite" data-narration></p>';
  document.body.appendChild(el);

  const canvas = el.querySelector("canvas");
  const bubble = el.querySelector(".bubble");
  const bubbleText = el.querySelector(".bubble__text");
  const live = el.querySelector("[data-narration]");
  const hit = el.querySelector(".narrator__hit");

  const state = {
    slots: [],
    slot: null,
    gliding: false,
    rect: null,
    shown: false,
    pose: "sit",
    desired: "sit",
    lockUntil: 0,
    reactUntil: 0,
    said: "",
    typing: 0,
    hideTimer: 0,
    saidAt: 0,
    saidY: 0,
    pointer: { x: 0.5, y: 0.4 },
    glen: null
  };

  /* ---------------- Slots + layout ---------------- */

  function pickSlot() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let best = null;
    let bestArea = 0;
    for (const slot of state.slots) {
      if (!slot.isConnected || slot.hasAttribute("data-slot-off")) continue;
      const r = slot.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const w = Math.min(r.right, vw) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      const area = w > 0 && h > 0 ? w * h : 0;
      if (area > bestArea) { bestArea = area; best = { slot, r }; }
    }
    return best;
  }

  function modeFor(slot) {
    if (slot.dataset.slot === "cover") return "cover";
    if (slot.dataset.slot === "desk") return window.innerWidth >= 900 ? "spread" : "cover";
    return getComputedStyle(slot).position === "fixed" ? "mini" : "spread";
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const picked = pickSlot();
    if (picked) {
      const target = { x: picked.r.left, y: picked.r.top, w: picked.r.width, h: picked.r.height };
      const mode = modeFor(picked.slot);
      if (el.dataset.mode !== mode) el.dataset.mode = mode;
      // Glide only when moving to another slot; otherwise stay glued to the
      // page, or Glen trails behind every scroll and seems to float.
      if (picked.slot !== state.slot) {
        state.gliding = !!state.rect;
        state.slot = picked.slot;
      }
      if (!state.rect || reduceMotion || !state.gliding) {
        state.rect = { ...target };
      } else {
        const k = 1 - Math.exp(-9 * dt);
        const r = state.rect;
        r.x += (target.x - r.x) * k;
        r.y += (target.y - r.y) * k;
        r.w += (target.w - r.w) * k;
        r.h += (target.h - r.h) * k;
        if (Math.abs(target.x - r.x) + Math.abs(target.y - r.y) + Math.abs(target.w - r.w) + Math.abs(target.h - r.h) < 2) {
          state.gliding = false;
        }
      }
      const r = state.rect;
      el.style.transform = "translate3d(" + r.x.toFixed(1) + "px," + r.y.toFixed(1) + "px,0)";
      el.style.width = r.w.toFixed(1) + "px";
      el.style.height = r.h.toFixed(1) + "px";
      if (!state.shown) { el.style.visibility = "visible"; state.shown = true; }
    } else if (state.shown && !state.rect) {
      el.style.visibility = "hidden";
      state.shown = false;
    }

    if (now > state.lockUntil && now > state.reactUntil && state.pose !== state.desired) {
      applyPose(state.desired);
    }

    if (state.glen && state.rect && !document.hidden) {
      const headAt = state.glen.render(state.rect, dt, state.pointer);
      if (headAt && el.dataset.mode === "spread") placeBubble(headAt, dt);
    }
    requestAnimationFrame(frame);
  }
  el.style.visibility = "hidden";
  requestAnimationFrame(frame);

  window.addEventListener("pointermove", function (e) {
    state.pointer.x = e.clientX / window.innerWidth;
    state.pointer.y = e.clientY / window.innerHeight;
  }, { passive: true });

  /* ---------------- Bubble ---------------- */

  // In spread mode the bubble rides just above Glen's head, wherever the pose puts it.
  const anchor = { x: -1, y: -1 };
  function placeBubble(headAt, dt) {
    const r = state.rect;
    const k = anchor.x < 0 || reduceMotion ? 1 : 1 - Math.exp(-6 * dt);
    anchor.x += (headAt.x - anchor.x) * k;
    anchor.y += (headAt.y - anchor.y) * k;
    const bh = bubble.offsetHeight || 60;
    const bottom = clamp(r.h - anchor.y + 18, 0, r.h - bh);
    const right = clamp(r.w - anchor.x - 34, 0, Math.max(0, r.w - bubble.offsetWidth));
    bubble.style.setProperty("--bubble-bottom", bottom.toFixed(1) + "px");
    bubble.style.setProperty("--bubble-right", right.toFixed(1) + "px");
  }

  function say(text) {
    if (!text || text === state.said) return;
    state.said = text;
    clearInterval(state.typing);
    clearTimeout(state.hideTimer);
    bubble.hidden = false;

    if (reduceMotion) {
      bubbleText.textContent = text;
    } else {
      let i = 0;
      bubbleText.textContent = "";
      const caret = document.createElement("span");
      caret.className = "bubble__caret";
      const node = document.createTextNode("");
      bubbleText.append(node, caret);
      state.typing = setInterval(function () {
        i += 1;
        node.textContent = text.slice(0, i);
        if (sound) sound.type(text[i - 1], text[i - 2]);
        if (i >= text.length) {
          clearInterval(state.typing);
          caret.remove();
        }
      }, 22);
    }

    if (el.dataset.mode === "mini") {
      state.saidAt = performance.now();
      state.saidY = window.scrollY;
      state.hideTimer = setTimeout(function () { bubble.hidden = true; }, 5000);
    }
  }

  /* ---------------- Poses ---------------- */

  function applyPose(name) {
    state.pose = name;
    if (state.glen) state.glen.setPose(name);
  }

  function cue(beat) {
    if (!beat) return;
    if (beat.pose && POSES[beat.pose]) state.desired = beat.pose;
    if (beat.say) say(beat.say);
  }

  function setPage(main) {
    state.slots = Array.from(main.querySelectorAll("[data-narrator-slot]"));
    state.said = "";
    if (main.dataset.say) live.textContent = "Glen says: " + main.dataset.say;
    cue({ pose: main.dataset.pose, say: main.dataset.say });
  }

  function turn() {
    if (reduceMotion) return;
    state.lockUntil = performance.now() + 900;
    applyPose("run");
  }

  function react(kind) {
    const pose = kind || (Math.random() < 0.55 ? "dance" : "wave");
    state.reactUntil = performance.now() + (pose === "dance" ? 4200 : 2600);
    applyPose(pose);
  }

  hit.addEventListener("click", function () {
    state.said = "";
    say(POKE_LINES[Math.floor(Math.random() * POKE_LINES.length)]);
    react();
  });

  bubble.addEventListener("click", function () {
    if (el.dataset.mode === "mini") bubble.hidden = true;
  });

  // On phones the bubble floats over the text, so it gets out of the way once the reader moves on.
  window.addEventListener("scroll", function () {
    if (el.dataset.mode !== "mini" || bubble.hidden) return;
    if (performance.now() - state.saidAt > 1200 && Math.abs(window.scrollY - state.saidY) > 140) {
      bubble.hidden = true;
    }
  }, { passive: true });

  /* ---------------- 3D loading ---------------- */

  function boot() {
    loadGlen(canvas)
      .then(function (glen) {
        state.glen = glen;
        glen.setPose(state.pose, true);
        document.documentElement.classList.add("is-glen-ready");
      })
      .catch(function (err) {
        console.warn("Glen 3D unavailable, keeping the poster.", err);
        canvas.remove();
      });
  }

  if ("requestIdleCallback" in window) {
    window.addEventListener("load", function () { requestIdleCallback(boot, { timeout: 2000 }); }, { once: true });
  } else {
    window.addEventListener("load", function () { setTimeout(boot, 300); }, { once: true });
  }
  if (document.readyState === "complete") setTimeout(boot, 0);

  return { setPage, cue, say, turn, react, element: el };
}

/* ==================================================================
   Three.js character
   ================================================================== */

let booted = false;

async function loadGlen(canvas) {
  if (booted) throw new Error("already booted");
  booted = true;

  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) throw new Error("No WebGL");

  const THREE = await import("three");
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);

  scene.add(new THREE.HemisphereLight(0xfff8ee, 0x8f8a99, 1.7));
  const key = new THREE.DirectionalLight(0xfff0d8, 1.45);
  key.position.set(-1.6, 2.6, 2.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd59a, 0.7);
  rim.position.set(1.8, 1.4, -1.6);
  scene.add(rim);

  const gradientMap = new THREE.DataTexture(new Uint8Array([168, 222, 255]), 3, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;

  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const model = gltf.scene;
  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);

  const skinned = [];
  model.traverse(function (node) {
    if (!node.isMesh) return;
    node.frustumCulled = false;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    const toon = mats.map(function (m) {
      return new THREE.MeshToonMaterial({
        map: m.map || null,
        color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
        gradientMap: gradientMap,
        transparent: m.transparent,
        alphaTest: m.alphaTest
      });
    });
    node.material = Array.isArray(node.material) ? toon : toon[0];
    if (node.isSkinnedMesh) skinned.push(node);
  });

  const head = model.getObjectByName("Head");
  const hips = model.getObjectByName("Hips");

  /* Clips: pin Hips X/Z to the rest pose so every clip stays centred, but keep Y so sitting stays seated. */
  const restX = hips ? hips.position.x : 0;
  const restZ = hips ? hips.position.z : 0;
  const clips = {};
  gltf.animations.forEach(function (clip) {
    clip.tracks.forEach(function (track) {
      if (!/(^|\.)(mixamorig)?Hips\.position$/.test(track.name)) return;
      const v = track.values;
      for (let i = 0; i < v.length; i += 3) { v[i] = restX; v[i + 2] = restZ; }
    });
    clips[clip.name] = clip;
  });

  const mixer = new THREE.AnimationMixer(model);
  const spine = model.getObjectByName("Spine02") || model.getObjectByName("Spine01");

  function skinnedBounds() {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    skinned.forEach(function (m) {
      m.computeBoundingBox();
      box.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld));
    });
    return box;
  }

  function poseAt(name, t) {
    const clip = clips[name];
    if (!clip) return;
    mixer.stopAllAction();
    const a = mixer.clipAction(clip);
    a.reset().play();
    a.time = t || 0;
    mixer.update(0);
  }

  // Measure standing height from the first frame of the wave.
  poseAt("Big_Wave_Hello", 0);
  const standBox = skinnedBounds();
  const standH = standBox.max.y - standBox.min.y;
  const center = standBox.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= standBox.min.y;

  // Every clip's lowest point drifts above or below the floor as it plays
  // (the breakdance floats, the waves sink), so sample it along each clip
  // and keep Glen on the ground frame by frame.
  const GROUND_STEPS = 16;
  const ground = {};
  const baseY = model.position.y;
  Object.keys(POSES).flatMap(function (p) { return POSES[p].clips; })
    .concat("Sit_to_standTransition_Female_2")
    .forEach(function (name) {
      const clip = clips[name];
      if (!clip || ground[name]) return;
      const g = new Float32Array(GROUND_STEPS);
      for (let i = 0; i < GROUND_STEPS; i++) {
        poseAt(name, (clip.duration * i) / (GROUND_STEPS - 1));
        g[i] = -skinnedBounds().min.y;
      }
      ground[name] = g;
    });

  function liftAt(action) {
    if (!action) return 0;
    const clip = action.getClip();
    const g = ground[clip.name];
    if (!g) return 0;
    const x = clamp(action.time / clip.duration, 0, 1) * (GROUND_STEPS - 1);
    const i = Math.min(GROUND_STEPS - 2, Math.floor(x));
    return g[i] + (g[i + 1] - g[i]) * (x - i);
  }

  // Seat height for Sit_and_Drink, measured at the hips once the feet are down.
  poseAt("Sit_and_Drink", 0.5);
  const seatLift = -skinnedBounds().min.y;
  const hipPos = new THREE.Vector3();
  if (hips) hips.getWorldPosition(hipPos);
  const seatTop = Math.max(standH * 0.18, hipPos.y + seatLift - standH * 0.06);
  const seatZ = hips ? hipPos.z - standH * 0.04 : 0;
  mixer.stopAllAction();

  /* Inverted-hull ink outline sharing each skeleton. */
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1b2032, side: THREE.BackSide });
  skinned.forEach(function (mesh) {
    mesh.geometry.computeBoundingBox();
    const gb = mesh.geometry.boundingBox;
    const geoH = Math.max(gb.max.y - gb.min.y, gb.max.z - gb.min.z, 0.0001);
    const mat = outlineMat.clone();
    const width = geoH * 0.0048;
    mat.onBeforeCompile = function (shader) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed += normalize(normal) * " + width.toFixed(6) + ";"
      );
    };
    const outline = new THREE.SkinnedMesh(mesh.geometry, mat);
    outline.bind(mesh.skeleton, mesh.bindMatrix);
    outline.frustumCulled = false;
    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);
    outline.scale.copy(mesh.scale);
    mesh.parent.add(outline);
  });

  /* A stack of picture books to sit on (only for the "sit" pose). */
  const books = new THREE.Group();
  const bookColors = [0x2f4f86, 0xb5532f, 0x1d2a4a];
  const bookW = standH * 0.34;
  const bookD = standH * 0.26;
  let y = 0;
  const heights = [0.4, 0.33, 0.27];
  heights.forEach(function (f, i) {
    const h = seatTop * f;
    const cover = new THREE.Mesh(
      new THREE.BoxGeometry(bookW * (1 - i * 0.05), h, bookD * (1 - i * 0.04)),
      // Box faces are +x, -x, +y, -y, +z, -z: spines face the camera, pages face the sides.
      [
        new THREE.MeshToonMaterial({ color: 0xf4ecd9, gradientMap }),
        new THREE.MeshToonMaterial({ color: 0xf4ecd9, gradientMap }),
        new THREE.MeshToonMaterial({ color: bookColors[i], gradientMap }),
        new THREE.MeshToonMaterial({ color: bookColors[i], gradientMap }),
        new THREE.MeshToonMaterial({ color: bookColors[i], gradientMap }),
        new THREE.MeshToonMaterial({ color: 0xf4ecd9, gradientMap })
      ]
    );
    cover.position.y = y + h / 2;
    cover.rotation.y = (i - 1) * 0.18;
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(cover.geometry),
      new THREE.LineBasicMaterial({ color: 0x1b2032 })
    );
    cover.add(edge);
    books.add(cover);
    y += h;
  });
  books.position.set(0, 0, seatZ);
  books.scale.setScalar(0.0001);
  pivot.add(books);

  /* Ground shadow: a soft pool, plus a dark contact patch right under the
     shoes so Glen stands on the page instead of hovering over it. */
  function groundShadow(size, alpha, y) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g2 = c.getContext("2d");
    const grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(4,6,12," + alpha + ")");
    grad.addColorStop(0.5, "rgba(4,6,12," + alpha * 0.55 + ")");
    grad.addColorStop(1, "rgba(29,26,47,0)");
    g2.fillStyle = grad;
    g2.fillRect(0, 0, 64, 64);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(standH * size, standH * size),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.y = 0.55;
    mesh.position.y = y;
    pivot.add(mesh);
  }
  groundShadow(0.7, 0.4, 0.002);
  groundShadow(0.3, 0.75, 0.003);

  /* ---------------- Pose state machine ---------------- */

  let current = null;
  let currentPose = null;
  let lookWeight = 1;
  let lookTarget = 1;
  let booksTarget = 0;
  let previous = null;
  let replayAt = 0;
  let onFinished = null;
  const standUp = clips["Sit_to_standTransition_Female_2"];

  mixer.addEventListener("finished", function (e) {
    if (e.action !== current) return;
    const fn = onFinished;
    onFinished = null;
    if (fn) fn();
  });

  function play(clip, opts) {
    opts = opts || {};
    const action = mixer.clipAction(clip);
    action.reset();
    action.enabled = true;
    action.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, opts.once ? 1 : Infinity);
    action.clampWhenFinished = !!opts.once;
    action.timeScale = opts.reverse ? -1 : 1;
    if (opts.reverse) action.time = clip.duration;
    action.setEffectiveWeight(1);
    action.play();
    if (current && current !== action) {
      const fade = opts.fade != null ? opts.fade : 0.4;
      current.fadeOut(fade);
      action.fadeIn(fade);
      previous = current;
    }
    current = action;
    onFinished = opts.onFinished || null;
    return action;
  }

  function clipFor(name) {
    const def = POSES[name];
    const pool = def.clips.map(function (n) { return clips[n]; }).filter(Boolean);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function enterPose(name) {
    const def = POSES[name];
    const clip = clipFor(name);
    if (!clip) return;
    lookTarget = def.look;
    booksTarget = def.seat === "books" ? 1 : 0;
    if (def.loop) {
      play(clip, {});
      replayAt = 0;
    } else {
      play(clip, { once: true });
      replayAt = performance.now() + clip.duration * 1000 + 7000;
    }
  }

  function setPose(name, instant) {
    if (!POSES[name] || name === currentPose) return;
    const prev = currentPose ? POSES[currentPose] : null;
    const next = POSES[name];
    currentPose = name;

    if (instant || reduceMotion || !standUp || !prev) {
      enterPose(name);
      if (reduceMotion) mixer.update(0.6);
      return;
    }
    if (prev.seat === "books" && next.seat !== "books") {
      booksTarget = 1;
      play(standUp, { once: true, fade: 0.25, onFinished: function () { if (currentPose === name) enterPose(name); } });
    } else if (next.seat === "books" && prev.seat !== "books") {
      booksTarget = 1;
      play(standUp, { once: true, reverse: true, fade: 0.35, onFinished: function () { if (currentPose === name) enterPose(name); } });
    } else {
      enterPose(name);
    }
  }

  /* ---------------- Render ---------------- */

  const look = new THREE.Vector2();
  const qHead = new THREE.Quaternion();
  // The mixer skips bones whose value didn't change (a clamped, finished
  // clip), so the look and sway would pile up frame after frame and spin the
  // head. Put back the animated pose first, then add them on top.
  const headPose = new THREE.Quaternion();
  const spinePose = new THREE.Quaternion();
  let posed = false;
  const euler = new THREE.Euler();
  const headWorld = new THREE.Vector3();
  const hipsWorld = new THREE.Vector3();
  // Frame sits low so the top quarter stays free for the speech bubble.
  const lookAt = new THREE.Vector3(0, standH * 0.66, 0);
  let size = { w: 0, h: 0, dpr: 0 };
  let elapsed = 0;

  function resize(rect) {
    const w = Math.max(1, Math.round(rect.w));
    const h = Math.max(1, Math.round(rect.h));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    size = { w, h, dpr };
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    // Fit a standing Glen plus raised arms vertically, and dance width horizontally.
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const needH = standH * 1.5;
    const needW = standH * 1.05;
    const distH = needH / 2 / Math.tan(fov / 2);
    const distW = needW / 2 / (Math.tan(fov / 2) * camera.aspect);
    const dist = Math.max(distH, distW);
    camera.position.set(Math.sin(0.32) * dist, standH * 0.56, Math.cos(0.32) * dist);
    camera.lookAt(lookAt);
    camera.updateProjectionMatrix();
  }

  function render(rect, dt, pointer) {
    resize(rect);
    elapsed += dt;

    if (!reduceMotion) {
      if (posed) {
        if (head) head.quaternion.copy(headPose);
        if (spine) spine.quaternion.copy(spinePose);
      }
      mixer.update(dt);
      if (head) headPose.copy(head.quaternion);
      if (spine) spinePose.copy(spine.quaternion);
      posed = true;
      if (replayAt && performance.now() > replayAt && currentPose && !POSES[currentPose].loop) {
        const clip = clipFor(currentPose);
        if (clip) play(clip, { once: true, fade: 0.2 });
        replayAt = performance.now() + clip.duration * 1000 + 8000;
      }
    }

    lookWeight += (lookTarget - lookWeight) * Math.min(1, dt * 4);
    const bs = books.scale.x + (Math.max(booksTarget, 0.0001) - books.scale.x) * Math.min(1, dt * 6);
    books.scale.setScalar(bs);
    books.visible = bs > 0.02;
    // While two clips cross-fade, blend their floors by weight too.
    let lift = liftAt(current);
    if (previous && previous !== current && previous.enabled && previous.getEffectiveWeight() > 0) {
      const w = clamp(current.getEffectiveWeight(), 0, 1);
      lift = lift * w + liftAt(previous) * (1 - w);
    }
    model.position.y += (baseY + lift - model.position.y) * Math.min(1, dt * 14);

    if (head && !reduceMotion && lookWeight > 0.01) {
      const cx = (rect.x + rect.w * 0.5) / window.innerWidth;
      const cy = (rect.y + rect.h * 0.3) / window.innerHeight;
      const tx = clamp((pointer.x - cx) * 1.6, -1, 1);
      const ty = clamp((pointer.y - cy) * 1.6, -1, 1);
      look.x += (tx - look.x) * Math.min(1, dt * 5);
      look.y += (ty - look.y) * Math.min(1, dt * 5);
      euler.set(look.y * 0.32 * lookWeight, look.x * 0.62 * lookWeight, 0, "YXZ");
      qHead.setFromEuler(euler);
      head.quaternion.multiply(qHead);
    }

    if (spine && !reduceMotion && lookWeight > 0.6) {
      spine.rotation.x += Math.sin(elapsed * 1.6) * 0.012;
    }

    renderer.render(scene, camera);

    if (!head) return null;
    head.getWorldPosition(headWorld);
    headWorld.y += standH * 0.14;
    if (hips) {
      // Upside down (breakdance) the legs are the top, so anchor above the hips instead.
      hips.getWorldPosition(hipsWorld);
      if (hipsWorld.y + standH * 0.5 > headWorld.y) headWorld.set(hipsWorld.x, hipsWorld.y + standH * 0.5, hipsWorld.z);
    }
    headWorld.project(camera);
    return { x: (headWorld.x * 0.5 + 0.5) * size.w, y: (0.5 - headWorld.y * 0.5) * size.h };
  }

  return { setPose, render };
}

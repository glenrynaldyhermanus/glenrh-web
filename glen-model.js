/**
 * Glen 3D — glbs/glenv2.glb di scene homepage.
 * Home: duduk di log dekat api unggun.
 * #apps: zoom ke Glen, dia berdiri, board apps naik dari kanan bawah.
 * #contact: sama, tapi Glen dance (random) dan board kontak yang muncul.
 * Back: reverse animasi berdiri, zoom out, duduk lagi.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const MODEL_URL = "glbs/glenv2.min.glb";
const PNG_FALLBACK = "images/glen.png";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** 0 = arah asli export (menghadap kamera). */
const MODEL_YAW = 0;

/** Ruang vertikal ekstra frame home untuk transisi berdiri/duduk. */
const HEADROOM = 1.5;

const CLIP_SIT = /sit_and_drink/i;
const CLIP_STAND = /sit_to_stand/i;
const CLIP_WAVE = /big_wave/i;
const CLIP_DANCES = [/hip_hop_dance_1$/i, /hip_hop_dance_3$/i, /breakdance/i];

const mounts = [];
let sharedClips = [];
const clipCache = new Map();
let loadPromise = null;
let clock = null;
let route = "home";

function isDay() {
  return document.documentElement.getAttribute("data-theme") === "day";
}

function getClip(re) {
  const source = sharedClips.find(function (c) { return re.test(c.name); });
  if (!source) return null;
  return getStableClip(source);
}

/**
 * Sebagian clip membawa root-motion (Hips.position) sehingga karakter terlihat
 * "mundur/zoom out". Kita buang track posisi root agar Glen tetap di tempat.
 */
function getStableClip(clip) {
  if (clipCache.has(clip.name)) return clipCache.get(clip.name);
  const tracks = clip.tracks.filter(function (track) {
    return !/(^|\.)(Hips|mixamorigHips)\.position$/.test(track.name);
  });
  const stable = tracks.length === clip.tracks.length
    ? clip
    : new THREE.AnimationClip(clip.name, clip.duration, tracks);
  clipCache.set(clip.name, stable);
  return stable;
}

function pickDance() {
  const re = CLIP_DANCES[Math.floor(Math.random() * CLIP_DANCES.length)];
  return getClip(re) || getClip(/dance/i);
}

function loadModel() {
  if (!loadPromise) {
    const loader = new GLTFLoader();
    loadPromise = loader.loadAsync(MODEL_URL).then(function (gltf) {
      sharedClips = gltf.animations || [];
      gltf.scene.traverse(function (node) {
        if (node.isMesh) {
          node.castShadow = false;
          node.receiveShadow = false;
          node.frustumCulled = false;
          // Matte-kan material: kilap spekular PBR bikin Glen terlihat
          // "plastik studio" dan tidak nyatu dengan scene kartun flat.
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach(function (mat) {
            if (!mat) return;
            if ("roughness" in mat) mat.roughness = Math.max(mat.roughness || 0, 0.92);
            if ("metalness" in mat) mat.metalness = 0;
            if ("envMapIntensity" in mat) mat.envMapIntensity = 0;
            if ("clearcoat" in mat) mat.clearcoat = 0;
            if ("specularIntensity" in mat) mat.specularIntensity = 0.15;
            if ("sheen" in mat) mat.sheen = 0;
          });
        }
      });
      return gltf.scene;
    });
  }
  return loadPromise;
}

/** Log kayu: batang rebahan + serat ujung yang lebih terang. */
function makeLog(length, radius) {
  const group = new THREE.Group();
  group.name = "glen-log";

  const bark = new THREE.MeshToonMaterial({ color: 0x5b3a24 });
  const ring = new THREE.MeshToonMaterial({ color: 0xc49a6c });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.9, radius * 1.12, length, 22, 1),
    [bark, ring, ring]
  );
  body.rotation.z = Math.PI / 2;
  group.add(body);

  const knotMat = new THREE.MeshToonMaterial({ color: 0x4a2f1d });
  const knot = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.38, 10, 8), knotMat);
  knot.position.set(length * 0.16, radius * 0.55, radius * 0.78);
  knot.scale.set(1.1, 0.65, 0.55);
  group.add(knot);

  const stub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.18, radius * 0.28, radius * 0.7, 8),
    knotMat
  );
  stub.position.set(-length * 0.22, radius * 0.15, radius * 0.85);
  stub.rotation.x = 0.85;
  group.add(stub);

  group.rotation.y = 0.28;
  return group;
}

/** Shadow kecil dengan gradasi radial supaya tepinya lembut, bukan lingkaran keras. */
function makeSoftShadow(radius) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(3, 16, 23, 0.32)");
  gradient.addColorStop(0.6, "rgba(3, 16, 23, 0.18)");
  gradient.addColorStop(1, "rgba(3, 16, 23, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  // Local y jadi sumbu depth setelah rotasi; pipihkan agar elips.
  mesh.scale.y = 0.6;
  return mesh;
}

function makeLights() {
  const hemi = new THREE.HemisphereLight(0x8eb6d4, 0x1a2a22, 1);
  const key = new THREE.DirectionalLight(0xfff1d6, 1.2);
  key.position.set(-1.4, 2.2, 1.6);
  const fill = new THREE.DirectionalLight(0xb7d4ea, 0.45);
  fill.position.set(1.8, 1.2, 0.6);
  const rim = new THREE.DirectionalLight(0xffc07a, 0.35);
  rim.position.set(0.4, 0.6, -1.8);
  const fire = new THREE.PointLight(0xff7a2e, 1.1, 4, 1.4);
  fire.position.set(-1.3, 0.35, 0.9);
  return { hemi: hemi, key: key, fill: fill, rim: rim, fire: fire };
}

function applyTheme(lights) {
  const day = isDay();
  if (day) {
    // Siang: terang merata tapi lembut, senada scene kartun flat.
    lights.hemi.color.set(0xd8ebff);
    lights.hemi.groundColor.set(0x4a8a5c);
    lights.hemi.intensity = 0.95;
    lights.key.color.set(0xfff3c8);
    lights.key.intensity = 1.2;
    lights.key.position.set(1.6, 2.4, 1.1);
    lights.fill.color.set(0xffe0c0);
    lights.fill.intensity = 0.3;
    lights.fill.position.set(1.8, 1.2, 0.6);
    lights.rim.color.set(0xffefc2);
    lights.rim.intensity = 0.2;
    lights.fire.intensity = 0;
  } else {
    // Malam: api unggun oranye dominan — sama persis duduk maupun berdiri.
    lights.hemi.color.set(0x2e4d63);
    lights.hemi.groundColor.set(0x0a1c28);
    lights.hemi.intensity = 0.42;
    lights.key.color.set(0xaecde6);
    lights.key.intensity = 0.28;
    lights.key.position.set(1.6, 2.2, 0.4);
    lights.fill.color.set(0xff9a4d);
    lights.fill.intensity = 0.6;
    lights.fill.position.set(-1.8, 0.7, 1.2);
    lights.rim.color.set(0x9ad4ff);
    lights.rim.intensity = 0.2;
    lights.fire.color.set(0xff7a2e);
    lights.fire.intensity = 1.8;
    lights.fire.distance = 5;
  }
}

/* ---------------------------------------------------------
   Layout canvas: home mengikuti slot SVG, viewing ke kolom kiri
   --------------------------------------------------------- */

function homeRect(mount) {
  const slot = mount.slot;
  if (!slot) return stageRect();
  const r = slot.getBoundingClientRect();
  let left = r.left;
  let top = r.top;
  let width = Math.max(1, r.width);
  let height = Math.max(1, r.height);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (left + width < vw * 0.2 || left < -width * 0.35) {
    // Slot terpotong di layar sempit: sematkan Glen di kanan bawah.
    width = Math.min(210, vw * 0.48);
    height = width * 0.62;
    left = vw - width - vw * 0.02;
    top = vh - height - vh * 0.04;
  } else {
    const padX = width * 0.08;
    const padY = height * 0.1;
    left -= padX;
    top -= padY;
    width += padX * 2;
    height += padY * 2;
  }

  // Perluas ke atas sesuai HEADROOM (sinkron dengan framing kamera home).
  top -= height * (HEADROOM - 1);
  height *= HEADROOM;

  return { left: left, top: top, width: width, height: height };
}

function stageRect() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < 720) {
    return { left: vw * 0.04, top: vh * 0.04, width: vw * 0.66, height: vh * 0.5 };
  }
  return { left: vw * 0.015, top: vh * 0.07, width: vw * 0.49, height: vh * 0.91 };
}

function applyRect(canvas, rect) {
  canvas.style.left = rect.left + "px";
  canvas.style.top = rect.top + "px";
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
}

function resizeRenderer(mount) {
  const width = Math.max(1, Math.round(mount.rect.width));
  const height = Math.max(1, Math.round(mount.rect.height));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  if (mount.width === width && mount.height === height && mount.pixelRatio === pixelRatio) {
    return;
  }
  mount.width = width;
  mount.height = height;
  mount.pixelRatio = pixelRatio;
  mount.renderer.setPixelRatio(pixelRatio);
  mount.renderer.setSize(width, height, false);
  mount.camera.aspect = width / height;
  mount.camera.updateProjectionMatrix();
}

function hidePlaceholder() {
  document.documentElement.classList.add("is-glen-ready");
}

function showFallback(canvas) {
  const glen = document.querySelector(".horizon--scene .glen");
  if (glen) {
    glen.innerHTML =
      '<image href="' + PNG_FALLBACK + '" width="180" height="111" preserveAspectRatio="xMidYMax meet" />';
  }
  canvas.remove();
  hidePlaceholder();
}

/* ---------------------------------------------------------
   Animasi karakter
   --------------------------------------------------------- */

function playAction(mount, clip, opts) {
  opts = opts || {};
  const action = mount.mixer.clipAction(clip);
  const prev = mount.current;

  action.reset();
  action.enabled = true;
  if (opts.once) {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  } else {
    action.setLoop(THREE.LoopRepeat, Infinity);
  }
  action.timeScale = opts.reverse ? -1 : 1;
  if (opts.reverse) action.time = clip.duration;
  // Langsung lompat ke pose akhir clip (dipakai contact→apps: dance → berdiri).
  if (opts.atEnd) action.time = Math.max(0, clip.duration - 0.001);
  action.setEffectiveWeight(1);
  action.play();

  const fade = opts.fade != null ? opts.fade : 0.35;
  if (prev && prev !== action) {
    prev.fadeOut(fade);
    action.fadeIn(fade);
  }

  mount.current = action;
  mount.onFinished = opts.onFinished || null;
  return action;
}

function applyRouteAnimation(mount, target, prevRoute) {
  if (!mount.mixer) return;
  const sit = getClip(CLIP_SIT);
  const stand = getClip(CLIP_STAND);
  if (!sit || !stand) return;
  const wave = getClip(CLIP_WAVE);

  if (target === "home") {
    // Reverse animasi berdiri, lalu kembali duduk santai.
    playAction(mount, stand, {
      once: true,
      reverse: true,
      onFinished: function () { playAction(mount, sit, {}); }
    });
  } else if (target === "apps") {
    // Default saat zoom: berdiri lalu dadah (Big_Wave_Hello) loop.
    if (prevRoute === "contact") {
      playAction(mount, wave || stand, wave ? {} : { once: true, atEnd: true });
    } else {
      playAction(mount, stand, {
        once: true,
        onFinished: wave
          ? function () { playAction(mount, wave, {}); }
          : null
      });
    }
  } else if (target === "contact") {
    const dance = pickDance();
    if (!dance) return;
    if (prevRoute === "apps") {
      playAction(mount, dance, {});
    } else {
      playAction(mount, stand, {
        once: true,
        onFinished: function () { playAction(mount, dance, {}); }
      });
    }
  }
}

/* ---------------------------------------------------------
   Routing #apps / #contact
   --------------------------------------------------------- */

function parseRoute() {
  if (location.hash === "#apps") return "apps";
  if (location.hash === "#contact") return "contact";
  return "home";
}

function updateZoomOrigin() {
  const slot = document.querySelector(".horizon--scene .glen__slot");
  const sky = document.querySelector(".sky");
  if (!slot || !sky) return;
  const r = slot.getBoundingClientRect();
  sky.style.setProperty("--zoom-x", (r.left + r.width / 2).toFixed(0) + "px");
  sky.style.setProperty("--zoom-y", (r.top + r.height / 2).toFixed(0) + "px");
}

function setRoute(target, opts) {
  opts = opts || {};
  if (target === route) return;
  const prev = route;
  route = target;

  const viewing = target !== "home";
  // Origin zoom hanya di-set saat sky belum ter-transform.
  if (viewing && prev === "home") updateZoomOrigin();

  const board = document.getElementById("board");
  const panelApps = document.getElementById("board-apps");
  const panelContact = document.getElementById("board-contact");
  if (viewing && panelApps && panelContact) {
    panelApps.hidden = target !== "apps";
    panelContact.hidden = target !== "contact";
  }
  if (board) board.setAttribute("aria-hidden", viewing ? "false" : "true");
  document.documentElement.classList.toggle("is-viewing", viewing);

  for (let i = 0; i < mounts.length; i++) {
    applyRouteAnimation(mounts[i], target, prev);
  }

  if (opts.push !== false) {
    const url = viewing ? "#" + target : location.pathname + location.search;
    history.pushState({ route: target }, "", url);
  }
}

function bindRouting() {
  document.addEventListener("click", function (event) {
    const link = event.target.closest("[data-route]");
    if (link) {
      event.preventDefault();
      setRoute(link.getAttribute("data-route"));
      return;
    }
    const brand = event.target.closest("#brand-home");
    if (brand) {
      event.preventDefault();
      setRoute("home");
    }
  });

  const back = document.getElementById("board-back");
  if (back) {
    back.addEventListener("click", function () { setRoute("home"); });
  }

  window.addEventListener("popstate", function () {
    setRoute(parseRoute(), { push: false });
  });
}

/* ---------------------------------------------------------
   Mount + render loop
   --------------------------------------------------------- */

async function mountCanvas(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power"
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = null;
  scene.environment = null;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 40);
  const lights = makeLights();
  scene.add(lights.hemi, lights.key, lights.fill, lights.rim, lights.fire);

  const pivot = new THREE.Group();
  scene.add(pivot);

  const model = SkeletonUtils.clone(await loadModel());
  model.rotation.y = MODEL_YAW;
  pivot.add(model);

  let mixer = null;
  if (sharedClips.length) {
    mixer = new THREE.AnimationMixer(model);
  }

  const mount = {
    canvas: canvas,
    renderer: renderer,
    scene: scene,
    camera: camera,
    lights: lights,
    mixer: mixer,
    current: null,
    onFinished: null,
    visible: true,
    width: 0,
    height: 0,
    pixelRatio: 0,
    rect: null,
    slot: document.querySelector(".horizon--scene .glen__slot")
  };

  if (mixer) {
    mixer.addEventListener("finished", function (event) {
      if (mount.onFinished && event.action === mount.current) {
        const fn = mount.onFinished;
        mount.onFinished = null;
        fn();
      }
    });
    const sit = getClip(CLIP_SIT) || sharedClips[0];
    playAction(mount, sit, {});
    mixer.update(0);
  }

  // Bounding box biasa meleset (node mesh scale 0.01, ukuran asli dari bones),
  // jadi ukur dari skinned bounds yang memperhitungkan pose duduk.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse(function (node) {
    if (node.isSkinnedMesh) {
      node.computeBoundingBox();
      box.union(node.boundingBox.clone().applyMatrix4(node.matrixWorld));
    }
  });
  if (box.isEmpty()) box.setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  // Log kayu diposisikan tepat di bawah pinggul (bone Hips).
  let hipY = size.y * 0.38;
  let hipZ = 0;
  const hips = model.getObjectByName("Hips") || model.getObjectByName("mixamorigHips");
  if (hips) {
    const hipPos = new THREE.Vector3();
    hips.getWorldPosition(hipPos);
    hipY = hipPos.y - box.min.y;
    hipZ = hipPos.z - center.z;
  }
  // Batang kayu: lebih gemuk & panjang dari celah di bawah pinggul.
  // Puncak log tetap di pinggul supaya Glen tetap duduk di atasnya;
  // kelebihan radius masuk ke bawah (seperti batang rebahan di rumput).
  const logTop = hipY - 0.03;
  const logRadius = Math.max(0.11, size.x * 0.34, logTop * 0.82);
  const log = makeLog(Math.max(size.x * 2.25, logRadius * 7.5), logRadius);
  log.position.set(0, logTop - logRadius, hipZ - logRadius * 0.08);
  pivot.add(log);
  mount.log = log;

  const shadow = makeSoftShadow(size.x * 1.05);
  shadow.position.set(0, 0.004, hipZ * 0.5);
  pivot.add(shadow);

  // Frame kamera dari Glen, bukan dari log — batang yang lebih panjang
  // tidak boleh membuat karakter mengecil di dalam slot.
  const totalCenter = new THREE.Vector3(0, size.y * 0.48, 0);
  const maxDim = Math.max(size.x, size.y, size.z);
  const standH = size.y * 1.42; // tinggi berdiri, diekstrapolasi dari pose duduk

  camera.near = maxDim / 80;
  camera.far = maxDim * 40;
  camera.updateProjectionMatrix();

  // Kamera home vs viewing (zoom). Nilai di-lerp tiap frame di tick().
  // Home dikasih headroom vertikal: canvas + jarak kamera diperbesar HEADROOM
  // kali dengan ground tetap di dasar frame, supaya kepala tidak kepotong
  // saat animasi berdiri/duduk berjalan di state home. Ukuran piksel Glen
  // tidak berubah karena canvas ikut membesar dengan faktor yang sama.
  const fovRad = (camera.fov * Math.PI) / 180;
  const baseRadius = maxDim * 2.55;
  const baseSpan = 2 * baseRadius * Math.tan(fovRad / 2);
  const frameBottom = totalCenter.y - baseSpan / 2;
  const headSpan = baseSpan * HEADROOM;
  mount.camHome = {
    radius: baseRadius * HEADROOM,
    phi: 1.18,
    theta: 0.55,
    look: new THREE.Vector3(totalCenter.x, frameBottom + headSpan / 2, totalCenter.z)
  };
  mount.camView = {
    radius: standH * 2.45,
    phi: 1.38,
    theta: 0.12,
    look: new THREE.Vector3(0, standH * 0.38, 0)
  };
  mount.cam = {
    radius: mount.camHome.radius,
    phi: mount.camHome.phi,
    theta: mount.camHome.theta,
    look: mount.camHome.look.clone()
  };

  applyTheme(lights);

  mount.rect = homeRect(mount);
  applyRect(canvas, mount.rect);
  resizeRenderer(mount);
  mounts.push(mount);

  const observer = new IntersectionObserver(
    function (entries) {
      mount.visible = entries[0].isIntersecting;
    },
    { threshold: 0.01 }
  );
  observer.observe(canvas);

  return mount;
}

function tick() {
  window.requestAnimationFrame(tick);
  if (!clock) clock = new THREE.Clock();
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  const k = reduceMotion ? 1 : 1 - Math.exp(-4 * delta);

  for (let i = 0; i < mounts.length; i++) {
    const mount = mounts[i];
    if (!mount.visible) continue;

    const targetRect = route === "home" ? homeRect(mount) : stageRect();
    mount.rect.left += (targetRect.left - mount.rect.left) * k;
    mount.rect.top += (targetRect.top - mount.rect.top) * k;
    mount.rect.width += (targetRect.width - mount.rect.width) * k;
    mount.rect.height += (targetRect.height - mount.rect.height) * k;
    applyRect(mount.canvas, mount.rect);
    resizeRenderer(mount);

    if (mount.mixer && !reduceMotion) {
      mount.mixer.update(delta);
    }

    const targetCam = route === "home" ? mount.camHome : mount.camView;
    mount.cam.radius += (targetCam.radius - mount.cam.radius) * k;
    mount.cam.phi += (targetCam.phi - mount.cam.phi) * k;
    mount.cam.theta += (targetCam.theta - mount.cam.theta) * k;
    mount.cam.look.lerp(targetCam.look, k);

    const spherical = new THREE.Spherical(mount.cam.radius, mount.cam.phi, mount.cam.theta);
    if (!reduceMotion) {
      const sway = route === "home" ? 1 : 0.35;
      spherical.theta += Math.sin(elapsed * 0.35) * 0.08 * sway;
      spherical.phi += Math.sin(elapsed * 0.27) * 0.02 * sway;
    }
    mount.camera.position.setFromSpherical(spherical);
    mount.camera.position.add(mount.cam.look);
    mount.camera.lookAt(mount.cam.look);
    mount.renderer.render(mount.scene, mount.camera);
  }
}

function syncTheme() {
  for (let i = 0; i < mounts.length; i++) {
    applyTheme(mounts[i].lights);
  }
}

async function init() {
  const canvas = document.querySelector("[data-glen-model]");
  if (!canvas) return;

  try {
    await mountCanvas(canvas);
    hidePlaceholder();
  } catch (err) {
    console.warn("Glen 3D failed, using PNG.", err);
    showFallback(canvas);
    return;
  }

  new MutationObserver(syncTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });

  bindRouting();

  // Load langsung di #apps / #contact: masuk state tanpa push history.
  const initial = parseRoute();
  if (initial !== "home") {
    setRoute(initial, { push: false });
  }

  tick();
}

init();

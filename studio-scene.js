/* ============================================================
   RIVANO — Stone Studio · shared 3D scene (Three.js + GSAP)
   ------------------------------------------------------------
   Config-driven: reads window.STONE (see each stone page).
   · One slab floats above the painted pedestal, rotates 360°
   · Colours either swap a dedicated GLB (color.model) or reuse
     a shared base slab tinted to color.tint (placeholder mode)
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader }      from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const gsap = window.gsap;
const CFG = window.STONE || { colors: [], baseSlab: 'assets/models/white-calacatta.glb', defaultKey: '' };
const BASE_Y = (CFG.baseYaw != null ? CFG.baseYaw : Math.PI);   // default facing flip (per-studio override via STONE.baseYaw)
const WARM = 0xffe2b8;                   // backlight glow tint

const stage = document.getElementById('stage');

// ---------------- renderer ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.64;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050506, 0.045);

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0.5, 1.98, 7.4);
const LOOK = new THREE.Vector3(0.04, 1.62, 0.24);
camera.lookAt(LOOK);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ---------------- lighting ----------------
scene.add(new THREE.AmbientLight(0x20232a, 0.35));
const SPOT_BASE = 74;
const spot = new THREE.SpotLight(0xffe8c4, SPOT_BASE, 22, 0.62, 0.7, 1.4);
spot.position.set(0.4, 8.2, 3.0); spot.target.position.copy(LOOK);
spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -0.0002; spot.shadow.radius = 9;
spot.shadow.camera.near = 1; spot.shadow.camera.far = 18;
scene.add(spot, spot.target);
const rim = new THREE.DirectionalLight(0x8fb4ff, 0.8); rim.position.set(-5, 3.5, -3.5); scene.add(rim);
const back = new THREE.PointLight(0xffcaa0, 18, 12, 2.2); back.position.set(0.1, 2.0, -2.2); scene.add(back);

// Dedicated backlight (off by default) — sits behind the slab so the
// "Lumière" toggle can reveal the translucent / alabaster glow.
const translight = new THREE.PointLight(0xffd49a, 0, 10, 2.0);
translight.position.set(0.04, 1.74, -2.0);
scene.add(translight);

// ---------------- contact shadow + glow ----------------
function radial(stops, size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, size, 128, 128, 128);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const SLAB_BASE = new THREE.Vector3(0.04, 0.58, -1.0);
let slabHalfH = 1.16;
let slabHalfW = 1.0;
let slabHalfD = 0.12;
let slabCenterY = 1.74;
const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5),
  new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(0,0,0,0.6)'], [0.55, 'rgba(0,0,0,0.28)'], [1, 'rgba(0,0,0,0)']], 6), transparent: true, depthWrite: false }));
contact.rotation.x = -Math.PI / 2; contact.position.set(SLAB_BASE.x, SLAB_BASE.y - 0.004, SLAB_BASE.z); scene.add(contact);

const glow = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 6.5),
  new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(255,196,150,0.55)'], [0.4, 'rgba(220,150,96,0.20)'], [1, 'rgba(0,0,0,0)']], 10), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
glow.position.set(0.1, 1.8, -1.9); scene.add(glow);

// ============================================================
//  MODELS  (cache by file; colours reuse a shared base slab unless they name a model)
// ============================================================
const loader = new GLTFLoader();
const slabPivot = new THREE.Group(); scene.add(slabPivot);
let slabReady = false;
const byFile = {};                 // file -> { object, mats:[{mat,base}] }
const colorOf = k => (CFG.colors || []).find(c => c.key === k) || {};
const fileFor = k => colorOf(k).model || CFG.baseSlab;
let activeFile = null;

const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));

function prepSlab(obj) {
  obj.updateMatrixWorld(true);
  obj.traverse(o => { o.quaternion.identity(); });
  obj.updateMatrixWorld(true);
  // Optional uniform normalize-scale: real GLBs come in at their true (small)
  // physical size, so scale each one — without distortion — so its largest
  // face dimension matches CFG.slabTarget, locking it into the framing the
  // painted pedestal already defines. Studios without slabTarget are untouched.
  if (CFG.slabTarget) {
    const b0 = new THREE.Box3().setFromObject(obj);
    const fit = CFG.slabTarget / Math.max(b0.max.x - b0.min.x, b0.max.y - b0.min.y);
    if (isFinite(fit) && fit > 0) { obj.scale.multiplyScalar(fit); obj.updateMatrixWorld(true); }
  }
  const box = new THREE.Box3().setFromObject(obj);
  const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, cz = (box.min.z + box.max.z) / 2;
  obj.position.x -= cx; obj.position.y -= cy; obj.position.z -= cz;
  if (!slabPivot.userData.centered) {
    slabHalfH = (box.max.y - box.min.y) / 2;
    slabHalfW = (box.max.x - box.min.x) / 2;
    slabHalfD = (box.max.z - box.min.z) / 2;
    slabCenterY = SLAB_BASE.y + slabHalfH;
    slabPivot.position.set(SLAB_BASE.x, slabCenterY, SLAB_BASE.z);
    slabPivot.userData.centered = true;
  }
  const mats = [];
  obj.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const arr = Array.isArray(o.material) ? o.material : [o.material];
    const out = arr.map(m => {
      let mat = m;
      // For backlight-enabled stones, ensure a physical material so we can
      // drive transmission + emissive glow. (No-op for other studios.)
      // NB: use the *standard* copy onto a fresh physical instance — the
      // physical copy() reads clearcoat Vector2 fields a standard source
      // lacks and would throw.
      if (CFG.backlight && !m.isMeshPhysicalMaterial) {
        mat = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(mat, m);
      }
      mat.envMapIntensity = 0.55;
      if ('roughness' in mat) mat.roughness = Math.min(mat.roughness ?? 0.5, 0.45);
      if (CFG.backlight && mat.isMeshPhysicalMaterial) {
        mat.transmission = 0; mat.thickness = 0; mat.ior = 1.45;
        mat.attenuationColor = new THREE.Color(0xf3e2c4); mat.attenuationDistance = 1.4;
        if (mat.map) mat.emissiveMap = mat.map;        // veins glow from within
        mat.emissive = new THREE.Color(WARM); mat.emissiveIntensity = 0;
        mat.needsUpdate = true;
      }
      mats.push({ mat, base: mat.color.clone() });
      return mat;
    });
    if (Array.isArray(o.material)) o.material = out; else o.material = out[0];
  });
  return mats;
}

function loadFile(file) {
  if (byFile[file]) return Promise.resolve(byFile[file]);
  return load(file).then(gltf => {
    const obj = gltf.scene; const mats = prepSlab(obj); obj.visible = false;
    slabPivot.add(obj); byFile[file] = { object: obj, mats }; return byFile[file];
  });
}

function applyTint(entry, tint) {
  entry.mats.forEach(({ mat, base }) => {
    const target = tint != null ? new THREE.Color(tint) : base;
    if (gsap) gsap.to(mat.color, { r: target.r, g: target.g, b: target.b, duration: 0.6, ease: 'power2.inOut' });
    else mat.color.copy(target);
  });
}

// ---------------- backlight translucency ----------------
let backlightOn = false;

function lightTargets() {
  const bl = backlightOn;
  return {
    trans: bl ? 0.45 : 0,
    thick: bl ? 0.5 : 0,
    emi:   bl ? 0.95 : 0,
    trLight: bl ? 7.5 : 0,
    spot:  bl ? SPOT_BASE * 0.6 : SPOT_BASE
  };
}
function applyLightState(animate) {
  const t = lightTargets();
  Object.values(byFile).forEach(e => {
    const vis = e.object.visible;
    e.mats.forEach(({ mat }) => {
      if (!mat.isMeshPhysicalMaterial || !('transmission' in mat)) return;
      if (gsap && animate && vis) gsap.to(mat, { transmission: t.trans, thickness: t.thick, emissiveIntensity: t.emi, duration: 0.6, ease: 'power2.inOut' });
      else { mat.transmission = t.trans; mat.thickness = t.thick; mat.emissiveIntensity = t.emi; }
    });
  });
  if (gsap && animate) {
    gsap.to(translight, { intensity: t.trLight, duration: 0.6, ease: 'power2.inOut' });
    gsap.to(spot, { intensity: t.spot, duration: 0.6, ease: 'power2.inOut' });
  } else { translight.intensity = t.trLight; spot.intensity = t.spot; }
}
function setBacklight(on) { backlightOn = !!on; applyLightState(true); return backlightOn; }

(async function init() {
  try {
    const startKey = CFG.defaultKey || (CFG.colors[0] && CFG.colors[0].key);
    const file = fileFor(startKey);
    const entry = await loadFile(file);
    entry.object.visible = true; activeFile = file;
    applyTint(entry, colorOf(startKey).tint);
    slabReady = true;
    document.getElementById('loader').classList.add('hide');
    reveal();
    // Prefetch the other distinct models ONE AT A TIME in the background.
    // (Real stones can be several MB each; loading them all at once starved
    // first paint.) Sequential loading keeps the opening instant while still
    // warming the cache so later swatch switches are snappy.
    const rest = [...new Set((CFG.colors || []).map(c => fileFor(c.key)))].filter(f => f !== file);
    (function next() { const f = rest.shift(); if (!f) return; loadFile(f).finally(() => setTimeout(next, 250)); })();
  } catch (e) {
    console.error('GLB load failed', e && (e.stack || e.message || e), e);
    const l = document.getElementById('loader');
    if (l) l.querySelector('.loader-txt').textContent = 'Unable to load model';
  }
})();

// ============================================================
//  INTERACTION — drag to rotate (free 360° both axes, inertia)
// ============================================================
let rotY = 0, rotX = 0, velY = 0, velX = 0, dragging = false, lastX = 0, lastY = 0, resetTween = null;
function down(x, y) { dragging = true; lastX = x; lastY = y; velX = velY = 0; if (resetTween) { resetTween.kill(); resetTween = null; } stage.classList.add('grabbing'); }
function move(x, y) {
  if (!dragging) return;
  const dY = (x - lastX) * 0.0062, dX = (y - lastY) * 0.0062;
  rotY += dY; rotX += dX; velY = dY; velX = dX; lastX = x; lastY = y;
}
function up() { dragging = false; stage.classList.remove('grabbing'); }
renderer.domElement.addEventListener('pointerdown', e => { down(e.clientX, e.clientY); e.target.setPointerCapture?.(e.pointerId); });
window.addEventListener('pointermove', e => move(e.clientX, e.clientY));
window.addEventListener('pointerup', up);

function resetRotation() {
  velX = velY = 0;
  const norm = a => (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  rotX = norm(rotX); rotY = norm(rotY);
  if (resetTween) resetTween.kill();
  if (gsap) { const p = { x: rotX, y: rotY }; resetTween = gsap.to(p, { x: 0, y: 0, duration: 0.9, ease: 'power3.inOut', onUpdate() { rotX = p.x; rotY = p.y; }, onComplete() { resetTween = null; } }); }
  else { rotX = 0; rotY = 0; }
}

// shared API (kept as MarbleStudio so existing pages/UI keep working)
window.MarbleStudio = window.StoneStudio = {
  selectVariant(key) {
    const c = colorOf(key); const file = fileFor(key);
    loadFile(file).then(entry => {
      Object.values(byFile).forEach(e => e.object.visible = false);
      entry.object.visible = true; activeFile = file;
      resetRotation();
      applyTint(entry, c.tint);
      applyLightState(true);
    }).catch(() => {});
  },
  setBacklight,
  toggleBacklight() { return setBacklight(!backlightOn); },
  isBacklit() { return backlightOn; },
  hasBacklight: !!CFG.backlight
};

// ============================================================
//  REVEAL + LOOP
// ============================================================
function reveal() {
  if (!gsap) return;
  gsap.fromTo(slabPivot.scale, { x: 0.92, y: 0.92, z: 0.92 }, { x: 1, y: 1, z: 1, duration: 1.6, ease: 'power3.out' });
  const intro = { a: -0.5 }; rotY = -0.5;
  gsap.to(intro, { a: 0, duration: 1.8, ease: 'power3.out', onUpdate() { rotY = intro.a; } });
  gsap.fromTo(renderer.domElement, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2, ease: 'power2.out' });
  gsap.utils.toArray('.reveal').forEach((el, i) =>
    gsap.fromTo(el, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 1, delay: 0.4 + i * 0.12, ease: 'power3.out' }));
}

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const t = clock.getElapsedTime();
  if (!dragging) {
    rotY += velY; velY *= 0.92; if (Math.abs(velY) < 1e-4) velY = 0;
    rotX += velX; velX *= 0.92; if (Math.abs(velX) < 1e-4) velX = 0;
  }
  if (slabReady) {
    slabPivot.rotation.set(rotX, BASE_Y + rotY, 0);
    slabPivot.position.y = SLAB_BASE.y + slabHalfH + Math.sin(t * 0.9) * 0.022;
  }
  glow.position.y = 1.8 + Math.sin(t * 0.9) * 0.022;
  renderer.render(scene, camera);
}
tick();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.lookAt(LOOK);
});

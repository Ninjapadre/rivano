/* ============================================================
   RIVANO — Marble Studio · 3D scene (Three.js + GSAP)
   ------------------------------------------------------------
   · Dedicated GLB slab floats above a fixed pedestal
   · Only the slab rotates — drag ±60° with inertia & settle
   · Very dark luxury showroom · warm spotlight · polished floor
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader }      from 'three/addons/loaders/GLTFLoader.js';
import { Reflector }       from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const gsap = window.gsap;
const MAX_ANGLE = Math.PI;             // ±180°
const BASE_Y = Math.PI;                // default facing: flip the slab 180° to show its front

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

// ---------------- scene & camera ----------------
const scene = new THREE.Scene();
scene.background = null;
scene.fog = new THREE.FogExp2(0x050506, 0.045);

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0.5, 1.98, 7.4);
const LOOK = new THREE.Vector3(0.04, 1.62, 0.24);
camera.lookAt(LOOK);

// ---------------- environment (reflections only) ----------------
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ---------------- lighting ----------------
scene.add(new THREE.AmbientLight(0x20232a, 0.35));

// warm key spotlight from above
const spot = new THREE.SpotLight(0xffe8c4, 74, 22, 0.62, 0.7, 1.4);
spot.position.set(0.4, 8.2, 3.0);
spot.target.position.copy(LOOK);
spot.castShadow = true;
spot.shadow.mapSize.set(2048, 2048);
spot.shadow.bias = -0.0002;
spot.shadow.radius = 9;
spot.shadow.camera.near = 1;
spot.shadow.camera.far = 18;
scene.add(spot, spot.target);

// cool rim from camera-left, behind
const rim = new THREE.DirectionalLight(0x8fb4ff, 0.8);
rim.position.set(-5, 3.5, -3.5);
scene.add(rim);

// warm backlight glow behind the slab
const back = new THREE.PointLight(0xffcaa0, 18, 12, 2.2);
back.position.set(0.1, 2.0, -2.2);
scene.add(back);

// ---------------- contact shadow that seats the slab on the painted pedestal ----------------
// (the backdrop image already provides the floor, room and a real pedestal, so we
//  drop the 3D floor + GLB pedestal entirely and only ground the slab with a soft blob)
function shadowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d').createRadialGradient(128, 128, 6, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  const ctx = cv.getContext('2d'); ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}
// world position where the slab's BASE-CENTRE should sit on the painted pedestal.
// each GLB is re-origined to its own bounding box, so all finishes land identically
// here regardless of their baked node transforms. tune .z to push back, .y for height.
const SLAB_BASE = new THREE.Vector3(0.04, 0.58, -1.0);
let slabHalfH = 1.16;   // half the slab height (set on first load) → pivot at slab CENTRE
const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(2.4, 1.5),
  new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })
);
contact.rotation.x = -Math.PI / 2;
contact.position.set(SLAB_BASE.x, SLAB_BASE.y - 0.004, SLAB_BASE.z);
scene.add(contact);

// ---------------- warm glow plane behind slab ----------------
function radialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d').createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,196,150,0.55)');
  g.addColorStop(0.4, 'rgba(220,150,96,0.20)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  const ctx = c.getContext('2d'); ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glow = new THREE.Mesh(
  new THREE.PlaneGeometry(5.5, 6.5),
  new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false })
);
glow.position.set(0.1, 1.8, -1.9);
scene.add(glow);

// ============================================================
//  LOAD MODELS
// ============================================================
const loader = new GLTFLoader();
const slabPivot = new THREE.Group();     // rotates about the slab's vertical centroid
scene.add(slabPivot);
let slabReady = false, pedReady = false;

const SLAB_FILES = {
  calacatta: 'assets/models/white-calacatta.glb',
  cream:     'assets/models/cream.glb',
  batik:     'assets/models/batik.glb',
  bw:        'assets/models/black-and-white.glb',
  bg:        'assets/models/black-and-gold.glb'
};
const slabs = {};          // key -> { object, mats:[{mat,base}] }
let activeKey = 'calacatta';

function load(url) {
  return new Promise((res, rej) => loader.load(url, res, undefined, rej));
}

// re-origin every slab to its OWN bounding box (base-centre → local origin) so all
// finishes — whatever their baked node transform — sit identically on the pedestal
function prepSlab(obj) {
  // these GLBs bake a ~17° tilt into their node — neutralise it so the slab stands
  // vertical (like the original), keeping translation/scale (thin slab)
  obj.updateMatrixWorld(true);
  obj.traverse(o => { o.quaternion.identity(); });
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const cx = (box.min.x + box.max.x) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  obj.position.x -= cx;
  obj.position.y -= cy;            // CENTRE → local origin (rotate about the slab's centre)
  obj.position.z -= cz;
  if (!slabPivot.userData.centered) {
    slabHalfH = (box.max.y - box.min.y) / 2;
    slabPivot.position.set(SLAB_BASE.x, SLAB_BASE.y + slabHalfH, SLAB_BASE.z);
    slabPivot.userData.centered = true;
  }
  const mats = [];
  obj.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        m.envMapIntensity = 0.55;
        if ('roughness' in m) m.roughness = Math.min(m.roughness ?? 0.5, 0.45);
        mats.push({ mat: m, base: m.color.clone() });
      });
    }
  });
  return mats;
}

// load a slab GLB on demand and cache it (added to pivot, hidden until selected)
function loadSlab(key) {
  if (slabs[key]) return Promise.resolve(slabs[key]);
  if (!SLAB_FILES[key]) return Promise.reject(new Error('unknown slab ' + key));
  return load(SLAB_FILES[key]).then(gltf => {
    const obj = gltf.scene;
    const mats = prepSlab(obj);
    obj.visible = false;
    slabPivot.add(obj);
    slabs[key] = { object: obj, mats };
    return slabs[key];
  });
}

(async function init() {
  try {
    // pedestal + room + floor all come from the backdrop image — only load the slab
    await loadSlab('calacatta');
    slabs.calacatta.object.visible = true;
    slabReady = true; pedReady = true;

    document.getElementById('loader').classList.add('hide');
    reveal();

    // quietly prefetch the other finishes so swatch clicks feel instant
    loadSlab('cream'); loadSlab('batik'); loadSlab('bw'); loadSlab('bg');
  } catch (e) {
    console.error('GLB load failed', e);
    const l = document.getElementById('loader');
    if (l) l.querySelector('.loader-txt').textContent = 'Unable to load model';
  }
})();

// ============================================================
//  INTERACTION — drag to rotate slab (full 360°, inertia, settle)
// ============================================================
let rotY = 0, rotX = 0, velY = 0, velX = 0, dragging = false, lastX = 0, lastY = 0;
let resetTween = null;

function down(x, y) { dragging = true; lastX = x; lastY = y; velX = velY = 0; if (resetTween) { resetTween.kill(); resetTween = null; } stage.classList.add('grabbing'); }
function move(x, y) {
  if (!dragging) return;
  const dY = (x - lastX) * 0.0062;   // horizontal drag → spin (Y axis)
  const dX = (y - lastY) * 0.0062;   // vertical drag → tilt (X axis)
  rotY += dY; rotX += dX;            // unbounded → free 360° on BOTH axes
  velY = dY; velX = dX;
  lastX = x; lastY = y;
}
function up() { dragging = false; stage.classList.remove('grabbing'); }

renderer.domElement.addEventListener('pointerdown', e => { down(e.clientX, e.clientY); e.target.setPointerCapture?.(e.pointerId); });
window.addEventListener('pointermove', e => move(e.clientX, e.clientY));
window.addEventListener('pointerup', up);

// ============================================================
//  VARIANT SWAP — each swatch shows its own real GLB model
// ============================================================
const VARIANT_MAP = {
  calacatta: { model: 'calacatta' },
  cream:     { model: 'cream' },
  batik:     { model: 'batik' },
  bw:        { model: 'bw' },
  bg:        { model: 'bg' }
};
// ease the slab back to its front-facing axis on both axes (every finish presents the same)
function resetRotation() {
  velX = velY = 0;
  const norm = a => (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  rotX = norm(rotX); rotY = norm(rotY);
  if (resetTween) resetTween.kill();
  if (gsap) {
    const p = { x: rotX, y: rotY };
    resetTween = gsap.to(p, { x: 0, y: 0, duration: 0.9, ease: 'power3.inOut',
      onUpdate() { rotX = p.x; rotY = p.y; }, onComplete() { resetTween = null; } });
  } else { rotX = 0; rotY = 0; }
}

window.MarbleStudio = {
  selectVariant(key) {
    const v = VARIANT_MAP[key]; if (!v) return;
    // ensure the target model is loaded (on-demand), then swap to it
    loadSlab(v.model).then(({ mats }) => {
      Object.keys(slabs).forEach(k => slabs[k].object.visible = (k === v.model));
      activeKey = v.model;
      resetRotation();                       // present every stone on the same front axis
      mats.forEach(({ mat, base }) => {
        const target = v.tint != null ? new THREE.Color(v.tint) : base;
        if (gsap) gsap.to(mat.color, { r: target.r, g: target.g, b: target.b, duration: 0.6, ease: 'power2.inOut' });
        else mat.color.copy(target);
      });
    }).catch(() => {});
  }
};

// ============================================================
//  REVEAL + RENDER LOOP
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
    slabPivot.position.y = SLAB_BASE.y + slabHalfH + Math.sin(t * 0.9) * 0.022;   // float ADDS to centre height
  }
  glow.position.y = 1.8 + Math.sin(t * 0.9) * 0.022;
  renderer.render(scene, camera);
}
tick();

// ---------------- resize ----------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.lookAt(LOOK);
});

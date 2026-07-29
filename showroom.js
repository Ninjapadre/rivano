/* ============================================================
   RIVANO — Virtual Showroom
   Lateral camera dolly along the material wall (GSAP-driven).
   ------------------------------------------------------------
   The wall is a single image. We treat #scene as a "camera":
   GSAP animates a translate + scale on it. The dot / name markers
   live in a separate, NON-scaled overlay (#panels) and are
   repositioned every frame so they stay locked to their panel.
   ============================================================ */

// Native image size used for panel mapping (1573 x 1000 gallery wall — overscanned)
const IMG_W = 1681, IMG_H = 1000;
const PANEL_Y1 = 0.27, PANEL_Y2 = 0.715;            // panel top / bottom (image fraction)

// ---- Stone data (left → right on the wall) ----
// x1/x2 = horizontal panel bounds as a fraction of the image width.
// material = dedicated studio image shown in LEVEL 3 (Material View).
const STONES = [
  { id: 'travertine', name: 'Travertine', page: 'travertine.html',     x1: 0.1523, x2: 0.2623, material: 'assets/materials/travertine.jpg', cat: 'Warm · Porous · Sculptural', studio3d: 'Travertine Studio.html', mobile3d: 'Travertine White Travertine Mobile.html' },
  { id: 'marble',     name: 'Marble',     page: 'marble.html',         x1: 0.2719, x2: 0.3801, material: 'assets/materials/marble.jpg',     cat: 'Veined · Luminous · Refined', studio3d: 'Marble Studio.html', mobile3d: 'Marble White Calacatta Mobile.html' },
  { id: 'limestone',  name: 'Limestone',  page: 'limestone.html',      x1: 0.3896, x2: 0.4973, material: 'assets/materials/limestone.jpg',  cat: 'Soft · Even · Timeless', studio3d: 'Limestone Studio.html', mobile3d: 'Limestone Carrara Mobile.html' },
  { id: 'andesite',   name: 'Andesite',   page: 'volcanic-stone.html', x1: 0.5068, x2: 0.6205, material: 'assets/materials/andesite.jpg',   cat: 'Deep · Matte · Grounding', studio3d: 'Andesite Studio.html', mobile3d: 'Andesite Black Mobile.html' },
  { id: 'quartzite',  name: 'Quartzite',  page: 'quartzite.html',      x1: 0.6300, x2: 0.7329, material: 'assets/materials/quartzite.jpg',  cat: 'Textured · Dense · Resilient', studio3d: 'Quartzite Studio.html', mobile3d: 'Quartzite Copper Mobile.html' },
  { id: 'terrazzo',   name: 'Terrazzo',   page: 'Terrazzo Studio.html', x1: 0.7424, x2: 0.8477, material: 'assets/materials/terrazzo.jpg',   cat: 'Speckled · Composite · Expressive', studio3d: 'Terrazzo Studio.html', mobile3d: 'Terrazzo White Mobile.html' }
];
const byId = id => STONES.find(s => s.id === id);

// ---- Camera tuning (3-level showroom) ----
// The wall image is WIDER than the viewport (2:1), so it overscans the screen:
// there is real corridor/room content beyond both edges. The camera pans the
// FULL image (never a viewport-crop), so edge stones can travel to dead-centre
// while the side corridors fill the frame — no black, no digital-zoom feel.
// LEVEL 2 (Focus) is a gentle approach; fine detail comes from LEVEL 3.
const FOCUS_Z      = 1.2;   // focus scale — gentle approach (edge stones pan in as far as the overscan allows)
const FOCUS_DUR    = 2.0;   // seconds — slow cinematic glide (power3.inOut)
const GALLERY_DUR  = 1.6;
const MATERIAL_DUR = 1.2;   // material scene-swap crossfade
const DOT_YF  = 0.35;       // dot anchor  — fraction of IMAGE height (glued to the wall)
const DOT_YF_FOCUS = 0.49;  // when focused, the dot drops to the slab centre ("tap again for 3D")
const NAME_YF = 0.64;       // name anchor — fraction of IMAGE height

// ============================================================
//  BUILD OVERLAY MARKERS
// ============================================================
const panelsEl = document.getElementById('panels');
const arrowSVG = '<svg viewBox="0 0 24 12"><path d="M2 6 H21 M15 1 l6 5 -6 5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const dots = [], names = [];

STONES.forEach((s, i) => {
  const dot = document.createElement('button');
  dot.className = 'spot';
  dot.setAttribute('aria-label', s.name);
  dot.innerHTML = '<span class="halo"></span><span class="ring"></span><span class="cue">View in 3D</span>';
  dot.addEventListener('click', (e) => { e.stopPropagation(); onMarkerClick(i); });
  panelsEl.appendChild(dot);
  dots.push(dot);

  const nm = document.createElement('button');
  nm.className = 'name';
  nm.innerHTML =
    `<span class="nm">${s.name}</span>` +
    `<span class="rule"></span>`;
  // clicking the name focuses the stone (a 2nd click on the focused stone opens its studio)
  nm.addEventListener('click', (e) => { e.stopPropagation(); onMarkerClick(i); });
  panelsEl.appendChild(nm);
  names.push(nm);
});

// ============================================================
//  GEOMETRY  (cover-fit the wide image; it overscans the viewport)
// ============================================================
let geo = null;     // { W, H, iw, ih, ox, oy }
let bases = [];      // per-stone IMAGE-LOCAL coords (independent of camera)

function computeGeo() {
  const W = window.innerWidth, H = window.innerHeight;
  const scale = Math.max(W / IMG_W, H / IMG_H);
  const iw = IMG_W * scale, ih = IMG_H * scale;     // cover size (iw > W for a 2:1 image)
  geo = { W, H, iw, ih, ox: (W - iw) / 2, oy: (H - ih) / 2 };
  bases = STONES.map(s => ({
    cxL: ((s.x1 + s.x2) / 2) * iw,   // panel centre, image-local px
    wL:  (s.x2 - s.x1) * iw          // panel width, image-local px
  }));
}

// Camera = { z, L, T } where a panel's image-local x maps to screen as
//   screenX = cxL * z + L     (the plate has transform-origin 0 0)
// Centre stone i: L = W/2 - cxL*z. Vertical: keep the wall centred (T from mid).
function camFor(i) {
  const z = FOCUS_Z;
  const midL = ((PANEL_Y1 + PANEL_Y2) / 2) * geo.ih;
  return clampCam({ z, L: geo.W / 2 - bases[i].cxL * z, T: geo.H / 2 - midL * z });
}

function galleryCam() {
  return { z: 1, L: geo.ox, T: geo.oy };
}

// The plate must always cover the viewport: its left edge ≤ 0 and right edge ≥ W
// (same vertically). Clamp L/T so panning never reveals a black void — with the
// wide overscanned image there is real corridor content to slide in instead.
function clampCam(c) {
  const minL = geo.W - geo.iw * c.z, maxL = 0;
  const minT = geo.H - geo.ih * c.z, maxT = 0;
  return {
    z: c.z,
    L: Math.max(minL, Math.min(maxL, c.L)),
    T: Math.max(minT, Math.min(maxT, c.T))
  };
}

// ============================================================
//  RENDER  (apply camera to #scene + reposition every marker)
// ============================================================
const sceneEl = document.getElementById('scene');
const plateEl = document.getElementById('plate');
const cam = { z: 1, L: 0, T: 0 };

const spans = new Array(STONES.length);

function render() {
  const { W, H, iw, ih } = geo;
  // size + transform the plate (the whole wide image), origin top-left
  plateEl.style.width  = iw + 'px';
  plateEl.style.height = ih + 'px';
  plateEl.style.transform = `translate3d(${cam.L}px, ${cam.T}px, 0) scale(${cam.z})`;

  const focused = currentId ? STONES.indexOf(byId(currentId)) : -1;
  const nameY = NAME_YF * ih;
  const pad = Math.max(58, W * 0.055);

  STONES.forEach((s, i) => {
    const b = bases[i];
    const centerX = b.cxL * cam.z + cam.L;          // panel centre on screen
    const halfW   = (b.wL * cam.z) / 2;
    const leftX = centerX - halfW, rightX = centerX + halfW;
    spans[i] = { leftX, rightX, centerX };

    // vertical screen position of the dot / name anchors (glued to the wall);
    // the focused slab's dot drops to the stone centre to cue "tap again for 3D"
    const dyf = (focused === i) ? DOT_YF_FOCUS : DOT_YF;
    const dotScreenY  = (dyf * ih) * cam.z + cam.T;
    const nameScreenY = nameY * cam.z + cam.T;

    // how much of the panel is actually on screen
    const visW = Math.min(W, rightX) - Math.max(0, leftX);

    const dot = dots[i], nm = names[i];

    // marker x: normally the panel centre, but if the centre has scrolled off
    // screen we DOCK the marker over the still-visible sliver near the edge so
    // neighbour dots + names stay visible and clickable while zoomed in.
    let mx = centerX, docked = 0;
    if (centerX < pad)        { mx = Math.min(pad, Math.max(16, rightX - 12)); docked = -1; }
    else if (centerX > W - pad) { mx = Math.max(W - pad, Math.min(W - 16, leftX + 12)); docked = 1; }

    dot.style.left = mx + 'px';  dot.style.top = dotScreenY + 'px';
    nm.style.left  = mx + 'px';  nm.style.top  = nameScreenY + 'px';

    if (docked === -1) {        // sliver on the left edge → read rightward
      nm.style.transform = 'translate(0, -50%)';
      nm.style.textAlign = 'left';
      nm.style.width = 'auto';
      nm.style.whiteSpace = 'nowrap';
    } else if (docked === 1) {  // sliver on the right edge → read leftward
      nm.style.transform = 'translate(-100%, -50%)';
      nm.style.textAlign = 'right';
      nm.style.width = 'auto';
      nm.style.whiteSpace = 'nowrap';
    } else {                    // centred under its panel — wrap within panel width
      nm.style.transform = 'translate(-50%, -50%)';
      nm.style.textAlign = 'center';
      nm.style.whiteSpace = 'normal';
      nm.style.width = Math.min(W * 0.78, Math.max(b.wL * cam.z, 92)) + 'px';
    }

    // fade out only when the panel is essentially gone from the frame
    const vis = Math.max(0, Math.min(1, visW / 64));
    const emph = (focused === -1 || focused === i) ? 1 : 0.55;
    const o = +(vis * emph).toFixed(3);
    dot.style.opacity = o;
    const dotLive = o > 0.05;
    const cueEl = dot.querySelector('.cue');
    if (cueEl) cueEl.style.opacity = (focused === i && level === 'focus') ? '1' : '0';
    dot.style.pointerEvents = dotLive ? 'auto' : 'none';
    // when a panel's centre has scrolled off-screen (docked) we keep only its
    // dot at the edge and hide the name, so neighbour names never collide.
    const nameO = docked === 0 ? o : 0;
    nm.style.opacity = nameO;
    nm.style.pointerEvents = nameO > 0.05 ? 'auto' : 'none';
  });
}

// which panel sits under a given screen x (visible ones only)
function panelAtX(x) {
  for (let i = 0; i < STONES.length; i++) {
    const sp = spans[i];
    if (sp && x >= sp.leftX && x <= sp.rightX) return i;
  }
  return -1;
}

// ============================================================
//  SOUND  (footsteps when approaching, a slide when tracking sideways)
// ============================================================
const sndApproach = new Audio('assets/audio/footsteps.mp3');
const sndSlide    = new Audio('assets/audio/slide.mp3');
[sndApproach, sndSlide].forEach(a => { a.preload = 'auto'; });
sndApproach.volume = 0.18;   // very discreet
sndSlide.volume    = 0.16;

function playSound(a) {
  // a 0.5s beat after the click before the sound begins
  setTimeout(() => {
    try { a.pause(); a.currentTime = 0; a.play().catch(() => {}); } catch (e) {}
  }, 500);
}

// ============================================================
//  SELECTION  (camera moves to a stone — neighbours stay live)
// ============================================================
let currentId = null;
let arrived = false;
let level = 'gallery';     // 'gallery' | 'focus' | 'material'

function moveCamera(target, dur) {
  if (window.gsap) {
    gsap.to(cam, { z: target.z, L: target.L, T: target.T,
      duration: dur, ease: 'power3.inOut', overwrite: true, onUpdate: render });
  } else {
    cam.z = target.z; cam.L = target.L; cam.T = target.T; render();
  }
}

// ---- LEVEL 2 · FOCUS — gentle approach + lateral track ----
function focusStone(id) {
  const i = STONES.indexOf(byId(id));
  if (i < 0) return;
  const cameFromGallery = level === 'gallery';
  const movingSideways  = level === 'focus' && currentId !== id;
  currentId = id;
  level = 'focus';
  moveCamera(camFor(i), FOCUS_DUR);
  if (cameFromGallery)     playSound(sndApproach);  // footsteps walking up
  else if (movingSideways) playSound(sndSlide);     // lateral track
  dots.forEach((d, k) => d.classList.toggle('active', k === i));
  names.forEach((n, k) => n.classList.toggle('active', k === i));
  overviewBtn.classList.add('show');
  inspectBtn.classList.add('show');
  if (sampleBtn) {
    const sampleTarget = m => (window.matchMedia('(max-width:880px)').matches ? 'Request%20Sample%20Mobile.html' : 'sample.html') + '?material=' + encodeURIComponent(m);
    sampleBtn.href = sampleTarget(byId(id).name);
    sampleBtn.classList.add('show');
  }
  updateHint();
}

// ---- LEVEL 1 · GALLERY — pull back to the full wall ----
function gallery() {
  currentId = null;
  level = 'gallery';
  moveCamera(galleryCam(), GALLERY_DUR);
  dots.forEach(d => d.classList.remove('active'));
  names.forEach(n => n.classList.remove('active'));
  overviewBtn.classList.remove('show');
  inspectBtn.classList.remove('show');
  if (sampleBtn) sampleBtn.classList.remove('show');
  updateHint();
}

// ---- LEVEL 3 · MATERIAL — swap the whole scene for a dedicated studio image ----
const materialEl   = document.getElementById('material');
const materialImg  = document.getElementById('materialImg');
const materialName = document.getElementById('materialName');
const materialCat  = document.getElementById('materialCat');
const inspectBtn   = document.getElementById('inspectBtn');
const sampleBtn    = document.getElementById('sampleBtn');

function openMaterial(id) {
  const s = byId(id);
  if (!s) return;
  // stones with a dedicated 3D studio page navigate there instead of the image view
  if (s.studio3d) { playSound(sndApproach); window.location.href = encodeURI((window.matchMedia('(max-width:880px)').matches && s.mobile3d) ? s.mobile3d : s.studio3d); return; }
  const i = STONES.indexOf(s);
  // make sure the wall underneath is framed on this stone (so closing is seamless)
  if (currentId !== id) {
    currentId = id;
    Object.assign(cam, camFor(i)); render();
    dots.forEach((d, k) => d.classList.toggle('active', k === i));
    names.forEach((n, k) => n.classList.toggle('active', k === i));
  }
  level = 'material';
  materialImg.src = s.material;
  materialName.textContent = s.name;
  materialCat.textContent  = s.cat;
  inspectBtn.classList.remove('show');
  if (sampleBtn) sampleBtn.classList.remove('show');
  playSound(sndApproach);   // a step closer into the material

  materialEl.style.display = 'block';
  if (window.gsap) {
    gsap.killTweensOf([materialEl, materialImg]);
    gsap.set(materialEl, { autoAlpha: 0 });
    // the dedicated image eases out of a gentle push-in → "the camera moved closer"
    gsap.fromTo(materialImg, { scale: 1.1 }, { scale: 1, duration: 1.6, ease: 'power3.out' });
    gsap.to(materialEl, { autoAlpha: 1, duration: MATERIAL_DUR, ease: 'power2.inOut' });
    gsap.to('#panels', { autoAlpha: 0, duration: 0.45, ease: 'power2.out' });
  } else {
    materialEl.style.opacity = 1; materialEl.style.visibility = 'visible';
  }
  updateHint();
}

function closeMaterial() {
  level = 'focus';
  if (window.gsap) {
    gsap.killTweensOf([materialEl, materialImg]);
    gsap.fromTo(materialImg, { scale: 1 }, { scale: 1.06, duration: 0.8, ease: 'power2.in' });
    gsap.to(materialEl, { autoAlpha: 0, duration: 0.8, ease: 'power2.inOut',
      onComplete: () => { materialEl.style.display = 'none'; } });
    gsap.to('#panels', { autoAlpha: 1, duration: 0.7, delay: 0.25, ease: 'power2.out' });
  } else {
    materialEl.style.display = 'none';
  }
  inspectBtn.classList.add('show');
  if (sampleBtn && currentId) { sampleBtn.href = (window.matchMedia('(max-width:880px)').matches ? 'Request%20Sample%20Mobile.html' : 'sample.html') + '?material=' + encodeURIComponent(byId(currentId).name); sampleBtn.classList.add('show'); }
  updateHint();
}

// browse materials directly from the Material View
function materialStep(dir) {
  const i = STONES.indexOf(byId(currentId));
  const n = (i + dir + STONES.length) % STONES.length;
  const s = STONES[n];
  currentId = s.id;
  Object.assign(cam, camFor(n)); render();    // keep the wall in sync underneath
  dots.forEach((d, k) => d.classList.toggle('active', k === n));
  names.forEach((nm, k) => nm.classList.toggle('active', k === n));
  materialName.textContent = s.name;
  materialCat.textContent  = s.cat;
  materialImg.src = s.material;
  if (window.gsap) gsap.fromTo(materialImg, { autoAlpha: 0, scale: 1.06 }, { autoAlpha: 1, scale: 1, duration: 0.9, ease: 'power3.out' });
  playSound(sndSlide);
}

// click a marker: 1st click focuses · 2nd click on the focused stone → Material View
function onMarkerClick(i) {
  if (!arrived) { skipIntro(); return; }
  if (level === 'material') return;
  const s = STONES[i];
  if (level === 'focus' && currentId === s.id) { openMaterial(s.id); return; }
  focusStone(s.id);
}

const overviewBtn = document.getElementById('overviewBtn');
overviewBtn.addEventListener('click', gallery);
inspectBtn.addEventListener('click', () => { if (currentId) openMaterial(currentId); });
document.getElementById('materialBack').addEventListener('click', closeMaterial);
document.getElementById('mPrev').addEventListener('click', () => materialStep(-1));
document.getElementById('mNext').addEventListener('click', () => materialStep(1));

// clicking the wall (only in focus): a neighbour panel focuses that stone directly;
// clicking the focused panel or the bare wall pulls back to the gallery view
window.addEventListener('click', (e) => {
  if (!arrived || level !== 'focus') return;
  if (e.target.closest('.spot') || e.target.closest('.name') ||
      e.target.closest('.topbar') || e.target.closest('.inspect')) return;
  const focused = STONES.indexOf(byId(currentId));
  const i = panelAtX(e.clientX);
  if (i !== -1 && i !== focused) focusStone(STONES[i].id);
  else gallery();
});

// ============================================================
//  CINEMATIC INTRO  (angled view → straight wall)
// ============================================================
let introTl = null;

function finishIntro() {
  arrived = true;
  render();
  updateHint();
  // arriving from a Studio page with #focus=<id> → go straight to that stone's focus
  const m = (location.hash || '').match(/focus=([a-z]+)/i);
  if (m && byId(m[1])) { setTimeout(() => focusStone(m[1]), 60); }
}

function buildIntro() {
  computeGeo();
  Object.assign(cam, galleryCam());
  render();
  if (!window.gsap) { gsapFallback(); return; }
  // arriving from a Studio page → skip the storefront intro, land on the wall, then focus
  if (/focus=/.test(location.hash)) { gsapFallback(); return; }
  // wait for the storefront image before rolling the camera — avoids a black flash
  const angleImg = document.getElementById('viewAngle');
  const start = () => {
    if (arrived) return;
    gsap.set('#viewFront', { autoAlpha: 0, scale: 1.12 });
  gsap.set('#viewAngle', { transformOrigin: '57% 52%' });
  introTl = gsap.timeline({ delay: 0.5, onComplete: finishIntro });
  // 1 · headline drifts away
  introTl.to('#introText', { x: -90, autoAlpha: 0, duration: 0.8, ease: 'power2.inOut' }, 0);
  // 2 · the storefront dollies forward (walking up to the door) and dips to black
  introTl.to('#viewAngle', { scale: 1.16, autoAlpha: 0, duration: 1.2, ease: 'power2.in' }, 0.4);
  // 3 · (brief black — stepping through the door) the gallery wall emerges and settles
  introTl.fromTo('#viewFront', { scale: 1.12, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 1.3, ease: 'power3.out' }, 1.45);
  // 4 · chrome rises once we are inside, facing the wall
  introTl.to(['#vignette', '#topbar'], { autoAlpha: 1, duration: 0.8, ease: 'power2.out' }, '-=0.55');
  introTl.to('#panels', { autoAlpha: 1, duration: 0.8, ease: 'power2.out' }, '<');
  };
  if (angleImg && !angleImg.complete && angleImg.decode) {
    Promise.race([
      angleImg.decode().catch(() => {}),
      new Promise(r => setTimeout(r, 2500)) // never wait more than 2.5s
    ]).then(start);
  } else { start(); }
}

function gsapFallback() {
  document.getElementById('viewFront').style.opacity = 1;
  document.getElementById('viewFront').style.transform = 'none';
  document.getElementById('viewAngle').style.opacity = 0;
  document.getElementById('introText').style.opacity = 0;
  ['vignette', 'topbar', 'panels'].forEach(id => {
    const el = document.getElementById(id);
    el.style.visibility = 'visible'; el.style.opacity = 1;
  });
  finishIntro();
}

function skipIntro() {
  if (arrived) return;
  if (introTl) introTl.progress(1); else gsapFallback();
}

// ============================================================
//  MOBILE PORTRAIT SHOWROOM  (full-screen swipe carousel)
//  The lateral camera wall is built for wide screens; on a
//  portrait phone we present a dedicated stories-style browser.
// ============================================================
let mobileMode = false;
const portraitMQ = window.matchMedia('(max-width: 760px) and (orientation: portrait)');

function buildMobileShowroom() {
  mobileMode = true;
  const SWATCH = {
    travertine: 'assets/materials/travertine.jpg',
    marble:     'assets/materials/marble.jpg',
    limestone:  'assets/materials/limestone.jpg',
    andesite:   'assets/materials/andesite.jpg',
    quartzite:  'assets/materials/quartzite.jpg',
    terrazzo:   'assets/textures/terrazzo-pink-200.jpg'
  };
  // horizontal focus point into the gallery-wall image so each row frames its own lit niche
  const NICHE_X = { travertine: 6, marble: 25, limestone: 43, andesite: 60, quartzite: 78, terrazzo: 95 };
  const wall = 'assets/web/gallery-wall.jpg';
  const root = document.getElementById('mobileSR');
  if (!root) return;
  const arrow = '<svg viewBox="0 0 24 14"><path d="M3 7 H19 M13 1 l6 6 -6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let rows = '';
  STONES.forEach(s => {
    const sw = SWATCH[s.id] || s.material;
    const nx = NICHE_X[s.id] != null ? NICHE_X[s.id] : 50;
    const target = encodeURI(s.mobile3d || s.studio3d || s.page);
    rows +=
      '<a class="msr-row" href="' + target + '" aria-label="Explore ' + s.name + '">' +
        '<div class="msr-niche"><img src="' + wall + '" alt="" style="object-position:' + nx + '% center"></div>' +
        '<div class="msr-swatch" style="background-image:url(\'' + sw + '\')">' +
          '<span class="msr-row-name">' + s.name + '</span>' +
          '<span class="msr-row-go">' + arrow + '</span>' +
        '</div>' +
      '</a>';
  });
  const cubeSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 2.5 L20.5 7 V17 L12 21.5 L3.5 17 V7 Z" stroke-linejoin="round"/><path d="M3.5 7 L12 11.5 L20.5 7 M12 11.5 V21.5" stroke-linejoin="round"/></svg>';

  root.innerHTML =
    // ---------- ENTRANCE HERO ----------
    '<section class="msr-hero" id="msrHero">' +
      '<header class="msr-hero-top">' +
        '<a class="msr-hicon" href="Mobile%20Hero.html" aria-label="Back to site"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7 H20 M4 12 H20 M4 17 H20" stroke-linecap="round"/></svg></a>' +
        '<button class="msr-hicon" id="msrCube" type="button" aria-label="Enter virtual showroom">' + cubeSVG + '</button>' +
      '</header>' +
      '<div class="msr-hero-img"><img src="assets/web/showroom-entrance.jpg" alt="Rivano Stone showroom storefront at dusk"></div>' +
      '<div class="msr-hero-body">' +
        '<div class="msr-hero-eyebrow">Virtual Showroom</div>' +
        '<h1 class="msr-hero-title">Visualize.<br>Compare.<br><span class="em">Decide.</span></h1>' +
        '<p class="msr-hero-sub">Visualize materials, compare textures, and discover how each stone transforms architectural spaces.</p>' +
        '<button class="msr-enter" id="msrEnter" type="button">Enter Virtual Showroom' +
          '<svg viewBox="0 0 24 14"><path d="M3 7 H19 M13 1 l6 6 -6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<div class="msr-feats">' +
          '<div class="msr-feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 12 C5 6 9 4 12 4 C15 4 19 6 22 12 C19 18 15 20 12 20 C9 20 5 18 2 12 Z" stroke-linejoin="round"/><circle cx="12" cy="12" r="3"/></svg><span>High-Resolution<br>Preview</span></div>' +
          '<div class="msr-feat"><span class="fc">' + cubeSVG + '</span><span>3D<br>Immersive</span></div>' +
          '<div class="msr-feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5 H13" stroke-linecap="round"/></svg><span>Any Device<br>Anytime</span></div>' +
        '</div>' +
      '</div>' +
    '</section>' +
    // ---------- MATERIAL LIST ----------
    '<header class="msr-top">' +
      '<div class="msr-brand"><span class="bn">RIVANO STONE</span><span class="bs">VIRTUAL SHOWROOM</span></div>' +
      '<a class="msr-exit" href="Mobile%20Hero.html" aria-label="Exit showroom"><svg viewBox="0 0 24 24"><path d="M6 6 L18 18 M18 6 L6 18" stroke-linecap="round"/></svg></a>' +
    '</header>' +
    '<div class="msr-scroller">' +
      '<div class="msr-head">' +
        '<div class="msr-eyebrow">The Material Wall</div>' +
        '<p class="msr-sub">Tap a material to explore in detail</p>' +
      '</div>' +
      '<div class="msr-list">' + rows + '</div>' +
    '</div>' +
    '<footer class="msr-foot"><span class="pt"></span> Tap a material to step closer</footer>';

  const hero = document.getElementById('msrHero');
  const heroImg = hero.querySelector('.msr-hero-img img');

  function enterShowroom() {
    hero.classList.add('gone');
  }
  const eb = document.getElementById('msrEnter'); if (eb) eb.addEventListener('click', enterShowroom);
  const cb = document.getElementById('msrCube'); if (cb) cb.addEventListener('click', enterShowroom);

  if (skipMobileEntrance()) {
    // Coming back from a studio — skip immediately
    hero.style.transition = 'none'; hero.classList.add('gone');
  } else {
    // Cinematic entrance: slow zoom on the building image, then auto-advance
    if (heroImg) {
      heroImg.style.transition = 'transform 3.8s cubic-bezier(0.25, 0, 0.15, 1)';
      heroImg.style.transformOrigin = '52% 40%';
      heroImg.style.transform = 'scale(1)';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        heroImg.style.transform = 'scale(1.18)';
      }));
    }
    // Auto-advance after 3.2s
    var autoTimer = setTimeout(enterShowroom, 3200);
    // Tap anywhere on hero also advances
    hero.addEventListener('click', function() { clearTimeout(autoTimer); enterShowroom(); }, { once: true });
  }
}

// #mobile (or ?view=mobile) forces the portrait showroom even on a wide preview
// window; #desktop / ?view=desktop forces the 3D wall. Else auto-detect by viewport.
function forcedView() {
  try {
    var h = (location.hash || '').replace('#', '');
    if (h === 'mobile' || h === 'enter') return 'mobile';
    if (h === 'desktop') return 'desktop';
    var v = new URLSearchParams(location.search).get('view');
    return (v === 'mobile' || v === 'desktop') ? v : null;
  } catch (e) { return null; }
}
// Skip the entrance when coming back from a studio (referrer check + #enter hash).
function skipMobileEntrance() {
  const ref = document.referrer || '';
  if (/Studio\.html|Mobile\.html/i.test(ref)) return true;
  return (location.hash || '').replace('#', '') === 'enter';
}
function boot() {
  var forced = forcedView();
  if (forced === 'mobile' || (!forced && portraitMQ.matches)) {
    if (forced === 'mobile') document.documentElement.classList.add('force-mobile');
    buildMobileShowroom();
  } else {
    buildIntro();
  }
}
// switching between portrait phone and landscape/desktop rebuilds the right
// experience — but not when a view is explicitly forced via the URL
portraitMQ.addEventListener('change', function () { if (!forcedView()) location.reload(); });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
// a click anywhere skips the intro (desktop / landscape only)
window.addEventListener('click', () => { if (!mobileMode && !arrived) skipIntro(); }, true);

// ============================================================
//  RESIZE  (recompute geometry, keep current framing)
// ============================================================
window.addEventListener('resize', () => {
  if (mobileMode) return;
  computeGeo();
  if (currentId) Object.assign(cam, camFor(STONES.indexOf(byId(currentId))));
  else Object.assign(cam, galleryCam());
  render();
});

// ============================================================
//  HINT + KEYBOARD
// ============================================================
const hintEl = document.getElementById('hint');
function updateHint() {
  hintEl.classList.toggle('show', arrived && !currentId);
}

window.addEventListener('keydown', (e) => {
  if (!arrived) return;
  if (e.key === 'Escape') {
    if (level === 'material') { closeMaterial(); return; }
    if (level === 'focus')    { gallery(); return; }
  }
  if (level === 'material') {
    if (e.key === 'ArrowRight') materialStep(1);
    if (e.key === 'ArrowLeft')  materialStep(-1);
    return;
  }
  if (/^[1-6]$/.test(e.key)) focusStone(STONES[+e.key - 1].id);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const cur = currentId ? STONES.indexOf(byId(currentId)) : (dir === 1 ? -1 : STONES.length);
    const next = Math.max(0, Math.min(STONES.length - 1, cur + dir));
    focusStone(STONES[next].id);
  }
});

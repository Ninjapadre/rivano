/* ============================================================
   RIVANO — Stone Studio · shared UI (swatches, finish circles,
   texture viewer). Reads window.STONE and drives the page.
   ============================================================ */
(function () {
  const CFG = window.STONE || {};
  const colors = CFG.colors || [];
  const gsap = window.gsap;
  const $ = id => document.getElementById(id);
  const byKey = k => colors.find(c => c.key === k) || {};
  let current = CFG.defaultKey || (colors[0] && colors[0].key);

  // ---------- left panel + title ----------
  const titleEl = $('stoneTitle');
  const esc = s => (s || '').replace(/&/g, '&amp;');
  function applyStatic() {
    const sp = CFG.specs || {};
    const set = (id, v) => { const e = $(id); if (e != null && v != null) e.textContent = v; };
    set('specType', sp.type); set('specFinish', sp.finish); set('specThickness', sp.thickness);
    set('specSizes', sp.sizes); set('specApplications', sp.applications);
    const tvT = $('tvType'), tvF = $('tvFinish'), tvTh = $('tvThickness');
    if (tvT && sp.type) tvT.textContent = sp.type;
    if (tvF && sp.finish) tvF.textContent = sp.finish;
    if (tvTh && sp.thickness) tvTh.textContent = sp.thickness;
  }

  // ---------- finish circles ----------
  const finishDots = $('finishDots');
  function updateForColor() {
    const c = byKey(current);
    if (titleEl) titleEl.innerHTML = CFG.name + ' <br><em>' + esc(c.label) + '</em>';
    const so = $('specOrigin'); if (so) so.textContent = c.origin || '';
    const to = $('tvOrigin'); if (to) to.textContent = c.origin || '';
    const sp = CFG.specs || {};
    const sf = $('specFinish'); if (sf) sf.textContent = c.finishLabel || sp.finish || sf.textContent;
    const tf = $('tvFinish'); if (tf) tf.textContent = c.finishLabel || sp.finish || tf.textContent;
    const sa = $('specApplications'); if (sa) sa.textContent = c.applicationsLabel || sp.applications || sa.textContent;
    const sth = $('specThickness'); if (sth) sth.textContent = c.thicknessLabel || sp.thickness || sth.textContent;
    const tth = $('tvThickness'); if (tth) tth.textContent = c.thicknessLabel || sp.thickness || tth.textContent;
    if (finishDots) {
      finishDots.style.setProperty('--ring', c.ring || '#BFA46A');
      const nonPoli = $('dotNonPoli'), poli = $('dotPoli'), reb = $('dotRebord');
      let any = false;
      if (c.finish && nonPoli && poli) {
        nonPoli.style.backgroundImage = `url('${c.finish.unpoli}')`;
        poli.style.backgroundImage = `url('${c.finish.poli}')`;
        any = true;
      }
      if (c.rebord && reb) {
        reb.style.backgroundImage = `url('${c.rebord}')`;
        any = true;
      }
      if (any) { finishDots.classList.remove('hidden'); document.body.classList.add('with-dots'); }
      else { finishDots.classList.add('hidden'); document.body.classList.remove('with-dots'); }
    }
  }

  // ---------- swatches (with scroller when more than `visible`) ----------
  const row = $('swatchRow');
  const visible = CFG.visible || 5;
  let scrollIdx = 0;
  function buildSwatches() {
    row.innerHTML = '';
    colors.forEach(c => {
      const b = document.createElement('button');
      b.className = 'chip' + (c.key === current ? ' active' : '');
      b.dataset.variant = c.key;
      b.innerHTML = `<span class="chip-img" style="background-image:url('${c.swatch}')"></span>` +
        `<span class="chip-name">${esc(c.label)}</span>`;
      b.addEventListener('click', () => select(c.key));
      row.appendChild(b);
    });
    setupScroller();
  }
  function setupScroller() {
    const wrap = row.parentElement; // .swatch-rail
    const prev = $('swPrev'), next = $('swNext');
    if (colors.length <= visible) { if (prev) prev.style.display = 'none'; if (next) next.style.display = 'none'; row.style.transform = 'none'; return; }
    if (prev) prev.style.display = next.style.display = 'grid';
    const clampMax = colors.length - visible;
    const stepPx = () => { const chip = row.children[0]; const gap = parseFloat(getComputedStyle(row).gap) || 24; return chip.getBoundingClientRect().width + gap; };
    const apply = () => {
      scrollIdx = Math.max(0, Math.min(clampMax, scrollIdx));
      row.style.transform = `translateX(${-scrollIdx * stepPx()}px)`;
      prev.classList.toggle('off', scrollIdx <= 0);
      next.classList.toggle('off', scrollIdx >= clampMax);
    };
    prev.onclick = () => { scrollIdx--; apply(); };
    next.onclick = () => { scrollIdx++; apply(); };
    // mouse wheel / trackpad (horizontal or vertical) scrolls the rail
    let lastWheel = 0;
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const now = Date.now(); if (now - lastWheel < 90) return; lastWheel = now;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      scrollIdx += d > 0 ? 1 : -1; apply();
    }, { passive: false });
    // drag to scroll (mouse / trackpad press)
    let dragging = false, sx = 0, sIdx = 0, moved = false;
    wrap.addEventListener('pointerdown', (e) => { dragging = true; moved = false; sx = e.clientX; sIdx = scrollIdx; });
    wrap.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx; if (Math.abs(dx) > 6) moved = true;
      scrollIdx = sIdx - Math.round(dx / stepPx()); apply();
    });
    const endDrag = () => { dragging = false; };
    wrap.addEventListener('pointerup', endDrag);
    wrap.addEventListener('pointerleave', endDrag);
    // swallow the chip click if it was actually a drag
    wrap.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);
    requestAnimationFrame(apply);
    window.addEventListener('resize', apply);
  }
  function select(key) {
    current = key;
    [...row.children].forEach(b => b.classList.toggle('active', b.dataset.variant === key));
    updateForColor();
    if (typeof syncLightButtons === 'function') syncLightButtons();
    (window.StoneStudio || window.MarbleStudio || {}).selectVariant && (window.StoneStudio || window.MarbleStudio).selectVariant(key);
  }

  // ============================================================
  //  TEXTURE VIEWER
  // ============================================================
  const tv = $('texview'), tvImg = $('tvImg'), tvStage = $('tvStage'), tvPct = $('tvPct'), presetWrap = $('tvPresets');
  let fitScale = 1, disp = 1, off = { x: 0, y: 0 }, natW = 1, natH = 1, tvOpen = false, levelsMode = false, levels = [], levelIdx = 0;
  const MINZ = 1, MAXZ = 2;

  function clampPan() {
    const w = natW * disp, h = natH * disp;
    const mx = Math.max(0, (w - innerWidth) / 2) + innerWidth * 0.05;
    const my = Math.max(0, (h - innerHeight) / 2) + innerHeight * 0.05;
    off.x = Math.max(-mx, Math.min(mx, off.x)); off.y = Math.max(-my, Math.min(my, off.y));
  }
  function applyTransform() {
    clampPan();
    tvImg.style.transform = `translate(${off.x}px,${off.y}px) translate(${-natW * disp / 2}px,${-natH * disp / 2}px) scale(${disp})`;
    if (!levelsMode) { const z = disp / fitScale; tvPct.textContent = Math.round(z * 100) + '%'; [...presetWrap.children].forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.z - z) < 0.02)); }
  }
  const coverFit = () => Math.max(innerWidth / natW, innerHeight / natH);
  const containFit = () => Math.min(innerWidth / natW, innerHeight / natH) * 0.92;
  function showImage(src, cover, anim) {
    tvImg.style.opacity = '0';
    const im = new Image();
    im.onload = () => {
      natW = im.naturalWidth; natH = im.naturalHeight; tvImg.src = src;
      tvImg.style.width = natW + 'px'; tvImg.style.height = natH + 'px';
      fitScale = cover ? coverFit() : containFit(); disp = fitScale; off.x = 0; off.y = 0; applyTransform();
      if (gsap && anim) gsap.fromTo(tvImg, { opacity: 0 }, { opacity: 1, duration: 0.55, ease: 'power2.out' }); else tvImg.style.opacity = '1';
    };
    im.src = src;
  }
  function setZoom(z) { z = Math.max(MINZ, Math.min(MAXZ, z)); disp = fitScale * z; off.x = 0; off.y = 0; applyTransform(); }
  function fitImage() { off.x = 0; off.y = 0; if (!levelsMode) disp = fitScale; applyTransform(); }
  function setLevel(i, anim) { levelIdx = Math.max(0, Math.min(levels.length - 1, i)); showImage(levels[levelIdx], true, anim); const pb = presetWrap.children[levelIdx]; tvPct.textContent = pb ? pb.textContent : ((levelIdx + 1) * 100) + '%'; [...presetWrap.children].forEach((b, k) => b.classList.toggle('on', k === levelIdx)); }
  const zoomIn = () => levelsMode ? setLevel(levelIdx + 1, true) : setZoom(disp / fitScale * 1.6);
  const zoomOut = () => levelsMode ? setLevel(levelIdx - 1, true) : setZoom(disp / fitScale / 1.6);

  function chrome() {
    if (!gsap) { tv.style.opacity = 1; return; }
    gsap.killTweensOf(tv);
    gsap.fromTo(tv, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power2.out' });
    gsap.fromTo('.texview-top, .tv-zoom, .tv-presets, .tv-fit', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.6, delay: 0.25, ease: 'power3.out', stagger: 0.04 });
  }
  function openTexture() {
    const c = byKey(current);
    $('tvName').textContent = c.label; $('tvInfoName').textContent = c.label;
    tv.style.display = 'block'; tvOpen = true;
    if (c.levels && c.levels.length) { levelsMode = true; levels = c.levels; setLevel(0, true); }
    else { levelsMode = false; showImage(c.hd || c.swatch, false, true); }
    chrome();
  }
  function openFinish(src) {
    const c = byKey(current);
    $('tvName').textContent = c.label; $('tvInfoName').textContent = c.label;
    tv.style.display = 'block'; tvOpen = true; levelsMode = false; showImage(src, true, true); chrome();
  }
  function closeTexture() { tvOpen = false; $('tvInfo').classList.remove('show'); if (gsap) gsap.to(tv, { autoAlpha: 0, duration: 0.5, ease: 'power2.inOut', onComplete: () => { tv.style.display = 'none'; } }); else tv.style.display = 'none'; }

  $('viewTexBtn').addEventListener('click', openTexture);
  $('tvBack').addEventListener('click', closeTexture);
  $('tvFit').addEventListener('click', fitImage);
  $('tvPlus').addEventListener('click', zoomIn);
  $('tvMinus').addEventListener('click', zoomOut);
  presetWrap.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (levelsMode) setLevel(+b.dataset.z - 1, true); else setZoom(+b.dataset.z); });
  $('tvInfoBtn').addEventListener('click', () => $('tvInfo').classList.toggle('show'));
  tvStage.addEventListener('wheel', e => { if (!tvOpen) return; e.preventDefault(); e.deltaY < 0 ? zoomIn() : zoomOut(); }, { passive: false });
  tvStage.addEventListener('dblclick', () => { if (levelsMode) setLevel(levelIdx ? 0 : 1, true); else if (disp / fitScale > 1.5) fitImage(); else setZoom(2); });
  if (finishDots) finishDots.addEventListener('click', e => { e.preventDefault(); });   // finish circles are display-only
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && tvOpen) closeTexture(); });
  window.addEventListener('resize', () => { if (!tvOpen) return; fitScale = levelsMode ? coverFit() : containFit(); if (levelsMode) disp = fitScale; applyTransform(); });

  // ---------- boot ----------
  const backLink = document.querySelector('.back');
  if (backLink) backLink.setAttribute('href', 'showroom.html#focus=' + (CFG.name || '').toLowerCase());

  // ---------- request sample CTA + mobile-portrait studio layout ----------
  (function injectStudioMobile() {
    if (document.querySelector('.studio-sample-link')) return;

    // Request Sample button (desktop: solid pill under View Texture · portrait: outlined)
    const a = document.createElement('a');
    a.className = 'studio-sample-link';
    a.href = 'Request%20Sample%20Mobile.html?material=' + encodeURIComponent(CFG.name || '');
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<rect x="4" y="4" width="12" height="12" rx="1"></rect><rect x="9" y="9" width="11" height="11" rx="1"></rect></svg>' +
      '<span>Request Sample</span>';
    const titleEl = document.getElementById('stoneTitle');
    if (titleEl) titleEl.insertAdjacentElement('afterend', a);
    else document.body.appendChild(a);

    // Finishes column (label + swatch rail + dots) — passthrough on desktop, stacked on portrait
    (function buildFinishes() {
      const sw = document.querySelector('.swatches');
      if (!sw || document.querySelector('.studio-fin')) return;
      const col = document.createElement('div'); col.className = 'studio-fin';
      const vt = document.createElement('button'); vt.className = 'studio-viewtex-btn'; vt.type = 'button';
      vt.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"></circle><path d="M16 16 L21 21" stroke-linecap="round"></path></svg><span>View Texture</span>';
      vt.addEventListener('click', () => { const b = document.getElementById('viewTexBtn'); if (b) b.click(); });
      const lbl = document.createElement('div'); lbl.className = 'studio-fin-label'; lbl.textContent = 'Explore Other Finishes';
      const dotsEl = document.createElement('div'); dotsEl.className = 'studio-fin-dots';
      sw.parentNode.insertBefore(col, sw);
      col.appendChild(vt); col.appendChild(lbl); col.appendChild(sw); col.appendChild(dotsEl);
      const colorsArr = (window.STONE && window.STONE.colors) || [];
      colorsArr.forEach((c, i) => {
        const d = document.createElement('i'); d.dataset.i = i;
        d.addEventListener('click', () => { const chip = document.querySelectorAll('#swatchRow .chip')[i]; if (chip) chip.click(); });
        dotsEl.appendChild(d);
      });
      const row = document.getElementById('swatchRow');
      function sync() {
        const chips = Array.prototype.slice.call(document.querySelectorAll('#swatchRow .chip'));
        const idx = chips.findIndex(ch => ch.classList.contains('active'));
        Array.prototype.slice.call(dotsEl.children).forEach((d, k) => d.classList.toggle('on', k === idx));
      }
      if (row) { try { new MutationObserver(sync).observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); } catch (e) {} }
      requestAnimationFrame(sync);
    })();

    const st = document.createElement('style');
    st.textContent =
      // ----- desktop — stone name ONE line, button BELOW, specs below button -----
      '@media (min-width:881px){' +
        '.panel-l{display:block;width:clamp(240px,22vw,310px);}' +
        '.title{font-size:clamp(24px,2.2vw,32px) !important;white-space:nowrap;margin-bottom:18px;}' +
        '.title br{display:none;}' +
      '}' +
      '.studio-sample-link{display:inline-flex;align-items:center;gap:9px;margin-top:0;margin-bottom:4px;padding:11px 16px;' +
        'font-family:var(--sans);white-space:nowrap;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#fff;' +
        'background:#B0703E;border:1px solid rgba(176,112,62,0.8);' +
        'transition:background .25s ease,transform .2s ease;}' +
      '.studio-sample-link:hover{background:#9c5f31;transform:translateY(-1px);}' +
      '.studio-sample-link svg{width:13px;height:13px;flex:0 0 auto;color:#fff;transition:transform .25s ease;}' +
      '.studio-sample-link:hover svg{transform:translateX(3px);}' +
      '.studio-fin{display:contents;}.studio-fin-label{display:none;}.studio-fin-dots{display:none;}.studio-viewtex-btn{display:none;}' +
      // ----- mobile portrait (reference layout) -----
      '@media (max-width:760px) and (orientation:portrait){' +
        '.topbar{padding:calc(16px + env(safe-area-inset-top)) 16px 12px;}' +
        '.back{width:46px;height:46px;border-radius:50%;justify-content:center;gap:0;font-size:0;' +
          'border:1px solid rgba(245,239,228,0.3);background:rgba(12,10,9,0.34);backdrop-filter:blur(6px);}' +
        '.back svg{width:18px;height:11px;}' +
        '.viewtex-link{display:none !important;}' +
        '.brand{position:absolute;left:50%;transform:translateX(-50%);}' +
        '.brand .bn{font-size:18px;white-space:nowrap;}.brand .bs{font-size:8px;white-space:nowrap;}' +
        '.panel{position:fixed;top:calc(116px + env(safe-area-inset-top));bottom:auto;transform:none;width:47%;}' +
        '.panel-l{left:18px;right:auto;display:block;}' +
        '.title{font-size:clamp(28px,8.6vw,38px);margin-bottom:18px;}' +
        '.eyebrow{margin-bottom:13px;font-size:9.5px;}' +
        '.spec{padding:9px 0;}.spec .k{font-size:9px;margin-bottom:5px;}.spec .v{font-size:16px;}' +
        '.finish-dots{display:none !important;}' +
        'body.with-dots .panel-r{right:auto;}' +
        '.studio-fin{display:flex;flex-direction:column;align-items:center;gap:13px;position:fixed;left:0;right:0;' +
          'bottom:calc(16px + env(safe-area-inset-bottom));z-index:16;}' +
        '.studio-viewtex-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;margin-bottom:4px;padding:11px 20px;border-radius:9px;font-family:var(--sans);white-space:nowrap;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#F5EFE4;background:rgba(12,10,9,0.45);border:1px solid rgba(191,164,106,0.7);}' +
        '.studio-viewtex-btn svg{width:14px;height:14px;color:var(--gold);}' +
        '.studio-fin-label{display:block;font-family:var(--sans);font-size:10px;letter-spacing:0.26em;text-transform:uppercase;color:rgba(245,239,228,0.62);white-space:nowrap;}' +
        '.swatches{position:static;left:auto;transform:none;bottom:auto;}' +
        '.sw-arrow{display:none !important;}' +
        '.swatch-rail{max-width:100vw;overflow-x:scroll;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:0 16px;}' +
        '.swatch-rail::-webkit-scrollbar{display:none;}' +
        '.swatch-row{transform:none !important;flex-wrap:nowrap;width:max-content;}' +
        '.studio-fin-dots{display:flex;align-items:center;gap:7px;}' +
        '.studio-fin-dots i{width:6px;height:6px;border-radius:50%;background:rgba(245,239,228,0.28);transition:background .25s ease,transform .25s ease;cursor:pointer;}' +
        '.studio-fin-dots i.on{background:var(--gold);transform:scale(1.3);}' +
        '.hint{display:none;}' +
      '}';
    document.head.appendChild(st);
  })();

  // ---------- minimal name + info "i" popover (all stones, all sizes) ----------
  (function injectInfo() {
    const panelL = document.querySelector('.panel-l');
    if (!panelL || document.querySelector('.studio-info-btn')) return;

    // build a fresh popover from the spec data (mirrors live values, no gsap residue)
    const specEls = Array.prototype.slice.call(panelL.querySelectorAll('.spec'));
    const rows = specEls.map(s => ({ k: ((s.querySelector('.k') || {}).textContent || ''), vEl: s.querySelector('.v') }));
    // Do NOT hide specs here — CSS media query hides them on mobile only (see st2 below)

    const info = document.createElement('div');
    info.className = 'studio-info-panel';
    info.id = 'studioInfoPanel';
    info.innerHTML = rows.map((r, i) =>
      '<div class="sinfo-row"><span class="sinfo-k">' + esc(r.k) + '</span><span class="sinfo-v" data-i="' + i + '"></span></div>'
    ).join('');
    document.body.appendChild(info);

    function mirror() {
      rows.forEach((r, i) => {
        const el = info.querySelector('.sinfo-v[data-i="' + i + '"]');
        if (el && r.vEl) el.textContent = r.vEl.textContent;
      });
    }
    mirror();
    try {
      const mo = new MutationObserver(mirror);
      rows.forEach(r => { if (r.vEl) mo.observe(r.vEl, { childList: true, characterData: true, subtree: true }); });
    } catch (e) {}

    const btn = document.createElement('button');
    btn.className = 'studio-info-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Stone information');
    btn.innerHTML = '<span>i</span>';
    document.body.appendChild(btn);

    const isMob = () => window.matchMedia('(max-width:880px)').matches;
    const setOpen = o => {
      open = o;
      btn.classList.toggle('on', o);
      info.style.opacity = o ? '1' : '0';
      info.style.visibility = o ? 'visible' : 'hidden';
      info.style.pointerEvents = o ? 'auto' : 'none';
      if (isMob()) {
        info.style.transform = 'translateY(' + (o ? '0' : '8px') + ')';
      } else {
        info.style.transform = 'translateX(-50%) translateY(' + (o ? '0' : '-8px') + ')';
      }
    };
    setOpen(false);
    btn.addEventListener('click', e => { e.stopPropagation(); setOpen(!open); });
    document.addEventListener('click', e => { if (open && !info.contains(e.target) && !btn.contains(e.target)) setOpen(false); });
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && open) setOpen(false); });

    const st2 = document.createElement('style');
    st2.textContent =
      /* "i" button — hidden on desktop, shown only on mobile */
      '.studio-info-btn{display:none;}' +
      '.studio-info-panel{position:fixed;top:24vh;left:50%;transform:translateX(-50%) translateY(-8px);z-index:23;' +
        'width:min(300px,82vw);padding:4px 16px;border-radius:12px;background:rgba(12,9,8,0.96);border:1px solid rgba(191,164,106,0.32);' +
        'backdrop-filter:blur(12px);box-shadow:0 24px 60px rgba(0,0,0,0.55);opacity:0;visibility:hidden;pointer-events:none;' +
        'transition:opacity .3s ease,transform .3s ease,visibility .3s;}' +
      '.sinfo-row{display:flex;justify-content:space-between;gap:14px;align-items:baseline;padding:8px 0;border-top:1px solid rgba(245,239,228,0.1);}' +
      '.sinfo-row:first-child{border-top:none;}' +
      '.sinfo-k{font-size:8.5px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(245,239,228,0.52);white-space:nowrap;}' +
      '.sinfo-v{font-family:var(--serif);font-size:14px;letter-spacing:0.02em;color:rgba(245,239,228,0.94);text-align:right;}' +
      /* mobile: hide specs from left panel, show "i" button */
      '@media (max-width:880px){' +
        '.panel-l .spec{display:none !important;}' +
        '.panel-l .applist{display:none !important;}' +
        '.studio-info-btn{' +
          'position:fixed;bottom:calc(160px + env(safe-area-inset-bottom));right:18px;left:auto;z-index:24;' +
          'width:42px;height:42px;border-radius:50%;display:grid;place-items:center;' +
          'background:rgba(12,10,9,0.52);border:1px solid rgba(191,164,106,0.6);color:var(--gold);' +
          'backdrop-filter:blur(6px);cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,0.4);' +
          'transition:background .25s ease,transform .2s ease;}' +
        '.studio-info-btn.on{background:rgba(191,164,106,0.22);}' +
        '.studio-info-btn span{font-family:var(--serif);font-style:italic;font-size:20px;line-height:1;}' +
        '.studio-info-panel{top:auto;bottom:calc(210px + env(safe-area-inset-bottom));right:18px;left:auto;transform:translateY(8px);width:min(260px,74vw);}' +
      '}';
    document.head.appendChild(st2);
  })();

  // ---------- light toggle (only on backlight-enabled stones) ----------
  const lightBtn = $('lightBtn');
  const blKeys = CFG.backlightKeys || null;       // null = all stones; array = only those keys
  const api = () => window.StoneStudio || window.MarbleStudio || {};
  function allowsLight(key) { return !!CFG.backlight && (!blKeys || blKeys.includes(key)); }
  function syncLightButtons() {
    const ok = allowsLight(current);
    if (lightBtn) lightBtn.style.display = ok ? 'inline-flex' : 'none';
    if (!ok) {
      const a = api();
      if (a.setBacklight) a.setBacklight(false);
      if (lightBtn) { lightBtn.classList.remove('on'); lightBtn.setAttribute('aria-pressed', 'false'); }
    }
  }
  if (lightBtn) lightBtn.addEventListener('click', () => {
    const a = api(); const on = a.toggleBacklight ? a.toggleBacklight() : false;
    lightBtn.classList.toggle('on', on); lightBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  applyStatic();


  buildSwatches();
  updateForColor();
  syncLightButtons();
})();

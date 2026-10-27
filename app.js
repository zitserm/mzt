(() => {
  // Real-world diameters/lengths in mm.
  const REFERENCES = {
    card: { label: 'credit card', mm: 85.6 },
    dollar: { label: 'dollar coin', mm: 26.49 },
    half: { label: 'half dollar', mm: 30.61 },
    quarter: { label: 'quarter', mm: 24.26 },
    nickel: { label: 'nickel', mm: 21.21 },
    penny: { label: 'penny', mm: 19.05 },
    dime: { label: 'dime', mm: 17.91 },
  };

  const STEPS = [
    'Step 1 of 3: tap the two ends of the reference object (for a coin, tap across its widest part).',
    'Step 2 of 3: tap the two ends of the track’s length.',
    'Step 3 of 3: tap the two ends of the track’s width (across the widest part).',
  ];

  const $ = (id) => document.getElementById(id);
  const canvas = $('view');
  const ctx = canvas.getContext('2d');
  const referenceSelect = $('reference');
  const customRow = $('customRow');
  const customInput = $('customMm');

  // points: image-pixel coordinates, in order [ref0, ref1, len0, len1, wid0, wid1]
  const state = {
    img: null,
    points: [],
    view: { s: 1, x: 0, y: 0 },
    fitScale: 1,
    pointers: new Map(),
    tap: null,
    pinch: null,
  };

  // ---------- helpers ----------

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmtMm = (mm) => `${mm.toFixed(1)} mm`;
  const fmtIn = (mm) => `${(mm / 25.4).toFixed(2)} in`;

  function referenceMm() {
    if (referenceSelect.value === 'custom') {
      const v = parseFloat(customInput.value);
      return v > 0 ? v : null;
    }
    return REFERENCES[referenceSelect.value].mm;
  }

  function referenceName() {
    return referenceSelect.value === 'custom' ? 'custom object' : REFERENCES[referenceSelect.value].label;
  }

  // Returns mm for each measured line, or null where not yet available.
  function measurements() {
    const p = state.points;
    const refMm = referenceMm();
    if (p.length < 2 || !refMm) return null;
    const mmPerPx = refMm / dist(p[0], p[1]);
    return {
      mmPerPx,
      length: p.length >= 4 ? dist(p[2], p[3]) * mmPerPx : null,
      width: p.length >= 6 ? dist(p[4], p[5]) * mmPerPx : null,
    };
  }

  // ---------- layout and drawing ----------

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function fitPhoto() {
    if (!state.img) return;
    const { w, h } = sizeCanvas();
    const s = Math.min(w / state.img.width, h / state.img.height);
    state.fitScale = s;
    state.view = {
      s,
      x: (w - state.img.width * s) / 2,
      y: (h - state.img.height * s) / 2,
    };
    draw();
  }

  function toScreen(p) {
    return { x: p.x * state.view.s + state.view.x, y: p.y * state.view.s + state.view.y };
  }

  function drawLine(a, b, color, label) {
    const A = toScreen(a);
    const B = toScreen(b);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
    for (const P of [A, B]) {
      ctx.beginPath();
      ctx.arc(P.x, P.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    if (label) {
      const mx = (A.x + B.x) / 2;
      const my = (A.y + B.y) / 2;
      ctx.font = '600 14px -apple-system, Helvetica, Arial, sans-serif';
      const tw = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(mx - tw / 2, my - 22, tw, 20);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, mx, my - 12);
    }
  }

  function draw() {
    const { w, h } = sizeCanvas();
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);
    $('empty').classList.toggle('hidden', !!state.img);
    if (!state.img) return;

    const v = state.view;
    ctx.drawImage(state.img, v.x, v.y, state.img.width * v.s, state.img.height * v.s);

    const p = state.points;
    const m = measurements();
    if (p.length >= 2) drawLine(p[0], p[1], '#ffb020', `${referenceMm()} mm ref`);
    if (p.length >= 4) drawLine(p[2], p[3], '#3a9cff', m && m.length ? fmtMm(m.length) : null);
    if (p.length >= 6) drawLine(p[4], p[5], '#38d46a', m && m.width ? fmtMm(m.width) : null);

    // Point before its pair is complete, so the first tap of each pair is still visible.
    if (p.length % 2 === 1) {
      const last = toScreen(p[p.length - 1]);
      ctx.beginPath();
      ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }

  function updateText() {
    const n = state.points.length;
    if (!state.img) {
      $('step').textContent = 'Take or choose a photo to begin.';
    } else if (referenceMm() === null) {
      $('step').textContent = 'Enter the reference length in mm.';
    } else if (n >= 6) {
      $('step').textContent = 'Done. Use Undo to fix a point, or Clear points to start over.';
    } else {
      $('step').textContent = STEPS[Math.floor(n / 2)];
    }

    const m = measurements();
    $('lengthOut').textContent = m && m.length ? `${fmtMm(m.length)}  (${fmtIn(m.length)})` : '–';
    $('widthOut').textContent = m && m.width ? `${fmtMm(m.width)}  (${fmtIn(m.width)})` : '–';
    $('scaleOut').textContent = m
      ? `Scale from ${referenceName()}: ${referenceMm()} mm.`
      : '';

    $('undo').disabled = n === 0;
    $('clear').disabled = n === 0;
  }

  function update() {
    draw();
    updateText();
  }

  // ---------- photo loading ----------

  function loadFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      state.img = img;
      state.points = [];
      fitPhoto();
      update();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      $('step').textContent = 'That file could not be opened. Try another photo.';
    };
    img.src = url;
  }

  $('camera').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
  $('library').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });

  // ---------- reference selection ----------

  referenceSelect.addEventListener('change', () => {
    customRow.classList.toggle('hidden', referenceSelect.value !== 'custom');
    if (referenceSelect.value === 'custom') customInput.focus();
    update();
  });
  customInput.addEventListener('input', update);

  // ---------- buttons ----------

  $('undo').addEventListener('click', () => { state.points.pop(); update(); });
  $('clear').addEventListener('click', () => { state.points = []; update(); });
  $('fit').addEventListener('click', fitPhoto);

  // ---------- touch: tap to place, drag and pinch to move/zoom ----------

  function localPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function addPointAt(screenPos) {
    if (state.points.length >= 6) return;
    const v = state.view;
    const img = {
      x: (screenPos.x - v.x) / v.s,
      y: (screenPos.y - v.y) / v.s,
    };
    // Ignore taps outside the photo.
    if (img.x < 0 || img.y < 0 || img.x > state.img.width || img.y > state.img.height) return;
    state.points.push(img);
    update();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!state.img) return;
    const pos = localPos(e);
    state.pointers.set(e.pointerId, pos);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* not needed for a tap */ }

    if (state.pointers.size === 1) {
      state.tap = { x: pos.x, y: pos.y, moved: false, multi: false };
    } else {
      state.tap.multi = true;
      state.tap.moved = true;
      const [a, b] = [...state.pointers.values()];
      state.pinch = { dist: dist(a, b), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!state.pointers.has(e.pointerId) || !state.img) return;
    const prev = state.pointers.get(e.pointerId);
    const pos = localPos(e);
    state.pointers.set(e.pointerId, pos);

    if (state.pointers.size === 1) {
      if (dist(pos, state.tap) > 8) state.tap.moved = true;
      if (state.tap.moved) {
        state.view.x += pos.x - prev.x;
        state.view.y += pos.y - prev.y;
        draw();
      }
    } else if (state.pinch) {
      const [a, b] = [...state.pointers.values()];
      const d = dist(a, b);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const v = state.view;
      // Keep the photo point under the previous midpoint anchored under the new one.
      const ax = (state.pinch.mid.x - v.x) / v.s;
      const ay = (state.pinch.mid.y - v.y) / v.s;
      const s = clamp(v.s * (d / state.pinch.dist), state.fitScale, state.fitScale * 10);
      state.view = { s, x: mid.x - ax * s, y: mid.y - ay * s };
      state.pinch = { dist: d, mid };
      draw();
    }
    e.preventDefault();
  });

  function endPointer(e) {
    if (!state.pointers.has(e.pointerId)) return;
    const wasSingle = state.pointers.size === 1;
    state.pointers.delete(e.pointerId);
    if (wasSingle && state.tap && !state.tap.moved && !state.tap.multi && e.type === 'pointerup') {
      addPointAt(state.tap);
    }
    if (state.pointers.size < 2) state.pinch = null;
    if (state.pointers.size === 1) {
      // Leftover finger after a pinch: do not treat it as a tap later.
      const [only] = [...state.pointers.values()];
      state.tap = { x: only.x, y: only.y, moved: true, multi: true };
    }
    if (state.pointers.size === 0) state.tap = null;
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // Keep the layout right if the phone rotates or the window resizes.
  window.addEventListener('resize', () => {
    if (state.img) fitPhoto();
  });

  // Initial state.
  draw();
  updateText();
})();

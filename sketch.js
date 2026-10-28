// Soft Hover — p5.js sketch.
// Circles mode: outlined circles packed inside an uploaded SVG, pushed away by the mouse.
// Polygon mode: jagged blob behind the SVG, jagged linework on top, both warped by the mouse.
// Press "S" to download the current frame as an SVG.

const PANEL_W = 270;
const CELL = 8; // polygon contour grid resolution, px

const S = {
  mode: 'circles',
  thick: 2,
  size: 10,
  radius: 100,
  stretch: 0.5,
  chaos: 0.7,
  noiseOn: false,
  invert: true,
  flip: false,
  seed: 1,
  col: {
    circles: { bg: '#000000', svg: '#ffffff', fill: '#ffffff' },
    polygon: { bg: '#000000', svg: '#000000', fill: '#ffffff', line: '#ffffff' },
  },
  svgText: null,
  img: null,
  rect: null,
  mask: null,
  alphaMode: true,
  glyph: null,
  circles: [],
  blob: [],
  lines: [],
};
const mouse = { x: 0, y: 0, on: false, hit: false };

const COLOR_FIELDS = {
  circles: [['bg', 'Background'], ['svg', 'SVG'], ['fill', 'Circles']],
  polygon: [['bg', 'Background'], ['fill', 'Blob'], ['svg', 'SVG'], ['line', 'Linework']],
};

const SAMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">' +
  '<text x="400" y="310" font-family="Georgia, serif" font-weight="bold" font-style="italic" ' +
  'font-size="330" text-anchor="middle">cern</text></svg>';

/* ---------- p5 ---------- */

function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  c.elt.addEventListener('pointermove', (e) => { mouse.x = e.offsetX; mouse.y = e.offsetY; mouse.on = true; });
  c.elt.addEventListener('pointerleave', () => { mouse.on = false; });
  buildGui();
  loadSvg(SAMPLE_SVG);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (S.img) layout();
}

function draw() {
  const ctx = drawingContext;
  const c = S.col[S.mode];
  const pd = pixelDensity();
  ctx.setTransform(pd, 0, 0, pd, 0, 0);
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, width, height);
  if (!S.rect) return;
  mouse.hit = mouse.on && inside(mouse.x, mouse.y); // circles only react while the cursor is over the artwork

  if (S.mode === 'circles') {
    drawGlyph(ctx);
    S.circles.forEach(stepCircle);
    withBlend(ctx, () => {
      ctx.lineWidth = S.thick;
      ctx.strokeStyle = c.fill;
      for (const p of S.circles) ctx.stroke(new Path2D(circlePathD(p)));
    });
  } else {
    S.blob.concat(S.lines).forEach((loop) => loop.forEach(stepVertex));
    ctx.fillStyle = c.fill;
    ctx.fill(new Path2D(S.blob.map(loopD).join('')), 'evenodd');
    drawGlyph(ctx);
    withBlend(ctx, () => {
      ctx.lineWidth = S.thick;
      ctx.lineJoin = 'miter';
      ctx.strokeStyle = c.line;
      ctx.stroke(new Path2D(S.blob.concat(S.lines).map(loopD).join('')));
    });
  }
}

function keyPressed() {
  if ((key === 's' || key === 'S') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
    saveSvg();
    return false;
  }
}

function withBlend(ctx, fn) {
  ctx.save();
  if (S.invert) ctx.globalCompositeOperation = 'difference';
  fn();
  ctx.restore();
}

function drawGlyph(ctx) {
  if (S.glyph) ctx.drawImage(S.glyph, S.rect.x, S.rect.y);
}

/* ---------- SVG loading + mask ---------- */

function loadSvg(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    S.svgText = text;
    S.img = img;
    layout();
  };
  img.onerror = () => alert('Could not read that SVG.');
  img.src = url;
}

// Fit the SVG into the area right of the panel, rasterise it to get an inside/outside mask.
function layout() {
  const iw = S.img.naturalWidth || 400;
  const ih = S.img.naturalHeight || 400;
  const availW = Math.max(120, width - PANEL_W - 60);
  const availH = height - 60;
  const s = Math.min(availW / iw, availH / ih);
  const w = Math.max(1, Math.round(iw * s));
  const h = Math.max(1, Math.round(ih * s));
  S.rect = { x: Math.round(30 + (availW - w) / 2), y: Math.round((height - h) / 2), w, h };

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d', { willReadFrequently: true });
  octx.drawImage(S.img, 0, 0, w, h);
  const data = octx.getImageData(0, 0, w, h).data;

  S.alphaMode = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { S.alphaMode = true; break; }
  computeMask(data);
  rebuild();
}

function computeMask(data) {
  const { w, h } = S.rect;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    let inside = S.alphaMode ? a > 127 : a > 127 && 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
    m[i] = inside !== S.flip ? 1 : 0;
  }
  S.mask = m;
}

function inside(x, y) {
  const { x: rx, y: ry, w, h } = S.rect;
  const ix = Math.floor(x - rx), iy = Math.floor(y - ry);
  return ix >= 0 && iy >= 0 && ix < w && iy < h && S.mask[iy * w + ix] === 1;
}

function tintGlyph() {
  const { w, h } = S.rect;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d');
  const id = cx.createImageData(w, h);
  const [r, g, b] = hexToRgb(S.col[S.mode].svg);
  for (let i = 0; i < S.mask.length; i++) {
    if (S.mask[i]) { id.data[i * 4] = r; id.data[i * 4 + 1] = g; id.data[i * 4 + 2] = b; id.data[i * 4 + 3] = 255; }
  }
  cx.putImageData(id, 0, 0);
  S.glyph = cv;
}

/* ---------- geometry builders ---------- */

function rebuild() {
  if (!S.rect) return;
  tintGlyph();
  if (S.mode === 'circles') buildCircles();
  else buildPolygon();
}

function buildCircles() {
  const r = S.size;
  const d = r * 2.15;
  const rowH = d * 0.866;
  const { x: rx, y: ry, w, h } = S.rect;
  const rnd = mulberry32(S.seed);
  const out = [];
  for (let j = 0, y = ry; y < ry + h; j++, y += rowH) {
    for (let x = rx + (j % 2 ? d / 2 : 0); x < rx + w; x += d) {
      if (!inside(x, y)) continue;
      const hx = x + (rnd() - 0.5) * r * 0.3, hy = y + (rnd() - 0.5) * r * 0.3;
      out.push({
        hx, hy, x: hx, y: hy, vx: 0, vy: 0, tx: hx, ty: hy,
        reach: 0.55 + rnd() * 0.9,              // how far from the mouse this circle still reacts
        push: 0.5 + Math.pow(rnd(), 2.5) * 2.5, // most shove a little, a few get flung far
        jit: (rnd() - 0.5) * 2.4,               // sideways deviation from "straight away"
        k: 0.05 + rnd() * 0.13,                 // spring stiffness
        damp: 0.6 + rnd() * 0.25,
        rs: rnd(),                              // decides whether it stretches into a capsule
        lag: 0.03 + rnd() * 0.08,               // how slowly a capsule's tail follows
      });
    }
  }
  S.circles = out;
}

function buildPolygon() {
  const rnd = mulberry32(S.seed);
  S.blob = contourLoops(S.size * 2.5 + 10, CELL * 1.2, CELL * 0.9, rnd);
  S.lines = contourLoops(S.size * 1.1 + 4, CELL * 2.5, CELL * 1.4, rnd);
}

// Dilate the mask by `pad` px, trace its outline, simplify and jitter it into jagged polygons.
function contourLoops(pad, tol, jitter, rnd) {
  const { x: rx, y: ry, w, h } = S.rect;
  const m = Math.ceil(pad) + CELL * 2;
  const gx = rx - m, gy = ry - m;
  const cols = Math.ceil((w + 2 * m) / CELL) + 1;
  const rows = Math.ceil((h + 2 * m) / CELL) + 1;

  const on = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x0 = gx + i * CELL, y0 = gy + j * CELL;
      for (let k = 0; k < 9 && !on[j * cols + i]; k++) {
        if (inside(x0 + (k % 3) * CELL / 3, y0 + Math.floor(k / 3) * CELL / 3)) on[j * cols + i] = 1;
      }
    }
  }

  const pr = Math.ceil(pad / CELL);
  const field = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!on[j * cols + i]) continue;
      for (let dj = -pr; dj <= pr; dj++) {
        for (let di = -pr; di <= pr; di++) {
          if (di * di + dj * dj > pr * pr) continue;
          const a = i + di, b = j + dj;
          if (a >= 0 && b >= 0 && a < cols && b < rows) field[b * cols + a] = 1;
        }
      }
    }
  }

  return marchingLoops(field, cols, rows).map((loop) => {
    const pts = simplifyClosed(loop.map(([x, y]) => [gx + x * CELL, gy + y * CELL]), tol);
    return pts.map(([x, y]) => {
      const hx = x + (rnd() - 0.5) * 2 * jitter, hy = y + (rnd() - 0.5) * 2 * jitter;
      return { hx, hy, x: hx, y: hy, vx: 0, vy: 0 };
    });
  }).filter((l) => l.length > 2);
}

// Marching squares on a binary grid; returns closed loops of [col,row] points (in 1/2 cell units).
function marchingLoops(f, cols, rows) {
  const v = (i, j) => (i >= 0 && j >= 0 && i < cols && j < rows ? f[j * cols + i] : 0);
  const adj = new Map();
  const key = (x, y) => x + ',' + y;
  const link = (a, b) => {
    const ka = key(...a), kb = key(...b);
    if (!adj.has(ka)) adj.set(ka, { p: a, n: [] });
    if (!adj.has(kb)) adj.set(kb, { p: b, n: [] });
    adj.get(ka).n.push(kb);
    adj.get(kb).n.push(ka);
  };
  for (let j = -1; j < rows; j++) {
    for (let i = -1; i < cols; i++) {
      const c = v(i, j) * 8 + v(i + 1, j) * 4 + v(i + 1, j + 1) * 2 + v(i, j + 1);
      const T = [i + 0.5, j], R = [i + 1, j + 0.5], B = [i + 0.5, j + 1], L = [i, j + 0.5];
      const segs = {
        1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[T, R]], 5: [[L, T], [B, R]], 6: [[T, B]], 7: [[L, T]],
        8: [[L, T]], 9: [[T, B]], 10: [[T, R], [L, B]], 11: [[T, R]], 12: [[L, R]], 13: [[B, R]], 14: [[L, B]],
      }[c];
      if (segs) segs.forEach(([a, b]) => link(a, b));
    }
  }
  const seen = new Set();
  const loops = [];
  for (const [k0, node] of adj) {
    if (seen.has(k0)) continue;
    const loop = [];
    let prev = null, cur = k0;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      loop.push(adj.get(cur).p);
      const next = adj.get(cur).n.find((n) => n !== prev && !seen.has(n));
      prev = cur;
      cur = next;
    }
    if (loop.length > 3) loops.push(loop);
  }
  return loops;
}

// Douglas–Peucker for a closed loop: split at the point farthest from the start.
function simplifyClosed(pts, tol) {
  let far = 0, best = -1;
  pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]);
    if (d > best) { best = d; far = i; }
  });
  const a = pts.slice(0, far + 1);
  const b = pts.slice(far).concat([pts[0]]);
  return dp(a, tol).slice(0, -1).concat(dp(b, tol).slice(0, -1));
}

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let idx = 0, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= tol) return [pts[0], pts[pts.length - 1]];
  return dp(pts.slice(0, idx + 1), tol).slice(0, -1).concat(dp(pts.slice(idx), tol));
}

/* ---------- motion ---------- */

// Spring a point towards its home; if the mouse is inside the hover radius, push it outwards.
function target(p, push) {
  if (!mouse.hit) return [p.hx, p.hy];
  const dx = p.hx - mouse.x, dy = p.hy - mouse.y, d = Math.hypot(dx, dy);
  if (d >= S.radius) return [p.hx, p.hy];
  const ux = d > 0.001 ? dx / d : 1, uy = d > 0.001 ? dy / d : 0;
  const reach = (S.radius - d) * push;
  return [p.hx + ux * reach, p.hy + uy * reach];
}

function spring(p, tx, ty, k = 0.12, damp = 0.72) {
  p.vx = (p.vx + (tx - p.x) * k) * damp;
  p.vy = (p.vy + (ty - p.y) * k) * damp;
  p.x += p.vx;
  p.y += p.vy;
}

function stepCircle(p) {
  let tx = p.hx, ty = p.hy;
  if (mouse.hit) {
    const dx = p.hx - mouse.x, dy = p.hy - mouse.y, d = Math.hypot(dx, dy);
    const R = S.radius * p.reach;
    if (d < R) {
      // slow noise field makes neighbours move alike but never identically, and keeps shifting
      const n = noise(p.hx * 0.012, p.hy * 0.012, frameCount * 0.015);
      const ang = Math.atan2(dy, dx) + (p.jit + (n - 0.5) * 3) * S.chaos;
      const push = 1 + (p.push - 1) * S.chaos;
      const dist = ((R - d) * push + 14 * p.rs * S.chaos) * (0.6 + n * 0.8);
      tx = p.hx + Math.cos(ang) * dist;
      ty = p.hy + Math.sin(ang) * dist;
    }
  }
  if (S.noiseOn) {
    // perpetual motion: every circle wanders through a slowly evolving noise field
    // a second, much larger noise field decides where it is busy and where it is almost still;
    // it drifts too, so the busy and calm zones keep moving across the artwork
    const t = frameCount * 0.008;
    const zone = noise(p.hx * 0.0025 + 500, p.hy * 0.0025 + 500, frameCount * 0.003);
    const busy = Math.pow(Math.min(1, Math.max(0, (zone - 0.4) * 3.5)), 1.4);
    const amp = (6 + 130 * busy) * (0.4 + S.chaos);
    tx += (noise(p.hx * 0.006, p.hy * 0.006, t) - 0.5) * 2 * amp;
    ty += (noise(p.hx * 0.006 + 100, p.hy * 0.006 + 100, t) - 0.5) * 2 * amp;
  }
  spring(p, tx, ty, p.k, p.damp);
  // a share of the circles (set by Stretch) drag a long tail behind them, the rest stay round
  const lag = p.rs < S.stretch * 0.5 || (S.noiseOn && p.rs < 0.4 && Math.hypot(p.x - p.hx, p.y - p.hy) > 12) ? p.lag : 0.6;
  p.tx += (p.x - p.tx) * lag;
  p.ty += (p.y - p.ty) * lag;
}

function stepVertex(p) {
  const [tx, ty] = target(p, 0.6);
  spring(p, tx, ty);
}

/* ---------- path strings (used for both canvas and SVG export) ---------- */

const f = (n) => Math.round(n * 100) / 100;

function circlePathD(p) {
  const r = S.size;
  const dx = p.x - p.tx, dy = p.y - p.ty, len = Math.hypot(dx, dy);
  if (len < 0.5) {
    return `M${f(p.x - r)} ${f(p.y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  }
  const nx = (-dy / len) * r, ny = (dx / len) * r;
  const A = [p.tx + nx, p.ty + ny], B = [p.x + nx, p.y + ny], C = [p.x - nx, p.y - ny], D = [p.tx - nx, p.ty - ny];
  // the extra "M..L.." is the line through the middle that appears once a circle stretches
  return `M${f(A[0])} ${f(A[1])}L${f(B[0])} ${f(B[1])}A${r} ${r} 0 0 0 ${f(C[0])} ${f(C[1])}` +
    `L${f(D[0])} ${f(D[1])}A${r} ${r} 0 0 0 ${f(A[0])} ${f(A[1])}Z` +
    (len > r * 0.6 ? `M${f(p.tx)} ${f(p.ty)}L${f(p.x)} ${f(p.y)}` : '');
}

function loopD(loop) {
  return 'M' + loop.map((p) => `${f(p.x)} ${f(p.y)}`).join('L') + 'Z';
}

/* ---------- export ---------- */

function saveSvg() {
  if (!S.rect) return;
  const c = S.col[S.mode];
  const r = S.rect;
  const blend = S.invert ? ' style="mix-blend-mode:difference"' : '';
  const b64 = btoa(unescape(encodeURIComponent(S.svgText)));

  // turn the uploaded SVG into a flat tinted silhouette, matching the on-screen mask
  const rgbaRow = S.alphaMode ? (S.flip ? '0 0 0 -1 1' : '0 0 0 1 0')
    : (S.flip ? '0.2126 0.7152 0.0722 0 0' : '-0.2126 -0.7152 -0.0722 0 1');
  const matrix = `0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${rgbaRow}`;
  const glyph = `<g filter="url(#tint)"><image x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" ` +
    `href="data:image/svg+xml;base64,${b64}"/></g>`;

  let body;
  if (S.mode === 'circles') {
    body = glyph +
      `<g fill="none" stroke="${c.fill}" stroke-width="${S.thick}"${blend}>` +
      S.circles.map((p) => `<path d="${circlePathD(p)}"/>`).join('') + '</g>';
  } else {
    body = `<path d="${S.blob.map(loopD).join('')}" fill="${c.fill}" fill-rule="evenodd"/>` + glyph +
      `<path d="${S.blob.concat(S.lines).map(loopD).join('')}" fill="none" stroke="${c.line}" ` +
      `stroke-width="${S.thick}" stroke-linejoin="miter"${blend}/>`;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><filter id="tint" color-interpolation-filters="sRGB">` +
    `<feColorMatrix type="matrix" values="${matrix}" result="m"/>` +
    `<feFlood flood-color="${c.svg}" result="c"/><feComposite in="c" in2="m" operator="in"/></filter></defs>` +
    `<rect width="100%" height="100%" fill="${c.bg}"/>${body}</svg>`;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  a.download = `soft-${S.mode}-${Date.now()}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- GUI ---------- */

function buildGui() {
  const $ = (id) => document.getElementById(id);

  $('file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) file.text().then(loadSvg);
    e.target.blur();
  });
  $('flip').addEventListener('change', (e) => {
    S.flip = e.target.checked;
    if (S.img) layout();
  });
  $('noise').addEventListener('click', (e) => {
    S.noiseOn = !S.noiseOn;
    e.target.classList.toggle('on', S.noiseOn);
    e.target.textContent = S.noiseOn ? 'Noise: on' : 'Noise';
    e.target.blur();
  });
  $('invert').addEventListener('change', (e) => { S.invert = e.target.checked; });
  $('reshuffle').addEventListener('click', () => { S.seed = (Math.random() * 1e9) | 0; rebuild(); });

  const slider = (id, key, onChange) => {
    const el = $(id), out = el.parentElement.querySelector('output');
    const sync = () => { S[key] = +el.value; out.textContent = el.value; };
    el.addEventListener('input', () => { sync(); if (onChange) onChange(); });
    sync();
  };
  slider('thick', 'thick');
  slider('size', 'size', rebuild);
  slider('radius', 'radius');
  slider('stretch', 'stretch');
  slider('chaos', 'chaos');

  setMode('circles');
}

function setMode(mode) {
  S.mode = mode;
  const $ = (id) => document.getElementById(id);
  $('size-label').textContent = mode === 'circles' ? 'Circle size' : 'Blob size';
  buildColorRows();
  rebuild();
}

function buildColorRows() {
  const box = document.getElementById('colors');
  box.innerHTML = '';
  for (const [key, label] of COLOR_FIELDS[S.mode]) {
    const row = document.createElement('div');
    row.className = 'color';
    const val = S.col[S.mode][key];
    row.innerHTML = `<span>${label}</span><input type="color" value="${val}"><input type="text" value="${val}" maxlength="7" spellcheck="false">`;
    const [picker, text] = row.querySelectorAll('input');
    const apply = (hex) => {
      S.col[S.mode][key] = hex;
      picker.value = hex;
      text.value = hex;
      if (key === 'svg') tintGlyph();
    };
    picker.addEventListener('input', () => apply(picker.value));
    text.addEventListener('input', () => {
      let t = text.value.trim();
      if (t && t[0] !== '#') t = '#' + t;
      if (/^#[0-9a-fA-F]{6}$/.test(t)) apply(t.toLowerCase());
    });
    box.appendChild(row);
  }
}

/* ---------- utils ---------- */

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Image Hover — p5.js sketch.
// Outlined circles populate the brightest parts of an uploaded image first; as Density rises they
// spread into the darker parts until they cover the whole image. Circles are pushed away by the mouse.
// Press "S" to download the current frame as an SVG.

const PANEL_W = 270;

const S = {
  thick: 2,
  size: 10,
  radius: 100,
  stretch: 0.5,
  chaos: 0.7,
  scale: 1,
  density: 0.2, // share of grid positions that get a circle, brightest first
  imgop: 1,
  noiseOn: false,
  invert: true,
  seed: 1,
  col: { bg: '#000000', fill: '#ffffff' },
  dataUrl: null,
  img: null,
  rect: null,
  circles: [],
};
const mouse = { x: 0, y: 0, on: false, hit: false };

const COLOR_FIELDS = [['bg', 'Background'], ['fill', 'Circles']];

/* ---------- p5 ---------- */

function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  c.elt.addEventListener('pointermove', (e) => { mouse.x = e.offsetX; mouse.y = e.offsetY; mouse.on = true; });
  c.elt.addEventListener('pointerleave', () => { mouse.on = false; });
  buildGui();
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) readImage(file);
  });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (S.img) layout();
}

function draw() {
  const ctx = drawingContext;
  const pd = pixelDensity();
  ctx.setTransform(pd, 0, 0, pd, 0, 0);
  ctx.fillStyle = S.col.bg;
  ctx.fillRect(0, 0, width, height);
  if (!S.rect) return;

  const r = S.rect;
  mouse.hit = mouse.on && mouse.x >= r.x && mouse.x < r.x + r.w && mouse.y >= r.y && mouse.y < r.y + r.h;

  ctx.save();
  ctx.globalAlpha = S.imgop;
  ctx.drawImage(S.img, r.x, r.y, r.w, r.h);
  ctx.restore();

  S.circles.forEach(stepCircle);
  ctx.save();
  if (S.invert) ctx.globalCompositeOperation = 'difference';
  ctx.lineWidth = S.thick;
  ctx.strokeStyle = S.col.fill;
  for (const p of S.circles) ctx.stroke(new Path2D(circlePathD(p)));
  ctx.restore();
}

function keyPressed() {
  if ((key === 's' || key === 'S') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
    saveSvg();
    return false;
  }
}

/* ---------- image loading ---------- */

function readImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      S.dataUrl = reader.result;
      S.img = img;
      document.body.classList.remove('empty');
      layout();
    };
    img.onerror = () => alert('Could not read that image.');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// Fit the image into the area left of the panel.
function layout() {
  const iw = S.img.naturalWidth || 400;
  const ih = S.img.naturalHeight || 400;
  const availW = Math.max(120, width - PANEL_W - 60);
  const availH = height - 60;
  const s = Math.min(availW / iw, availH / ih) * S.scale;
  const w = Math.max(1, Math.round(iw * s));
  const h = Math.max(1, Math.round(ih * s));
  S.rect = { x: Math.round(30 + (availW - w) / 2), y: Math.round((height - h) / 2), w, h };
  buildCircles();
}

/* ---------- circles ---------- */

// Lay a hex grid over the image, rank every position by the brightness of the image there, and keep the
// brightest share given by Density. Low density = highlights only, 1 = the whole image.
function buildCircles() {
  if (!S.rect) return;
  const r = S.size;
  const d = r * 2.15;
  const rowH = d * 0.866;
  const { x: rx, y: ry, w, h } = S.rect;

  // average the image down to roughly one sample per half grid step
  const sw = Math.max(1, Math.ceil(w / (d / 2))), sh = Math.max(1, Math.ceil(h / rowH));
  const cv = document.createElement('canvas');
  cv.width = sw;
  cv.height = sh;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#000';
  cx.fillRect(0, 0, sw, sh);
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(S.img, 0, 0, sw, sh);
  const px = cx.getImageData(0, 0, sw, sh).data;

  const rnd = mulberry32(S.seed);
  const pts = [];
  for (let j = 0, y = ry; y < ry + h; j++, y += rowH) {
    for (let x = rx + (j % 2 ? d / 2 : 0); x < rx + w; x += d) {
      const ix = Math.min(sw - 1, Math.floor((x - rx) / (d / 2)));
      const iy = Math.min(sh - 1, Math.floor((y - ry) / rowH));
      const o = (iy * sw + ix) * 4;
      const lum = (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]) / 255;
      pts.push({ x, y, l: lum + rnd() * 0.03 }); // tiny noise so flat areas fill unevenly, not in rows
    }
  }
  pts.sort((a, b) => b.l - a.l);
  const keep = pts.slice(0, Math.round(pts.length * S.density));

  S.circles = keep.map(({ x, y }) => {
    const hx = x + (rnd() - 0.5) * r * 0.3, hy = y + (rnd() - 0.5) * r * 0.3;
    return {
      hx, hy, x: hx, y: hy, vx: 0, vy: 0, tx: hx, ty: hy,
      reach: 0.55 + rnd() * 0.9,              // how far from the mouse this circle still reacts
      push: 0.5 + Math.pow(rnd(), 2.5) * 2.5, // most shove a little, a few get flung far
      jit: (rnd() - 0.5) * 2.4,               // sideways deviation from "straight away"
      k: 0.05 + rnd() * 0.13,                 // spring stiffness
      damp: 0.6 + rnd() * 0.25,
      rs: rnd(),                              // decides whether it stretches into a capsule
      lag: 0.03 + rnd() * 0.08,               // how slowly a capsule's tail follows
    };
  });
}

/* ---------- motion ---------- */

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
    // perpetual motion; a second, much larger noise field decides where it is busy and where almost still
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

/* ---------- export ---------- */

function saveSvg() {
  if (!S.rect) return;
  const r = S.rect;
  const blend = S.invert ? ' style="mix-blend-mode:difference"' : '';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${S.col.bg}"/>` +
    `<image x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" opacity="${S.imgop}" href="${S.dataUrl}"/>` +
    `<g fill="none" stroke="${S.col.fill}" stroke-width="${S.thick}"${blend}>` +
    S.circles.map((p) => `<path d="${circlePathD(p)}"/>`).join('') + '</g></svg>';
  deliverSvg(`image-circles-${Date.now()}.svg`, svg);
}

// Inside Claude's artifact viewer plain downloads are blocked, so use its downloads capability when present.
async function deliverSvg(filename, svg) {
  try {
    const dl = window.claude && (await window.claude.use('downloads'));
    if (dl) {
      await dl.save({ filename, data: svg });
      return;
    }
  } catch (err) {
    if (err && err.code === 'declined') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- GUI ---------- */

function buildGui() {
  const $ = (id) => document.getElementById(id);

  $('file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) readImage(file);
    e.target.value = '';
    e.target.blur();
  });
  $('invert').addEventListener('change', (e) => { S.invert = e.target.checked; });
  $('reshuffle').addEventListener('click', () => { S.seed = (Math.random() * 1e9) | 0; buildCircles(); });
  $('save').addEventListener('click', (e) => { saveSvg(); e.target.blur(); });
  $('noise').addEventListener('click', (e) => {
    S.noiseOn = !S.noiseOn;
    e.target.classList.toggle('on', S.noiseOn);
    e.target.textContent = S.noiseOn ? 'Noise: on' : 'Noise';
    e.target.blur();
  });

  const slider = (id, key, onChange) => {
    const el = $(id), out = el.parentElement.querySelector('output');
    const sync = () => { S[key] = +el.value; out.textContent = el.value; };
    el.addEventListener('input', () => { sync(); if (onChange) onChange(); });
    sync();
  };
  slider('thick', 'thick');
  slider('size', 'size', buildCircles);
  slider('density', 'density', buildCircles);
  slider('scale', 'scale', () => { if (S.img) layout(); });
  slider('imgop', 'imgop');
  slider('radius', 'radius');
  slider('chaos', 'chaos');
  slider('stretch', 'stretch');

  const box = $('colors');
  for (const [key, label] of COLOR_FIELDS) {
    const row = document.createElement('div');
    row.className = 'color';
    const val = S.col[key];
    row.innerHTML = `<span>${label}</span><input type="color" value="${val}"><input type="text" value="${val}" maxlength="7" spellcheck="false">`;
    const [picker, text] = row.querySelectorAll('input');
    const apply = (hex) => { S.col[key] = hex; picker.value = hex; text.value = hex; };
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

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

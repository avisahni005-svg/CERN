// Sphere Hover — p5.js sketch.
// Outlined circles sit on the surface of a sphere. An uploaded image is wrapped round the sphere and the
// circles populate its brightest parts first (Density). Drag to rotate; hovering pushes circles off the surface.
// Press "S" to download the current frame as an SVG.

const PANEL_W = 270;
const SEG = 20; // points per circle outline
const COS = Array.from({ length: SEG }, (_, i) => Math.cos((i / SEG) * Math.PI * 2));
const SIN = Array.from({ length: SEG }, (_, i) => Math.sin((i / SEG) * Math.PI * 2));

const S = {
  thick: 1.5,
  size: 10,
  radius: 110,
  stretch: 0.5,
  chaos: 0.7,
  scale: 1,
  density: 0.5,
  noiseOn: false,
  auto: true,
  seed: 1,
  col: { bg: '#000000', fill: '#ffffff' },
  ready: false,
  img: null,
  lumFn: null,
  pts: [],
  yaw: 0.4, pitch: -0.2, vyaw: 0, vpitch: 0,
  R: 250, cx: 0, cy: 0,
};
const mouse = { x: 0, y: 0, on: false, hit: false, down: false };
const COLOR_FIELDS = [['bg', 'Background'], ['fill', 'Circles']];

/* ---------- p5 ---------- */

function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  const el = c.elt;
  el.addEventListener('pointermove', (e) => {
    if (mouse.down) {
      S.vyaw = (e.offsetX - mouse.x) * 0.006;
      S.vpitch = (e.offsetY - mouse.y) * 0.006;
      S.yaw += S.vyaw;
      S.pitch = Math.max(-1.4, Math.min(1.4, S.pitch + S.vpitch));
    }
    mouse.x = e.offsetX;
    mouse.y = e.offsetY;
    mouse.on = true;
  });
  el.addEventListener('pointerdown', () => { mouse.down = true; S.vyaw = S.vpitch = 0; el.style.cursor = 'grabbing'; });
  window.addEventListener('pointerup', () => { mouse.down = false; el.style.cursor = 'grab'; });
  el.addEventListener('pointerleave', () => { mouse.on = false; });
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
  if (S.ready) layout();
}

function draw() {
  const ctx = drawingContext;
  const pd = pixelDensity();
  ctx.setTransform(pd, 0, 0, pd, 0, 0);
  ctx.fillStyle = S.col.bg;
  ctx.fillRect(0, 0, width, height);
  if (!S.ready) return;

  if (!mouse.down) {
    S.yaw += S.vyaw;
    S.pitch = Math.max(-1.4, Math.min(1.4, S.pitch + S.vpitch));
    S.vyaw *= 0.94;
    S.vpitch *= 0.94;
    if (S.auto) S.yaw += 0.0025;
  }
  mouse.hit = mouse.on && !mouse.down && Math.hypot(mouse.x - S.cx, mouse.y - S.cy) < S.R * 1.05;

  const shapes = frameShapes();
  ctx.lineWidth = S.thick;
  ctx.strokeStyle = S.col.fill;
  ctx.lineJoin = 'round';
  for (const sh of shapes) {
    ctx.globalAlpha = sh.alpha;
    ctx.stroke(new Path2D(sh.d));
  }
  ctx.globalAlpha = 1;
}

function keyPressed() {
  if ((key === 's' || key === 'S') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
    saveSvg();
    return false;
  }
}

/* ---------- 3D helpers ---------- */

// world -> camera: yaw about Y, then pitch about X. +z points at the viewer.
function toCam(x, y, z) {
  const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw), cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}

function toWorld(x, y, z) {
  const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw), cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
  const y1 = y * cp + z * sp, z1 = -y * sp + z * cp;
  return [x * cy - z1 * sy, y1, x * sy + z1 * cy];
}

const persp = (z) => (S.R * 3.2) / (S.R * 3.2 - z);

/* ---------- image loading + layout ---------- */

function readImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // keep a small equirectangular brightness map: u = longitude, v = latitude
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 128;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.fillStyle = '#000';
      cx.fillRect(0, 0, 256, 128);
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, 0, 256, 128);
      const px = cx.getImageData(0, 0, 256, 128).data;
      S.lumFn = (u, v) => {
        const ix = Math.min(255, Math.max(0, Math.floor(u * 256))), iy = Math.min(127, Math.max(0, Math.floor(v * 128)));
        const o = (iy * 256 + ix) * 4;
        return (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]) / 255;
      };
      start();
    };
    img.onerror = () => alert('Could not read that image.');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function plainSphere() {
  const off = Math.random() * 100;
  S.lumFn = (u, v) => noise(u * 6 + off, v * 3 + off);
  start();
}

function start() {
  S.ready = true;
  document.body.classList.remove('empty');
  layout();
}

function layout() {
  const availW = Math.max(120, width - PANEL_W - 60);
  S.R = Math.min(availW, height - 60) * 0.42 * S.scale;
  S.cx = 30 + availW / 2;
  S.cy = height / 2;
  buildPoints();
}

/* ---------- points ---------- */

// Evenly spread points on the sphere (Fibonacci lattice); keep the brightest share given by Density.
function buildPoints() {
  if (!S.ready) return;
  const r = S.size, d = r * 2.15;
  const n = Math.max(20, Math.round((4 * Math.PI * S.R * S.R) / (d * d * 0.866)));
  const rnd = mulberry32(S.seed);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const all = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, rad = Math.sqrt(1 - y * y), th = i * golden;
    const nx = Math.cos(th) * rad, nz = Math.sin(th) * rad;
    const u = 0.75 - Math.atan2(nz, nx) / (Math.PI * 2), v = 0.5 + Math.asin(y) / Math.PI;
    all.push({ nx, ny: y, nz, l: S.lumFn(((u % 1) + 1) % 1, v) + rnd() * 0.03 });
  }
  all.sort((a, b) => b.l - a.l);
  S.pts = all.slice(0, Math.round(all.length * S.density)).map(({ nx, ny, nz }) => {
    // two unit vectors lying in the tangent plane, used to draw the circle flat on the surface
    const ref = Math.abs(ny) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let t1 = [ny * ref[2] - nz * ref[1], nz * ref[0] - nx * ref[2], nx * ref[1] - ny * ref[0]];
    const l1 = Math.hypot(...t1);
    t1 = t1.map((c) => c / l1);
    const t2 = [ny * t1[2] - nz * t1[1], nz * t1[0] - nx * t1[2], nx * t1[1] - ny * t1[0]];
    return {
      hx: nx * S.R, hy: ny * S.R, hz: nz * S.R, t1, t2,
      ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0, // offset from home (world), its velocity
      tx: 0, ty: 0, tz: 0,                      // lagging tail offset, for stretched circles
      reach: 0.55 + rnd() * 0.9,
      push: 0.5 + Math.pow(rnd(), 2.5) * 2.5,
      jit: (rnd() - 0.5) * 2.4,
      k: 0.05 + rnd() * 0.13,
      damp: 0.6 + rnd() * 0.25,
      rs: rnd(),
      lag: 0.03 + rnd() * 0.08,
    };
  });
}

/* ---------- motion ---------- */

function stepPoint(p) {
  let ax = 0, ay = 0, az = 0; // target offset (world)
  const c = toCam(p.hx, p.hy, p.hz), s = persp(c[2]);
  if (mouse.hit && c[2] > -0.35 * S.R) {
    const dx = S.cx + c[0] * s - mouse.x, dy = S.cy + c[1] * s - mouse.y, d = Math.hypot(dx, dy);
    const Rr = S.radius * p.reach;
    if (d < Rr) {
      const n = noise(p.hx * 0.012, p.hy * 0.012 + p.hz * 0.012, frameCount * 0.015);
      const ang = Math.atan2(dy, dx) + (p.jit + (n - 0.5) * 3) * S.chaos;
      const push = 1 + (p.push - 1) * S.chaos;
      const dist = (((Rr - d) * push + 14 * p.rs * S.chaos) * (0.6 + n * 0.8)) / s;
      // away from the cursor on screen, and lifted off the surface towards the viewer
      [ax, ay, az] = toWorld(Math.cos(ang) * dist, Math.sin(ang) * dist, dist * 0.5 * (0.5 + S.chaos));
    }
  }
  if (S.noiseOn) {
    const k = 0.012 * (250 / S.R), t = frameCount * 0.008;
    const zone = noise(p.hx * k * 0.4 + 500, p.hy * k * 0.4 + p.hz * k * 0.4, frameCount * 0.003);
    const busy = Math.pow(Math.min(1, Math.max(0, (zone - 0.4) * 3.5)), 1.4);
    const amp = (6 + 130 * busy) * (0.4 + S.chaos) * (S.R / 250);
    ax += (noise(p.hx * k, p.hy * k, p.hz * k + t) - 0.5) * 2 * amp;
    ay += (noise(p.hx * k + 100, p.hy * k, p.hz * k + t) - 0.5) * 2 * amp;
    az += (noise(p.hx * k, p.hy * k + 100, p.hz * k + t) - 0.5) * 2 * amp;
  }
  p.vx = (p.vx + (ax - p.ox) * p.k) * p.damp;
  p.vy = (p.vy + (ay - p.oy) * p.k) * p.damp;
  p.vz = (p.vz + (az - p.oz) * p.k) * p.damp;
  p.ox += p.vx; p.oy += p.vy; p.oz += p.vz;
  const moved = Math.hypot(p.ox, p.oy, p.oz);
  const lag = p.rs < S.stretch * 0.5 || (S.noiseOn && p.rs < 0.4 && moved > 12) ? p.lag : 0.6;
  p.tx += (p.ox - p.tx) * lag;
  p.ty += (p.oy - p.ty) * lag;
  p.tz += (p.oz - p.tz) * lag;
}

/* ---------- shapes (used for both canvas and SVG export) ---------- */

const f = (n) => Math.round(n * 100) / 100;

function frameShapes() {
  const out = [];
  const r = S.size;
  for (const p of S.pts) {
    stepPoint(p);
    const hxw = p.hx + p.ox, hyw = p.hy + p.oy, hzw = p.hz + p.oz;
    const c = toCam(hxw, hyw, hzw), s = persp(c[2]);
    const X = S.cx + c[0] * s, Y = S.cy + c[1] * s, rr = r * s;
    const tc = toCam(p.hx + p.tx, p.hy + p.ty, p.hz + p.tz), ts = persp(tc[2]);
    const TX = S.cx + tc[0] * ts, TY = S.cy + tc[1] * ts;
    const t = Math.min(1, Math.max(0, (c[2] / S.R + 1) / 2));
    const alpha = 0.12 + 0.88 * t * t;
    const len = Math.hypot(X - TX, Y - TY);
    let d;
    if (len > rr * 0.5) d = stadiumD(X, Y, TX, TY, rr);
    else {
      // circle lying flat on the surface, so it squashes into an ellipse towards the edge
      d = '';
      for (let i = 0; i < SEG; i++) {
        const q = toCam(
          hxw + r * (COS[i] * p.t1[0] + SIN[i] * p.t2[0]),
          hyw + r * (COS[i] * p.t1[1] + SIN[i] * p.t2[1]),
          hzw + r * (COS[i] * p.t1[2] + SIN[i] * p.t2[2]));
        const qs = persp(q[2]);
        d += (i ? 'L' : 'M') + f(S.cx + q[0] * qs) + ' ' + f(S.cy + q[1] * qs);
      }
      d += 'Z';
    }
    out.push({ d, alpha: f(alpha), z: c[2] });
  }
  return out.sort((a, b) => a.z - b.z);
}

// capsule between two screen points, with a line through the middle
function stadiumD(x, y, tx, ty, r) {
  const dx = x - tx, dy = y - ty, len = Math.hypot(dx, dy);
  const nx = (-dy / len) * r, ny = (dx / len) * r;
  const A = [tx + nx, ty + ny], B = [x + nx, y + ny], C = [x - nx, y - ny], D = [tx - nx, ty - ny];
  return `M${f(A[0])} ${f(A[1])}L${f(B[0])} ${f(B[1])}A${f(r)} ${f(r)} 0 0 0 ${f(C[0])} ${f(C[1])}` +
    `L${f(D[0])} ${f(D[1])}A${f(r)} ${f(r)} 0 0 0 ${f(A[0])} ${f(A[1])}Z` +
    (len > r * 0.6 ? `M${f(tx)} ${f(ty)}L${f(x)} ${f(y)}` : '');
}

/* ---------- export ---------- */

function saveSvg() {
  if (!S.ready) return;
  const shapes = frameShapes();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${S.col.bg}"/>` +
    `<g fill="none" stroke="${S.col.fill}" stroke-width="${S.thick}" stroke-linejoin="round">` +
    shapes.map((sh) => `<path d="${sh.d}" stroke-opacity="${sh.alpha}"/>`).join('') + '</g></svg>';
  deliverSvg(`sphere-circles-${Date.now()}.svg`, svg);
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
  $('plain').addEventListener('click', plainSphere);
  $('auto').addEventListener('change', (e) => { S.auto = e.target.checked; });
  $('reshuffle').addEventListener('click', () => { S.seed = (Math.random() * 1e9) | 0; buildPoints(); });
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
  slider('size', 'size', buildPoints);
  slider('density', 'density', buildPoints);
  slider('scale', 'scale', () => { if (S.ready) layout(); });
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

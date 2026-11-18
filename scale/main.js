// Cosmic scale: shared state, images, text, input, HUD and the frame loop.
// The three modes live in stack.js, scroll.js and collide.js.

const ASPECT = 1.27;            // every image on the poster is cropped to this width : height
const IMAGE_DIR = window.IMAGE_DIR || 'images/';
const EXTS = ['jpg', 'png', 'jpeg', 'webp', 'avif'];
const FONT = '"Akkurat Mono", "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
const INK = '#f3f0e8';
// index-finger distance (fraction of camera width) that maps to the smallest / largest object
const SPREAD_MIN = 0.05, SPREAD_MAX = 0.72;

const App = {
  W: 0, H: 0, dpr: 1, ctx: null,
  mode: null, modes: {},
  t: 0, tTarget: 0, tShown: 0, tVel: 0,     // position along the 55 objects (0 = Higgs, 54 = Coma)
  mouse: { x: 0, y: 0, down: false, on: false },
  preview: true,
  idle: 0,                                   // seconds since the last input
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
// soft detents: t lingers on each whole object and moves quickly between them
const detent = (x) => { const f = Math.floor(x), r = x - f; return f + r - Math.sin(2 * Math.PI * r) / (2 * Math.PI) * 0.85; };
// log10 size at a fractional position along the list
const logAt = (t) => { const f = clamp(Math.floor(t), 0, N - 1), c = Math.min(N - 1, f + 1); return lerp(ITEMS[f].log, ITEMS[c].log, clamp(t - f, 0, 1)); };

/* ---------- images ---------- */

function coverCanvas(img, w) {
  const h = Math.round(w / ASPECT);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  let sw = iw, sh = iw / ASPECT;
  if (sh > ih) { sh = ih; sw = ih * ASPECT; }
  x.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
  return c;
}

function setImage(item, img) {
  item.big = coverCanvas(img, 900);
  item.small = coverCanvas(img, 240);
  item.real = true;
}

// stand-in until the real photo is in images/: a colour field keyed to the scale (blue subatomic → violet cosmic)
function placeholder(item, w) {
  const h = Math.round(w / ASPECT);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const hue = (215 - ((item.log + 9) / 41) * 290 + 720) % 360;
  x.fillStyle = `hsl(${hue},35%,7%)`;
  x.fillRect(0, 0, w, h);
  const g = x.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.55);
  g.addColorStop(0, `hsla(${hue},80%,62%,0.95)`);
  g.addColorStop(0.35, `hsla(${(hue + 30) % 360},70%,40%,0.6)`);
  g.addColorStop(1, `hsla(${hue},60%,10%,0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(255,255,255,0.18)';
  x.lineWidth = w / 240;
  for (let r = 1; r <= 5; r++) { x.beginPath(); x.arc(w / 2, h / 2, (r * h) / 11, 0, Math.PI * 2); x.stroke(); }
  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.font = `${Math.round(w / 14)}px ${FONT}`;
  x.textBaseline = 'top';
  x.fillText(String(item.i + 1).padStart(2, '0'), w * 0.04, h * 0.05);
  return c;
}

function loadImages() {
  ITEMS.forEach((item) => {
    item.big = placeholder(item, 480);
    item.small = placeholder(item, 240);
    let k = 0;
    const img = new Image();
    img.onload = () => setImage(item, img);
    img.onerror = () => { if (++k < EXTS.length) img.src = IMAGE_DIR + item.slug + '.' + EXTS[k]; };
    img.src = IMAGE_DIR + item.slug + '.' + EXTS[0];
  });
}

// match dropped / picked files to objects by name: "higgs-boson.jpg", "Higgs Boson.png", "01.jpg" all work
const norm = (s) => s.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/g, '');
function matchFile(name) {
  const n = norm(name);
  if (/^\d+$/.test(n)) return ITEMS[+n - 1] || null;
  let best = null, bestLen = 0;
  ITEMS.forEach((item) => {
    [norm(item.slug), norm(item.name)].forEach((key) => {
      if ((n === key || n.includes(key)) && key.length > bestLen) { best = item; bestLen = key.length; }
    });
  });
  return best;
}

function addFiles(files) {
  let used = 0;
  [...files].forEach((f) => {
    if (!f.type.startsWith('image/')) return;
    const item = matchFile(f.name);
    if (!item) return;
    used++;
    const img = new Image();
    img.onload = () => { setImage(item, img); URL.revokeObjectURL(img.src); };
    img.src = URL.createObjectURL(f);
  });
  flash(used ? `${used} image${used > 1 ? 's' : ''} placed` : 'no file names matched an object');
}

/* ---------- text ---------- */

const font = (px) => `${px}px ${FONT}`;

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  words.forEach((w) => {
    const test = line ? line + ' ' + w : w;
    if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = w; } else line = test;
  });
  if (line) lines.push(line);
  return lines;
}

// "1.6 × 10^-9" + " NM" with a raised exponent, top-aligned at y
function drawSize(ctx, str, x, y, px) {
  const m = str.match(/^(.*10)\^(-?\d+)$/);
  ctx.font = font(px);
  if (!m) { ctx.fillText(str + ' NM', x, y); return; }
  ctx.fillText(m[1], x, y);
  let w = ctx.measureText(m[1]).width;
  ctx.font = font(px * 0.58);
  const e = m[2].replace('-', '⁻');
  ctx.fillText(e, x + w + px * 0.08, y - px * 0.08);
  w += px * 0.08 + ctx.measureText(e).width;
  ctx.font = font(px);
  ctx.fillText(' NM', x + w, y);
}

// poster-style label: wrapped name, then size. Returns its height.
function drawLabel(ctx, item, x, y, px, maxW) {
  ctx.textBaseline = 'top';
  ctx.font = font(px);
  const lines = wrap(ctx, item.name, Math.max(maxW, px * 3));
  const lh = px * 0.9;
  lines.forEach((l, k) => ctx.fillText(l, x, y + k * lh));
  drawSize(ctx, item.size, x, y + lines.length * lh, px);
  return (lines.length + 1) * lh;
}

/* ---------- shared HUD pieces ---------- */

// vertical log ruler on the right edge, 10^-9 at the bottom to 10^32 at the top
function drawRuler(ctx, alpha = 1) {
  const { W, H } = App;
  const x = W - 34, top = 90, bot = H - 90;
  const lo = -9, hi = 33;
  const yOf = (L) => lerp(bot, top, (L - lo) / (hi - lo));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(243,240,232,0.35)';
  ctx.fillStyle = 'rgba(243,240,232,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, top); ctx.lineTo(x, bot);
  for (let L = lo; L <= hi; L++) {
    const y = Math.round(yOf(L)) + 0.5, len = L % 5 === 0 ? 10 : 5;
    ctx.moveTo(x, y); ctx.lineTo(x + len, y);
  }
  ctx.stroke();
  ctx.font = font(9);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let L = -5; L <= hi; L += 5) drawPow(ctx, L, x - 6, yOf(L), 9);
  // the objects
  ITEMS.forEach((it) => { ctx.fillRect(x - 2, yOf(it.log) - 0.5, 4, 1); });
  // current position
  const L = logAt(App.t), y = yOf(L);
  ctx.fillStyle = INK;
  ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.moveTo(x + 14, y); ctx.lineTo(x + 22, y - 5); ctx.lineTo(x + 22, y + 5); ctx.fill();
  ctx.fillRect(x - 8, y - 0.75, 22, 1.5);
  ctx.restore();
}

function drawPow(ctx, L, x, y, px) {
  // right-aligned "10^L"
  const e = String(L).replace('-', '⁻');
  ctx.font = font(px * 0.7);
  const ew = ctx.measureText(e).width;
  ctx.fillText(e, x, y - px * 0.35);
  ctx.font = font(px);
  ctx.fillText('10', x - ew - 1, y);
}

const HAND_LINES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

function drawPreview(ctx) {
  const v = Hands.video;
  if (!App.preview || !v || v.readyState < 2) return;
  const w = Math.min(220, App.W * 0.28), h = w / Hands.aspect;
  const x = 16, y = App.H - h - 16;
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.translate(x + w, y);
  ctx.scale(-1, 1);
  ctx.drawImage(v, 0, 0, w, h);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(243,240,232,0.25)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  Hands.list.forEach((hand) => {
    ctx.strokeStyle = hand.pointing ? '#ffd84a' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    HAND_LINES.forEach(([a, b]) => {
      ctx.moveTo(x + hand.lm[a].x * w, y + hand.lm[a].y * h);
      ctx.lineTo(x + hand.lm[b].x * w, y + hand.lm[b].y * h);
    });
    ctx.stroke();
    ctx.fillStyle = '#ff3b2f';
    ctx.beginPath(); ctx.arc(x + hand.tip.x * w, y + hand.tip.y * h, 3, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

// fingertips on screen: the whole camera frame maps onto the whole window
function drawCursors(ctx) {
  const { W, H } = App;
  const hands = Hands.list;
  const usesSpread = App.mode.spread;
  ctx.save();
  ctx.lineWidth = 1.5;
  if (usesSpread && hands.length === 2) {
    const [a, b] = hands;
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = 'rgba(243,240,232,0.45)';
    ctx.beginPath(); ctx.moveTo(a.tip.x * W, a.tip.y * H); ctx.lineTo(b.tip.x * W, b.tip.y * H); ctx.stroke();
    ctx.setLineDash([]);
    const mx = (a.tip.x + b.tip.x) / 2 * W, my = (a.tip.y + b.tip.y) / 2 * H;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = font(11);
    ctx.fillText(ITEMS[clamp(Math.round(App.t), 0, N - 1)].name, mx, my - 8);
    ctx.textAlign = 'left';
  }
  hands.forEach((h) => {
    const x = h.tip.x * W, y = h.tip.y * H;
    ctx.strokeStyle = h.pointing ? '#ffd84a' : 'rgba(243,240,232,0.8)';
    ctx.beginPath(); ctx.arc(x, y, h.pointing ? 16 : 11, 0, Math.PI * 2); ctx.stroke();
    if (h.pointing) { ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
  });
  ctx.restore();
}

/* ---------- DOM ---------- */

let flashTimer = 0;
function flash(text) {
  const el = document.getElementById('flash');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

function setMode(name) {
  if (!App.modes[name] || App.mode === App.modes[name]) return;
  App.mode = App.modes[name];
  if (App.mode.enter) App.mode.enter();
  document.querySelectorAll('#nav button[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === name));
  updateHint();
}

function updateHint() {
  const cam = !!Hands.model;
  document.getElementById('hint').textContent = cam ? App.mode.hintHands : App.mode.hintMouse;
}

/* ---------- loop ---------- */

function resize() {
  App.dpr = Math.min(2, window.devicePixelRatio || 1);
  App.W = window.innerWidth;
  App.H = window.innerHeight;
  const c = App.ctx.canvas;
  c.width = Math.round(App.W * App.dpr);
  c.height = Math.round(App.H * App.dpr);
  Object.values(App.modes).forEach((m) => m.resize && m.resize());
}

function updateScale(dt) {
  const s = App.mode.spread ? Hands.spread() : null;
  if (s !== null) {
    App.tTarget = clamp((s - SPREAD_MIN) / (SPREAD_MAX - SPREAD_MIN), 0, 1) * (N - 1);
    App.idle = 0;
  } else if (App.mode.spread && App.idle > 30) {
    // nobody around: drift slowly up through scale, and rewind (an explosion, in collide) at the end
    App.tTarget += dt * 0.45;
    if (App.tTarget > N - 1 + 0.6) App.tTarget = 0;
  }
  const prev = App.t;
  App.t += (App.tTarget - App.t) * (1 - Math.pow(0.88, dt * 60));
  App.tVel = lerp(App.tVel, (App.t - prev) / Math.max(dt, 1e-3), 0.2);
  App.tShown = detent(App.t);
}

let lastNow = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  App.idle += dt;
  Hands.update();
  if (Hands.list.length) App.idle = 0;
  updateScale(dt);
  App.mode.update(dt);

  const ctx = App.ctx;
  ctx.setTransform(App.dpr, 0, 0, App.dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, App.W, App.H);
  ctx.fillStyle = INK;
  App.mode.draw(ctx);
  drawCursors(ctx);
  drawPreview(ctx);
  requestAnimationFrame(frame);
}

/* ---------- input ---------- */

function bindInput() {
  const c = App.ctx.canvas;
  c.addEventListener('pointerdown', (e) => {
    App.mouse.down = true; App.mouse.x = e.clientX; App.mouse.y = e.clientY; App.idle = 0;
    c.setPointerCapture(e.pointerId);
    if (App.mode.press) App.mode.press(e.clientX, e.clientY);
  });
  c.addEventListener('pointermove', (e) => {
    const dx = e.clientX - App.mouse.x, dy = e.clientY - App.mouse.y;
    App.mouse.x = e.clientX; App.mouse.y = e.clientY; App.mouse.on = true;
    if (App.mouse.down) { App.idle = 0; if (App.mode.drag) App.mode.drag(dx, dy); }
  });
  const up = () => { if (App.mouse.down && App.mode.release) App.mode.release(); App.mouse.down = false; };
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', up);
  c.addEventListener('pointerleave', () => { App.mouse.on = false; });
  c.addEventListener('wheel', (e) => {
    e.preventDefault();
    App.idle = 0;
    const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    if (App.mode.wheel) App.mode.wheel(d);
    else App.tTarget = clamp(App.tTarget + d * 0.004, 0, N - 1);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === '1') setMode('stack');
    else if (k === '2') setMode('scroll');
    else if (k === '3') setMode('collide');
    else if (k === 'c') App.preview = !App.preview;
    else if (k === 'f') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
    else if (App.mode.key && App.mode.key(e.key)) e.preventDefault();
    else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { App.tTarget = clamp(Math.round(App.tTarget) + 1, 0, N - 1); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { App.tTarget = clamp(Math.round(App.tTarget) - 1, 0, N - 1); e.preventDefault(); }
    App.idle = 0;
  });

  document.querySelectorAll('#nav button[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.getElementById('files').addEventListener('change', (e) => addFiles(e.target.files));
  window.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dropping'); });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
  window.addEventListener('drop', (e) => { e.preventDefault(); document.body.classList.remove('dropping'); addFiles(e.dataTransfer.files); });
  window.addEventListener('resize', resize);

  const begin = () => { document.body.classList.remove('intro'); };
  document.getElementById('cam').addEventListener('click', () => { begin(); Hands.start(); });
  document.getElementById('nocam').addEventListener('click', begin);
  Hands.onStatus = (t) => { document.getElementById('status').textContent = t; updateHint(); };
}

/* ---------- start ---------- */

function init() {
  App.ctx = document.getElementById('c').getContext('2d');
  App.modes = { stack: StackMode, scroll: ScrollMode, collide: CollideMode };
  loadImages();
  bindInput();
  resize();
  const start = (location.hash || '').replace('#', '');
  App.mode = null;
  setMode(App.modes[start] ? start : 'stack');
  requestAnimationFrame(frame);
}

// wait for the poster font (Akkurat Mono if scale/fonts/ has it, else IBM Plex Mono) before the first frame
const fontsReady = document.fonts && document.fonts.load
  ? Promise.all([document.fonts.load('16px "Akkurat Mono"'), document.fonts.load('16px "IBM Plex Mono"')]).catch(() => {})
  : Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(init);

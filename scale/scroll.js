// Mode 2, scroll: the poster itself, one row of 1, then 2, 3 … 10 objects, filling the window width.
// Point your index finger and move it up or down to drag the poster; let go and it glides.

const ScrollMode = {
  spread: false,
  hintHands: 'POINT YOUR INDEX FINGER · MOVE IT UP OR DOWN TO SCROLL',
  hintMouse: 'SCROLL OR DRAG TO MOVE ALONG THE POSTER',
  cells: [],
  total: 0,
  footer: 0,
  u: 1,
  ox: 0,
  y: 0,          // scroll offset in px
  v: 0,          // px per frame
  prevY: null,   // last pointing fingertip y (px)
  hover: -1,
  dragging: false,
  gain: 2.2,     // how far the poster moves per pixel of finger movement

  enter() { this.prevY = null; },

  resize() {
    const PW = Math.min(App.W, 1500);
    const u = PW / 1333;
    const m = 28 * u, CW = PW - 2 * m, gap = 27 * u;
    this.u = u;
    this.ox = (App.W - PW) / 2;
    this.cells = [];
    let y = m, idx = 0;
    for (let r = 1; idx < N; r++) {
      const cellW = CW / r, iw = cellW * 0.487, ih = iw / ASPECT;
      for (let j = 0; j < r && idx < N; j++) {
        this.cells.push({ item: ITEMS[idx++], x: this.ox + m + j * cellW, y, w: iw, h: ih, cellW });
      }
      y += ih + gap;
    }
    this.footer = y + 220 * u;
    this.total = this.footer + 60 * u;
    this.y = clamp(this.y, 0, this.max());
  },

  max() { return Math.max(0, this.total - App.H); },

  update() {
    const p = Hands.pointer();
    if (p) {
      const fy = p.tip.y * App.H;
      if (this.prevY !== null) {
        const d = -(fy - this.prevY) * this.gain;
        this.y = clamp(this.y + d, -120, this.max() + 120);
        this.v = lerp(this.v, d, 0.35);
      }
      this.prevY = fy;
    } else {
      this.prevY = null;
    }
    if (!p && !this.dragging) {
      this.y += this.v;
      this.v *= 0.94;
      // ease back from beyond the ends
      if (this.y < 0) { this.y *= 0.8; this.v *= 0.5; }
      if (this.y > this.max()) { this.y = this.max() + (this.y - this.max()) * 0.8; this.v *= 0.5; }
    }
    // hovered object: under the pointing finger, else under the mouse
    const hx = p ? p.tip.x * App.W : App.mouse.on ? App.mouse.x : -1;
    const hy = p ? p.tip.y * App.H : App.mouse.y;
    this.hover = -1;
    this.cells.forEach((c, k) => {
      const y = c.y - this.y;
      if (hx >= c.x && hx <= c.x + c.cellW && hy >= y && hy <= y + c.h) this.hover = k;
    });
  },

  wheel(d) { this.y = clamp(this.y + d, -80, this.max() + 80); this.v = 0; },
  press() { this.dragging = true; this.v = 0; },
  drag(dx, dy) { this.y -= dy; this.v = lerp(this.v, -dy, 0.5); },
  release() { this.dragging = false; },
  key(k) {
    const step = App.H * 0.6;
    if (k === 'ArrowDown' || k === 'PageDown' || k === ' ') { this.v = 0; this.y = clamp(this.y + step, 0, this.max()); return true; }
    if (k === 'ArrowUp' || k === 'PageUp') { this.v = 0; this.y = clamp(this.y - step, 0, this.max()); return true; }
    if (k === 'Home') { this.y = 0; return true; }
    if (k === 'End') { this.y = this.max(); return true; }
    return false;
  },

  draw(ctx) {
    const { H } = App;
    const off = this.y;
    ctx.fillStyle = INK;
    this.cells.forEach((c, k) => {
      const y = c.y - off;
      if (y > H || y + c.h < 0) return;
      const hov = k === this.hover;
      ctx.globalAlpha = 1;
      ctx.drawImage(c.w > 250 ? c.item.big : c.item.small, c.x, y, c.w, c.h);
      if (hov) {
        ctx.strokeStyle = '#ffd84a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(c.x - 0.75, y - 0.75, c.w + 1.5, c.h + 1.5);
      }
      const px = Math.max(7, c.cellW * 0.057);
      const tx = c.x + c.w + c.cellW * 0.018;
      ctx.fillStyle = hov ? '#ffd84a' : INK;
      drawLabel(ctx, c.item, tx, y - px * 0.1, px, c.cellW - c.w - c.cellW * 0.04);
    });
    this.drawFooter(ctx, this.footer - off);
    // fade under the nav and the hint so text there stays readable
    const fade = (y0, y1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgba(0,0,0,0.92)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), App.W, Math.abs(y1 - y0)); };
    fade(0, 52);
    fade(H, H - 52);
    // scroll position
    const max = this.max();
    if (max > 0) {
      const trackH = H - 160, top = 80;
      const thumb = Math.max(30, trackH * H / this.total);
      const ty = top + (trackH - thumb) * clamp(off / max, 0, 1);
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = INK;
      ctx.fillRect(App.W - 8, ty, 2, thumb);
      ctx.globalAlpha = 1;
    }
  },

  // the poster's sign-off: converging lines pointing back to the start, and the tagline
  drawFooter(ctx, y) {
    if (y > App.H + 10 || y < -100) return;
    const u = this.u, x0 = this.ox + 28 * u, x1 = this.ox + 1060 * u;
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, 2.2 * u);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const ly = y + (k - 1.5) * 7 * u;
      ctx.moveTo(x0 + (36 - Math.abs(k - 1.5) * 8) * u, ly);
      ctx.lineTo(x1, ly);
    }
    ctx.moveTo(x0 + 40 * u, y - 16 * u); ctx.lineTo(x0, y); ctx.lineTo(x0 + 40 * u, y + 16 * u);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textBaseline = 'middle';
    ctx.font = font(Math.max(9, 14 * u));
    ctx.fillText('LOOK WITHIN', this.ox + 1165 * u, y - 7 * u);
    ctx.fillText('TO GO BEYOND', this.ox + 1162 * u, y + 8 * u);
    ctx.restore();
  },
};

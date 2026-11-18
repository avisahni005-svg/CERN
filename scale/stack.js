// Zoom: one framed image at a time. Moving to the next object, it grows out of the center of the current
// image while both break into halftone dots that merge into each other, sharpening again once it fills the frame.
// Going back (smaller), the same thing runs in reverse: the image shrinks back into the center.
// The distance between the two index fingers sets the position: together = Higgs boson, apart = Coma cluster.

const StackMode = (() => {
  const mk = () => { const c = document.createElement('canvas'); return { c, x: c.getContext('2d', { willReadFrequently: true }) }; };
  const buf = { a: mk(), b: mk(), out: mk(), full: mk() };
  const hash = (x, y) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const ease = (p) => p * p * (3 - 2 * p);
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

  // draw the transition from image A to image B at progress p (0..1) into the frame
  function merge(ctx, A, B, p, fx, fy, fw, fh) {
    const maxBlock = Math.max(6, fw / 20);
    const b = Math.max(2, Math.round(2 + (maxBlock - 2) * Math.pow(Math.sin(Math.PI * p), 1.2)));
    const cols = Math.ceil(fw / b), rows = Math.ceil(fh / b);
    [buf.a, buf.b, buf.out].forEach((s) => { if (s.c.width !== cols || s.c.height !== rows) { s.c.width = cols; s.c.height = rows; } });

    // A fills the frame; B grows from its center
    const s = Math.max(0.002, ease(p));
    buf.a.x.drawImage(A, 0, 0, cols, rows);
    buf.b.x.clearRect(0, 0, cols, rows);
    const bw = cols * s, bh = rows * s;
    buf.b.x.drawImage(B, (cols - bw) / 2, (rows - bh) / 2, bw, bh);
    const da = buf.a.x.getImageData(0, 0, cols, rows).data;
    const db = buf.b.x.getImageData(0, 0, cols, rows).data;
    const out = buf.out.x.createImageData(cols, rows);
    const o = out.data;

    const hx = cols / 2, hy = rows / 2;
    const rag = 0.4 * (1 - p);   // how ragged B's growing edge is
    const fill = 0.25 + p * 1.5; // how much of B's area has merged in so far
    for (let y = 0; y < rows; y++) {
      const ny = Math.floor(((y + 0.5) / rows) * 60);
      const dy = Math.abs(y + 0.5 - hy) / (hy * s);
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        // noise on a fixed grid, so the pattern holds still while the block size changes
        const nx = Math.floor(((x + 0.5) / cols) * 76);
        const d = Math.max(Math.abs(x + 0.5 - hx) / (hx * s), dy);
        const useB = db[i + 3] > 128 && d < 1.0001 - rag * hash(nx, ny) && hash(ny + 911, nx + 37) < fill;
        const src = useB ? db : da;
        o[i] = src[i]; o[i + 1] = src[i + 1]; o[i + 2] = src[i + 2]; o[i + 3] = 255;
      }
    }
    dots(ctx, o, cols, rows, b, fx, fy, fw, fh);
  }

  // each cell becomes a round dot of its colour, sized by its brightness (halftone), on black.
  // While the cells are still small, a square-pixel layer underneath keeps the image from going dark.
  function dots(ctx, cells, cols, rows, b, fx, fy, fw, fh) {
    const n = cols * rows;
    const rad = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const j = k * 4;
      const lum = (cells[j] * 0.299 + cells[j + 1] * 0.587 + cells[j + 2] * 0.114) / 255;
      rad[k] = b * 0.5 * (0.6 + 0.48 * lum);
    }
    const under = 1 - smooth(3, 11, b);
    const f = buf.full;
    if (f.c.width !== fw || f.c.height !== fh) { f.c.width = fw; f.c.height = fh; f.img = null; }
    if (!f.img) f.img = f.x.createImageData(fw, fh);
    const o = f.img.data;
    for (let py = 0; py < fh; py++) {
      const cy = Math.min(rows - 1, (py / b) | 0);
      const dy = py + 0.5 - (cy + 0.5) * b;
      const row = cy * cols;
      for (let px = 0; px < fw; px++) {
        const cx = Math.min(cols - 1, (px / b) | 0);
        const dx = px + 0.5 - (cx + 0.5) * b;
        const k = row + cx;
        // anti-aliased edge: full inside the radius, fading over one pixel
        const cov = clamp(rad[k] - Math.sqrt(dx * dx + dy * dy) + 0.5, 0, 1);
        const m = cov + under * (1 - cov);
        const j = k * 4, i = (py * fw + px) * 4;
        o[i] = cells[j] * m; o[i + 1] = cells[j + 1] * m; o[i + 2] = cells[j + 2] * m; o[i + 3] = 255;
      }
    }
    f.x.putImageData(f.img, 0, 0);
    ctx.drawImage(f.c, fx, fy);
  }

  return {
    spread: true,
    hintHands: 'BOTH INDEX FINGERS UP · CLOSE TOGETHER = SMALLER · FAR APART = BIGGER',
    hintMouse: 'SCROLL, DRAG OR ↑ ↓ TO MOVE THROUGH SCALE',

    update() {},
    drag(dx, dy) { App.tTarget = clamp(App.tTarget - dy * 0.02, 0, N - 1); },
    release() { App.tTarget = Math.round(App.tTarget); },

    draw(ctx) {
      const { W, H } = App;
      const t = clamp(App.tShown, 0, N - 1);
      const i = Math.min(N - 1, Math.floor(t)), p = i === N - 1 ? 0 : t - i;
      const A = ITEMS[i], B = ITEMS[Math.min(N - 1, i + 1)];

      const narrow = W < 760;
      const fh = Math.round(Math.min(H * (narrow ? 0.48 : 0.62), (W * (narrow ? 1 : 0.52) - (narrow ? 32 : 0)) / ASPECT));
      const fw = Math.round(fh * ASPECT);
      const fx = Math.round(narrow ? (W - fw) / 2 : Math.min(W * 0.44 - fw / 2, W - fw - 380));
      const fy = Math.round(narrow ? H * 0.12 : (H - fh) / 2);

      if (p < 0.015) ctx.drawImage(A.big, fx, fy, fw, fh);
      else if (p > 0.985) ctx.drawImage(B.big, fx, fy, fw, fh);
      else merge(ctx, A.big, B.big, p, fx, fy, fw, fh);

      // labels: the old one hands over to the new one halfway through
      const px = narrow ? 22 : clamp(Math.round(fw * 0.075), 18, 56);
      const lx = narrow ? fx : fx + fw + 20;
      const ly = narrow ? fy + fh + 18 : fy;
      const maxW = narrow ? fw : W - lx - 80;
      ctx.fillStyle = INK;
      [[A, 1 - smooth(0.3, 0.5, p)], [B, smooth(0.5, 0.7, p)]].forEach(([item, a]) => {
        if (a <= 0 || (item === B && i === N - 1)) return;
        ctx.globalAlpha = a;
        drawLabel(ctx, item, lx, ly, px, maxW);
        ctx.font = font(11);
        ctx.globalAlpha = a * 0.5;
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(item.i + 1).padStart(2, '0') + ' / ' + N, fx, fy - 8);
      });
      ctx.globalAlpha = 1;
      if (!narrow) drawRuler(ctx); // no room beside the image on a phone
    },
  };
})();

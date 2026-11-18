// Mode 1, stack: the objects are a deck of cards receding into depth, the next bigger ones peeking out above.
// Spreading the index fingers pulls bigger things forward; bringing them together brings smaller things back.

const StackMode = {
  spread: true,
  hintHands: 'BOTH INDEX FINGERS UP · CLOSE TOGETHER = SMALLER · FAR APART = BIGGER',
  hintMouse: 'SCROLL, DRAG OR ↑ ↓ TO MOVE THROUGH SCALE',

  update() {},

  drag(dx, dy) { App.tTarget = clamp(App.tTarget - dy * 0.02, 0, N - 1); },
  release() { App.tTarget = Math.round(App.tTarget); },

  draw(ctx) {
    const { W, H } = App;
    const t = App.tShown;
    const narrow = W < 760;
    const ch = Math.min(H * (narrow ? 0.36 : 0.44), (W * (narrow ? 0.72 : 0.46)) / ASPECT);
    const cw = ch * ASPECT;
    const cx = narrow ? 16 + cw / 2 : Math.min(W * 0.38, W - cw / 2 - 360);
    const cy = narrow ? H * 0.58 : H * 0.63;
    const bigPx = clamp(Math.round(cw * 0.1), 16, 60);
    const smallPx = 11;

    const cards = [];
    for (let i = 0; i < N; i++) {
      const k = i - t;
      if (k > -1 && k < 8.5) cards.push({ item: ITEMS[i], k });
    }
    cards.sort((a, b) => b.k - a.k); // farthest first
    const labels = []; // drawn after every card, so a card rushing past never covers the arriving label

    cards.forEach(({ item, k }) => {
      let sc, y, alpha, dim;
      if (k >= 0) {
        sc = Math.pow(0.84, k);
        y = cy - k * ch * 0.16;
        alpha = clamp(1 - (k - 5) / 3, 0, 1);
        dim = Math.min(0.78, k * 0.14);
      } else {
        // smaller object leaving: rushes past the viewer and fades
        const q = -k;
        sc = 1 + q * 0.7 + q * q * 2.4;
        y = cy + q * ch * 0.8;
        alpha = clamp(1 - q * 1.3, 0, 1);
        dim = 0;
      }
      if (alpha <= 0) return;
      const w = cw * sc, h = ch * sc, x0 = cx - w / 2, y0 = y - h / 2;
      ctx.globalAlpha = alpha;
      ctx.drawImage(w > 250 ? item.big : item.small, x0, y0, w, h);
      if (dim > 0) {
        ctx.globalAlpha = alpha * dim;
        ctx.fillStyle = '#000';
        ctx.fillRect(x0, y0, w, h);
      }
      if (k > 0) {
        // hairline so stacked cards read as separate sheets
        ctx.globalAlpha = alpha * 0.25;
        ctx.fillStyle = INK;
        ctx.fillRect(x0, y0, w, 1);
      }

      labels.push(() => {
      ctx.fillStyle = INK;
      ctx.textBaseline = 'top';
      if (narrow) {
        if (k < 1 && k > -0.4) {
          ctx.globalAlpha = alpha * clamp(1 - Math.abs(k) * (k < 0 ? 3 : 1.6), 0, 1);
          drawLabel(ctx, item, cx - cw / 2, cy + ch / 2 + 18, Math.round(bigPx * 0.8), cw);
        }
        return;
      }
      const lx = x0 + w + 16;
      const maxW = W - lx - 80;
      if (k < 0) {
        // the leaving label fades fast so it never sits on top of the arriving one
        ctx.globalAlpha = alpha * clamp(1 + k * 3.5, 0, 1);
        if (ctx.globalAlpha > 0) drawLabel(ctx, item, lx, y0, bigPx, maxW);
      } else if (k < 1) {
        const px = Math.round(lerp(bigPx, smallPx, clamp(k, 0, 1)));
        ctx.globalAlpha = alpha;
        ctx.font = font(px);
        const lines = wrap(ctx, item.name, maxW);
        const lh = px * 0.9;
        const shown = k > 0 ? 1 : lines.length; // the name collapses to one line as it recedes
        for (let l = 0; l < shown; l++) ctx.fillText(lines[l], lx, y0 + l * lh);
        ctx.globalAlpha = alpha * clamp(1 - k * 2, 0, 1);
        if (ctx.globalAlpha > 0) drawSize(ctx, item.size, lx, y0 + shown * lh, px);
      } else {
        ctx.globalAlpha = alpha * (1 - dim * 0.6);
        ctx.font = font(smallPx);
        ctx.fillText(item.name, lx, y0 + 1);
      }
      });
    });
    labels.forEach((f) => f());
    ctx.globalAlpha = 1;
    drawRuler(ctx);
  },
};

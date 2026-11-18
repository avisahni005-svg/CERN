// Mode 3, collide: a detector event display run backwards. The objects ride curved particle tracks from the
// calorimeter into the collision point, where the current one sits large, then collapse into the vertex as the
// next one arrives. Going the other way (smaller) it explodes outward instead.
// Two index fingers travel through scale (same as the stack); one pointing finger spins the event in 3D.

const CollideMode = (() => {
  // seeded random so the event looks the same every visit
  let seed = 7;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const SPREAD = 6;       // how many upcoming objects are in flight along their tracks
  const R_END = 0.84;     // tracks end at the calorimeter
  const SAMPLES = 36;
  const BINS = 90;        // calorimeter towers

  function makeTrack(phi0, c, zEnd, rEnd) {
    const ac = Math.max(Math.abs(c), 1e-3);
    const L = 2 * Math.asin(Math.min(0.999, (rEnd * ac) / 2)) / ac;
    const pts = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const l = (k / SAMPLES) * L, th = phi0 + c * l;
      pts.push(Math.abs(c) < 1e-3
        ? [l * Math.cos(phi0), l * Math.sin(phi0), zEnd * (k / SAMPLES)]
        : [(Math.sin(th) - Math.sin(phi0)) / c, -(Math.cos(th) - Math.cos(phi0)) / c, zEnd * (k / SAMPLES)]);
    }
    const e = pts[SAMPLES];
    return { pts, bin: ((Math.round((Math.atan2(e[1], e[0]) / (Math.PI * 2)) * BINS) % BINS) + BINS) % BINS };
  }

  const tracks = ITEMS.map((it, i) => {
    const sign = rnd() < 0.5 ? -1 : 1;
    return makeTrack(i * 2.39996 + rnd() * 0.4, sign * (0.35 + rnd() * 1.9), (rnd() - 0.5) * 1.1, R_END);
  });
  // decorative jets, like the yellow spray on the poster
  const jets = Array.from({ length: 70 }, () => {
    const cone = rnd() < 0.7;
    return makeTrack(cone ? 1.9 + (rnd() - 0.5) * 0.9 : rnd() * Math.PI * 2, (rnd() - 0.5) * (cone ? 0.5 : 3), (rnd() - 0.5) * 0.6, 0.6 + rnd() * 0.35);
  });
  // tracker hits: short tangential dashes
  const hits = Array.from({ length: 380 }, () => {
    const r = 0.14 + rnd() * 0.5, a = rnd() * Math.PI * 2, z = (rnd() - 0.5) * 0.35, l = 0.012 + rnd() * 0.012;
    return { a: [r * Math.cos(a), r * Math.sin(a), z], b: [r * Math.cos(a + l / r), r * Math.sin(a + l / r), z], hot: rnd() < 0.35 };
  });
  const energy = new Float32Array(BINS).map(() => rnd() * 0.04);
  const ring = (r, z = 0, n = 96) => Array.from({ length: n + 1 }, (_, k) => [r * Math.cos((k / n) * Math.PI * 2), r * Math.sin((k / n) * Math.PI * 2), z]);
  const rings = [0.035, 0.13, 0.22, 0.33, 0.46, 0.6].map((r) => ring(r));
  const outer = [ring(0.7), ring(0.95), ring(1.0)];

  const sparks = [];
  const state = {
    yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, time: 0,
    shake: 0, flash: 0, jet: 0, lastI: null, prevTip: null,
    D: 2.7, S: 1, cx: 0, cy: 0,
    cyw: 1, syw: 0, cp: 1, sp: 0,
  };

  // world -> screen. Returns [x, y, perspective factor, depth toward viewer]
  function P(p) {
    const s = state;
    const x1 = p[0] * s.cyw + p[2] * s.syw, z1 = -p[0] * s.syw + p[2] * s.cyw;
    const y2 = p[1] * s.cp - z1 * s.sp, z2 = p[1] * s.sp + z1 * s.cp;
    const k = s.D / Math.max(0.3, s.D - z2);
    return [s.cx + x1 * s.S * k, s.cy + y2 * s.S * k, k, z2];
  }

  function trackPoint(tr, s) {
    const f = clamp(s, 0, 1) * SAMPLES, a = Math.floor(f), b = Math.min(SAMPLES, a + 1), r = f - a;
    const A = tr.pts[a], B = tr.pts[b];
    return [lerp(A[0], B[0], r), lerp(A[1], B[1], r), lerp(A[2], B[2], r)];
  }

  function spawn(n, inward, speed = 1) {
    for (let k = 0; k < n && sparks.length < 900; k++) {
      // random direction, flattened toward the transverse plane like a real event
      const a = rnd() * Math.PI * 2, z = (rnd() - 0.5) * 0.9;
      const d = [Math.cos(a), Math.sin(a), z];
      const r = inward ? 0.9 + rnd() * 0.3 : 0.02;
      const sp = (inward ? -1 : 1) * (0.5 + rnd() * 1.2) * speed;
      const swirl = (rnd() - 0.5) * 2.2;
      sparks.push({ p: [d[0] * r, d[1] * r, d[2] * r], v: [d[0] * sp - d[1] * swirl * 0.4, d[1] * sp + d[0] * swirl * 0.4, d[2] * sp], inward, life: 0, prev: null, hot: rnd() < 0.5 });
    }
  }

  function arrive(dir, i) {
    if (tracks[i]) for (let d = -1; d <= 1; d++) energy[(tracks[i].bin + d + BINS) % BINS] += 0.09;
    state.shake = 1;
    state.flash = 1;
    state.jet = 1;
    spawn(dir > 0 ? 220 : 160, dir > 0, 1.4);
    for (let k = 0; k < 10; k++) energy[Math.floor(rnd() * BINS)] += 0.05 + rnd() * 0.12;
  }

  function polyline(ctx, pts) {
    let first = true;
    pts.forEach((p) => { const q = P(p); if (first) { ctx.moveTo(q[0], q[1]); first = false; } else ctx.lineTo(q[0], q[1]); });
  }

  return {
    spread: true,
    hintHands: 'TWO INDEX FINGERS = TRAVEL THROUGH SCALE · POINT ONE FINGER = SPIN THE EVENT',
    hintMouse: 'SCROLL OR ↑ ↓ TO TRAVEL THROUGH SCALE · DRAG TO SPIN THE EVENT',

    enter() { state.lastI = Math.round(App.tShown); state.prevTip = null; },

    resize() {
      state.S = Math.min(App.W, App.H) * 0.5;
      state.cx = App.W / 2;
      state.cy = App.H / 2;
    },

    drag(dx, dy) {
      state.vyaw = dx * 0.006; state.vpitch = dy * 0.006;
      state.yaw += state.vyaw; state.pitch = clamp(state.pitch + state.vpitch, -1.3, 1.3);
    },

    update(dt) {
      const s = state;
      s.time += dt;

      // one pointing hand (and not two hands) spins the event
      const p = Hands.list.length === 1 ? Hands.pointer() : null;
      if (p) {
        const tip = [p.tip.x * App.W, p.tip.y * App.H];
        if (s.prevTip) this.drag((tip[0] - s.prevTip[0]) * 1.6, (tip[1] - s.prevTip[1]) * 1.6);
        s.prevTip = tip;
      } else {
        s.prevTip = null;
        if (!App.mouse.down) {
          s.yaw += s.vyaw; s.pitch = clamp(s.pitch + s.vpitch, -1.3, 1.3);
          s.vyaw *= 0.94; s.vpitch *= 0.94;
        }
      }
      // a slow drift so the event always feels alive
      const yaw = s.yaw + Math.sin(s.time * 0.13) * 0.35, pitch = s.pitch + Math.sin(s.time * 0.09) * 0.22;
      s.cyw = Math.cos(yaw); s.syw = Math.sin(yaw); s.cp = Math.cos(pitch); s.sp = Math.sin(pitch);

      // arrivals
      const i = Math.round(App.tShown);
      if (s.lastI === null) s.lastI = i;
      if (i !== s.lastI) { arrive(i - s.lastI, i); s.lastI = i; }

      // ambient particles: inward while growing, outward while shrinking
      const v = App.tVel;
      const rate = 25 + Math.min(300, Math.abs(v) * 120);
      let n = rate * dt;
      const inward = v > -0.15;
      while (n > 0) { if (rnd() < n) spawn(1, inward, 0.6 + Math.min(2, Math.abs(v))); n -= 1; }

      for (let k = sparks.length - 1; k >= 0; k--) {
        const sp = sparks[k];
        const r = Math.hypot(sp.p[0], sp.p[1], sp.p[2]) || 1e-3;
        const pull = sp.inward ? -2.2 / (r + 0.25) : 0.8;
        for (let a = 0; a < 3; a++) sp.v[a] += (sp.p[a] / r) * pull * dt;
        sp.prev = sp.p.slice();
        for (let a = 0; a < 3; a++) sp.p[a] += sp.v[a] * dt;
        sp.life += dt;
        const r2 = Math.hypot(sp.p[0], sp.p[1], sp.p[2]);
        if ((sp.inward && r2 < 0.03) || r2 > 1.35 || sp.life > 4) sparks.splice(k, 1);
      }

      for (let b = 0; b < BINS; b++) energy[b] = energy[b] * Math.pow(0.35, dt) + 0.012 * dt * 60 * rnd() * 0.05;
      s.shake *= Math.pow(0.02, dt);
      s.flash *= Math.pow(0.04, dt);
      s.jet *= Math.pow(0.15, dt);
    },

    draw(ctx) {
      const s = state;
      const { W, H } = App;
      const t = App.tShown;
      const sh = s.shake * Math.min(W, H) * 0.012;
      const cx0 = s.cx, cy0 = s.cy;
      s.cx = cx0 + (Math.random() - 0.5) * sh;
      s.cy = cy0 + (Math.random() - 0.5) * sh;

      // vignette
      const g = ctx.createRadialGradient(s.cx, s.cy, 0, s.cx, s.cy, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(40,36,30,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.lineWidth = 1;
      // tracker layers
      ctx.strokeStyle = 'rgba(243,240,232,0.13)';
      ctx.beginPath(); rings.forEach((r) => polyline(ctx, r)); ctx.stroke();
      // hits
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(243,240,232,0.45)';
      hits.forEach((h) => { if (h.hot) return; const a = P(h.a), b = P(h.b); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); });
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,140,60,0.75)';
      hits.forEach((h) => { if (!h.hot) return; const a = P(h.a), b = P(h.b); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); });
      ctx.stroke();

      // calorimeter: a comb ring, red towers, outer grill
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(243,240,232,0.3)';
      for (let k = 0; k < 144; k++) {
        const a = (k / 144) * Math.PI * 2, c = Math.cos(a), si = Math.sin(a);
        const p1 = P([0.7 * c, 0.7 * si, 0]), p2 = P([0.8 * c, 0.8 * si, 0]);
        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
      }
      for (let k = 0; k < 240; k++) {
        const a = (k / 240) * Math.PI * 2, c = Math.cos(a), si = Math.sin(a);
        const p1 = P([0.95 * c, 0.95 * si, 0]), p2 = P([1.0 * c, 1.0 * si, 0]);
        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(160,200,255,0.4)';
      ctx.beginPath(); outer.forEach((r) => polyline(ctx, r)); ctx.stroke();
      ctx.fillStyle = '#ff2a1a';
      for (let b = 0; b < BINS; b++) {
        const e = Math.min(0.13, energy[b]);
        if (e < 0.004) continue;
        const a0 = (b / BINS) * Math.PI * 2, a1 = ((b + 0.8) / BINS) * Math.PI * 2;
        const r0 = 0.815, r1 = 0.815 + e;
        const q = [[r0, a0], [r1, a0], [r1, a1], [r0, a1]].map(([r, a]) => P([r * Math.cos(a), r * Math.sin(a), 0]));
        ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); q.slice(1).forEach((p) => ctx.lineTo(p[0], p[1])); ctx.fill();
      }
      // muon chamber marks
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + 0.1, p = P([1.13 * Math.cos(a), 1.13 * Math.sin(a), 0]);
        const z = 3 * p[2];
        ctx.fillRect(p[0] - z, p[1] - z, z * 2, z * 2);
      }

      ctx.globalCompositeOperation = 'lighter';
      // all tracks, faint; jets glow on arrival
      ctx.strokeStyle = 'rgba(243,240,232,0.07)';
      ctx.beginPath(); tracks.forEach((tr, i) => { if (i - t > -1) polyline(ctx, tr.pts); }); ctx.stroke();
      ctx.strokeStyle = `rgba(255,216,74,${0.05 + s.jet * 0.5})`;
      ctx.beginPath(); jets.forEach((tr) => polyline(ctx, tr.pts)); ctx.stroke();

      // the tracks of objects in flight: a bright trail behind each one, back toward where it came from
      ctx.lineWidth = 1.6;
      ITEMS.forEach((it, i) => {
        const k = i - t;
        if (k <= 0 || k > SPREAD + 1) return;
        const s0 = Math.pow(Math.min(1, k / SPREAD), 0.8), tr = tracks[i];
        const a = 0.9 * clamp(1 - (k - SPREAD), 0, 1);
        const steps = 10;
        for (let q = 0; q < steps; q++) {
          const u0 = s0 + (q / steps) * 0.45, u1 = s0 + ((q + 1) / steps) * 0.45;
          if (u0 >= 1) break;
          const p0 = P(trackPoint(tr, u0)), p1 = P(trackPoint(tr, Math.min(1, u1)));
          ctx.strokeStyle = `rgba(255,216,74,${a * (1 - q / steps)})`;
          ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
        }
      });

      // sparks
      ctx.lineWidth = 1.2;
      sparks.forEach((sp) => {
        if (!sp.prev) return;
        const a = P(sp.prev), b = P(sp.p);
        const fade = Math.min(1, sp.life * 4) * (sp.inward ? 1 : Math.max(0, 1 - sp.life / 1.6));
        ctx.strokeStyle = sp.hot ? `rgba(255,120,50,${0.8 * fade})` : `rgba(255,226,140,${0.75 * fade})`;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0] + (b[0] - a[0]) * 2, b[1] + (b[1] - a[1]) * 2); ctx.stroke();
      });
      ctx.globalCompositeOperation = 'source-over';

      // objects, far to near
      const draws = [];
      ITEMS.forEach((it, i) => {
        const k = i - t;
        if (k < -1) return;
        let pos, size, alpha, spin = 0;
        if (k >= 0) {
          const sp = Math.pow(Math.min(1, k / SPREAD), 0.8);
          pos = trackPoint(tracks[i], sp);
          size = lerp(0.07, 0.62, Math.pow(1 - sp, 2.2));
          alpha = k > SPREAD ? 0.45 : 1;
        } else {
          const q = -k;
          pos = [0, 0, 0];
          size = 0.62 * Math.pow(1 - q, 1.4);
          alpha = 1 - q * q;
          spin = q * q * 2.4;
        }
        const p = P(pos);
        draws.push({ it, k, p, size, alpha, spin });
      });
      draws.sort((a, b) => a.p[3] - b.p[3] || b.k - a.k);
      const center = draws.find((d) => d.it.i === clamp(Math.round(t), 0, N - 1));
      const keepOut = center ? center.size * s.S * center.p[2] * 0.75 + 140 : 0;
      draws.forEach(({ it, k, p, size, alpha, spin }) => {
        const w = size * s.S * p[2], h = w / ASPECT;
        if (w < 1) return;
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.translate(p[0], p[1]);
        if (spin) ctx.rotate(spin);
        ctx.drawImage(w > 250 ? it.big : it.small, -w / 2, -h / 2, w, h);
        ctx.restore();
        // small labels on the objects still in flight
        if (k > 0.3 && k < 3.5 && Math.hypot(p[0] - s.cx, p[1] - s.cy) > keepOut) {
          ctx.globalAlpha = alpha * clamp((3.5 - k) / 2, 0, 0.85);
          ctx.fillStyle = INK;
          ctx.font = font(10);
          ctx.textBaseline = 'top';
          ctx.fillText(it.name, p[0] + w / 2 + 6, p[1] - h / 2);
        }
      });
      ctx.globalAlpha = 1;

      // collision flash
      if (s.flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        const r = Math.min(W, H) * (0.1 + (1 - s.flash) * 0.5);
        const fg = ctx.createRadialGradient(s.cx, s.cy, 0, s.cx, s.cy, r);
        fg.addColorStop(0, `rgba(255,240,200,${0.7 * s.flash})`);
        fg.addColorStop(0.4, `rgba(255,170,60,${0.3 * s.flash})`);
        fg.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(s.cx - r, s.cy - r, r * 2, r * 2);
        ctx.globalCompositeOperation = 'source-over';
      }

      // label for the object at the vertex, poster style, beside it
      const ci = clamp(Math.round(t), 0, N - 1), ck = ci - t;
      const cur = center;
      if (cur) {
        const w = cur.size * s.S * cur.p[2], h = w / ASPECT;
        const px = clamp(Math.round(w * 0.085), 14, 44);
        ctx.globalAlpha = clamp(1 - Math.abs(ck) * 2.2, 0, 1);
        ctx.fillStyle = INK;
        const lx = Math.min(cur.p[0] + w / 2 + 18, W - 300);
        drawLabel(ctx, cur.it, lx, cur.p[1] - h / 2, px, W - lx - 70);
        ctx.globalAlpha = 1;
      }

      s.cx = cx0; s.cy = cy0;
      drawRuler(ctx, 0.8);
    },
  };
})();

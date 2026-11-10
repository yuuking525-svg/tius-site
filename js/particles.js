/* Opening: a network of nodes in the four mark colours drifts over the screen, breaks into
   particles and gathers into the Tius mark. The mark is drawn from its own geometry (not read
   from an image), so this also works when the page is opened from the disk.
   main.js decides when; this file only draws it. */
(function () {
  'use strict';

  const PALETTE = [[211, 138, 108], [232, 191, 168], [216, 169, 147], [140, 107, 88]];
  const FILLS = PALETTE.map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`);
  // Mark circles in a 100-unit box: x, y, radius, colour index (same as #logo-mark)
  const MARK = [
    [50, 50, 11, 1],
    [50, 14, 10.5, 0], [86, 50, 10.5, 1], [50, 86, 10.5, 2], [14, 50, 10.5, 3],
    [75.5, 24.5, 5.5, 2], [75.5, 75.5, 5.5, 3], [24.5, 75.5, 5.5, 0], [24.5, 24.5, 5.5, 1],
  ];

  const BURST = 0.7;
  const GATHER = 1.15;
  const SPREAD = 0.45;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (t) => Math.min(Math.max(t, 0), 1);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  };

  // Points on a grid over the mark, each knowing which colour circle it falls in
  function sampleMark(size) {
    const gap = Math.max(2, size / 60);
    const k = size / 100;
    const points = [];
    for (let y = gap / 2; y < size; y += gap) {
      for (let x = gap / 2; x < size; x += gap) {
        for (const [cx, cy, r, color] of MARK) {
          if (Math.hypot(x - cx * k, y - cy * k) <= r * k) { points.push({ x, y, color }); break; }
        }
      }
    }
    return { points, gap };
  }

  async function createLoaderParticles(canvas, markEl) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d canvas');
    const W = innerWidth;
    const H = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const box = markEl.getBoundingClientRect();
    const size = Math.min(box.width, box.height);
    if (!size) throw new Error('mark has no size');
    const offX = box.left + (box.width - size) / 2;
    const offY = box.top + (box.height - size) / 2;
    const { points, gap } = sampleMark(size);
    const dot = gap * 0.62;

    // Nodes on a jittered grid so they cover the screen evenly, shared out by colour
    const count = Math.round(Math.min(90, Math.max(28, (W * H) / 15000)));
    const cols = Math.max(1, Math.round(Math.sqrt((count * W) / H)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const spots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) spots.push([((c + rand(0.15, 0.85)) / cols) * W, ((r + rand(0.15, 0.85)) / rows) * H]);
    }
    shuffle(spots);
    const byColor = PALETTE.map((_, k) => shuffle(points.filter((p) => p.color === k)));
    const quota = byColor.map((list) => (list.length ? Math.max(1, Math.floor((spots.length * list.length) / points.length)) : 0));
    let left = spots.length - quota.reduce((a, b) => a + b, 0);
    byColor
      .map((list, k) => ({ k, rest: (spots.length * list.length) / points.length - quota[k] }))
      .sort((a, b) => b.rest - a.rest)
      .forEach(({ k }) => { if (left > 0 && byColor[k].length) { quota[k]++; left--; } });

    const nodes = [];
    byColor.forEach((list, color) => {
      if (!list.length) return;
      const group = [];
      for (let i = 0; i < quota[color] && spots.length; i++) {
        const [x, y] = spots.pop();
        const node = { x, y, color, members: 0, ax: rand(12, 40), ay: rand(12, 40), wx: rand(0.25, 0.6), wy: rand(0.25, 0.6), px: rand(0, 6.3), py: rand(0, 6.3) };
        nodes.push(node);
        group.push(node);
      }
      list.forEach((p, i) => { p.node = group[i % group.length]; p.node.members++; });
    });
    const maxR = Math.min(W, H) / 32;
    for (const n of nodes) n.r = Math.min(maxR, Math.max(3, Math.sqrt(n.members) * dot * 1.3));
    const nodeAt = (n, t) => [n.x + n.ax * Math.sin(t * n.wx + n.px), n.y + n.ay * Math.sin(t * n.wy + n.py)];

    const particles = points.map((p) => {
      const a = rand(0, Math.PI * 2);
      const d = Math.sqrt(Math.random()) * p.node.r;
      return Object.assign(p, {
        tx: offX + p.x, ty: offY + p.y,
        ox: Math.cos(a) * d, oy: Math.sin(a) * d,
        dir: a + rand(-0.6, 0.6), speed: rand(40, 220), delay: rand(0, SPREAD), curl: rand(-0.45, 0.45),
      });
    });
    const reach = Math.sqrt((W * H) / nodes.length) * 1.6;

    let gatherAt = null;
    let done = null;
    let raf = 0;
    const startedAt = performance.now();

    const draw = (now) => {
      const t = (now - startedAt) / 1000;
      ctx.clearRect(0, 0, W, H);
      const b = gatherAt === null ? 0 : t - gatherAt;

      // Links between nearby nodes, reaching further as the network builds up
      const linkAlpha = gatherAt === null ? 1 : 1 - clamp01(b / 0.4);
      const nodeScale = gatherAt === null ? easeOut(clamp01(t / 0.8)) : 1 - easeOut(clamp01(b / 0.22));
      const pos = nodes.map((n) => nodeAt(n, t));
      if (linkAlpha > 0) {
        const maxD = reach * (0.45 + 0.55 * easeOut(clamp01(t / 1.1)));
        ctx.lineWidth = 1;
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = pos[j][0] - pos[i][0];
            const dy = pos[j][1] - pos[i][1];
            const d = Math.hypot(dx, dy);
            if (d > maxD) continue;
            const k = (1 - d / maxD) * linkAlpha;
            ctx.strokeStyle = `rgba(59, 37, 25,${(k * 0.22).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(pos[i][0], pos[i][1]);
            ctx.lineTo(pos[j][0], pos[j][1]);
            ctx.stroke();
            // Travellers moving along some of the routes
            if ((i + j) % 5 === 0) {
              const f = (t * 0.45 + i * 0.137) % 1;
              ctx.fillStyle = FILLS[nodes[i].color];
              ctx.globalAlpha = k;
              ctx.beginPath();
              ctx.arc(pos[i][0] + dx * f, pos[i][1] + dy * f, 2, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
            }
          }
        }
      }
      if (nodeScale > 0) {
        FILLS.forEach((fill, color) => {
          ctx.fillStyle = fill;
          [[1.9, 0.18], [1, 1]].forEach(([k, alpha]) => {
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            nodes.forEach((n, i) => {
              if (n.color !== color) return;
              const r = n.r * nodeScale * k;
              ctx.moveTo(pos[i][0] + r, pos[i][1]);
              ctx.arc(pos[i][0], pos[i][1], r, 0, Math.PI * 2);
            });
            ctx.fill();
          });
          ctx.globalAlpha = 1;
        });
      }

      // Particles burst out of their node, then curve into the mark
      if (gatherAt !== null) {
        const spread = easeOut(clamp01(b / BURST));
        FILLS.forEach((fill, color) => {
          ctx.fillStyle = fill;
          ctx.beginPath();
          for (const p of particles) {
            if (p.color !== color) continue;
            const sx = p.sx + p.ox + Math.cos(p.dir) * p.speed * spread;
            const sy = p.sy + p.oy + Math.sin(p.dir) * p.speed * spread;
            const e = easeInOut(clamp01((b - BURST * 0.55 - p.delay) / GATHER));
            let x = sx;
            let y = sy;
            if (e > 0) {
              const dx = p.tx - sx;
              const dy = p.ty - sy;
              const cx = sx + dx / 2 - dy * p.curl;
              const cy = sy + dy / 2 + dx * p.curl;
              x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cx + e * e * p.tx;
              y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cy + e * e * p.ty;
            }
            const r = dot * (1 + 0.6 * Math.sin(Math.PI * e) + 0.35 * (1 - e));
            ctx.moveTo(x + r, y);
            ctx.arc(x, y, r, 0, Math.PI * 2);
          }
          ctx.fill();
        });
        if (done && b >= BURST * 0.55 + SPREAD + GATHER) {
          done();
          done = null;
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return {
      gather() {
        if (gatherAt !== null) return Promise.resolve();
        const t = (performance.now() - startedAt) / 1000;
        gatherAt = t;
        for (const p of particles) { const at = nodeAt(p.node, t); p.sx = at[0]; p.sy = at[1]; }
        return new Promise((resolve) => { done = resolve; });
      },
      stop() { cancelAnimationFrame(raf); },
    };
  }

  window.TiusParticles = { createLoaderParticles };
})();

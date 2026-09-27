/* Ragdoll Slash v2 - renderer: layered parallax arena, armoured fighters with damage, weapons, projectiles, effects, HUD */
(function () {
  'use strict';
  const { SHIELDS, D, SWORD_A, ARENA, WEAPONS, WLIST, STAND_Y, HIP_OFF, SHO_OFF } = window.RSGame;
  const COLORS = [
    { name: 'Red', c: '#b8242f', l: '#e2515a', d: '#5e0f16', trim: '#f2c14e' },
    { name: 'Blue', c: '#2552b8', l: '#5a86e8', d: '#0f2560', trim: '#e8e8f0' },
    { name: 'Green', c: '#2a8a3e', l: '#5fc271', d: '#0f4019', trim: '#f2c14e' },
    { name: 'Gold', c: '#c98a17', l: '#f0bd4f', d: '#6b4406', trim: '#3a1f0a' },
    { name: 'Purple', c: '#6a2a9a', l: '#9a5ad0', d: '#2a0a48', trim: '#f2c14e' },
    { name: 'Black', c: '#2a2a30', l: '#55555f', d: '#0a0a0e', trim: '#c0c0c8' },
    { name: 'White', c: '#d8d8d0', l: '#ffffff', d: '#8a8a84', trim: '#2a2a30' },
    { name: 'Orange', c: '#d8601a', l: '#ff9a50', d: '#6a2806', trim: '#2a1a0a' }
  ];
  const TEAMS = COLORS;
  const TEAM_COL = [0, 1];
  const LEN = [2 * D.th, 0, D.ua, D.fa, D.thg, D.shn, D.thg, D.shn, D.ua, D.fa];
  const R = { cam: { x: 0, w: 10, gy: 0 }, shake: 0, texts: [], parts: [], flashes: [], trails: [], ghost: [], decals: [], t: 0, whiteFlash: 0, me: -1, aim: { on: false, a: 0 }, view: { ox: 0, gy: 0, s: 1 } };
  let chainPat = null;
  let cv, ctx, W = 0, H = 0, dpr = 1, bg = null;

  function rnd(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

  R.init = function (canvas) { cv = canvas; ctx = cv.getContext('2d', { alpha: false }); R.resize(); addEventListener('resize', R.resize); };
  R.resize = function () {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(cv.clientWidth * dpr); H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) return;
    cv.width = W; cv.height = H; buildBg();
  };

  function buildBg() {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    bg = {};
    // sky
    const sky = mk(W, H), s = sky.getContext('2d');
    let g = s.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b2a4e'); g.addColorStop(0.45, '#5b4a7a'); g.addColorStop(0.72, '#e0845a'); g.addColorStop(0.85, '#f6c27a'); g.addColorStop(1, '#f6c27a');
    s.fillStyle = g; s.fillRect(0, 0, W, H);
    const sx = W * 0.72, sy = H * 0.52;
    g = s.createRadialGradient(sx, sy, 0, sx, sy, H * 0.55);
    g.addColorStop(0, 'rgba(255,240,200,0.95)'); g.addColorStop(0.06, 'rgba(255,220,150,0.8)'); g.addColorStop(0.25, 'rgba(255,170,100,0.25)'); g.addColorStop(1, 'rgba(255,150,90,0)');
    s.fillStyle = g; s.fillRect(0, 0, W, H);
    const r = rnd(7);
    for (let i = 0; i < 9; i++) {
      const cx = r() * W, cy = H * (0.08 + r() * 0.3), cw = W * (0.1 + r() * 0.15);
      for (let k = 0; k < 6; k++) {
        const ex = cx + (r() - 0.5) * cw, ey = cy + (r() - 0.5) * cw * 0.12, er = cw * (0.15 + r() * 0.2);
        const cg = s.createRadialGradient(ex, ey, 0, ex, ey, er);
        cg.addColorStop(0, 'rgba(255,200,180,0.22)'); cg.addColorStop(1, 'rgba(255,200,180,0)');
        s.fillStyle = cg; s.beginPath(); s.ellipse(ex, ey, er, er * 0.35, 0, 0, 7); s.fill();
      }
    }
    bg.sky = sky;
    // far mountains (2 layers)
    const mw = Math.round(W * 1.6), mh = Math.round(H * 0.6);
    bg.mount = mk(mw, mh);
    const m = bg.mount.getContext('2d');
    const ridge = (base, amp, col1, col2, seed) => {
      const rr = rnd(seed); m.beginPath(); m.moveTo(0, mh);
      let y = base; for (let x = 0; x <= mw; x += mw / 60) { y = clamp(y + (rr() - 0.5) * amp, base - amp * 2.5, base + amp * 1.5); m.lineTo(x, y); }
      m.lineTo(mw, mh); m.closePath();
      const gg = m.createLinearGradient(0, base - amp * 2, 0, mh); gg.addColorStop(0, col1); gg.addColorStop(1, col2); m.fillStyle = gg; m.fill();
    };
    ridge(mh * 0.35, mh * 0.08, '#6a5a8a', '#b98a86', 3);
    ridge(mh * 0.55, mh * 0.07, '#4a3f66', '#8a6a78', 11);
    bg.mw = mw;
    // arena wall (colosseum)
    const aw = Math.round(W * 2.4), ah = Math.round(H * 0.5);
    bg.arena = mk(aw, ah); bg.aw = aw;
    const a = bg.arena.getContext('2d');
    const wallTop = ah * 0.18;
    g = a.createLinearGradient(0, wallTop, 0, ah);
    g.addColorStop(0, '#c9a37a'); g.addColorStop(0.5, '#a07c5a'); g.addColorStop(1, '#6e5238');
    a.fillStyle = g; a.fillRect(0, wallTop, aw, ah - wallTop);
    // stone blocks
    const rs = rnd(5); a.strokeStyle = 'rgba(60,40,25,0.35)'; a.lineWidth = Math.max(1, H / 500);
    const bh = ah / 14;
    for (let row = 0, y = wallTop; y < ah; row++, y += bh) {
      a.beginPath(); a.moveTo(0, y); a.lineTo(aw, y); a.stroke();
      for (let x = (row % 2) * bh; x < aw; x += bh * 2.2) { a.beginPath(); a.moveTo(x, y); a.lineTo(x, y + bh); a.stroke();
        a.fillStyle = 'rgba(' + (rs() < 0.5 ? '255,230,200' : '40,25,15') + ',' + (rs() * 0.08) + ')'; a.fillRect(x, y, bh * 2.2, bh); }
    }
    // arches
    const archW = ah * 0.28, gap = archW * 0.55;
    for (let x = gap; x < aw; x += archW + gap) {
      const top = wallTop + ah * 0.18, bot = ah * 0.78;
      a.beginPath(); a.moveTo(x, bot); a.lineTo(x, top + archW / 2); a.arc(x + archW / 2, top + archW / 2, archW / 2, Math.PI, 0); a.lineTo(x + archW, bot); a.closePath();
      const ag = a.createLinearGradient(0, top, 0, bot); ag.addColorStop(0, '#1e140e'); ag.addColorStop(1, '#3a2a1e');
      a.fillStyle = ag; a.fill();
      a.strokeStyle = 'rgba(255,230,190,0.35)'; a.lineWidth = Math.max(2, H / 300); a.stroke();
      // torch glow between arches
      const tx = x + archW + gap / 2, ty = top + archW * 0.2;
      const tg = a.createRadialGradient(tx, ty, 0, tx, ty, gap * 1.3);
      tg.addColorStop(0, 'rgba(255,200,90,0.75)'); tg.addColorStop(0.2, 'rgba(255,150,50,0.3)'); tg.addColorStop(1, 'rgba(255,120,40,0)');
      a.fillStyle = tg; a.fillRect(tx - gap * 1.3, ty - gap * 1.3, gap * 2.6, gap * 2.6);
      a.fillStyle = '#3b2a1c'; a.fillRect(tx - gap * 0.06, ty, gap * 0.12, gap * 0.5);
    }
    // top rim with banners
    a.fillStyle = '#8c6a4c'; a.fillRect(0, wallTop - ah * 0.03, aw, ah * 0.05);
    a.fillStyle = 'rgba(255,240,210,0.4)'; a.fillRect(0, wallTop - ah * 0.03, aw, ah * 0.008);
    for (let i = 0, x = archW; x < aw; x += archW * 2.6, i++) {
      const col = TEAMS[i % 4];
      const bw2 = archW * 0.35, bh2 = ah * 0.32;
      const bgd = a.createLinearGradient(x, 0, x + bw2, 0); bgd.addColorStop(0, col.d); bgd.addColorStop(0.5, col.c); bgd.addColorStop(1, col.d);
      a.fillStyle = bgd; a.beginPath(); a.moveTo(x, wallTop); a.lineTo(x + bw2, wallTop); a.lineTo(x + bw2, wallTop + bh2); a.lineTo(x + bw2 / 2, wallTop + bh2 * 0.85); a.lineTo(x, wallTop + bh2); a.closePath(); a.fill();
      a.fillStyle = col.trim; a.fillRect(x, wallTop + bh2 * 0.1, bw2, bh2 * 0.04);
    }
    // crowd silhouettes above wall
    const rc = rnd(19);
    for (let x = 0; x < aw; x += ah * 0.025) {
      const hh = ah * (0.05 + rc() * 0.05);
      a.fillStyle = 'rgba(40,25,35,' + (0.55 + rc() * 0.3) + ')';
      a.beginPath(); a.arc(x, wallTop - ah * 0.03 - hh, ah * 0.018, 0, 7); a.fill();
      a.fillRect(x - ah * 0.018, wallTop - ah * 0.03 - hh, ah * 0.036, hh);
    }
    // wall base shadow
    g = a.createLinearGradient(0, ah * 0.8, 0, ah); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    a.fillStyle = g; a.fillRect(0, ah * 0.8, aw, ah * 0.2);
    // ground tile pattern (128px = 2m)
    const gt = mk(256, 128), q = gt.getContext('2d');
    q.fillStyle = '#b08a5e'; q.fillRect(0, 0, 256, 128);
    const rg = rnd(23);
    for (let i = 0; i < 900; i++) { q.fillStyle = 'rgba(' + (rg() < 0.5 ? '70,45,25' : '240,210,170') + ',' + rg() * 0.18 + ')'; q.fillRect(rg() * 256, rg() * 128, 1 + rg() * 3, 1 + rg() * 2); }
    q.strokeStyle = 'rgba(70,45,25,0.35)'; q.lineWidth = 2;
    for (let y = 0; y < 128; y += 32) { q.beginPath(); q.moveTo(0, y); q.lineTo(256, y); q.stroke(); for (let x = (y / 32 % 2) * 32; x < 256; x += 64) { q.beginPath(); q.moveTo(x, y); q.lineTo(x, y + 32); q.stroke(); } }
    bg.groundPat = ctx.createPattern(gt, 'repeat');
    // chainmail ring pattern (8px tile = 3.5cm)
    const cp = mk(8, 8), cq = cp.getContext('2d');
    cq.fillStyle = 'rgba(0,0,0,0)'; cq.clearRect(0, 0, 8, 8);
    cq.strokeStyle = 'rgba(20,24,30,0.9)'; cq.lineWidth = 1.2;
    for (const [x, y] of [[0, 0], [8, 0], [4, 4], [0, 8], [8, 8]]) { cq.beginPath(); cq.arc(x, y, 2.6, 0, 7); cq.stroke(); }
    cq.fillStyle = 'rgba(255,255,255,0.5)'; cq.fillRect(3, 2, 1, 1); cq.fillRect(7, 6, 1, 1);
    chainPat = ctx.createPattern(cp, 'repeat');
    if (chainPat.setTransform) chainPat.setTransform(new DOMMatrix([0.035 / 8, 0, 0, 0.035 / 8, 0, 0]));
    // vignette
    bg.vig = mk(W, H); const v = bg.vig.getContext('2d');
    g = v.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,5,15,0.55)'); v.fillStyle = g; v.fillRect(0, 0, W, H);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- camera ----------
  function updateCam(snap, dt) {
    let minx = 1e9, maxx = -1e9, maxy = 0;
    const live = snap.f.filter((f) => f.fl & 1), set = live.length ? live : snap.f;
    for (const f of set) { const x = f.p[0]; minx = Math.min(minx, x); maxx = Math.max(maxx, x); maxy = Math.max(maxy, f.p[4]); }
    let tw = clamp(maxx - minx + 5.2, 7.2, 18.5);
    let tx = clamp((minx + maxx) / 2, -ARENA - 1 + tw / 2, ARENA + 1 - tw / 2);
    let k = 1 - Math.pow(0.02, dt);
    if (snap.kf >= 0 && snap.f[snap.kf]) { const f = snap.f[snap.kf]; tx = f.p[0]; tw = snap.fin && snap.fin[3] ? 4.3 : 5.2; k = 1 - Math.pow(0.004, dt); maxy = Math.max(1.8, f.p[4]); }
    const fn = snap.fin;
    if (fn && fn[3] && snap.f[fn[5]] && snap.f[fn[0]]) { // fatality: frame the finisher and the victim together, close and low
      const A = snap.f[fn[5]], Vf = snap.f[fn[0]], vx = clamp(Vf.p[0], A.p[0] - 6, A.p[0] + 6);
      tx = (A.p[0] + vx) / 2; tw = clamp(Math.abs(vx - A.p[0]) + 4.6, 6.6, 12); maxy = clamp(Math.max(A.p[4], Vf.p[4]), 1.8, 2.8); k = 1 - Math.pow(0.01, dt);
    }
    R.cam.w += (tw - R.cam.w) * k; R.cam.x += (tx - R.cam.x) * k;
    const s = W / R.cam.w;
    const gyT = H * 0.8 + Math.max(0, (maxy + 0.6) * s - H * 0.74);
    if (!R.cam.gy) R.cam.gy = gyT;
    R.cam.gy += (gyT - R.cam.gy) * k;
    R.cam.s = s;
  }

  // ---------- drawing helpers ----------
  function limb(x1, y1, x2, y2, w, cl, cm, cd) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len * w * 0.5, ny = dx / len * w * 0.5;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const g = ctx.createLinearGradient(mx + nx, my + ny, mx - nx, my - ny);
    g.addColorStop(0, cl); g.addColorStop(0.45, cm); g.addColorStop(1, cd);
    ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function ends(p, i) {
    const x = p[i * 3], y = p[i * 3 + 1], a = p[i * 3 + 2], h = LEN[i] / 2;
    const ex = -Math.sin(a) * h, ey = Math.cos(a) * h;
    return [x + ex, y + ey, x - ex, y - ey];
  }
  const mixCache = new Map();
  function mix(a, b, t) {
    const key = a + b + t; let v = mixCache.get(key); if (v) return v;
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = ((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t, g = ((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t, bl = (pa & 255) * (1 - t) + (pb & 255) * t;
    v = '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1); mixCache.set(key, v); return v;
  }
  const dk = (cols, back) => (back ? cols.map((c) => mix(c, '#1a1020', 0.35)) : cols);
  const SKIN = ['#f3cfa6', '#d9a47a', '#8a5638'];
  const LEATHER = ['#a0703f', '#6a4424', '#2e1c0e'];
  const CHAIN = ['#d6dce2', '#8a929a', '#3a4046'];
  const STEEL = ['#f4f8fc', '#a8b4c0', '#4c5560'];
  const BOOT = ['#6a4428', '#3e2614', '#1a0e06'];
  const WOOD = ['#b07a44', '#7a4a22', '#3a2210'];
  const MAT = [null, LEATHER, CHAIN, STEEL];
  function limbMat(x1, y1, x2, y2, w, cols, chain, back) {
    const c = dk(cols, back); limb(x1, y1, x2, y2, w, c[0], c[1], c[2]);
    if (chain && chainPat) { ctx.save(); ctx.globalAlpha = back ? 0.35 : 0.6; ctx.strokeStyle = chainPat; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore(); }
  }
  function seeded(n) { let s = n * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
  // dents (level <= 6) and cracks (level <= 3) on a piece, drawn around (x, y) in the current frame
  function marks(x, y, lvl, seed, size, t) {
    if (!(lvl <= 6) || !t) return;
    const r = seeded(seed);
    const n = lvl <= 3 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const px = x + (r() - 0.5) * size, py = y + (r() - 0.5) * size, rr = size * (0.12 + r() * 0.12);
      ctx.fillStyle = t === 2 ? 'rgba(10,10,12,0.55)' : 'rgba(20,15,10,0.35)'; ctx.beginPath(); ctx.ellipse(px, py, rr, rr * 0.6, r() * 3, 0, 7); ctx.fill();
      if (t === 3) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(px - rr * 0.3, py + rr * 0.3, rr * 0.4, rr * 0.2, 0, 0, 7); ctx.fill(); }
    }
    if (lvl <= 3) {
      ctx.strokeStyle = t === 1 ? 'rgba(40,20,5,0.9)' : 'rgba(15,15,20,0.9)'; ctx.lineWidth = size * 0.05;
      for (let c = 0; c < 2; c++) {
        let px = x + (r() - 0.5) * size * 0.4, py = y + (r() - 0.5) * size * 0.4; ctx.beginPath(); ctx.moveTo(px, py);
        for (let k = 0; k < 4; k++) { px += (r() - 0.5) * size * 0.5; py += (r() - 0.5) * size * 0.5; ctx.lineTo(px, py); }
        ctx.stroke();
      }
    }
  }
  function lookOf(m, f) {
    const base = COLORS[m.teams ? TEAM_COL[f.sd | 0] : (m.color | 0)] || COLORS[0], tr = COLORS[m.trim | 0] || COLORS[3];
    const a = m.arm || [3, 3, 2, 2], types = [a[0], a[1], a[2], a[2], a[3], a[3]], ar = f.ar || '999999';
    const pt = types.map((t, i) => (ar[i] === 'x' || ar[i] === '-' ? 0 : t));
    const lv = types.map((t, i) => (ar[i] >= '0' && ar[i] <= '9' ? +ar[i] : 9));
    return { c: base.c, l: base.l, d: base.d, trim: tr.l, trimC: tr.c, pt, lv, broken: types.map((t, i) => t > 0 && ar[i] === 'x') };
  }

  function drawArm(p, iu, ifa, L, pi, back, seed) {
    const t = L.pt[pi], lv = L.lv[pi];
    const u = ends(p, iu), f = ends(p, ifa);
    const cloth = [L.l, L.c, L.d];
    limbMat(u[0], u[1], u[2], u[3], 0.13, t === 0 ? cloth : MAT[t], t === 2, back);
    if (t === 0 || t === 1) limbMat(f[0], f[1], f[2], f[3], 0.095, SKIN, false, back);
    else limbMat(f[0], f[1], f[2], f[3], 0.105, MAT[t], t === 2, back);
    if (t === 1) {
      const bx = f[0] + (f[2] - f[0]) * 0.35, by = f[1] + (f[3] - f[1]) * 0.35;
      limbMat(bx, by, f[2] - (f[2] - f[0]) * 0.12, f[3] - (f[3] - f[1]) * 0.12, 0.108, LEATHER, false, back);
    }
    if (t > 0 && !back) { marks((u[0] + u[2]) / 2, (u[1] + u[3]) / 2, lv, seed, 0.12, t); marks((f[0] + f[2]) / 2, (f[1] + f[3]) / 2, lv, seed + 7, 0.1, t); }
    if (t === 1 || t === 3) {
      ctx.save(); ctx.translate(u[0], u[1]); ctx.rotate(p[iu * 3 + 2]);
      const c = dk(MAT[t], back);
      const g = ctx.createLinearGradient(-0.09, 0.05, 0.09, -0.06); g.addColorStop(0, c[0]); g.addColorStop(0.5, c[1]); g.addColorStop(1, c[2]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -0.02, t === 3 ? 0.098 : 0.08, t === 3 ? 0.078 : 0.06, 0, 0, 7); ctx.fill();
      if (t === 3) { ctx.strokeStyle = back ? mix(L.trim, '#1a1020', 0.35) : L.trim; ctx.lineWidth = 0.015; ctx.beginPath(); ctx.ellipse(0, -0.02, 0.098, 0.078, 0, Math.PI * 1.05, Math.PI * 1.95, true); ctx.stroke(); }
      ctx.restore();
    }
    return { f, t };
  }
  function drawHand(x, y, t, back) {
    const s = dk(t === 3 ? STEEL : t === 1 ? LEATHER : t === 2 ? CHAIN : ['#9a6a40', '#5a3a1e', '#2e1c0e'], back);
    const g = ctx.createRadialGradient(x - 0.015, y + 0.015, 0.005, x, y, 0.06);
    g.addColorStop(0, s[0]); g.addColorStop(0.6, s[1]); g.addColorStop(1, s[2]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 0.055, 0, 7); ctx.fill();
  }
  function drawLeg(p, it, is, L, pi, back, fa, seed) {
    const t = L.pt[pi], lv = L.lv[pi];
    const pants = [mix(L.d, '#ffffff', 0.25), L.d, '#12080c'];
    const tt = ends(p, it), s = ends(p, is);
    limbMat(tt[0], tt[1], tt[2], tt[3], 0.15, t === 0 ? pants : MAT[t], t === 2, back);
    limbMat(s[0], s[1], s[2], s[3], 0.12, t === 0 ? BOOT : t === 1 ? LEATHER : BOOT, false, back);
    if (t >= 2) limbMat(s[0] + (s[2] - s[0]) * 0.08, s[1] + (s[3] - s[1]) * 0.08, s[0] + (s[2] - s[0]) * 0.7, s[1] + (s[3] - s[1]) * 0.7, 0.11, MAT[t], t === 2, back);
    if (t === 3) { ctx.fillStyle = dk(STEEL, back)[1]; ctx.beginPath(); ctx.arc(tt[2], tt[3], 0.065, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(tt[2] - 0.02, tt[3] + 0.02, 0.022, 0, 7); ctx.fill(); }
    if (t > 0 && !back) { marks((tt[0] + tt[2]) / 2, (tt[1] + tt[3]) / 2, lv, seed, 0.14, t); marks((s[0] + s[2]) / 2, (s[1] + s[3]) / 2, lv, seed + 3, 0.1, t); }
    const bc = dk(t === 3 ? STEEL : BOOT, back);
    ctx.save(); ctx.translate(s[2], s[3]); ctx.rotate(p[is * 3 + 2]); ctx.scale(fa, 1);
    ctx.fillStyle = bc[2]; ctx.beginPath(); ctx.moveTo(-0.07, 0.03); ctx.lineTo(0.08, 0.03); ctx.quadraticCurveTo(0.17, 0.0, 0.16, -0.04); ctx.lineTo(-0.08, -0.04); ctx.closePath(); ctx.fill();
    ctx.fillStyle = bc[0]; ctx.fillRect(-0.06, 0.0, 0.12, 0.02);
    ctx.restore();
  }
  function torsoPath() { ctx.beginPath(); ctx.moveTo(-0.14, -0.31); ctx.lineTo(0.15, -0.31); ctx.lineTo(0.14, 0.1); ctx.quadraticCurveTo(0.17, 0.27, 0.1, 0.31); ctx.lineTo(-0.1, 0.31); ctx.quadraticCurveTo(-0.18, 0.27, -0.15, 0.1); ctx.closePath(); }
  function chestPath() { ctx.beginPath(); ctx.moveTo(-0.13, -0.04); ctx.lineTo(0.14, -0.04); ctx.quadraticCurveTo(0.19, 0.14, 0.11, 0.29); ctx.lineTo(-0.1, 0.29); ctx.quadraticCurveTo(-0.16, 0.14, -0.13, -0.04); ctx.closePath(); }
  function drawTorso(p, L, fa, seed) {
    const t = L.pt[1];
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(p[2]); ctx.scale(fa, 1);
    let g = ctx.createLinearGradient(-0.17, 0, 0.17, 0); g.addColorStop(0, L.d); g.addColorStop(0.6, L.c); g.addColorStop(1, L.l);
    ctx.fillStyle = g; torsoPath(); ctx.fill();
    if (t === 0 && L.broken[1]) { ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(-0.1, 0.25); ctx.lineTo(0.05, 0.1); ctx.lineTo(-0.05, 0.0); ctx.stroke(); }
    if (t === 1) {
      g = ctx.createLinearGradient(-0.14, 0, 0.16, 0.1); g.addColorStop(0, '#3e2614'); g.addColorStop(0.6, '#7a5030'); g.addColorStop(1, '#a0703f');
      ctx.fillStyle = g; chestPath(); ctx.fill();
      ctx.strokeStyle = 'rgba(240,210,160,0.5)'; ctx.setLineDash([0.015, 0.012]); ctx.lineWidth = 0.006;
      ctx.beginPath(); ctx.moveTo(-0.1, 0.0); ctx.lineTo(0.12, 0.0); ctx.moveTo(-0.1, 0.12); ctx.lineTo(0.14, 0.12); ctx.moveTo(0.03, -0.03); ctx.lineTo(0.05, 0.27); ctx.stroke(); ctx.setLineDash([]);
    } else if (t === 2) {
      g = ctx.createLinearGradient(-0.15, 0, 0.16, 0.1); g.addColorStop(0, CHAIN[2]); g.addColorStop(0.6, CHAIN[1]); g.addColorStop(1, CHAIN[0]);
      ctx.fillStyle = g; torsoPath(); ctx.fill();
      if (chainPat) { ctx.globalAlpha = 0.6; ctx.fillStyle = chainPat; torsoPath(); ctx.fill(); ctx.globalAlpha = 1; }
    } else if (t === 3) {
      g = ctx.createLinearGradient(-0.12, 0.3, 0.16, -0.05);
      g.addColorStop(0, '#5a636e'); g.addColorStop(0.45, '#c9d3dd'); g.addColorStop(0.6, '#ffffff'); g.addColorStop(0.75, '#9aa6b2'); g.addColorStop(1, '#4a525c');
      ctx.fillStyle = g; chestPath(); ctx.fill();
      ctx.strokeStyle = L.trim; ctx.lineWidth = 0.014; ctx.stroke();
      ctx.strokeStyle = 'rgba(40,45,55,0.5)'; ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(0.02, 0.27); ctx.quadraticCurveTo(0.06, 0.12, 0.03, -0.03); ctx.stroke();
      ctx.fillStyle = L.c; ctx.beginPath(); ctx.moveTo(0.05, 0.18); ctx.lineTo(0.1, 0.13); ctx.lineTo(0.05, 0.05); ctx.lineTo(0.0, 0.13); ctx.closePath(); ctx.fill();
    }
    if (t > 0) marks(0.03, 0.13, L.lv[1], seed + 11, 0.24, t);
    g = ctx.createLinearGradient(0, -0.04, 0, -0.11); g.addColorStop(0, '#6a4428'); g.addColorStop(1, '#2e1c0e');
    ctx.fillStyle = g; ctx.fillRect(-0.15, -0.11, 0.3, 0.07);
    ctx.fillStyle = '#e8c060'; ctx.fillRect(0.06, -0.1, 0.05, 0.05); ctx.fillStyle = '#6a4a10'; ctx.fillRect(0.075, -0.085, 0.02, 0.02);
    g = ctx.createLinearGradient(-0.12, 0, 0.14, 0); g.addColorStop(0, L.d); g.addColorStop(0.7, L.c); g.addColorStop(1, L.l);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-0.02, -0.11); ctx.lineTo(0.13, -0.11); ctx.lineTo(0.16, -0.36); ctx.lineTo(0.0, -0.33); ctx.closePath(); ctx.fill();
    ctx.fillStyle = L.trim; ctx.fillRect(0.0, -0.35, 0.16, 0.018);
    ctx.restore();
  }
  function drawHead(p, L, fa, alive, seed) {
    const x = p[3], y = p[4], a = p[5], t = L.pt[0];
    const nx = p[0] - Math.sin(p[2]) * 0.3, ny = p[1] + Math.cos(p[2]) * 0.3;
    limb(nx, ny, x - Math.sin(a) * -0.06, y + Math.cos(a) * -0.06, 0.09, SKIN[0], SKIN[1], SKIN[2]);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(fa, 1);
    if (t === 2) { // coif behind the face
      let g = ctx.createRadialGradient(-0.02, 0.03, 0.02, 0, 0, 0.17); g.addColorStop(0, CHAIN[0]); g.addColorStop(0.7, CHAIN[1]); g.addColorStop(1, CHAIN[2]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0.005, 0.158, 0, 7); ctx.fill();
      if (chainPat) { ctx.globalAlpha = 0.6; ctx.fillStyle = chainPat; ctx.beginPath(); ctx.arc(0, 0.005, 0.158, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    }
    let g = ctx.createRadialGradient(0.04, 0.03, 0.01, 0, 0, 0.15);
    g.addColorStop(0, '#f8dcb8'); g.addColorStop(0.6, '#e0ab80'); g.addColorStop(1, '#9a6440');
    ctx.fillStyle = g; ctx.beginPath();
    if (t === 2) ctx.ellipse(0.05, -0.01, 0.085, 0.1, 0, 0, 7); else ctx.arc(0, 0, 0.135, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(70,40,25,0.35)'; ctx.beginPath(); ctx.ellipse(0.04, -0.085, 0.07, 0.04, -0.3, 0, 7); ctx.fill();
    if (alive) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0.078, 0.0, 0.022, 0.014, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#1a1010'; ctx.beginPath(); ctx.arc(0.086, 0.0, 0.01, 0, 7); ctx.fill();
      ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(0.05, 0.03); ctx.lineTo(0.105, 0.022); ctx.stroke();
    } else { ctx.strokeStyle = '#2a1010'; ctx.lineWidth = 0.014; ctx.beginPath(); ctx.moveTo(0.06, -0.015); ctx.lineTo(0.1, 0.015); ctx.moveTo(0.06, 0.015); ctx.lineTo(0.1, -0.015); ctx.stroke(); }
    ctx.strokeStyle = '#6a2a20'; ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(0.07, -0.07); ctx.lineTo(0.11, -0.065); ctx.stroke();
    if (t === 0) { // hair
      ctx.fillStyle = '#3a2414'; ctx.beginPath(); ctx.arc(0, 0.01, 0.14, Math.PI * 0.05, Math.PI * 1.1); ctx.lineTo(-0.1, -0.04); ctx.quadraticCurveTo(0.0, 0.06, 0.1, 0.06); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d9a47a'; ctx.beginPath(); ctx.ellipse(-0.01, -0.005, 0.022, 0.032, 0, 0, 7); ctx.fill();
    } else if (t === 1) {
      g = ctx.createLinearGradient(-0.1, 0.15, 0.1, 0.0); g.addColorStop(0, '#3e2614'); g.addColorStop(0.5, '#8a5a30'); g.addColorStop(1, '#4e3018');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0.01, 0.148, Math.PI + 0.1, -0.1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2e1c0e'; ctx.lineWidth = 0.014; ctx.beginPath(); ctx.moveTo(-0.02, 0.0); ctx.lineTo(0.02, -0.12); ctx.stroke();
    } else if (t === 3) {
      g = ctx.createLinearGradient(-0.1, 0.16, 0.12, -0.02);
      g.addColorStop(0, '#4a525c'); g.addColorStop(0.4, '#c9d3dd'); g.addColorStop(0.55, '#ffffff'); g.addColorStop(0.7, '#8a96a2'); g.addColorStop(1, '#3a424c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-0.155, -0.02); ctx.arc(0, 0.005, 0.155, Math.PI + 0.15, -0.12); ctx.lineTo(0.15, 0.02); ctx.lineTo(-0.155, 0.02); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a3038'; ctx.fillRect(-0.16, 0.0, 0.31, 0.025);
      ctx.fillStyle = L.trim; ctx.fillRect(-0.16, 0.022, 0.31, 0.01);
      ctx.fillStyle = '#9aa6b2'; ctx.fillRect(0.1, -0.06, 0.028, 0.08);
      ctx.fillStyle = '#6a7480'; ctx.beginPath(); ctx.moveTo(-0.15, 0.0); ctx.lineTo(-0.02, 0.0); ctx.lineTo(-0.05, -0.1); ctx.lineTo(-0.14, -0.08); ctx.closePath(); ctx.fill();
      g = ctx.createLinearGradient(0, 0.2, -0.25, 0.0); g.addColorStop(0, L.trim); g.addColorStop(1, L.trimC);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0.03, 0.15); ctx.quadraticCurveTo(-0.1, 0.3, -0.3, 0.12); ctx.quadraticCurveTo(-0.2, 0.14, -0.12, 0.05); ctx.quadraticCurveTo(-0.05, 0.12, 0.03, 0.15); ctx.fill();
    }
    if (t > 0) marks(-0.02, 0.07, L.lv[0], seed + 5, 0.16, t);
    ctx.restore();
  }

  // ---------- weapons ----------
  function steelGrad(w) {
    const g = ctx.createLinearGradient(0, w, 0, -w);
    g.addColorStop(0, '#f8fbff'); g.addColorStop(0.35, '#c8d2dc'); g.addColorStop(0.5, '#7a8692'); g.addColorStop(0.65, '#b8c4d0'); g.addColorStop(1, '#3d444c'); return g;
  }
  function woodGrad(w) { const g = ctx.createLinearGradient(0, w, 0, -w); g.addColorStop(0, WOOD[0]); g.addColorStop(0.5, WOOD[1]); g.addColorStop(1, WOOD[2]); return g; }
  function goldGrad(w) { const g = ctx.createLinearGradient(0, w, 0, -w); g.addColorStop(0, '#fff0b0'); g.addColorStop(0.5, '#d4a030'); g.addColorStop(1, '#6a4a10'); return g; }
  function shine(x0, x1, w, strike, a) {
    const sp = x0 + ((R.t * 0.7 + a * 0.2) % 1.6) / 1.6 * (x1 - x0 + 0.4) - 0.2;
    const g = ctx.createLinearGradient(sp - 0.15, 0, sp + 0.15, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,' + (strike ? 0.95 : 0.65) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x0, 0, x1 - x0, w);
  }
  function drawMelee(key, strike, a) {
    const Wp = WEAPONS[key], L = Wp.len;
    if (key === 'longsword' || key === 'greatsword') {
      const big = key === 'greatsword', w = big ? 0.04 : 0.027, gl = big ? 0.3 : 0.14;
      ctx.fillStyle = '#3b2616'; ctx.fillRect(-gl, -0.022, gl + 0.01, 0.044);
      ctx.fillStyle = '#e8c060'; ctx.beginPath(); ctx.arc(-gl - 0.01, 0, big ? 0.04 : 0.032, 0, 7); ctx.fill();
      ctx.fillStyle = steelGrad(w); ctx.beginPath(); ctx.moveTo(0.03, w); ctx.lineTo(L - 0.12, w * 0.8); ctx.lineTo(L + 0.02, 0); ctx.lineTo(L - 0.12, -w * 0.8); ctx.lineTo(0.03, -w); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,70,80,0.6)'; ctx.lineWidth = 0.008; ctx.beginPath(); ctx.moveTo(0.06, 0); ctx.lineTo(L * 0.78, 0); ctx.stroke();
      shine(0.03, L, w * 0.7, strike, a);
      const gw = big ? 0.16 : 0.11;
      ctx.fillStyle = goldGrad(gw); ctx.beginPath(); ctx.moveTo(0.0, gw); ctx.lineTo(0.035, gw - 0.01); ctx.lineTo(0.035, -gw + 0.01); ctx.lineTo(0.0, -gw); ctx.closePath(); ctx.fill();
    } else if (key === 'katana') {
      ctx.fillStyle = '#1a1414'; ctx.fillRect(-0.26, -0.02, 0.27, 0.04);
      ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 0.006; ctx.beginPath(); for (let x = -0.24; x < 0; x += 0.03) { ctx.moveTo(x, -0.02); ctx.lineTo(x + 0.015, 0.02); ctx.moveTo(x + 0.015, -0.02); ctx.lineTo(x, 0.02); } ctx.stroke();
      const g = ctx.createLinearGradient(0, 0.03, 0, -0.03); g.addColorStop(0, '#9aa6b2'); g.addColorStop(0.5, '#e8eef4'); g.addColorStop(0.75, '#ffffff'); g.addColorStop(1, '#c8d2dc');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0.03, 0.02); ctx.quadraticCurveTo(0.55, 0.045, 1.07, 0.085); ctx.quadraticCurveTo(1.0, 0.04, 0.95, 0.035); ctx.quadraticCurveTo(0.5, -0.0, 0.03, -0.018); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.005; ctx.beginPath(); ctx.moveTo(0.05, -0.008); ctx.quadraticCurveTo(0.5, 0.01, 0.98, 0.045); ctx.stroke();
      shine(0.03, 1.0, 0.03, strike, a);
      ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.ellipse(0.015, 0, 0.018, 0.06, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#c8a040'; ctx.beginPath(); ctx.ellipse(0.015, 0, 0.008, 0.05, 0, 0, 7); ctx.fill();
    } else {
      // hafted weapons: axe, spear, mace
      const shaftW = key === 'spear' ? 0.022 : 0.03;
      ctx.fillStyle = woodGrad(shaftW); ctx.fillRect(-0.15, -shaftW, L + (key === 'spear' ? -0.2 : 0.02), shaftW * 2);
      ctx.fillStyle = '#3b2616'; ctx.fillRect(-0.05, -shaftW - 0.004, 0.1, shaftW * 2 + 0.008);
      if (key === 'axe') {
        const x = L - 0.12;
        ctx.fillStyle = steelGrad(0.12); ctx.beginPath();
        ctx.moveTo(x - 0.05, 0.03); ctx.lineTo(x + 0.07, 0.03); ctx.quadraticCurveTo(x + 0.14, -0.08, x + 0.12, -0.24); ctx.quadraticCurveTo(x + 0.02, -0.16, x - 0.1, -0.2); ctx.quadraticCurveTo(x - 0.06, -0.08, x - 0.05, 0.03); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.008; ctx.beginPath(); ctx.moveTo(x + 0.12, -0.23); ctx.quadraticCurveTo(x + 0.02, -0.16, x - 0.09, -0.19); ctx.stroke();
        ctx.fillStyle = '#3a424c'; ctx.fillRect(x - 0.05, -0.04, 0.12, 0.08);
      } else if (key === 'spear') {
        const x = L - 0.25;
        ctx.fillStyle = steelGrad(0.05); ctx.beginPath(); ctx.moveTo(x, 0.02); ctx.quadraticCurveTo(x + 0.12, 0.055, x + 0.29, 0); ctx.quadraticCurveTo(x + 0.12, -0.055, x, -0.02); ctx.closePath(); ctx.fill();
        shine(x, x + 0.28, 0.02, strike, a);
        ctx.fillStyle = '#6a3a1a'; ctx.fillRect(x - 0.06, -0.028, 0.06, 0.056);
      } else {
        const x = L - 0.08;
        const g = ctx.createRadialGradient(x - 0.02, 0.03, 0.01, x, 0, 0.1); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#a8b4c0'); g.addColorStop(1, '#3a424c');
        ctx.fillStyle = '#4c5560';
        for (let k = 0; k < 6; k++) { ctx.save(); ctx.translate(x, 0); ctx.rotate(k * Math.PI / 3); ctx.beginPath(); ctx.moveTo(-0.02, 0.05); ctx.lineTo(0.0, 0.11); ctx.lineTo(0.02, 0.05); ctx.fill(); ctx.restore(); }
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, 0, 0.075, 0, 7); ctx.fill();
      }
    }
  }
  function drawGun(key, f) {
    if (key === 'pistol') {
      ctx.fillStyle = '#23262b'; ctx.beginPath(); ctx.moveTo(-0.01, 0.0); ctx.lineTo(0.04, 0.0); ctx.lineTo(0.02, -0.11); ctx.lineTo(-0.03, -0.11); ctx.closePath(); ctx.fill();
      const g = ctx.createLinearGradient(0, 0.06, 0, 0); g.addColorStop(0, '#6a727c'); g.addColorStop(0.5, '#2e3238'); g.addColorStop(1, '#16181c');
      ctx.fillStyle = g; ctx.fillRect(-0.03, 0.0, 0.29, 0.055);
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0.2, 0.012, 0.06, 0.02);
      ctx.strokeStyle = '#16181c'; ctx.lineWidth = 0.01; ctx.beginPath(); ctx.arc(0.07, -0.015, 0.03, Math.PI, 0, true); ctx.stroke();
    } else if (key === 'rifle' || key === 'shotgun') {
      const sg = key === 'shotgun';
      ctx.fillStyle = woodGrad(0.05); ctx.beginPath(); ctx.moveTo(-0.42, -0.06); ctx.lineTo(-0.42, 0.04); ctx.lineTo(-0.05, 0.03); ctx.lineTo(-0.02, -0.03); ctx.closePath(); ctx.fill();
      const g = ctx.createLinearGradient(0, 0.06, 0, -0.03); g.addColorStop(0, '#6a727c'); g.addColorStop(0.5, '#2e3238'); g.addColorStop(1, '#16181c');
      ctx.fillStyle = g; ctx.fillRect(-0.08, -0.03, 0.4, 0.07);
      ctx.fillStyle = '#1e2126'; ctx.fillRect(0.3, 0.0, 0.55, sg ? 0.04 : 0.025);
      if (sg) { ctx.fillStyle = woodGrad(0.03); ctx.fillRect(0.36, -0.035, 0.2, 0.04); }
      else {
        ctx.fillStyle = '#16181c'; ctx.beginPath(); ctx.moveTo(0.08, -0.03); ctx.lineTo(0.15, -0.03); ctx.lineTo(0.13, -0.16); ctx.lineTo(0.07, -0.15); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#2a2e34'; ctx.fillRect(0.0, 0.05, 0.2, 0.035); ctx.fillStyle = '#4a90c0'; ctx.fillRect(0.19, 0.055, 0.012, 0.025);
      }
    } else if (key === 'bow') {
      const dr = f.dr || 0, pull = -0.05 - dr * 0.42;
      ctx.strokeStyle = 'rgba(240,235,220,0.9)'; ctx.lineWidth = 0.008;
      ctx.beginPath(); ctx.moveTo(-0.06, 0.56); ctx.lineTo(pull, 0); ctx.lineTo(-0.06, -0.56); ctx.stroke();
      ctx.strokeStyle = WOOD[1]; ctx.lineWidth = 0.035; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-0.06, 0.56); ctx.quadraticCurveTo(0.14, 0.3, 0.02, 0); ctx.quadraticCurveTo(0.14, -0.3, -0.06, -0.56); ctx.stroke();
      ctx.strokeStyle = WOOD[0]; ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(-0.05, 0.54); ctx.quadraticCurveTo(0.13, 0.3, 0.02, 0.02); ctx.stroke();
      ctx.fillStyle = '#3b2616'; ctx.fillRect(-0.01, -0.06, 0.05, 0.12);
      if (f.am > 0 && !f.rl) drawArrowShape(pull, 0.74 + pull + 0.05);
    }
  }
  function drawArrowShape(x0, len) {
    ctx.strokeStyle = '#c8a070'; ctx.lineWidth = 0.014; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + len, 0); ctx.stroke();
    ctx.fillStyle = '#b8c4d0'; ctx.beginPath(); ctx.moveTo(x0 + len + 0.07, 0); ctx.lineTo(x0 + len - 0.01, 0.025); ctx.lineTo(x0 + len - 0.01, -0.025); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e04030'; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + 0.1, 0); ctx.lineTo(x0 + 0.03, 0.035); ctx.lineTo(x0 - 0.02, 0.035); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + 0.1, 0); ctx.lineTo(x0 + 0.03, -0.035); ctx.lineTo(x0 - 0.02, -0.035); ctx.closePath(); ctx.fill();
  }
  function weaponFrame(p, fa, melee) {
    ctx.save(); ctx.translate(p[27], p[28]); ctx.rotate(p[29]); ctx.translate(0, -D.fa / 2);
    if (melee) ctx.rotate(SWORD_A(fa)); else ctx.rotate(-Math.PI / 2);
    if (fa < 0) ctx.scale(1, -1);
  }
  function tipPts(p, fa, len) {
    const x = p[27], y = p[28], a = p[29];
    const hx = x + Math.sin(a) * D.fa / 2, hy = y - Math.cos(a) * D.fa / 2, sa = a + SWORD_A(fa);
    return [hx + Math.cos(sa) * len * 0.5, hy + Math.sin(sa) * len * 0.5, hx + Math.cos(sa) * (len + 0.02), hy + Math.sin(sa) * (len + 0.02)];
  }

  // ---------- shields ----------
  function shieldPath(t, w, h) {
    ctx.beginPath();
    if (t === 1) ctx.arc(0, 0, w, 0, 7);
    else if (t === 2) { ctx.moveTo(-w, -h * 0.55); ctx.quadraticCurveTo(-w * 1.02, -h, 0, -h); ctx.quadraticCurveTo(w * 1.02, -h, w, -h * 0.55); ctx.quadraticCurveTo(w * 0.9, h * 0.35, 0, h); ctx.quadraticCurveTo(-w * 0.9, h * 0.35, -w, -h * 0.55); ctx.closePath(); }
    else { const r = 0.04; ctx.moveTo(-w + r, -h); ctx.lineTo(w - r, -h); ctx.quadraticCurveTo(w, -h, w, -h + r); ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h); ctx.lineTo(-w + r, h); ctx.quadraticCurveTo(-w, h, -w, h - r); ctx.lineTo(-w, -h + r); ctx.quadraticCurveTo(-w, -h, -w + r, -h); ctx.closePath(); }
  }
  function drawShieldShape(t, lvl, L, seed) {
    const S = SHIELDS[t]; if (!S) return;
    const w = S.w, h = S.h;
    shieldPath(t, w, h);
    const g = ctx.createLinearGradient(-w, -h, w, h);
    if (t === 1) { g.addColorStop(0, '#b07a44'); g.addColorStop(0.5, '#8a5a2c'); g.addColorStop(1, '#5a3818'); }
    else { g.addColorStop(0, mix(L.c, '#ffffff', 0.25)); g.addColorStop(0.55, L.c); g.addColorStop(1, mix(L.c, '#000000', 0.45)); }
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); shieldPath(t, w, h); ctx.clip();
    if (t === 1) {
      // planks + painted half
      ctx.strokeStyle = 'rgba(40,20,5,0.45)'; ctx.lineWidth = 0.008;
      for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * w / 3.5, -h); ctx.lineTo(k * w / 3.5, h); ctx.stroke(); }
      ctx.fillStyle = L.c; ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, w, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    } else if (t === 2) {
      ctx.fillStyle = L.trim; ctx.fillRect(-0.03, -h, 0.06, h * 2); ctx.fillRect(-w, -h * 0.45, w * 2, 0.06);
    } else {
      ctx.fillStyle = L.trim; ctx.fillRect(-w, -h * 0.55, w * 2, 0.05); ctx.fillRect(-w, h * 0.45, w * 2, 0.05);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-w, -h, w * 0.5, h * 2);
    }
    if (lvl < 9) { const r = seeded(seed * 7 + 3); ctx.strokeStyle = 'rgba(30,12,2,0.85)'; ctx.lineWidth = 0.012; const n = Math.round((9 - lvl) * 1.3);
      for (let k = 0; k < n; k++) { let x = (r() - 0.5) * w * 1.6, y = (r() - 0.5) * h * 1.6; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 3; j++) { x += (r() - 0.5) * 0.12; y += (r() - 0.5) * 0.12; ctx.lineTo(x, y); } ctx.stroke(); } }
    ctx.restore();
    shieldPath(t, w, h); ctx.strokeStyle = t === 1 ? '#6d747c' : '#c9ced4'; ctx.lineWidth = 0.022; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.006; ctx.stroke();
    // boss
    const bg2 = ctx.createRadialGradient(-0.015, -0.015, 0, 0, 0, 0.06); bg2.addColorStop(0, '#f4f6f8'); bg2.addColorStop(0.5, '#9aa2aa'); bg2.addColorStop(1, '#3a4048');
    ctx.fillStyle = bg2; ctx.beginPath(); ctx.arc(0, t === 2 ? -h * 0.3 : 0, t === 3 ? 0.05 : 0.06, 0, 7); ctx.fill();
  }
  function drawShield(f, p, L, seed, slung) {
    const sh = f.sh; if (!sh) return;
    const t = +sh[0], st = sh[1], lvl = st === 'x' ? 0 : +st, act = sh[2] === 'a';
    if (st === 'x' || slung === act) return;
    ctx.save();
    if (act) { const x = p[9], y = p[10], a = p[11]; ctx.translate(x + Math.sin(a) * D.fa * 0.15, y - Math.cos(a) * D.fa * 0.15); ctx.rotate(a); }
    else { const x = p[0], y = p[1], a = p[2]; ctx.translate(x, y); ctx.rotate(a); ctx.translate(-0.11 * f.fa, 0.02); ctx.scale(0.8, 0.8); ctx.globalAlpha = 0.95; }
    drawShieldShape(t, lvl, L, seed);
    ctx.restore();
  }

  function drawFighter(f, i, m) {
    const p = f.p, fa = f.fa, alive = f.fl & 1, L = lookOf(m, f), seed = i * 31 + 1;
    const key = WLIST[f.wp | 0] || 'longsword', Wp = WEAPONS[key], melee = Wp.kind === 'melee';
    const ab = drawArm(p, 2, 3, L, 2, true, seed);
    const fb = ends(p, 3);
    drawLeg(p, 4, 5, L, 4, true, fa, seed);
    drawShield(f, p, L, seed, true);
    drawTorso(p, L, fa, seed);
    drawLeg(p, 6, 7, L, 5, false, fa, seed + 1);
    drawHead(p, L, fa, alive, seed);
    drawShield(f, p, L, seed, false);
    const tr = R.trails[i] || (R.trails[i] = []);
    if (melee && (f.fl & 4)) tr.push(tipPts(p, fa, Wp.len)); else if (tr.length) tr.shift();
    if (tr.length > 7) tr.shift();
    if (tr.length > 1) {
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 1; k < tr.length; k++) {
        const A = tr[k - 1], B = tr[k];
        ctx.fillStyle = 'rgba(170,200,255,' + (0.03 + 0.16 * k / tr.length) + ')';
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(A[2], A[3]); ctx.lineTo(B[2], B[3]); ctx.lineTo(B[0], B[1]); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    weaponFrame(p, fa, melee);
    if (melee) drawMelee(key, f.fl & 4, p[29]); else drawGun(key, f);
    ctx.restore();
    drawHand(fb[2], fb[3], ab.t, true);
    const af = drawArm(p, 8, 9, L, 3, false, seed + 2);
    drawHand(af.f[2], af.f[3], af.t, false);
    if (f.fl & 2) {
      const sp = tipPts(p, fa, Wp.len);
      const g = ctx.createRadialGradient(sp[2], sp[3], 0, sp[2], sp[3], 0.35);
      g.addColorStop(0, 'rgba(160,210,255,0.5)'); g.addColorStop(1, 'rgba(160,210,255,0)');
      ctx.fillStyle = g; ctx.fillRect(sp[2] - 0.35, sp[3] - 0.35, 0.7, 0.7);
    }
  }
  function drawDebris(d, meta) {
    const [x, y, a, pi, fid, type, al] = d, m = meta[fid] || {};
    const L = lookOf(m, { sd: 0, ar: '999999' });
    if (pi === 6) { ctx.save(); ctx.globalAlpha = al; ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = '#9a6634'; ctx.beginPath(); ctx.moveTo(-0.13, -0.035); ctx.lineTo(0.1, -0.05); ctx.lineTo(0.15, 0.0); ctx.lineTo(0.06, 0.04); ctx.lineTo(-0.12, 0.03); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(40,20,5,0.7)'; ctx.lineWidth = 0.01; ctx.stroke(); ctx.restore(); return; }
    const c = MAT[type] || STEEL;
    ctx.save(); ctx.globalAlpha = al; ctx.translate(x, y); ctx.rotate(a);
    const g = ctx.createLinearGradient(-0.1, 0.1, 0.1, -0.1); g.addColorStop(0, c[0]); g.addColorStop(0.5, c[1]); g.addColorStop(1, c[2]);
    ctx.fillStyle = g; ctx.beginPath();
    if (pi === 0) { ctx.arc(0, -0.02, 0.15, 0, Math.PI); ctx.closePath(); }
    else if (pi === 1) { ctx.moveTo(-0.13, -0.17); ctx.lineTo(0.14, -0.17); ctx.quadraticCurveTo(0.19, 0.02, 0.11, 0.17); ctx.lineTo(-0.1, 0.17); ctx.quadraticCurveTo(-0.16, 0.02, -0.13, -0.17); }
    else { const hw = pi < 4 ? 0.055 : 0.07, hh = pi < 4 ? 0.13 : 0.17; ctx.moveTo(-hw, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(hw * 0.8, hh); ctx.lineTo(-hw * 0.8, hh); ctx.closePath(); }
    ctx.fill();
    if (type === 2 && chainPat) { ctx.globalAlpha = al * 0.6; ctx.fillStyle = chainPat; ctx.fill(); ctx.globalAlpha = al; }
    ctx.strokeStyle = type === 3 ? L.trim : 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.012; ctx.stroke();
    marks(0, 0, 2, fid * 13 + pi, 0.16, type);
    ctx.restore();
  }
  function drawProj(q) {
    const [x, y, a, arrow] = q;
    if (arrow) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); drawArrowShape(-0.35, 0.63); ctx.restore(); return; }
    const tx = x - Math.cos(a) * 0.45, ty = y - Math.sin(a) * 0.45;
    const g = ctx.createLinearGradient(x, y, tx, ty); g.addColorStop(0, 'rgba(255,250,200,1)'); g.addColorStop(0.3, 'rgba(255,200,90,0.8)'); g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.strokeStyle = g; ctx.lineWidth = 0.03; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
  }

  // ---------- effects ----------
  R.addEvents = function (evs) {
    for (const e of evs) {
      const [type, x, y, pw] = e;
      if (type === 'blood') { spark(x, y, 12 + pw * 16, ['#ff3a28', '#c8000c', '#ff8a60', '#8a0008'], 6 + pw * 4, 1); flash(x, y, 0.45 + pw * 0.35, 'rgba(255,90,60,'); R.shake = Math.max(R.shake, Math.min(1.2, pw * 0.9)); decal(x, 0.05 + pw * 0.1); Sound.hit(pw); }
      else if (type === 'armor') { spark(x, y, 10 + pw * 12, ['#fff6c0', '#ffb040', '#ffffff'], 7 + pw * 4); flash(x, y, 0.4 + pw * 0.3, 'rgba(255,230,170,'); R.shake = Math.max(R.shake, Math.min(1, pw * 0.7)); Sound.armor(pw); }
      else if (type === 'break') { spark(x, y, 34, ['#ffffff', '#ffd070', '#ff9030', '#c0c8d0'], 11); flash(x, y, 1.0, 'rgba(255,240,210,'); R.shake = Math.max(R.shake, 0.8); Sound.shatter(); }
      else if (type === 'block' || type === 'clash') { spark(x, y, 22, ['#ffffff', '#bfe0ff', '#ffe890'], 9); flash(x, y, 0.7, 'rgba(190,220,255,'); R.shake = Math.max(R.shake, 0.35); Sound.clang(); }
      else if (type === 'ko') { spark(x, y, 40, ['#ffffff', '#ff4030', '#c00010', '#ffd060'], 12, 1); flash(x, y, 1.4, 'rgba(255,200,180,'); R.shake = 1.4; R.whiteFlash = 0.5; decal(x, 0.3); Sound.ko(); }
      else if (type === 'swing') Sound.swoosh(pw);
      else if (type === 'pistol' || type === 'rifle' || type === 'shotgun') {
        const big = type === 'shotgun' ? 1.6 : type === 'rifle' ? 1.1 : 0.9;
        muzzle(x, y, pw, big); R.shake = Math.max(R.shake, type === 'shotgun' ? 0.5 : 0.18); Sound.bang(type);
      }
      else if (type === 'bow') Sound.twang();
      else if (type === 'reload') Sound.click(1);
      else if (type === 'swap') Sound.click(0.6);
      else if (type === 'ric') { spark(x, y, 6, ['#fff6c0', '#ffb040'], 5); dust(x, 0, 3); }
      else if (type === 'thud') dust(x, 0, 4);
      else if (type === 'land' || type === 'jump' || type === 'dash') dust(x, 0, type === 'dash' ? 6 : 8);
      else if (type === 'parry') { spark(x, y, 36, ['#ffffff', '#ffe890', '#9fd8ff'], 12); flash(x, y, 1.3, 'rgba(255,245,200,'); R.shake = Math.max(R.shake, 0.6); R.whiteFlash = Math.max(R.whiteFlash, 0.18); Sound.clang(); Sound.clang(); callout(x, y + 0.5, 'PARRY!', '#ffe27a'); }
      else if (type === 'glance') { spark(x, y, 16, ['#ffffff', '#fff6c0', '#c0d8ff'], 10); flash(x, y, 0.5, 'rgba(220,235,255,'); Sound.clang(); callout(x, y + 0.35, 'glance', '#cfe3ff', 0.7); }
      else if (type === 'guardbreak') { callout(x, y, 'GUARD BREAK', '#ff9a5a'); R.shake = Math.max(R.shake, 0.6); }
      else if (type === 'riposte') callout(x, y, 'RIPOSTE!', '#ff6a50');
      else if (type === 'kick') { dust(x, y - 0.1, 4); flash(x, y, 0.5, 'rgba(255,220,180,'); R.shake = Math.max(R.shake, 0.4 + pw * 0.3); Sound.hit(0.5); }
      else if (type === 'wall') { dust(x, y, 10); R.shake = Math.max(R.shake, 0.6 + pw * 0.6); Sound.hit(0.8); }
      else if (type === 'down') { dust(x, 0, 14); R.shake = Math.max(R.shake, 0.5); Sound.hit(0.6); }
      else if (type === 'getup' || type === 'roll') dust(x, 0, 6);
      else if (type === 'shield') { spark(x, y, 10, ['#d8a060', '#8a5a2c', '#fff0c0'], 6); flash(x, y, 0.45, 'rgba(255,220,160,'); R.shake = Math.max(R.shake, 0.35); Sound.thunk(); }
      else if (type === 'splinter') { spark(x, y, 30, ['#c08040', '#8a5a2c', '#e0b070', '#ffffff'], 10); flash(x, y, 0.9, 'rgba(255,220,160,'); R.shake = Math.max(R.shake, 0.8); Sound.splinter(); if (pw > 0) callout(x, y + 0.15, 'SHIELD BROKEN', '#ffb060'); }
      else if (type === 'bash') { spark(x, y, 12, ['#ffffff', '#ffe0b0'], 7); flash(x, y, 0.6, 'rgba(255,230,190,'); R.shake = Math.max(R.shake, 0.55); Sound.thunk(); Sound.hit(0.6); }
      else if (type === 'bashgo') Sound.swoosh(1.5);
      else if (type === 'feint') callout(x, y + 0.3, 'feint', '#bfe0ff', 0.7);
      else if (type === 'daze') callout(x, y + 0.35, 'DAZED', '#fff27a', 0.8);
      else if (type === 'limp') callout(x, y, 'LEG HIT', '#ffb0a0', 0.75);
      else if (type === 'armhurt') callout(x, y, 'ARM HIT', '#ffb0a0', 0.75);
      else if (type === 'finish') { R.shake = Math.max(R.shake, 1.0); Sound.gong(); }
      else if (type === 'fatstart') Sound.swoosh(0.6);
      else if (type === 'toofar') callout(x, y + 0.6, 'Get closer!', '#ffffff', 0.8);
      else if (type === 'slam' || type === 'pierce') { spark(x, y, 26, ['#ff3a28', '#ffd060', '#ffffff'], 10, 1); dust(x, 0, 16); R.shake = Math.max(R.shake, 1.4); Sound.hit(1); }
      else if (type === 'fatal') { spark(x, y, 90, ['#ff2a18', '#c8000c', '#ffd060', '#ffffff', '#ff6040'], 16, 1); flash(x, y, 2.2, 'rgba(255,60,40,'); R.shake = 2.2; R.whiteFlash = 0.6; decal(x, 0.4); Sound.ko(); Sound.shatter(); Sound.gong(); }
    }
  };
  function spark(x, y, n, cols, sp, heavy) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = sp * 0.6 * (0.3 + Math.random());
      R.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 2, life: 0.15 + Math.random() * (heavy ? 0.45 : 0.3), max: 0.45, c: cols[i % cols.length], k: 's', w: heavy ? 0.035 : 0.025 }); }
    if (R.parts.length > 400) R.parts.splice(0, R.parts.length - 400);
  }
  function muzzle(x, y, a, big) {
    for (let i = 0; i < 10 * big; i++) { const aa = a + (Math.random() - 0.5) * 0.5, v = 6 + Math.random() * 8 * big;
      R.parts.push({ x, y, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, life: 0.06 + Math.random() * 0.08, max: 0.14, c: i % 2 ? '#fff8c0' : '#ffb040', k: 's', w: 0.03 }); }
    for (let i = 0; i < 4; i++) R.parts.push({ x: x + Math.cos(a) * 0.1, y: y + Math.sin(a) * 0.1, vx: Math.cos(a) * 1.2 + (Math.random() - 0.5) * 0.6, vy: Math.sin(a) * 1.2 + 0.4, life: 0.6 + Math.random() * 0.4, max: 1.0, c: 'd', k: 'm', r: 0.05 + Math.random() * 0.05 * big });
    R.flashes.push({ x: x + Math.cos(a) * 0.12, y: y + Math.sin(a) * 0.12, r: 0.35 * big, c: 'rgba(255,220,140,', life: 0.07, max: 0.07 });
  }
  function dust(x, y, n) { for (let i = 0; i < n; i++) R.parts.push({ x: x + (Math.random() - 0.5) * 0.4, y: 0.05, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 0.8, life: 0.5 + Math.random() * 0.4, max: 0.9, c: 'd', k: 'd', r: 0.08 + Math.random() * 0.1 }); }
  function callout(x, y, txt, col, sc) { R.texts.push({ x, y, txt, col, sc: sc || 1, life: 0.9, max: 0.9 }); if (R.texts.length > 8) R.texts.shift(); }
  function flash(x, y, r, c) { R.flashes.push({ x, y, r, c, life: 0.18, max: 0.18 }); }
  function decal(x, w) { R.decals.push({ x: x + (Math.random() - 0.5) * 0.3, w: w * (0.7 + Math.random() * 0.6), life: 9 }); if (R.decals.length > 40) R.decals.shift(); }

  function drawScene(snap, meta, dt) {
    const s = R.cam.s;
    R.shake = Math.max(0, R.shake - dt * 3);
    const shx = (Math.random() - 0.5) * R.shake * s * 0.12, shy = (Math.random() - 0.5) * R.shake * s * 0.12;
    const gy = R.cam.gy + shy, ox = W / 2 - R.cam.x * s + shx;
    R.view = { ox, gy, s };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg.sky, 0, 0);
    const par = (img, iw, factor, bottom) => {
      let x = (-R.cam.x * factor * H * 0.12 - (iw - W) / 2) % iw; if (x > 0) x -= iw;
      for (; x < W; x += iw) ctx.drawImage(img, x, bottom - img.height);
    };
    par(bg.mount, bg.mw, 0.25, gy - H * 0.12);
    par(bg.arena, bg.aw, 0.6, gy + H * 0.02);
    ctx.save(); const k = s / 64; ctx.translate(ox, gy); ctx.scale(k, k);
    ctx.fillStyle = bg.groundPat; ctx.fillRect(-ox / k, 0, W / k, (H - gy) / k + 2); ctx.restore();
    let g = ctx.createLinearGradient(0, gy, 0, H); g.addColorStop(0, 'rgba(255,220,170,0.25)'); g.addColorStop(0.08, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,10,5,0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, gy, W, H - gy);
    ctx.setTransform(s, 0, 0, -s, ox, gy);
    // red decals on the sand
    for (let i = R.decals.length - 1; i >= 0; i--) {
      const d = R.decals[i]; d.life -= dt; if (d.life <= 0) { R.decals.splice(i, 1); continue; }
      ctx.fillStyle = 'rgba(120,8,8,' + Math.min(0.55, d.life / 9 * 0.8) + ')';
      ctx.beginPath(); ctx.ellipse(d.x, -0.02, d.w, d.w * 0.22, 0, 0, 7); ctx.fill();
    }
    for (const f of snap.f) {
      const x = f.p[0], hgt = Math.max(0, f.p[1] - 1.1), al = clamp(0.5 - hgt * 0.12, 0.12, 0.5), w = 0.55 + hgt * 0.1;
      ctx.save(); ctx.translate(x, 0.0); ctx.scale(1, 0.16);
      const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, w); sg.addColorStop(0, 'rgba(0,0,0,' + al + ')'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, w, 0, 7); ctx.fill(); ctx.restore();
    }
    for (const d of snap.db || []) drawDebris(d, meta);
    const order = snap.f.map((f, i) => i).sort((a, b) => (snap.f[a].fl & 1) - (snap.f[b].fl & 1));
    for (const i of order) drawFighter(snap.f[i], i, meta[i] || {});
    for (const q of snap.pr || []) drawProj(q);
    // markers
    snap.f.forEach((f, i) => {
      if (!(f.fl & 1)) return;
      const mine = i === R.me && snap.f.length > 1;
      if (!snap.tmode && !mine) return;
      const x = f.p[3], y = f.p[4] + 0.44;
      ctx.fillStyle = snap.tmode ? COLORS[TEAM_COL[f.sd | 0]].l : 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.moveTo(x - 0.09, y + 0.13); ctx.lineTo(x + 0.09, y + 0.13); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
      if (mine) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.025; ctx.stroke(); }
    });
    // aim guide for the local fighter
    const me = snap.f[R.me];
    if (R.aim.on && me && (me.fl & 1) && WEAPONS[WLIST[me.wp | 0]].kind !== 'melee') {
      const hx = me.p[27] + Math.sin(me.p[29]) * D.fa / 2, hy = me.p[28] - Math.cos(me.p[29]) * D.fa / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.02; ctx.setLineDash([0.12, 0.1]);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(R.aim.a) * 4, hy + Math.sin(R.aim.a) * 4); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(hx + Math.cos(R.aim.a) * 4, hy + Math.sin(R.aim.a) * 4, 0.12, 0, 7); ctx.stroke();
    }
    // particles
    ctx.globalCompositeOperation = 'lighter';
    const pdt = dt * (snap.ts || 1);
    for (let i = R.parts.length - 1; i >= 0; i--) {
      const q = R.parts[i]; q.life -= pdt; if (q.life <= 0) { R.parts.splice(i, 1); continue; }
      if (q.k === 's') {
        q.vy -= 14 * pdt; q.x += q.vx * pdt; q.y += q.vy * pdt;
        if (q.y < 0) { q.y = 0; q.vy *= -0.4; q.vx *= 0.6; }
        ctx.strokeStyle = q.c; ctx.globalAlpha = clamp(q.life / 0.3, 0, 1); ctx.lineWidth = q.w || 0.025;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.025, q.y - q.vy * 0.025); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (let i = R.flashes.length - 1; i >= 0; i--) {
      const fl = R.flashes[i]; fl.life -= dt; if (fl.life <= 0) { R.flashes.splice(i, 1); continue; }
      const a = fl.life / fl.max, r = fl.r * (1.4 - a * 0.4);
      const fg = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, r); fg.addColorStop(0, fl.c + (0.9 * a) + ')'); fg.addColorStop(1, fl.c + '0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fl.x, fl.y, r, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const q of R.parts) if (q.k === 'd' || q.k === 'm') {
      q.x += q.vx * pdt; q.y += q.vy * pdt; q.r += pdt * (q.k === 'm' ? 0.25 : 0.3);
      ctx.fillStyle = (q.k === 'm' ? 'rgba(200,200,200,' : 'rgba(190,160,120,') + clamp(q.life / q.max, 0, 1) * (q.k === 'm' ? 0.35 : 0.4) + ')';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill();
    }
  }

  // ---------- main draw ----------
  R.draw = function (snap, meta, dt) {
    if (!W) { R.resize(); if (!W) return; }
    R.t += dt;
    updateCam(snap, dt);
    drawScene(snap, meta, dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg.vig, 0, 0);
    if (snap.ts < 1) { ctx.fillStyle = 'rgba(40,0,0,' + (snap.kf >= 0 ? 0.25 : 0.12) + ')'; ctx.fillRect(0, 0, W, H); }
    if (R.whiteFlash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + R.whiteFlash + ')'; ctx.fillRect(0, 0, W, H); R.whiteFlash -= dt * 1.5; }
    for (let i = R.texts.length - 1; i >= 0; i--) {
      const q = R.texts[i]; q.life -= dt; if (q.life <= 0) { R.texts.splice(i, 1); continue; }
      const k = q.life / q.max, v = R.view, sx = v.ox + q.x * v.s, sy = v.gy - (q.y + (1 - k) * 0.5) * v.s;
      const fs = Math.round(v.s * 0.32 * q.sc * (1 + 0.25 * Math.max(0, k - 0.8) * 5));
      ctx.globalAlpha = Math.min(1, k * 2.5); ctx.font = '900 ' + fs + 'px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = fs * 0.14; ctx.strokeStyle = 'rgba(20,8,0,0.85)'; ctx.strokeText(q.txt, sx, sy); ctx.fillStyle = q.col; ctx.fillText(q.txt, sx, sy);
      ctx.globalAlpha = 1;
    }
    drawHud(snap, meta, dt);
  };
  R.w2s = function (x, y) { const v = R.view; return { x: (v.ox + x * v.s) / dpr, y: (v.gy - y * v.s) / dpr }; };

  function drawHud(snap, meta, dt) {
    const n = snap.f.length, u = H / 360, pad = 10 * u, top = 8 * u, tm = snap.tmode;
    const bw = n === 2 ? Math.min(W * 0.36, (W - pad * 3 - 140 * u) / 2) : (W - 52 * u - pad - 60 * u - pad * (n - 1)) / n;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const f = snap.f[i], m = meta[i] || {}, col = COLORS[tm ? TEAM_COL[f.sd | 0] : (m.color | 0)] || COLORS[0];
      let x;
      if (n === 2) x = i === 0 ? pad + 40 * u : W - pad - 40 * u - bw; else x = 52 * u + i * (bw + pad) + (i >= n / 2 ? 60 * u : 0);
      const gh = R.ghost[i] = R.ghost[i] == null ? f.h : Math.max(f.h, R.ghost[i] - dt * 25);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(x - 2 * u, top - 2 * u, bw + 4 * u, 16 * u, 4 * u); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(x, top, bw * gh / 100, 12 * u);
      const hg = ctx.createLinearGradient(0, top, 0, top + 12 * u);
      const hc = f.h > 50 ? ['#9cf07a', '#3fae2a'] : f.h > 25 ? ['#ffe070', '#d99a10'] : ['#ff8070', '#c02010'];
      hg.addColorStop(0, hc[0]); hg.addColorStop(1, hc[1]);
      ctx.fillStyle = hg; ctx.fillRect(x, top, bw * f.h / 100, 12 * u);
      ctx.fillStyle = col.c; ctx.fillRect(x, top + 12 * u, bw, 2.5 * u);
      // armour pips
      const ar = f.ar || '';
      for (let k = 0; k < 6; k++) { const ch = ar[k]; if (!ch || ch === '-') continue; ctx.fillStyle = ch === 'x' ? 'rgba(255,60,40,0.9)' : 'rgba(200,215,230,' + (0.3 + (+ch) / 12) + ')'; ctx.fillRect(x + bw - (6 - k) * 7 * u, top + 3 * u, 5 * u, 6 * u); }
      ctx.font = 'bold ' + Math.round(11 * u) + 'px system-ui, sans-serif';
      ctx.fillStyle = tm ? col.l : '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3 * u;
      const label = (m.name || 'P' + (i + 1)) + (i === R.me && n > 1 && m.name !== 'You' ? ' (you)' : '');
      const right = n === 2 && i === 1;
      ctx.textAlign = right ? 'right' : 'left';
      ctx.fillText(label, right ? x + bw : x, top + 24 * u);
      const hu = f.hu || '', tags = [];
      if ((f.fl & 1) && hu) { if (+hu[0] >= 3) tags.push('LIMPING'); if (+hu[1] >= 3) tags.push('ARM HURT'); if (hu[2] === '1') tags.push('DAZED'); }
      if (f.fl & 512) tags.push('DEFEATED');
      if (tags.length) { ctx.font = 'bold ' + Math.round(9 * u) + 'px system-ui, sans-serif'; ctx.fillStyle = '#ffb0a0'; ctx.fillText(tags.join(' · '), right ? x + bw : x, top + 36 * u); ctx.font = 'bold ' + Math.round(11 * u) + 'px system-ui, sans-serif'; }
      ctx.shadowBlur = 0;
      if (!tm) for (let k = 0; k < 3; k++) {
        const cx = right ? x + bw - 6 * u - k * 13 * u - ctx.measureText(label).width - 8 * u : x + ctx.measureText(label).width + 12 * u + k * 13 * u;
        ctx.beginPath(); ctx.arc(cx, top + 24 * u, 4.5 * u, 0, 7); ctx.fillStyle = k < snap.sc[i] ? '#ffd24a' : 'rgba(0,0,0,0.45)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1 * u; ctx.stroke();
      }
    }
    ctx.textAlign = 'center'; ctx.font = 'bold ' + Math.round(20 * u) + 'px system-ui, sans-serif';
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4 * u;
    ctx.fillText(String(snap.tm), W / 2, top + 10 * u);
    if (tm) {
      ctx.font = 'bold ' + Math.round(13 * u) + 'px system-ui, sans-serif';
      ctx.fillStyle = COLORS[0].l; ctx.textAlign = 'right'; ctx.fillText('Red ' + snap.sc[0], W / 2 - 6 * u, top + 30 * u);
      ctx.fillStyle = COLORS[1].l; ctx.textAlign = 'left'; ctx.fillText(snap.sc[1] + ' Blue', W / 2 + 6 * u, top + 30 * u);
      ctx.textAlign = 'center';
    }
    ctx.shadowBlur = 0;
    // local weapon / ammo
    const me = snap.f[R.me];
    if (me && (me.fl & 1)) {
      const Wp = WEAPONS[WLIST[me.wp | 0]];
      const txt = Wp.kind === 'melee' ? Wp.name : me.rl ? Wp.name + '  reloading…' : Wp.name + '  ' + me.am + ' / ' + Wp.mag;
      ctx.font = 'bold ' + Math.round(12 * u) + 'px system-ui, sans-serif';
      const tw = ctx.measureText(txt).width + 16 * u, bx = W / 2 - tw / 2, by = H - 26 * u;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(bx, by - 10 * u, tw, 20 * u, 6 * u); ctx.fill();
      ctx.fillStyle = me.rl ? '#ffd070' : '#fff'; ctx.fillText(txt, W / 2, by);
    }
    const fin = snap.fin;
    if (fin || snap.ban) drawFinish(snap, u);
    else if (snap.msg) {
      const big = /K\.O|FIGHT|Round/.test(snap.msg);
      const fs = Math.round((big ? 46 : 26) * u);
      ctx.font = '900 ' + fs + 'px system-ui, sans-serif';
      ctx.lineWidth = fs * 0.14; ctx.strokeStyle = 'rgba(20,5,5,0.85)'; ctx.lineJoin = 'round';
      const mg = ctx.createLinearGradient(0, H * 0.42 - fs / 2, 0, H * 0.42 + fs / 2);
      mg.addColorStop(0, '#fff6d0'); mg.addColorStop(0.5, '#ffc640'); mg.addColorStop(1, '#e06010');
      ctx.strokeText(snap.msg, W / 2, H * 0.42); ctx.fillStyle = mg; ctx.fillText(snap.msg, W / 2, H * 0.42);
    }
  }
  function drawFinish(snap, u) {
    const fin = snap.fin, fat = snap.ban || (fin && fin[4]);
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    if (fat) {
      const fs = Math.round(58 * u), jit = (Math.random() - 0.5) * 4 * u;
      ctx.font = '900 italic ' + fs + 'px Impact, system-ui, sans-serif';
      const y = H * 0.24 + jit;
      const g = ctx.createLinearGradient(0, y - fs / 2, 0, y + fs / 2); g.addColorStop(0, '#ffb0a0'); g.addColorStop(0.45, '#ff2a14'); g.addColorStop(1, '#6a0008');
      ctx.shadowColor = 'rgba(255,30,10,0.9)'; ctx.shadowBlur = 24 * u;
      ctx.lineWidth = fs * 0.16; ctx.strokeStyle = '#140000'; ctx.strokeText('FATALITY', W / 2 + jit, y);
      ctx.fillStyle = g; ctx.fillText('FATALITY', W / 2 + jit, y); ctx.shadowBlur = 0;
      return;
    }
    if (!fin) return;
    const pulse = 1 + 0.08 * Math.sin(R.t * 12), fs = Math.round(52 * u * pulse);
    ctx.font = '900 italic ' + fs + 'px Impact, system-ui, sans-serif';
    const y = H * 0.3;
    ctx.shadowColor = 'rgba(255,40,20,0.8)'; ctx.shadowBlur = 16 * u;
    ctx.lineWidth = fs * 0.15; ctx.strokeStyle = '#1a0000'; ctx.strokeText('FINISH HIM!', W / 2, y);
    const g = ctx.createLinearGradient(0, y - fs / 2, 0, y + fs / 2); g.addColorStop(0, '#fff0c0'); g.addColorStop(0.5, '#ff4a20'); g.addColorStop(1, '#8a0010');
    ctx.fillStyle = g; ctx.fillText('FINISH HIM!', W / 2, y); ctx.shadowBlur = 0;
    if (!fin[3]) {
      const bw = 180 * u, bx = W / 2 - bw / 2, by = y + 32 * u;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(bx - 2 * u, by - 2 * u, bw + 4 * u, 9 * u, 4 * u); ctx.fill();
      ctx.fillStyle = '#ff3a20'; ctx.fillRect(bx, by, bw * clamp(fin[2] / 3.6, 0, 1), 5 * u);
      const me = snap.f[R.me];
      if (me && (me.fl & 1) && (me.sd | 0) === fin[1]) {
        ctx.font = 'bold ' + Math.round(13 * u) + 'px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4 * u;
        ctx.fillText(R.touch ? 'Get close and tap FATALITY' : 'Get close and press E (or F) for a FATALITY', W / 2, by + 20 * u); ctx.shadowBlur = 0;
      }
    }
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---------- customise preview ----------
  function standPose(key, shUp) {
    const Wp = WEAPONS[key], p = new Array(30).fill(0), ty = STAND_Y;
    const set = (i, x, y, a) => { p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = a; };
    set(0, 0, ty, 0); set(1, 0, ty + D.th + D.hr + 0.02, 0);
    const chain = (iu, ifa, ax, ay, a1, a2, L1, L2) => {
      set(iu, ax + Math.sin(a1) * L1 / 2, ay - Math.cos(a1) * L1 / 2, a1);
      const ex = ax + Math.sin(a1) * L1, ey = ay - Math.cos(a1) * L1;
      set(ifa, ex + Math.sin(a1 + a2) * L2 / 2, ey - Math.cos(a1 + a2) * L2 / 2, a1 + a2);
    };
    const sy = ty + SHO_OFF, hy = ty - HIP_OFF;
    let sh = 0.9, el = 0.8, shB = 0.5, elB = 1.5;
    if (Wp.kind !== 'melee') { sh = Math.PI / 2 - 0.05; el = 0.06; if (Wp.two) { shB = sh - 0.35; elB = 0.8; } else if (Wp.kind === 'bow') { shB = sh; elB = 1.3; } else { shB = 0.4; elB = 1.3; } }
    if (shUp) { shB = 1.0; elB = 1.2; }
    chain(2, 3, 0, sy, shB, elB, D.ua, D.fa);
    chain(8, 9, 0, sy, sh, el, D.ua, D.fa);
    chain(4, 5, 0, hy, -0.25, -0.2, D.thg, D.shn);
    chain(6, 7, 0, hy, 0.3, -0.35, D.thg, D.shn);
    return p;
  }
  R.drawPreview = function (canvas, lo) {
    const saved = ctx, c2 = canvas.getContext('2d');
    const cw = canvas.width, ch = canvas.height;
    ctx = c2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, '#3a2a3a'); g.addColorStop(0.75, '#6a4a3a'); g.addColorStop(0.76, '#8a6a4a'); g.addColorStop(1, '#5a4030');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    const s = ch / 2.5, gy = ch * 0.9;
    ctx.setTransform(s, 0, 0, -s, cw * 0.45, gy);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 0.5, 0.07, 0, 0, 7); ctx.fill();
    const key = lo.primary;
    const one = !!WEAPONS[key].one, shT = lo.shield | 0;
    const f = { sh: shT ? shT + '9' + (one ? 'a' : 's') : '', p: standPose(key, shT && one), fa: 1, fl: 1, ar: '999999', wp: WLIST.indexOf(key), am: WEAPONS[key].mag || 0, rl: 0, dr: WEAPONS[key].kind === 'bow' ? 0.6 : 0, sd: 0 };
    const m = { color: lo.color, trim: lo.trim, arm: [lo.helmet, lo.chest, lo.arms, lo.legs] };
    R.trails[99] = [];
    drawFighter(f, 99, m);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx = saved;
  };

  // ---------- sound (synthesised, offline) ----------
  const Sound = {
    ac: null, on: true,
    unlock() { if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (this.ac && this.ac.state === 'suspended') this.ac.resume(); },
    noise(dur, f0, f1, vol, q, type) {
      const ac = this.ac; if (!ac || !this.on) return;
      const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const src = ac.createBufferSource(); src.buffer = buf;
      const bp = ac.createBiquadFilter(); bp.type = type || 'bandpass'; bp.Q.value = q || 1.5; bp.frequency.setValueAtTime(f0, ac.currentTime); bp.frequency.exponentialRampToValueAtTime(f1, ac.currentTime + dur);
      const gn = ac.createGain(); gn.gain.value = vol; src.connect(bp).connect(gn).connect(ac.destination); src.start();
    },
    tone(type, f0, f1, dur, vol) {
      const ac = this.ac; if (!ac || !this.on) return;
      const o = ac.createOscillator(), gn = ac.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, ac.currentTime); o.frequency.exponentialRampToValueAtTime(f1, ac.currentTime + dur);
      gn.gain.setValueAtTime(vol, ac.currentTime); gn.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.connect(gn).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
    },
    swoosh(w) { this.noise(0.2, 500 / (w || 1), 2200 / (w || 1), 0.25, 2); },
    hit(p) { this.tone('sine', 150, 40, 0.22, 0.6); this.noise(0.14, 800, 250, 0.4 + p * 0.2, 1); },
    armor(p) { this.tone('triangle', 900, 600, 0.12, 0.12); this.tone('sine', 140, 60, 0.15, 0.4); this.noise(0.08, 3000, 1500, 0.25, 2); },
    shatter() { for (const f of [700, 1100, 1650]) this.tone('square', f, f * 0.7, 0.3, 0.05); this.noise(0.35, 4000, 800, 0.4, 0.8); this.tone('sine', 120, 50, 0.3, 0.5); },
    clang() { for (const f of [1250, 1870, 2630]) this.tone('triangle', f, f * 0.98, 0.45, 0.12); this.noise(0.08, 4000, 2000, 0.2, 3); },
    ko() { this.tone('sine', 110, 30, 0.6, 0.7); this.noise(0.4, 500, 100, 0.4, 0.8); },
    bang(t) { const big = t === 'shotgun' ? 1.5 : t === 'rifle' ? 1.1 : 0.9; this.noise(0.18 * big, 2500, 200, 0.55, 0.7, 'lowpass'); this.tone('sine', 120 / big, 35, 0.15 * big, 0.5); },
    twang() { this.tone('triangle', 240, 170, 0.18, 0.2); this.noise(0.1, 1800, 600, 0.2, 2); },
    thunk() { this.tone('sine', 140, 55, 0.16, 0.6); this.noise(0.12, 900, 300, 0.45, 1.2, 'lowpass'); },
    splinter() { this.noise(0.4, 2500, 400, 0.5, 0.7); for (let k = 0; k < 4; k++) this.tone('square', 300 + k * 170, 120, 0.08 + k * 0.03, 0.04); this.tone('sine', 110, 40, 0.3, 0.5); },
    gong() { for (const [f, v] of [[98, 0.5], [196, 0.22], [293, 0.12], [415, 0.07]]) this.tone('sine', f, f * 0.97, 2.2, v); this.noise(0.3, 600, 200, 0.2, 1); },
    click(v) { this.tone('square', 1800, 1200, 0.03, 0.08 * v); this.tone('square', 900, 700, 0.04, 0.06 * v); }
  };
  window.Sound = Sound;
  R.TEAMS = COLORS; R.COLORS = COLORS;
  R.reset = function () { R.texts = []; R.parts = []; R.flashes = []; R.trails = []; R.ghost = []; R.decals = []; R.shake = 0; R.whiteFlash = 0; R.cam.gy = 0; };
  window.RSRender = R;
})();

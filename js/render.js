/* Ragdoll Slash - renderer: layered parallax arena, shaded armoured fighters, effects, HUD */
(function () {
  'use strict';
  const { D, SWORD_A, ARENA } = window.RSGame;
  const TEAMS = [
    { name: 'Red', c: '#b8242f', l: '#e2515a', d: '#5e0f16', trim: '#f2c14e' },
    { name: 'Blue', c: '#2552b8', l: '#5a86e8', d: '#0f2560', trim: '#e8e8f0' },
    { name: 'Green', c: '#2a8a3e', l: '#5fc271', d: '#0f4019', trim: '#f2c14e' },
    { name: 'Gold', c: '#c98a17', l: '#f0bd4f', d: '#6b4406', trim: '#3a1f0a' }
  ];
  const LEN = [2 * D.th, 0, D.ua, D.fa, D.thg, D.shn, D.thg, D.shn, D.ua, D.fa];
  const R = { cam: { x: 0, w: 10, gy: 0 }, shake: 0, parts: [], flashes: [], trails: [], ghost: [], t: 0, whiteFlash: 0, me: -1 };
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
    // vignette
    bg.vig = mk(W, H); const v = bg.vig.getContext('2d');
    g = v.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,5,15,0.55)'); v.fillStyle = g; v.fillRect(0, 0, W, H);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- camera ----------
  function updateCam(snap, dt) {
    let minx = 1e9, maxx = -1e9, maxy = 0;
    for (const f of snap.f) { const x = f.p[0]; minx = Math.min(minx, x); maxx = Math.max(maxx, x); maxy = Math.max(maxy, f.p[4]); }
    const spread = maxx - minx;
    const tw = clamp(spread + 5.2, 7.2, 18.5);
    const tx = clamp((minx + maxx) / 2, -ARENA - 1 + tw / 2, ARENA + 1 - tw / 2);
    const k = 1 - Math.pow(0.02, dt);
    R.cam.w += (tw - R.cam.w) * k; R.cam.x += (tx - R.cam.x) * k;
    const s = W / R.cam.w;
    const gyT = H * 0.8 + Math.max(0, (maxy + 0.6) * s - H * 0.74);
    R.cam.gy += ((R.cam.gy || gyT) - R.cam.gy) + (gyT - R.cam.gy) * k;
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
  const SKIN = ['#f3cfa6', '#d9a47a', '#8a5638'];
  function darkenCols(cols, k) { return cols.map((c) => mix(c, '#1a1020', k)); }
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = ((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t, g = ((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t, bl = (pa & 255) * (1 - t) + (pb & 255) * t;
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  const STEEL = ['#f4f8fc', '#a8b4c0', '#4c5560'];

  function drawArm(p, iu, ifa, team, back) {
    const k = back ? 0.35 : 0;
    const cloth = darkenCols([team.l, team.c, team.d], k), skin = darkenCols(SKIN, k), leather = darkenCols(['#8a5a34', '#5a3a1e', '#2e1c0e'], k), steel = darkenCols(STEEL, k);
    const u = ends(p, iu), f = ends(p, ifa);
    limb(u[0], u[1], u[2], u[3], 0.13, cloth[0], cloth[1], cloth[2]);
    limb(f[0], f[1], f[2], f[3], 0.095, skin[0], skin[1], skin[2]);
    // bracer on lower forearm
    const bx = f[0] + (f[2] - f[0]) * 0.35, by = f[1] + (f[3] - f[1]) * 0.35;
    limb(bx, by, f[2] - (f[2] - f[0]) * 0.12, f[3] - (f[3] - f[1]) * 0.12, 0.105, leather[0], leather[1], leather[2]);
    // pauldron
    ctx.save(); ctx.translate(u[0], u[1]); ctx.rotate(p[iu * 3 + 2]);
    const g = ctx.createLinearGradient(-0.09, 0.05, 0.09, -0.06); g.addColorStop(0, steel[0]); g.addColorStop(0.5, steel[1]); g.addColorStop(1, steel[2]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -0.02, 0.095, 0.075, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = back ? mix(team.trim, '#1a1020', 0.35) : team.trim; ctx.lineWidth = 0.015; ctx.beginPath(); ctx.ellipse(0, -0.02, 0.095, 0.075, 0, Math.PI * 1.05, Math.PI * 1.95, true); ctx.stroke();
    ctx.restore();
    return f;
  }
  function drawHand(x, y, back) {
    const s = back ? darkenCols(['#8a5a34', '#5a3a1e', '#2e1c0e'], 0.35) : ['#9a6a40', '#5a3a1e', '#2e1c0e'];
    const g = ctx.createRadialGradient(x - 0.015, y + 0.015, 0.005, x, y, 0.06);
    g.addColorStop(0, s[0]); g.addColorStop(0.6, s[1]); g.addColorStop(1, s[2]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 0.055, 0, 7); ctx.fill();
  }
  function drawLeg(p, it, is, team, back, fa) {
    const k = back ? 0.35 : 0;
    const pants = darkenCols([mix(team.d, '#ffffff', 0.25), team.d, '#12080c'], k), boot = darkenCols(['#6a4428', '#3e2614', '#1a0e06'], k), steel = darkenCols(STEEL, k);
    const t = ends(p, it), s = ends(p, is);
    limb(t[0], t[1], t[2], t[3], 0.15, pants[0], pants[1], pants[2]);
    limb(s[0], s[1], s[2], s[3], 0.12, boot[0], boot[1], boot[2]);
    // greave
    limb(s[0] + (s[2] - s[0]) * 0.1, s[1] + (s[3] - s[1]) * 0.1, s[0] + (s[2] - s[0]) * 0.6, s[1] + (s[3] - s[1]) * 0.6, 0.095, steel[0], steel[1], steel[2]);
    // knee cop
    ctx.fillStyle = steel[1]; ctx.beginPath(); ctx.arc(t[2], t[3], 0.06, 0, 7); ctx.fill();
    // foot
    ctx.save(); ctx.translate(s[2], s[3]); ctx.rotate(p[is * 3 + 2]); ctx.scale(fa, 1);
    ctx.fillStyle = boot[2]; ctx.beginPath(); ctx.moveTo(-0.07, 0.03); ctx.lineTo(0.08, 0.03); ctx.quadraticCurveTo(0.17, 0.0, 0.16, -0.04); ctx.lineTo(-0.08, -0.04); ctx.closePath(); ctx.fill();
    ctx.fillStyle = boot[0]; ctx.fillRect(-0.06, 0.0, 0.12, 0.02);
    ctx.restore();
  }
  function drawTorso(p, team, fa) {
    const x = p[0], y = p[1], a = p[2];
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(fa, 1);
    // tunic body
    let g = ctx.createLinearGradient(-0.17, 0, 0.17, 0); g.addColorStop(0, team.d); g.addColorStop(0.6, team.c); g.addColorStop(1, team.l);
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(-0.14, -0.31); ctx.lineTo(0.15, -0.31); ctx.lineTo(0.14, 0.1); ctx.quadraticCurveTo(0.17, 0.27, 0.1, 0.31); ctx.lineTo(-0.1, 0.31); ctx.quadraticCurveTo(-0.18, 0.27, -0.15, 0.1); ctx.closePath(); ctx.fill();
    // breastplate
    g = ctx.createLinearGradient(-0.12, 0.3, 0.16, -0.05);
    g.addColorStop(0, '#5a636e'); g.addColorStop(0.45, '#c9d3dd'); g.addColorStop(0.6, '#ffffff'); g.addColorStop(0.75, '#9aa6b2'); g.addColorStop(1, '#4a525c');
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(-0.13, -0.04); ctx.lineTo(0.14, -0.04); ctx.quadraticCurveTo(0.19, 0.14, 0.11, 0.29); ctx.lineTo(-0.1, 0.29); ctx.quadraticCurveTo(-0.16, 0.14, -0.13, -0.04); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = team.trim; ctx.lineWidth = 0.014; ctx.stroke();
    ctx.strokeStyle = 'rgba(40,45,55,0.5)'; ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(0.02, 0.27); ctx.quadraticCurveTo(0.06, 0.12, 0.03, -0.03); ctx.stroke();
    // emblem
    ctx.fillStyle = team.c; ctx.beginPath(); ctx.moveTo(0.05, 0.18); ctx.lineTo(0.1, 0.13); ctx.lineTo(0.05, 0.05); ctx.lineTo(0.0, 0.13); ctx.closePath(); ctx.fill();
    // belt
    g = ctx.createLinearGradient(0, -0.04, 0, -0.11); g.addColorStop(0, '#6a4428'); g.addColorStop(1, '#2e1c0e');
    ctx.fillStyle = g; ctx.fillRect(-0.15, -0.11, 0.3, 0.07);
    ctx.fillStyle = '#e8c060'; ctx.fillRect(0.06, -0.1, 0.05, 0.05); ctx.fillStyle = '#6a4a10'; ctx.fillRect(0.075, -0.085, 0.02, 0.02);
    // tabard
    g = ctx.createLinearGradient(-0.12, 0, 0.14, 0); g.addColorStop(0, team.d); g.addColorStop(0.7, team.c); g.addColorStop(1, team.l);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-0.02, -0.11); ctx.lineTo(0.13, -0.11); ctx.lineTo(0.16, -0.36); ctx.lineTo(0.0, -0.33); ctx.closePath(); ctx.fill();
    ctx.fillStyle = team.trim; ctx.fillRect(0.0, -0.35, 0.16, 0.018);
    ctx.restore();
  }
  function drawHead(p, pt, team, fa, alive) {
    const x = p[3], y = p[4], a = p[5];
    // neck
    const nx = pt[0] - Math.sin(pt[2]) * 0.3, ny = pt[1] + Math.cos(pt[2]) * 0.3;
    limb(nx, ny, x - Math.sin(a) * -0.06, y + Math.cos(a) * -0.06, 0.09, SKIN[0], SKIN[1], SKIN[2]);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(fa, 1);
    let g = ctx.createRadialGradient(0.04, 0.03, 0.01, 0, 0, 0.15);
    g.addColorStop(0, '#f8dcb8'); g.addColorStop(0.6, '#e0ab80'); g.addColorStop(1, '#9a6440');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 0.135, 0, 7); ctx.fill();
    // jaw / beard shadow
    ctx.fillStyle = 'rgba(70,40,25,0.35)'; ctx.beginPath(); ctx.ellipse(0.04, -0.085, 0.08, 0.045, -0.3, 0, 7); ctx.fill();
    // eye
    if (alive) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0.078, 0.0, 0.022, 0.014, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#1a1010'; ctx.beginPath(); ctx.arc(0.086, 0.0, 0.01, 0, 7); ctx.fill();
      ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(0.05, 0.03); ctx.lineTo(0.105, 0.022); ctx.stroke(); }
    else { ctx.strokeStyle = '#2a1010'; ctx.lineWidth = 0.014; ctx.beginPath(); ctx.moveTo(0.06, -0.015); ctx.lineTo(0.1, 0.015); ctx.moveTo(0.06, 0.015); ctx.lineTo(0.1, -0.015); ctx.stroke(); }
    ctx.strokeStyle = '#6a2a20'; ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(0.07, -0.07); ctx.lineTo(0.11, -0.065); ctx.stroke();
    // helmet
    g = ctx.createLinearGradient(-0.1, 0.16, 0.12, -0.02);
    g.addColorStop(0, '#4a525c'); g.addColorStop(0.4, '#c9d3dd'); g.addColorStop(0.55, '#ffffff'); g.addColorStop(0.7, '#8a96a2'); g.addColorStop(1, '#3a424c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-0.155, -0.02); ctx.arc(0, 0.005, 0.155, Math.PI + 0.15, -0.12); ctx.lineTo(0.15, 0.02); ctx.lineTo(-0.155, 0.02); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a3038'; ctx.fillRect(-0.16, 0.0, 0.31, 0.025);
    ctx.fillStyle = team.trim; ctx.fillRect(-0.16, 0.022, 0.31, 0.01);
    // nasal guard + cheek plate
    ctx.fillStyle = '#9aa6b2'; ctx.fillRect(0.1, -0.06, 0.028, 0.08);
    ctx.fillStyle = '#6a7480'; ctx.beginPath(); ctx.moveTo(-0.15, 0.0); ctx.lineTo(-0.02, 0.0); ctx.lineTo(-0.05, -0.1); ctx.lineTo(-0.14, -0.08); ctx.closePath(); ctx.fill();
    // plume
    g = ctx.createLinearGradient(0, 0.2, -0.25, 0.0); g.addColorStop(0, team.l); g.addColorStop(1, team.d);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0.03, 0.15); ctx.quadraticCurveTo(-0.1, 0.3, -0.3, 0.12); ctx.quadraticCurveTo(-0.2, 0.14, -0.12, 0.05); ctx.quadraticCurveTo(-0.05, 0.12, 0.03, 0.15); ctx.fill();
    ctx.restore();
  }
  function drawSword(p, fa, strike) {
    const x = p[27], y = p[28], a = p[29];
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.translate(0, -D.fa / 2); ctx.rotate(SWORD_A(fa));
    if (fa < 0) ctx.scale(1, -1);
    // grip + pommel
    ctx.fillStyle = '#3b2616'; ctx.fillRect(-0.13, -0.022, 0.14, 0.044);
    ctx.fillStyle = '#e8c060'; ctx.beginPath(); ctx.arc(-0.14, 0, 0.032, 0, 7); ctx.fill();
    // blade
    let g = ctx.createLinearGradient(0, 0.028, 0, -0.028);
    g.addColorStop(0, '#f8fbff'); g.addColorStop(0.35, '#c8d2dc'); g.addColorStop(0.5, '#7a8692'); g.addColorStop(0.65, '#b8c4d0'); g.addColorStop(1, '#3d444c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0.03, 0.027); ctx.lineTo(0.9, 0.022); ctx.lineTo(1.02, 0); ctx.lineTo(0.9, -0.022); ctx.lineTo(0.03, -0.027); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,70,80,0.6)'; ctx.lineWidth = 0.008; ctx.beginPath(); ctx.moveTo(0.06, 0); ctx.lineTo(0.78, 0); ctx.stroke();
    // moving shine
    const sp = ((R.t * 0.7 + a * 0.2) % 1.6) - 0.3;
    g = ctx.createLinearGradient(sp - 0.15, 0, sp + 0.15, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,' + (strike ? 0.95 : 0.7) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0.03, 0.02); ctx.lineTo(0.9, 0.016); ctx.lineTo(1.0, 0); ctx.lineTo(0.03, 0.0); ctx.closePath(); ctx.fill();
    // crossguard
    g = ctx.createLinearGradient(0, 0.11, 0, -0.11); g.addColorStop(0, '#fff0b0'); g.addColorStop(0.5, '#d4a030'); g.addColorStop(1, '#6a4a10');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0.0, 0.11); ctx.lineTo(0.035, 0.1); ctx.lineTo(0.035, -0.1); ctx.lineTo(0.0, -0.11); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function swordPts(p, fa) {
    const x = p[27], y = p[28], a = p[29];
    const hx = x + Math.sin(a) * D.fa / 2, hy = y - Math.cos(a) * D.fa / 2;
    const sa = a + SWORD_A(fa);
    return [hx + Math.cos(sa) * 0.5, hy + Math.sin(sa) * 0.5, hx + Math.cos(sa) * 1.02, hy + Math.sin(sa) * 1.02];
  }

  function drawFighter(f, i, team) {
    const p = f.p, fa = f.fa, alive = f.fl & 1;
    drawArm(p, 2, 3, team, true);
    const fb = ends(p, 3); drawHand(fb[2], fb[3], true);
    drawLeg(p, 4, 5, team, true, fa);
    drawTorso(p, team, fa);
    drawLeg(p, 6, 7, team, false, fa);
    drawHead(p, p, team, fa, alive);
    // sword trail
    const tr = R.trails[i] || (R.trails[i] = []);
    if (f.fl & 4) tr.push(swordPts(p, fa)); else if (tr.length) tr.shift();
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
    drawSword(p, fa, f.fl & 4);
    const ff = drawArm(p, 8, 9, team, false);
    drawHand(ff[2], ff[3], false);
    if (f.fl & 2) { // block glint
      const sp = swordPts(p, fa);
      const g = ctx.createRadialGradient(sp[2], sp[3], 0, sp[2], sp[3], 0.35);
      g.addColorStop(0, 'rgba(160,210,255,0.5)'); g.addColorStop(1, 'rgba(160,210,255,0)');
      ctx.fillStyle = g; ctx.fillRect(sp[2] - 0.35, sp[3] - 0.35, 0.7, 0.7);
    }
  }

  // ---------- effects ----------
  R.addEvents = function (evs) {
    for (const e of evs) {
      const [type, x, y, pw] = e;
      if (type === 'hit') { spark(x, y, 14 + pw * 14, ['#fff6c0', '#ffb040', '#ff6020'], 7 + pw * 4); flash(x, y, 0.5 + pw * 0.4, 'rgba(255,220,150,'); R.shake = Math.max(R.shake, Math.min(1, pw * 0.8)); Sound.hit(pw); }
      else if (type === 'block' || type === 'clash') { spark(x, y, 22, ['#ffffff', '#bfe0ff', '#ffe890'], 9); flash(x, y, 0.7, 'rgba(190,220,255,'); R.shake = Math.max(R.shake, 0.35); Sound.clang(); }
      else if (type === 'ko') { spark(x, y, 40, ['#ffffff', '#ffd060', '#ff5020'], 12); flash(x, y, 1.4, 'rgba(255,240,200,'); R.shake = 1.2; R.whiteFlash = 0.5; Sound.ko(); }
      else if (type === 'swing') Sound.swoosh();
      else if (type === 'land' || type === 'jump' || type === 'dash') dust(x, type === 'dash' ? 0 : y, type === 'dash' ? 6 : 8);
    }
  };
  function spark(x, y, n, cols, sp) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = sp * 0.6 * (0.3 + Math.random());
      R.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 2, life: 0.15 + Math.random() * 0.3, max: 0.45, c: cols[i % cols.length], k: 's' }); }
  }
  function dust(x, y, n) { for (let i = 0; i < n; i++) R.parts.push({ x: x + (Math.random() - 0.5) * 0.4, y: 0.05, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 0.8, life: 0.5 + Math.random() * 0.4, max: 0.9, c: 'd', k: 'd', r: 0.08 + Math.random() * 0.1 }); }
  function flash(x, y, r, c) { R.flashes.push({ x, y, r, c, life: 0.18, max: 0.18 }); }

  // ---------- main draw ----------
  R.draw = function (snap, meta, dt) {
    if (!W) { R.resize(); if (!W) return; }
    R.t += dt;
    updateCam(snap, dt);
    const s = R.cam.s;
    R.shake = Math.max(0, R.shake - dt * 3);
    const shx = (Math.random() - 0.5) * R.shake * s * 0.12, shy = (Math.random() - 0.5) * R.shake * s * 0.12;
    const gy = R.cam.gy + shy, ox = W / 2 - R.cam.x * s + shx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg.sky, 0, 0);
    // parallax layers
    const par = (img, iw, factor, bottom) => {
      let x = (-R.cam.x * factor * H * 0.12 - (iw - W) / 2) % iw; if (x > 0) x -= iw;
      for (; x < W; x += iw) ctx.drawImage(img, x, bottom - img.height);
    };
    par(bg.mount, bg.mw, 0.25, gy - H * 0.12);
    par(bg.arena, bg.aw, 0.6, gy + H * 0.02);
    // ground
    ctx.save(); const k = s / 64; ctx.translate(ox, gy); ctx.scale(k, k);
    ctx.fillStyle = bg.groundPat; ctx.fillRect(-ox / k, 0, W / k, (H - gy) / k + 2); ctx.restore();
    let g = ctx.createLinearGradient(0, gy, 0, H); g.addColorStop(0, 'rgba(255,220,170,0.25)'); g.addColorStop(0.08, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,10,5,0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, gy, W, H - gy);
    // world transform (y up)
    ctx.setTransform(s, 0, 0, -s, ox, gy);
    // shadows
    for (const f of snap.f) {
      const x = f.p[0], hgt = Math.max(0, f.p[1] - 1.1), al = clamp(0.5 - hgt * 0.12, 0.12, 0.5), w = 0.55 + hgt * 0.1;
      ctx.save(); ctx.translate(x, 0.0); ctx.scale(1, 0.16);
      const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, w); sg.addColorStop(0, 'rgba(0,0,0,' + al + ')'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, w, 0, 7); ctx.fill(); ctx.restore();
    }
    // KO'd fighters behind live ones
    const order = snap.f.map((f, i) => i).sort((a, b) => (snap.f[a].fl & 1) - (snap.f[b].fl & 1));
    for (const i of order) drawFighter(snap.f[i], i, TEAMS[meta[i].color]);
    // marker over my fighter
    if (R.me >= 0 && snap.f[R.me] && snap.f.length > 1) {
      const f = snap.f[R.me], x = f.p[3], y = f.p[4] + 0.42;
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.moveTo(x - 0.08, y + 0.12); ctx.lineTo(x + 0.08, y + 0.12); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
    }
    // particles
    ctx.globalCompositeOperation = 'lighter';
    const pdt = dt * (snap.ts || 1);
    for (let i = R.parts.length - 1; i >= 0; i--) {
      const q = R.parts[i]; q.life -= pdt; if (q.life <= 0) { R.parts.splice(i, 1); continue; }
      if (q.k === 's') {
        q.vy -= 14 * pdt; q.x += q.vx * pdt; q.y += q.vy * pdt;
        if (q.y < 0) { q.y = 0; q.vy *= -0.4; q.vx *= 0.6; }
        ctx.strokeStyle = q.c; ctx.globalAlpha = clamp(q.life / 0.3, 0, 1); ctx.lineWidth = 0.025;
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
    for (const q of R.parts) if (q.k === 'd') {
      q.x += q.vx * pdt; q.y += q.vy * pdt; q.r += pdt * 0.3;
      ctx.fillStyle = 'rgba(190,160,120,' + clamp(q.life / q.max, 0, 1) * 0.4 + ')'; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill();
    }
    // screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg.vig, 0, 0);
    if (snap.ts < 1) { ctx.fillStyle = 'rgba(40,0,0,0.18)'; ctx.fillRect(0, 0, W, H); }
    if (R.whiteFlash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + R.whiteFlash + ')'; ctx.fillRect(0, 0, W, H); R.whiteFlash -= dt * 1.5; }
    drawHud(snap, meta, dt);
  };

  function drawHud(snap, meta, dt) {
    const n = snap.f.length, u = H / 360, pad = 10 * u, top = 8 * u;
    const bw = n === 2 ? Math.min(W * 0.36, (W - pad * 3 - 140 * u) / 2) : (W - 52 * u - pad - 60 * u - pad * (n - 1)) / n;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const f = snap.f[i], team = TEAMS[meta[i].color];
      let x;
      if (n === 2) x = i === 0 ? pad + 40 * u : W - pad - 40 * u - bw; else x = 52 * u + i * (bw + pad) + (i >= n / 2 ? 60 * u : 0);
      const gh = R.ghost[i] = R.ghost[i] == null ? f.h : Math.max(f.h, R.ghost[i] - dt * 25);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(x - 2 * u, top - 2 * u, bw + 4 * u, 16 * u, 4 * u); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(x, top, bw * gh / 100, 12 * u);
      const hg = ctx.createLinearGradient(0, top, 0, top + 12 * u);
      const hc = f.h > 50 ? ['#9cf07a', '#3fae2a'] : f.h > 25 ? ['#ffe070', '#d99a10'] : ['#ff8070', '#c02010'];
      hg.addColorStop(0, hc[0]); hg.addColorStop(1, hc[1]);
      ctx.fillStyle = hg; ctx.fillRect(x, top, bw * f.h / 100, 12 * u);
      ctx.fillStyle = team.c; ctx.fillRect(x, top + 12 * u, bw, 2 * u);
      ctx.font = 'bold ' + Math.round(11 * u) + 'px system-ui, sans-serif';
      ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3 * u;
      const label = meta[i].name + (i === R.me && n > 1 && meta[i].name !== 'You' ? ' (you)' : '');
      ctx.textAlign = (n === 2 && i === 1) ? 'right' : 'left';
      ctx.fillText(label, (n === 2 && i === 1) ? x + bw : x, top + 24 * u);
      ctx.shadowBlur = 0;
      for (let k = 0; k < 3; k++) {
        const cx = (n === 2 && i === 1) ? x + bw - 6 * u - k * 13 * u - ctx.measureText(label).width - 8 * u : x + ctx.measureText(label).width + 12 * u + k * 13 * u;
        ctx.beginPath(); ctx.arc(cx, top + 24 * u, 4.5 * u, 0, 7); ctx.fillStyle = k < snap.sc[i] ? '#ffd24a' : 'rgba(0,0,0,0.45)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1 * u; ctx.stroke();
      }
    }
    // timer
    ctx.textAlign = 'center'; ctx.font = 'bold ' + Math.round(20 * u) + 'px system-ui, sans-serif';
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4 * u;
    ctx.fillText(String(snap.tm), W / 2, top + 10 * u);
    ctx.shadowBlur = 0;
    if (snap.msg) {
      const big = /K\.O|FIGHT|Round/.test(snap.msg);
      const fs = Math.round((big ? 46 : 28) * u);
      ctx.font = '900 ' + fs + 'px system-ui, sans-serif';
      ctx.lineWidth = fs * 0.14; ctx.strokeStyle = 'rgba(20,5,5,0.85)'; ctx.lineJoin = 'round';
      const mg = ctx.createLinearGradient(0, H * 0.42 - fs / 2, 0, H * 0.42 + fs / 2);
      mg.addColorStop(0, '#fff6d0'); mg.addColorStop(0.5, '#ffc640'); mg.addColorStop(1, '#e06010');
      ctx.strokeText(snap.msg, W / 2, H * 0.42); ctx.fillStyle = mg; ctx.fillText(snap.msg, W / 2, H * 0.42);
    }
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---------- sound (synthesised, offline) ----------
  const Sound = {
    ac: null, on: true,
    unlock() { if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (this.ac && this.ac.state === 'suspended') this.ac.resume(); },
    noise(dur, f0, f1, vol, q) {
      const ac = this.ac; if (!ac || !this.on) return;
      const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ac.createBufferSource(); src.buffer = buf;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q || 1.5; bp.frequency.setValueAtTime(f0, ac.currentTime); bp.frequency.exponentialRampToValueAtTime(f1, ac.currentTime + dur);
      const gn = ac.createGain(); gn.gain.value = vol; src.connect(bp).connect(gn).connect(ac.destination); src.start();
    },
    tone(type, f0, f1, dur, vol) {
      const ac = this.ac; if (!ac || !this.on) return;
      const o = ac.createOscillator(), gn = ac.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, ac.currentTime); o.frequency.exponentialRampToValueAtTime(f1, ac.currentTime + dur);
      gn.gain.setValueAtTime(vol, ac.currentTime); gn.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.connect(gn).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
    },
    swoosh() { this.noise(0.18, 600, 2400, 0.25, 2); },
    hit(p) { this.tone('sine', 160, 45, 0.18, 0.5); this.noise(0.12, 900, 300, 0.35 + p * 0.2, 1); },
    clang() { for (const f of [1250, 1870, 2630]) this.tone('triangle', f, f * 0.98, 0.45, 0.12); this.noise(0.08, 4000, 2000, 0.2, 3); },
    ko() { this.tone('sine', 110, 30, 0.6, 0.7); this.noise(0.4, 500, 100, 0.4, 0.8); }
  };
  window.Sound = Sound;
  R.TEAMS = TEAMS;
  R.reset = function () { R.parts = []; R.flashes = []; R.trails = []; R.ghost = []; R.shake = 0; R.whiteFlash = 0; R.cam.gy = 0; };
  window.RSRender = R;
})();

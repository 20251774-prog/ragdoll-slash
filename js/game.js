/* Ragdoll Slash v2 - physics + game rules (runs on solo device or on the host) */
(function () {
  'use strict';
  const pl = planck, Vec2 = pl.Vec2;
  const G = 20, ARENA = 9, DT = 1 / 60, WIN_SCORE = 3, ROUND_TIME = 75;
  const D = { tw: 0.15, th: 0.3, hr: 0.14, ua: 0.3, fa: 0.28, thg: 0.43, shn: 0.43, aw: 0.05, fw: 0.045, lw: 0.07 };
  const HIP_OFF = 0.26, SHO_OFF = 0.24;
  const STAND_Y = 0.83 + HIP_OFF;
  const CAT = { GROUND: 1, BODY: 2, BLADE: 4, SENSE: 8, PROJ: 16, DEBRIS: 32 };
  // parts: 0 torso,1 head,2 back upper arm,3 back forearm,4 back thigh,5 back shin,6 front thigh,7 front shin,8 weapon upper arm,9 weapon forearm
  const PART_MUL = [1, 1.6, 0.75, 0.75, 0.8, 0.8, 0.8, 0.8, 0.75, 0.75];
  // armour pieces: 0 helmet, 1 chest, 2 back arm, 3 front arm, 4 back leg, 5 front leg
  const PART_PIECE = [1, 0, 2, 2, 4, 4, 5, 5, 3, 3];
  const PIECE_CAT = ['helmet', 'chest', 'arms', 'arms', 'legs', 'legs'];
  const PIECE_W = [0.5, 1.0, 0.35, 0.35, 0.4, 0.4];
  const ARMOUR = [
    { name: 'None', hp: 0, prot: 0, slow: 0 },
    { name: 'Leather', hp: 35, prot: 0.3, slow: 0.02 },
    { name: 'Chainmail', hp: 60, prot: 0.48, slow: 0.05 },
    { name: 'Plate', hp: 95, prot: 0.65, slow: 0.085 }
  ];
  const SWORD_A = (fc) => (fc > 0 ? -1.0 : Math.PI + 1.0);
  const WEAPONS = {
    longsword: { name: 'Longsword', kind: 'melee', len: 1.0, w: 0.028, dens: 6, dmg: 1.0, kb: 1.0, arm: 1.0, prot: 1.0, spd: 1.0, s0: 0.15, tq: 260 },
    greatsword: { name: 'Greatsword', kind: 'melee', len: 1.38, w: 0.04, dens: 6, dmg: 1.5, kb: 1.6, arm: 1.25, prot: 0.9, spd: 0.72, s0: 0.2, tq: 520, move: 0.9 },
    katana: { name: 'Katana', kind: 'melee', len: 1.05, w: 0.022, dens: 4, dmg: 1.2, kb: 0.8, arm: 0.6, prot: 1.15, spd: 1.3, s0: 0.15, tq: 230 },
    axe: { name: 'Battle axe', kind: 'melee', len: 0.95, w: 0.022, dens: 5, dmg: 1.35, kb: 1.35, arm: 1.6, prot: 0.85, spd: 0.85, s0: 0.62, tq: 340, head: 0.09 },
    spear: { name: 'Spear', kind: 'melee', len: 1.75, w: 0.018, dens: 3.5, dmg: 1.1, kb: 1.1, arm: 0.9, prot: 0.8, spd: 0.95, s0: 1.3, tq: 330 },
    mace: { name: 'Mace', kind: 'melee', len: 0.85, w: 0.022, dens: 5, dmg: 1.25, kb: 1.8, arm: 2.0, prot: 0.65, spd: 0.8, s0: 0.58, tq: 360, head: 0.1 },
    pistol: { name: 'Pistol', kind: 'gun', len: 0.26, dmg: 19, speed: 60, mag: 8, reload: 1.4, cd: 0.32, pen: 0.3, kb: 1.0, spread: 0.015, pellets: 1, grav: 0.1, recoil: 0.6 },
    rifle: { name: 'Rifle', kind: 'gun', len: 0.85, dmg: 11, speed: 85, mag: 20, reload: 2.2, cd: 0.14, auto: true, pen: 0.6, kb: 0.9, spread: 0.05, pellets: 1, two: true, grav: 0.05, recoil: 0.5 },
    shotgun: { name: 'Shotgun', kind: 'gun', len: 0.75, dmg: 8, speed: 45, mag: 5, reload: 2.4, cd: 0.8, pen: 0.1, kb: 1.5, spread: 0.16, pellets: 7, two: true, grav: 0.1, recoil: 1.6, falloff: true },
    bow: { name: 'Bow', kind: 'bow', len: 0.1, dmg: 42, speed: 34, mag: 1, reload: 0.35, cd: 0.2, pen: 0.4, kb: 1.3, spread: 0.01, pellets: 1, grav: 1, recoil: 0 }
  };
  const WLIST = Object.keys(WEAPONS);
  WLIST.forEach((k) => (WEAPONS[k].key = k));
  const MELEE = WLIST.filter((k) => WEAPONS[k].kind === 'melee'), RANGED = WLIST.filter((k) => WEAPONS[k].kind !== 'melee');
  const DIFF = {
    easy: { react: 0.5, aggr: 0.35, block: 0.12, dash: 0.0, spacing: 1.5, jump: 0.01, aimErr: 0.22 },
    normal: { react: 0.28, aggr: 0.6, block: 0.4, dash: 0.08, spacing: 1.45, jump: 0.02, aimErr: 0.1 },
    hard: { react: 0.14, aggr: 0.85, block: 0.72, dash: 0.2, spacing: 1.4, jump: 0.03, aimErr: 0.04 }
  };
  const DEFAULT_LOADOUT = { name: 'You', helmet: 3, chest: 3, arms: 2, legs: 2, color: 0, trim: 3, primary: 'longsword', secondary: 'pistol' };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  function randomLoadout(r) {
    r = r || Math.random; const pick = (a) => a[Math.floor(r() * a.length)];
    return { name: '', helmet: pick([0, 1, 2, 3, 3]), chest: pick([1, 2, 3, 3]), arms: pick([0, 1, 2, 3]), legs: pick([0, 1, 2, 3]),
      color: Math.floor(r() * 8), trim: Math.floor(r() * 8), primary: pick(MELEE), secondary: r() < 0.65 ? pick(RANGED) : pick(MELEE) };
  }
  function sanitizeLoadout(lo) {
    lo = Object.assign({}, DEFAULT_LOADOUT, lo || {});
    for (const k of ['helmet', 'chest', 'arms', 'legs']) lo[k] = clamp(parseInt(lo[k], 10) || 0, 0, 3);
    lo.color = clamp(parseInt(lo.color, 10) || 0, 0, 7); lo.trim = clamp(parseInt(lo.trim, 10) || 0, 0, 7);
    if (!WEAPONS[lo.primary]) lo.primary = 'longsword'; if (!WEAPONS[lo.secondary]) lo.secondary = 'pistol';
    lo.name = String(lo.name || '').slice(0, 12);
    return lo;
  }
  function loadoutStats(lo) {
    const types = [lo.helmet, lo.chest, lo.arms, lo.arms, lo.legs, lo.legs];
    let slow = 0, prot = 0, pw = 0;
    types.forEach((t, i) => { slow += PIECE_W[i] * ARMOUR[t].slow; prot += PIECE_W[i] * ARMOUR[t].prot; pw += PIECE_W[i]; });
    return { speed: 1 - slow, prot: prot / pw };
  }

  function Sim(players, opts) {
    // players: [{name, color, cpu, team, loadout}]
    opts = opts || {};
    this.teams = !!opts.teams;
    this.players = players;
    players.forEach((p, i) => { p.loadout = sanitizeLoadout(p.loadout); p.side = this.teams ? (p.team | 0) : i; });
    this.nSides = this.teams ? 2 : players.length;
    this.inputs = players.map(() => ({ l: 0, r: 0, b: 0, a: 0, j: 0, d: 0, h: 0, am: null, w: 0, rl: 0 }));
    this.ai = players.map(() => ({ t: 0, drawT: 0, err: 0 }));
    this.scores = new Array(this.nSides).fill(0);
    this.round = 0; this.events = []; this.netEvents = [];
    this.world = new pl.World({ gravity: Vec2(0, -G) });
    const g = this.world.createBody({ type: 'static' });
    const gf = { friction: 0.9, filterCategoryBits: CAT.GROUND, filterMaskBits: 0xffff };
    g.createFixture(new pl.Box(40, 1, Vec2(0, -1), 0), gf);
    g.createFixture(new pl.Box(0.5, 20, Vec2(-ARENA - 0.5, 10), 0), gf);
    g.createFixture(new pl.Box(0.5, 20, Vec2(ARENA + 0.5, 10), 0), gf);
    this.clashQ = [];
    this.world.on('begin-contact', (c) => {
      const a = c.getFixtureA().getUserData(), b = c.getFixtureB().getUserData();
      if (a && b && a.k === 'blade' && b.k === 'blade') {
        const wm = c.getWorldManifold(null); const p = wm && wm.points && wm.points[0];
        this.clashQ.push([a.f, b.f, p ? { x: p.x, y: p.y } : null]);
      }
    });
    this.fighters = []; this.projs = []; this.debris = [];
    this.acc = 0; this.slowT = 0; this.timeScale = 1; this.hitStop = 0; this.koCam = -1;
    this.startRound();
  }
  const S = Sim.prototype;

  S.ev = function (type, x, y, p) { const e = [type, +x.toFixed(2), +y.toFixed(2), +(p || 0).toFixed(2)]; this.events.push(e); this.netEvents.push(e); };
  S.drainEvents = function () { const e = this.events; this.events = []; return e; };
  S.drainNetEvents = function () { const e = this.netEvents; this.netEvents = []; return e; };
  S.sideName = function (s) { return this.teams ? (s === 0 ? 'Red team' : 'Blue team') : this.players[s].name; };

  S.startRound = function () {
    for (const p of this.projs) this.world.destroyBody(p.b);
    for (const d of this.debris) this.world.destroyBody(d.b);
    this.projs = []; this.debris = [];
    for (const f of this.fighters) for (const b of f.b) this.world.destroyBody(b);
    this.fighters = [];
    const n = this.players.length;
    let xs;
    if (this.teams) {
      const L = [-2.6, -4.6, -6.2], R = [2.6, 4.6, 6.2]; let li = 0, ri = 0;
      xs = this.players.map((p) => (p.side === 0 ? L[li++] : R[ri++]));
    } else xs = n === 2 ? [-2.4, 2.4] : n === 3 ? [-4, 0, 4] : [-5.4, -1.8, 1.8, 5.4];
    for (let i = 0; i < n; i++) this.fighters.push(this.makeFighter(i, xs[i], xs[i] < 0 ? 1 : -1));
    this.round++; this.state = 'intro'; this.stateT = 0; this.timer = ROUND_TIME; this.winner = -1;
    this.msg = 'Round ' + this.round; this.slowT = 0; this.koCam = -1; this.hitStop = 0;
  };
  S.restartMatch = function () { this.scores = new Array(this.nSides).fill(0); this.round = 0; this.startRound(); };

  S.makeFighter = function (idx, x, facing) {
    const w = this.world, grp = -(idx + 1), P = this.players[idx], lo = P.loadout;
    const f = { id: idx, side: P.side, b: [], j: {}, facing: 1, health: 100, alive: true, atk: null, atkCd: 0, comboT: 0, lastType: '',
      stun: 0, jumpT: 0, dashT: 0, dashCd: 0, dashDir: 1, walk: 0, turnT: 0, blocking: false, grounded: true,
      la: 0, lj: 0, ld: 0, lw: 0, lrl: 0, wantAtk: 0, wantJump: 0, wantDash: 0, clashT: 0, wfx: [],
      slot: 0, ws: [{ key: lo.primary, ammo: WEAPONS[lo.primary].mag || 0 }, { key: lo.secondary, ammo: WEAPONS[lo.secondary].mag || 0 }],
      reloadT: 0, cd: 0, draw: 0, aim: facing > 0 ? 0 : Math.PI };
    const ci = this.inputs[idx]; // start in sync with the player's button counters so nothing fires by itself
    f.la = ci.a; f.lj = ci.j; f.ld = ci.d; f.lw = ci.w; f.lrl = ci.rl;
    const types = [lo.helmet, lo.chest, lo.arms, lo.arms, lo.legs, lo.legs];
    f.pieces = types.map((t) => ({ type: t, hp: ARMOUR[t].hp, max: ARMOUR[t].hp }));
    const st = loadoutStats(lo); f.spd = st.speed;
    const ty = STAND_Y + 0.02;
    const fdef = (dens, part) => ({ density: dens, friction: 0.7, filterGroupIndex: grp, filterCategoryBits: CAT.BODY,
      filterMaskBits: CAT.GROUND | CAT.SENSE, userData: { k: 'body', f, part } });
    const mk = (px, py, shape, dens, part) => {
      const b = w.createBody({ type: 'dynamic', position: Vec2(px, py), angularDamping: 0.6, linearDamping: 0.05 });
      b.createFixture(shape, fdef(dens, part)); f.b[part] = b; return b;
    };
    const torso = mk(x, ty, new pl.Box(D.tw, D.th), 30, 0);
    const head = mk(x, ty + D.th + D.hr + 0.02, new pl.Circle(D.hr), 20, 1);
    const sy = ty + SHO_OFF, hy = ty - HIP_OFF;
    const uab = mk(x, sy - D.ua / 2, new pl.Box(D.aw, D.ua / 2), 20, 2);
    const fab = mk(x, sy - D.ua - D.fa / 2, new pl.Box(D.fw, D.fa / 2), 20, 3);
    const thb = mk(x, hy - D.thg / 2, new pl.Box(D.lw, D.thg / 2), 20, 4);
    const shb = mk(x, hy - D.thg - D.shn / 2, new pl.Box(D.lw * 0.85, D.shn / 2), 20, 5);
    const thf = mk(x, hy - D.thg / 2, new pl.Box(D.lw, D.thg / 2), 20, 6);
    const shf = mk(x, hy - D.thg - D.shn / 2, new pl.Box(D.lw * 0.85, D.shn / 2), 20, 7);
    const uaf = mk(x, sy - D.ua / 2, new pl.Box(D.aw, D.ua / 2), 20, 8);
    const faf = mk(x, sy - D.ua - D.fa / 2, new pl.Box(D.fw, D.fa / 2), 20, 9);
    for (const s of [shb, shf]) s.createFixture(new pl.Box(0.09, 0.03, Vec2(0, -D.shn / 2), 0), fdef(10, s === shb ? 5 : 7));
    faf.setBullet(true);
    const rev = (a, b, anchor, lim) => {
      const j = w.createJoint(new pl.RevoluteJoint({ enableLimit: true, lowerAngle: lim[0], upperAngle: lim[1], enableMotor: true, maxMotorTorque: 50, motorSpeed: 0 }, a, b, anchor));
      j._lim = lim; return j;
    };
    f.j.neck = rev(torso, head, Vec2(x, ty + D.th), [-0.6, 0.6]);
    f.j.shB = rev(torso, uab, Vec2(x, sy), [-2.4, 3.2]);
    f.j.elB = rev(uab, fab, Vec2(x, sy - D.ua), [0, 2.6]);
    f.j.shF = rev(torso, uaf, Vec2(x, sy), [-2.4, 3.4]);
    f.j.elF = rev(uaf, faf, Vec2(x, sy - D.ua), [0, 2.6]);
    f.j.hipB = rev(torso, thb, Vec2(x, hy), [-1.1, 2.1]);
    f.j.kneeB = rev(thb, shb, Vec2(x, hy - D.thg), [-2.5, 0]);
    f.j.hipF = rev(torso, thf, Vec2(x, hy), [-1.1, 2.1]);
    f.j.kneeF = rev(thf, shf, Vec2(x, hy - D.thg), [-2.5, 0]);
    f.grp = grp;
    this.setFacing(f, facing);
    f.mass = f.b.reduce((m, b) => m + b.getMass(), 0);
    return f;
  };

  S.weapon = function (f) { return WEAPONS[f.ws[f.slot].key]; };

  S.setFacing = function (f, fc) {
    f.facing = fc;
    for (const k in f.j) { const j = f.j[k], l = j._lim; if (fc > 0) j.setLimits(l[0], l[1]); else j.setLimits(-l[1], -l[0]); }
    this.setWeapon(f);
  };
  S.setWeapon = function (f) {
    const b = f.b[9];
    for (const fx of f.wfx) b.destroyFixture(fx);
    f.wfx = []; f.bladeFx = f.senseFx = null;
    const W = this.weapon(f);
    if (W.kind !== 'melee') return;
    const a = SWORD_A(f.facing), dx = Math.cos(a), dy = Math.sin(a), hy = -D.fa / 2;
    const from = -0.12, L = W.len, c = (from + L) / 2, hl = (L - from) / 2;
    const bd = { density: W.dens, friction: 0.3, filterGroupIndex: f.grp, filterCategoryBits: CAT.BLADE, filterMaskBits: CAT.BLADE, userData: { k: 'blade', f } };
    f.bladeFx = b.createFixture(new pl.Box(hl, W.w, Vec2(dx * c, hy + dy * c), a), bd);
    f.wfx.push(f.bladeFx);
    if (W.head) { const hc = L - W.head; f.wfx.push(b.createFixture(new pl.Box(W.head, W.head, Vec2(dx * hc, hy + dy * hc), a), Object.assign({}, bd, { density: W.dens * 3 }))); }
    const s0 = W.s0, sc = (s0 + L + 0.04) / 2, sh = (L + 0.04 - s0) / 2;
    f.senseFx = b.createFixture(new pl.Box(sh, 0.08, Vec2(dx * sc, hy + dy * sc), a),
      { density: 0, isSensor: true, filterGroupIndex: f.grp, filterCategoryBits: CAT.SENSE, filterMaskBits: CAT.BODY, userData: { k: 'sense', f } });
    f.wfx.push(f.senseFx);
  };

  function drive(j, target, torque, gain) {
    j.setMaxMotorTorque(torque);
    j.setMotorSpeed(clamp((target - j.getJointAngle()) * (gain || 15), -30, 30));
  }

  S.isEnemy = function (a, b) { return a !== b && a.side !== b.side; };
  S.nearestEnemy = function (f) {
    let best = null, bd = 1e9; const x = f.b[0].getPosition().x;
    for (const o of this.fighters) if (o.alive && this.isEnemy(f, o)) { const d = Math.abs(o.b[0].getPosition().x - x); if (d < bd) { bd = d; best = o; } }
    return best;
  };
  S.limp = function (f) { for (const k in f.j) { f.j[k].setMaxMotorTorque(k === 'neck' ? 1.5 : 2.5); f.j[k].setMotorSpeed(0); } };

  S.autoAim = function (f, W) {
    const tgt = this.nearestEnemy(f), sp = f.b[8].getPosition();
    if (!tgt) return f.facing > 0 ? 0 : Math.PI;
    const tp = tgt.b[0].getPosition(), dx = tp.x - sp.x, dy = tp.y + 0.15 - sp.y;
    const t = Math.hypot(dx, dy) / (W.speed || 30), drop = 0.5 * G * (W.grav || 0) * t * t;
    return Math.atan2(dy + drop, dx);
  };
  S.startReload = function (f, W) { if (f.reloadT > 0 || W.kind === 'melee') return; f.reloadT = W.reload; f.draw = 0; const p = f.b[9].getPosition(); this.ev('reload', p.x, p.y, 0); };

  S.control = function (f, dt) {
    const t = f.b[0];
    f.stun = Math.max(0, f.stun - dt); f.jumpT -= dt; f.dashT -= dt; f.dashCd -= dt; f.atkCd -= dt; f.comboT -= dt; f.clashT -= dt; f.cd -= dt;
    f.wantAtk -= dt; f.wantJump -= dt; f.wantDash -= dt;
    let W = this.weapon(f);
    if (f.reloadT > 0) { f.reloadT -= dt; if (f.reloadT <= 0) { f.reloadT = 0; f.ws[f.slot].ammo = W.mag; } }
    if (!f.alive) { this.limp(f); return; }
    const frozen = this.state === 'intro' || this.state === 'over';
    const inp = frozen ? { l: 0, r: 0, b: 0, a: f.la, j: f.lj, d: f.ld, h: 0, am: null, w: f.lw, rl: f.lrl } : this.inputs[f.id];
    if (inp.a !== f.la) { f.la = inp.a; f.wantAtk = 0.25; }
    if (inp.j !== f.lj) { f.lj = inp.j; f.wantJump = 0.15; }
    if (inp.d !== f.ld) { f.ld = inp.d; f.wantDash = 0.15; }
    if (inp.w !== f.lw) {
      f.lw = inp.w;
      if (!f.atk) { f.slot ^= 1; f.reloadT = 0; f.draw = 0; this.setWeapon(f); W = this.weapon(f); f.cd = 0.25; const p = f.b[9].getPosition(); this.ev('swap', p.x, p.y, 0);
        if (W.kind !== 'melee' && f.ws[f.slot].ammo <= 0) this.startReload(f, W); }
    }
    const ranged = W.kind !== 'melee';
    const pos = t.getPosition(), v = t.getLinearVelocity(), ang = t.getAngle();
    const grounded = pos.y < STAND_Y + 0.15 && f.jumpT <= 0;
    if (grounded && !f.grounded && v.y < -4) this.ev('land', pos.x, 0, Math.min(1, -v.y / 10));
    f.grounded = grounded;
    if (ranged) {
      const manual = inp.am != null && isFinite(inp.am);
      f.aim = manual ? +inp.am : this.autoAim(f, W);
      if (inp.rl !== f.lrl) { f.lrl = inp.rl; if (f.ws[f.slot].ammo < W.mag) this.startReload(f, W); }
    } else if (inp.rl !== f.lrl) f.lrl = inp.rl;
    // facing
    if (!f.atk && f.dashT <= 0 && f.stun <= 0) {
      let want = f.facing;
      if (ranged) want = Math.cos(f.aim) >= 0 ? 1 : -1;
      else { const tgt = this.nearestEnemy(f); if (tgt) want = Math.sign(tgt.b[0].getPosition().x - pos.x) || f.facing; }
      if (want !== f.facing) { f.turnT += dt; if (f.turnT > 0.12) { this.setFacing(f, want); f.turnT = 0; } } else f.turnT = 0;
    }
    let move = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    if (f.stun > 0) move = 0;
    f.blocking = !!inp.b && !ranged && !f.atk && f.stun <= 0;
    const speed = (f.blocking ? 1.6 : 4.2) * f.spd * (W.move || 1) * (ranged && (inp.h || f.draw > 0) ? 0.7 : 1);
    let vx = v.x, vy = v.y;
    if (f.dashT > 0) vx = f.dashDir * 12;
    else { const bl = grounded ? (f.stun > 0 ? 0.02 : 0.25) : 0.06; vx += (move * speed - vx) * bl; }
    if (grounded && f.stun <= 0.15) {
      const vyDes = clamp((STAND_Y - pos.y) * 12, -6, 4);
      vy += (vyDes - vy) * 0.35;
      t.applyForceToCenter(Vec2(0, (f.mass - t.getMass()) * G * 0.9), true);
    }
    t.setLinearVelocity(Vec2(vx, vy));
    if (f.wantJump > 0 && grounded && f.stun <= 0) {
      f.wantJump = 0; f.jumpT = 0.3;
      const jv = 8.5 * (1 - (1 - f.spd) * 0.5);
      for (const b of f.b) { const bv = b.getLinearVelocity(); b.setLinearVelocity(Vec2(bv.x, jv)); }
      this.ev('jump', pos.x, 0, 0.5);
    }
    if (f.wantDash > 0 && f.dashCd <= 0 && f.stun <= 0) {
      f.wantDash = 0; f.dashCd = 0.9; f.dashT = 0.17 * (0.6 + 0.4 * f.spd); f.dashDir = move || f.facing;
      this.ev('dash', pos.x, pos.y, f.dashDir);
    }
    const fc = f.facing, st = f.stun > 0 ? 0.25 : 1;
    // ---- weapon use ----
    if (ranged) {
      const wsl = f.ws[f.slot];
      if (W.kind === 'gun') {
        if ((f.wantAtk > 0 || (W.auto && inp.h)) && f.cd <= 0 && f.reloadT <= 0 && f.stun <= 0) {
          f.wantAtk = 0;
          if (wsl.ammo > 0) { this.fire(f, W, 1); wsl.ammo--; f.cd = W.cd; if (wsl.ammo === 0) this.startReload(f, W); }
          else this.startReload(f, W);
        }
      } else {
        if (inp.h && f.reloadT <= 0 && wsl.ammo > 0 && f.stun <= 0) f.draw = Math.min(1, f.draw + dt / 0.6);
        else if (!inp.h && f.draw > 0) { if (f.draw > 0.15 && wsl.ammo > 0) { this.fire(f, W, f.draw); wsl.ammo--; this.startReload(f, W); } f.draw = 0; }
        if (f.stun > 0) f.draw = 0;
        f.wantAtk = 0;
      }
      f.atk = null;
    } else if (f.wantAtk > 0 && !f.atk && f.stun <= 0 && f.atkCd <= 0) {
      f.wantAtk = 0;
      const type = !grounded ? 'chop' : (f.comboT > 0 && f.lastType === 'chop') ? 'up' : 'chop';
      f.atk = { type, ph: 'wind', t: 0, hit: new Set() };
    }
    if (f.atk) {
      const A = f.atk; A.t += dt;
      const k = 1 / (W.spd || 1), PH = { wind: 0.13 * k, strike: 0.17 * Math.sqrt(k), rec: 0.16 * k };
      if (A.t > PH[A.ph]) {
        A.t = 0; A.ph = A.ph === 'wind' ? 'strike' : A.ph === 'strike' ? 'rec' : null;
        if (A.ph === 'strike') this.ev('swing', pos.x, pos.y, W.dmg);
        if (!A.ph) { f.lastType = A.type; f.comboT = 0.45; f.atk = null; f.atkCd = 0.05; }
      }
    }
    // upright
    let tgtAng = clamp(-vx * 0.03, -0.3, 0.3);
    if (f.atk && f.atk.ph === 'strike') tgtAng += -fc * 0.25;
    if (f.atk && f.atk.ph === 'wind') tgtAng += fc * 0.12;
    if (f.blocking) tgtAng += fc * 0.08;
    const bal = f.stun > 0 ? 0.03 : 0.35;
    const w = t.getAngularVelocity();
    const wDes = clamp(wrap(tgtAng - ang) * 14, -12, 12);
    t.setAngularVelocity(w + (wDes - w) * bal);
    // arms
    if (ranged) {
      const shT = wrap(f.aim + Math.PI / 2 - ang);
      drive(f.j.shF, shT, 200 * st, 25); drive(f.j.elF, 0.06 * fc, 140 * st, 25);
      if (W.kind === 'bow') { drive(f.j.shB, shT, 90 * st, 20); drive(f.j.elB, (0.25 + f.draw * 2.1) * fc, 80 * st, 20); }
      else if (W.two) { drive(f.j.shB, wrap(shT - 0.35 * fc), 90 * st, 20); drive(f.j.elB, 0.8 * fc, 70 * st, 20); }
      else { drive(f.j.shB, 0.4 * fc, 40 * st); drive(f.j.elB, 1.3 * fc, 30 * st); }
    } else {
      let sh = 0.9, el = 0.8, str = 90 * Math.sqrt(W.tq / 260);
      if (f.blocking) { sh = 1.25; el = 1.6; str = 160 * Math.sqrt(W.tq / 260); }
      if (f.atk) {
        const P = f.atk.type === 'chop' ? { wind: [2.7, 1.3], strike: [0.2, 0.1], rec: [0.6, 0.5] } : { wind: [-0.9, 0.2], strike: [2.3, 0.7], rec: [1.4, 0.9] };
        [sh, el] = P[f.atk.ph]; str = f.atk.ph === 'strike' ? W.tq : f.atk.ph === 'wind' ? W.tq * 0.6 : 90;
      }
      drive(f.j.shF, sh * fc, str * st, 22); drive(f.j.elF, el * fc, str * 0.7 * st, 22);
      drive(f.j.shB, (f.atk ? -0.4 : f.blocking ? 0.9 : 0.5) * fc, 40 * st); drive(f.j.elB, 1.5 * fc, 30 * st);
    }
    // legs
    let hF, kF, hB, kB;
    if (!grounded) { hF = 1.0; kF = -1.4; hB = 0.2; kB = -0.9; }
    else if (Math.abs(vx) > 0.4 && f.dashT <= 0) {
      f.walk += vx * fc * dt * 5.5; const p = f.walk;
      hF = 0.55 * Math.sin(p) + 0.1; kF = -0.15 - 0.9 * Math.max(0, Math.cos(p));
      hB = 0.55 * Math.sin(p + Math.PI) + 0.1; kB = -0.15 - 0.9 * Math.max(0, Math.cos(p + Math.PI));
    } else if (f.dashT > 0) { hF = 0.9; kF = -0.6; hB = -0.6; kB = -0.3; }
    else if (f.blocking || ranged) { hF = 0.5; kF = -0.6; hB = -0.35; kB = -0.3; }
    else { hF = 0.3; kF = -0.35; hB = -0.25; kB = -0.2; }
    drive(f.j.hipF, hF * fc, 70 * st); drive(f.j.kneeF, kF * fc, 60 * st);
    drive(f.j.hipB, hB * fc, 70 * st); drive(f.j.kneeB, kB * fc, 60 * st);
    drive(f.j.neck, clamp(-ang, -0.5, 0.5), 20 * st);
  };

  // ---- ranged ----
  S.fire = function (f, W, power) {
    const fb = f.b[9], a0 = fb.getAngle() - Math.PI / 2;
    const hand = fb.getWorldPoint(Vec2(0, -D.fa / 2));
    const mx = hand.x + Math.cos(a0) * W.len, my = hand.y + Math.sin(a0) * W.len;
    for (let i = 0; i < W.pellets; i++) {
      const a = a0 + (Math.random() - 0.5) * 2 * W.spread;
      const sp = W.speed * (W.kind === 'bow' ? 0.45 + 0.55 * power : 1) * (W.pellets > 1 ? 0.9 + Math.random() * 0.2 : 1);
      this.spawnProj(f, W, mx, my, a, sp, W.dmg * (W.kind === 'bow' ? 0.35 + 0.65 * power : 1));
    }
    const dx = Math.cos(a0), dy = Math.sin(a0);
    if (W.recoil) {
      fb.applyLinearImpulse(Vec2(-dx * W.recoil * 1.5, -dy * W.recoil * 1.5 + W.recoil * 0.8), hand, true);
      const t = f.b[0], v = t.getLinearVelocity(); t.setLinearVelocity(Vec2(v.x - dx * W.recoil * 0.9, v.y));
    }
    this.ev(W.key, mx, my, a0);
  };
  S.spawnProj = function (f, W, x, y, a, sp, dmg) {
    if (this.projs.length > 70) { const o = this.projs.shift(); this.world.destroyBody(o.b); }
    const arrow = W.kind === 'bow';
    const b = this.world.createBody({ type: 'dynamic', bullet: true, position: Vec2(x, y), gravityScale: W.grav, angle: a,
      linearVelocity: Vec2(Math.cos(a) * sp, Math.sin(a) * sp), fixedRotation: true });
    b.createFixture(arrow ? new pl.Box(0.35, 0.012) : new pl.Circle(0.02), { density: arrow ? 3 : 30, friction: 0.6, restitution: 0.1, filterCategoryBits: CAT.PROJ, filterMaskBits: CAT.GROUND });
    this.projs.push({ b, arrow, w: W.key, owner: f, side: f.side, dmg, life: arrow ? 4 : 1.6, prev: { x, y }, sx: x, sy: y, stuck: false, ang: a });
  };
  S.removeProj = function (p) { const i = this.projs.indexOf(p); if (i >= 0) this.projs.splice(i, 1); this.world.destroyBody(p.b); };
  S.updateProjs = function () {
    for (const p of this.projs.slice()) {
      p.life -= DT;
      if (p.life <= 0) { this.removeProj(p); continue; }
      if (p.stuck) continue;
      const cur = p.b.getPosition(), v = p.b.getLinearVelocity();
      if (p.arrow) p.ang = Math.atan2(v.y, v.x);
      // arrow tip leads the body centre
      const lead = p.arrow ? 0.35 : 0;
      const ax = p.prev.x, ay = p.prev.y, bx = cur.x + Math.cos(p.ang) * lead, by = cur.y + Math.sin(p.ang) * lead;
      if (Math.hypot(bx - ax, by - ay) < 1e-4) continue;
      let best = null;
      this.world.rayCast(Vec2(ax, ay), Vec2(bx, by), (fix, pt, n, fr) => {
        const body = fix.getBody(); if (body === p.b) return -1;
        const ud = fix.getUserData();
        if (fix.isSensor()) return -1;
        if (ud && ud.k === 'body') {
          if (ud.f === p.owner || (this.teams && ud.f.side === p.side && ud.f.alive)) return -1;
          best = { fix, ud, pt: Vec2(pt.x, pt.y), fr }; return fr;
        }
        if (ud && ud.k === 'blade') {
          if (ud.f !== p.owner && ud.f.blocking && this.isEnemy(ud.f, p.owner)) { best = { blade: true, ud, pt: Vec2(pt.x, pt.y), fr }; return fr; }
          return -1;
        }
        if (body.isStatic()) { best = { ground: true, pt: Vec2(pt.x, pt.y), fr }; return fr; }
        return -1;
      });
      p.prev = { x: bx, y: by };
      if (!best) { if (Math.abs(cur.x) > ARENA + 2 || cur.y < -1) this.removeProj(p); continue; }
      if (best.ground) {
        if (p.arrow) { this.stickArrow(p, null, best.pt); this.ev('thud', best.pt.x, best.pt.y, 0.3); }
        else { this.ev('ric', best.pt.x, best.pt.y, 0.3); this.removeProj(p); }
      } else if (best.blade) { this.ev('block', best.pt.x, best.pt.y, 1); this.removeProj(p); }
      else this.projHit(p, best.ud, best.fix, best.pt, v);
    }
  };
  S.stickArrow = function (p, body, pt) {
    p.stuck = true; p.life = body ? 2.5 : 3.5;
    const dx = Math.cos(p.ang), dy = Math.sin(p.ang);
    p.b.setLinearVelocity(Vec2(0, 0));
    p.b.setTransform(Vec2(pt.x - dx * 0.2, pt.y - dy * 0.2), p.ang);
    if (!body) { p.b.setType('static'); return; }
    p.b.getFixtureList().setFilterData({ groupIndex: 0, categoryBits: CAT.PROJ, maskBits: 0 });
    p.b.setFixedRotation(false);
    p.b.setLinearVelocity(body.getLinearVelocity());
    this.world.createJoint(new pl.WeldJoint({}, body, p.b, Vec2(pt.x, pt.y)));
  };
  S.projHit = function (p, ud, fix, pt, v) {
    const W = WEAPONS[p.w], def = ud.f, tb = fix.getBody();
    const sp = Math.hypot(v.x, v.y) || 1, dx = v.x / sp, dy = v.y / sp;
    let dmg = p.dmg;
    if (W.falloff) dmg *= clamp(1.25 - Math.hypot(pt.x - p.sx, pt.y - p.sy) / 8, 0.35, 1);
    if (p.arrow) dmg *= clamp(sp / W.speed, 0.4, 1.1);
    tb.applyLinearImpulse(Vec2(dx * W.kb * 5, dy * W.kb * 5 + 0.5), pt, true);
    if (def.alive) {
      if (def.blocking && Math.sign(p.owner.b[0].getPosition().x - def.b[0].getPosition().x) === def.facing) dmg *= 0.6;
      const r = this.damage(def, ud.part, dmg, { prot: 1 - W.pen, arm: 0.5 + W.pen, pt, dx, dy });
      const t = def.b[0], tv = t.getLinearVelocity();
      t.setLinearVelocity(Vec2(tv.x + dx * (0.6 + r.raw * 0.05) * W.kb, tv.y));
      def.stun = Math.max(def.stun, r.raw > 30 ? 0.7 : r.raw > 15 ? 0.3 : 0.12);
      if (def.atk && r.raw > 15) def.atk = null;
      if (r.raw > 25) this.hitStop = Math.max(this.hitStop, 0.05);
      if (def.health <= 0) this.ko(def, dx, dy, pt);
    } else this.ev('armor', pt.x, pt.y, 0.3);
    if (p.arrow) this.stickArrow(p, tb, pt); else this.removeProj(p);
  };

  // ---- damage + armour ----
  S.damage = function (def, part, raw, o) {
    const pi = PART_PIECE[part], pc = def.pieces[pi];
    let dmg = raw * PART_MUL[part], flesh = true;
    if (pc.hp > 0) {
      const A = ARMOUR[pc.type], prot = clamp(A.prot * o.prot, 0, 0.9);
      pc.hp -= raw * o.arm; dmg *= (1 - prot); flesh = false;
      if (pc.hp <= 0) { pc.hp = 0; this.breakPiece(def, pi, o.pt, o.dx, o.dy); }
    } else if (pc.type > 0) dmg *= 1.3; // exposed after the armour broke
    def.health = Math.max(0, def.health - dmg);
    this.ev(flesh ? 'blood' : 'armor', o.pt.x, o.pt.y, Math.min(1.5, raw / 20));
    return { dmg, raw, flesh };
  };
  S.breakPiece = function (def, pi, pt, dx, dy) {
    const pc = def.pieces[pi];
    const partOf = [1, 0, 3, 9, 5, 7][pi], src = def.b[partOf], sp = src.getPosition(), sv = src.getLinearVelocity();
    this.ev('break', pt.x, pt.y, pc.type);
    if (this.debris.length > 16) { const o = this.debris.shift(); this.world.destroyBody(o.b); }
    const b = this.world.createBody({ type: 'dynamic', position: Vec2(sp.x, sp.y), angle: src.getAngle(), angularDamping: 0.3,
      linearVelocity: Vec2(sv.x + dx * 4 + (Math.random() - 0.5) * 2, sv.y + Math.abs(dy) * 2 + 4), angularVelocity: (Math.random() - 0.5) * 20 });
    const shape = pi === 0 ? new pl.Circle(0.13) : pi === 1 ? new pl.Box(0.14, 0.18) : pi < 4 ? new pl.Box(0.055, 0.13) : new pl.Box(0.07, 0.17);
    b.createFixture(shape, { density: 4, friction: 0.6, restitution: 0.25, filterCategoryBits: CAT.DEBRIS, filterMaskBits: CAT.GROUND | CAT.DEBRIS });
    this.debris.push({ b, piece: pi, fid: def.id, type: pc.type, life: 8 });
  };

  S.bladeGeom = function (f) {
    const b = f.b[9], a = b.getAngle() + SWORD_A(f.facing);
    const hand = b.getWorldPoint(Vec2(0, -D.fa / 2));
    return { hand, dx: Math.cos(a), dy: Math.sin(a) };
  };
  S.checkHits = function (f) {
    const A = f.atk; if (!A || A.ph !== 'strike' || !f.alive || !f.senseFx) return;
    for (let ce = f.b[9].getContactList(); ce; ce = ce.next) {
      const c = ce.contact; if (!c.isTouching()) continue;
      let fa = c.getFixtureA(), fb = c.getFixtureB();
      if (fb === f.senseFx) { const t = fa; fa = fb; fb = t; }
      if (fa !== f.senseFx) continue;
      const ud = fb.getUserData();
      if (!ud || ud.k !== 'body' || !this.isEnemy(f, ud.f) || !ud.f.alive || A.hit.has(ud.f.id)) continue;
      this.applyHit(f, ud.f, ud.part, fb.getBody());
      if (!f.atk) return;
    }
  };
  S.applyHit = function (att, def, part, tb) {
    const A = att.atk, W = this.weapon(att); A.hit.add(def.id);
    const bg = this.bladeGeom(att), tp = tb.getPosition();
    const s = clamp((tp.x - bg.hand.x) * bg.dx + (tp.y - bg.hand.y) * bg.dy, 0.1, W.len);
    const pt = Vec2(bg.hand.x + bg.dx * s, bg.hand.y + bg.dy * s);
    const vs = att.b[9].getLinearVelocityFromWorldPoint(pt), vt = tb.getLinearVelocity();
    const rx = vs.x - vt.x, ry = vs.y - vt.y, rel = Math.hypot(rx, ry);
    if (rel < 1.5) { A.hit.delete(def.id); return; }
    const raw = (6 + Math.min(rel, 20) * 0.95) * W.dmg;
    const ax = att.b[0].getPosition().x, dxp = def.b[0].getPosition().x;
    const blocked = def.blocking && Math.sign(ax - dxp) === def.facing;
    const dir = Math.sign(dxp - ax) || att.facing;
    const nx = rel > 0 ? rx / rel : dir, ny = rel > 0 ? ry / rel : 0;
    let r;
    if (blocked) {
      att.stun = 0.3; att.atk = null; att.atkCd = 0.2;
      def.health = Math.max(0, def.health - raw * 0.1);
      r = { dmg: raw * 0.1, raw: raw * 0.1, flesh: false };
      this.ev('block', pt.x, pt.y, 1);
      const at = att.b[0], v = at.getLinearVelocity(); at.setLinearVelocity(Vec2(v.x - dir * 3, v.y));
    } else r = this.damage(def, part, raw, { prot: W.prot, arm: W.arm, pt, dx: nx, dy: ny });
    const J = blocked ? 1.5 : Math.min(22, 3 + raw * 0.5) * W.kb;
    tb.applyLinearImpulse(Vec2(nx * J, ny * J), pt, true);
    const t = def.b[0], tv = t.getLinearVelocity();
    t.setLinearVelocity(Vec2(tv.x + dir * (blocked ? 1.2 : 1.5 + raw * 0.12) * W.kb, tv.y + (raw > 25 && !blocked ? 2.5 : 0)));
    if (!blocked) {
      def.stun = Math.max(def.stun, raw > 26 ? 0.9 : raw > 14 ? 0.45 : 0.22);
      if (def.atk && raw > 10) def.atk = null;
      if (raw > 18) this.hitStop = Math.max(this.hitStop, 0.07);
    }
    if (def.health <= 0) this.ko(def, nx, ny, pt);
  };

  S.ko = function (def, nx, ny, pt) {
    if (!def.alive) return;
    def.alive = false; def.atk = null; def.blocking = false; def.draw = 0; this.limp(def);
    for (const b of def.b) { const v = b.getLinearVelocity(); b.setLinearVelocity(Vec2(v.x + nx * 4, v.y + Math.abs(ny) * 2 + 2.5)); }
    this.ev('ko', pt.x, pt.y, 1);
    const sides = new Set(this.fighters.filter((f) => f.alive).map((f) => f.side));
    if (sides.size <= 1 && this.state === 'fight') {
      this.slowT = 1.5; this.koCam = def.id;
      this.endRound(sides.size ? [...sides][0] : -1, 'K.O.!');
    } else this.slowT = Math.max(this.slowT, 0.45);
  };
  S.endRound = function (winner, msg) {
    this.state = 'ko'; this.stateT = 0; this.winner = winner; this.msg = msg;
    if (winner >= 0) this.scores[winner]++;
  };

  // ---- computer players ----
  S.aiThink = function (f, dt) {
    const p = this.players[f.id], dc = DIFF[p.cpu] || DIFF.normal, mem = this.ai[f.id], inp = this.inputs[f.id];
    mem.t -= dt;
    if (!f.alive) { inp.h = 0; return; }
    const tgt = this.nearestEnemy(f);
    if (!tgt) { inp.l = inp.r = inp.b = inp.h = 0; return; }
    const mx = f.b[0].getPosition().x, tx = tgt.b[0].getPosition().x, dx = tx - mx, dist = Math.abs(dx), dir = Math.sign(dx) || 1;
    const W = this.weapon(f), O = WEAPONS[f.ws[1 - f.slot].key], ranged = W.kind !== 'melee';
    if (ranged) { inp.am = this.autoAim(f, W) + mem.err; } else inp.am = null;
    if (mem.drawT > 0) { mem.drawT -= dt; if (mem.drawT <= 0) inp.h = 0; }
    const threat = !ranged && tgt.atk && tgt.atk.ph !== 'rec' && dist < 2.4;
    if (mem.t > 0) {
      if (threat && !mem.threatSeen) { mem.threatSeen = true; mem.blockAt = dc.react * 0.8; mem.willBlock = Math.random() < dc.block; }
      if (mem.threatSeen && mem.willBlock) { mem.blockAt -= dt; if (mem.blockAt <= 0) { inp.b = 1; inp.l = inp.r = 0; } }
      if (!threat) mem.threatSeen = false;
      return;
    }
    mem.t = dc.react * (0.6 + Math.random() * 0.8);
    mem.err = (Math.random() - 0.5) * 2 * dc.aimErr;
    inp.l = inp.r = inp.b = 0;
    if (!threat) mem.threatSeen = false;
    if (ranged && dist < 2.3 && O.kind === 'melee' && Math.random() < 0.7) { inp.h = 0; inp.w++; return; }
    if (!ranged && O.kind !== 'melee' && dist > 6 && Math.random() < 0.35) { inp.w++; return; }
    if (ranged) {
      const want = W.kind === 'bow' ? 7 : W.key === 'shotgun' ? 3.5 : 6;
      if (dist < want - 1.5) dir > 0 ? (inp.l = 1) : (inp.r = 1);
      else if (dist > want + 2) dir > 0 ? (inp.r = 1) : (inp.l = 1);
      if (W.kind === 'bow') { if (!inp.h && f.reloadT <= 0 && Math.random() < dc.aggr) { inp.h = 1; mem.drawT = 0.45 + Math.random() * 0.35; } }
      else if (W.auto) { inp.h = Math.random() < dc.aggr ? 1 : 0; }
      else if (Math.random() < dc.aggr) inp.a++;
      if (Math.random() < dc.jump) inp.j++;
      return;
    }
    const range = dc.spacing * (0.6 + 0.4 * W.len), lowHp = f.health < 35;
    if (threat && mem.willBlock) { inp.b = 1; if (Math.random() < dc.dash * 0.5) { inp.d++; inp.b = 0; (dir > 0 ? (inp.l = 1) : (inp.r = 1)); } return; }
    if (dist > range + 0.3) {
      dir > 0 ? (inp.r = 1) : (inp.l = 1);
      if (dist > 3.5 && Math.random() < dc.dash) inp.d++;
      if (Math.random() < dc.jump) inp.j++;
      if (dist < range + 1.2 && Math.random() < dc.aggr * 0.35) inp.a++;
    } else if (dist < 0.85) {
      dir > 0 ? (inp.l = 1) : (inp.r = 1);
      if (Math.random() < dc.aggr * 0.5) inp.a++;
    } else {
      if (f.atkCd <= 0 && !f.atk && Math.random() < dc.aggr) { inp.a++; if (Math.random() < 0.5) (dir > 0 ? (inp.r = 1) : (inp.l = 1)); }
      else if (lowHp && Math.random() < 0.3) { dir > 0 ? (inp.l = 1) : (inp.r = 1); }
      else if (Math.random() < 0.3) { Math.random() < 0.5 ? (inp.l = 1) : (inp.r = 1); }
      if (tgt.stun > 0 && Math.random() < dc.aggr) inp.a++;
      if (Math.random() < dc.jump * 2) { inp.j++; inp.a++; }
    }
  };

  S.stepFixed = function () {
    for (const f of this.fighters) { if (this.players[f.id].cpu && this.state !== 'intro') this.aiThink(f, DT); this.control(f, DT); }
    const fs = this.fighters;
    for (let i = 0; i < fs.length; i++) for (let k = i + 1; k < fs.length; k++) {
      const a = fs[i], b = fs[k]; if (!a.alive || !b.alive) continue;
      const pa = a.b[0].getPosition(), pb = b.b[0].getPosition(), dx = pb.x - pa.x;
      if (Math.abs(dx) < 0.55 && Math.abs(pb.y - pa.y) < 1.0) {
        const push = (0.55 - Math.abs(dx)) * 6 * (Math.sign(dx) || 1);
        const va = a.b[0].getLinearVelocity(), vb = b.b[0].getLinearVelocity();
        a.b[0].setLinearVelocity(Vec2(va.x - push, va.y)); b.b[0].setLinearVelocity(Vec2(vb.x + push, vb.y));
      }
    }
    this.world.step(DT, 8, 3);
    for (const [a, b, p] of this.clashQ) {
      if (!this.isEnemy(a, b)) continue;
      if (a.clashT > 0 && b.clashT > 0) continue;
      const sa = a.atk && a.atk.ph === 'strike', sb = b.atk && b.atk.ph === 'strike';
      if (!sa && !sb) continue;
      a.clashT = b.clashT = 0.2;
      const pt = p || this.bladeGeom(a).hand;
      this.ev('clash', pt.x, pt.y, 1);
      for (const f of [a, b]) if (f.atk && f.atk.ph === 'strike') { f.atk.ph = 'rec'; f.atk.t = 0; f.stun = Math.max(f.stun, 0.12); }
    }
    this.clashQ.length = 0;
    for (const f of this.fighters) this.checkHits(f);
    this.updateProjs();
    for (const d of this.debris.slice()) { d.life -= DT; if (d.life <= 0) { this.debris.splice(this.debris.indexOf(d), 1); this.world.destroyBody(d.b); } }
  };

  S.update = function (realDt) {
    const dt = Math.min(realDt, 0.05);
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    this.slowT -= dt; this.timeScale = this.slowT > 0 ? (this.koCam >= 0 ? 0.25 : 0.4) : 1;
    this.acc += dt * this.timeScale;
    let n = 0;
    while (this.acc >= DT && n < 4) { this.acc -= DT; this.stepFixed(); n++; }
    if (n === 4) this.acc = 0;
    this.stateT += dt;
    if (this.state === 'intro') {
      this.msg = this.stateT < 1.1 ? 'Round ' + this.round : 'FIGHT!';
      if (this.stateT > 1.6) { this.state = 'fight'; this.stateT = 0; }
    } else if (this.state === 'fight') {
      if (this.stateT > 0.6) this.msg = '';
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        const hp = new Array(this.nSides).fill(0);
        for (const f of this.fighters) if (f.alive) hp[f.side] += f.health;
        const order = hp.map((h, i) => [h, i]).sort((a, b) => b[0] - a[0]);
        this.endRound(order[0][0] > (order[1] ? order[1][0] : 0) ? order[0][1] : -1, 'Time up!');
      }
    } else if (this.state === 'ko') {
      if (this.stateT > 1.6 && this.stateT < 1.7) this.msg = this.winner >= 0 ? this.sideName(this.winner) + ' wins the round' : 'Draw';
      if (this.stateT > 3.4) {
        const champ = this.scores.findIndex((s) => s >= WIN_SCORE);
        if (champ >= 0) { this.state = 'over'; this.stateT = 0; this.champ = champ; this.msg = this.sideName(champ) + ' wins the match!'; }
        else this.startRound();
      }
    }
  };

  S.snapshot = function () {
    return {
      f: this.fighters.map((f) => {
        const p = [];
        for (const b of f.b) { const q = b.getPosition(); p.push(q.x, q.y, b.getAngle()); }
        const fl = (f.alive ? 1 : 0) | (f.blocking ? 2 : 0) | (f.atk && f.atk.ph === 'strike' ? 4 : 0) | (f.stun > 0 ? 8 : 0);
        const ar = f.pieces.map((pc) => (pc.type === 0 ? '-' : pc.hp <= 0 ? 'x' : String(Math.max(1, Math.ceil(pc.hp / pc.max * 9))))).join('');
        return { p, h: f.health, fa: f.facing, fl, ar, wp: WLIST.indexOf(f.ws[f.slot].key), am: f.ws[f.slot].ammo, rl: f.reloadT > 0 ? 1 : 0, dr: Math.round(f.draw * 10) / 10, sd: f.side };
      }),
      pr: this.projs.map((p) => { const q = p.b.getPosition(); return [q.x, q.y, p.stuck ? p.b.getAngle() : p.ang, p.arrow ? 1 : 0]; }),
      db: this.debris.map((d) => { const q = d.b.getPosition(); return [q.x, q.y, d.b.getAngle(), d.piece, d.fid, d.type, Math.min(1, d.life / 1.5)]; }),
      sc: this.scores.slice(), st: this.state, tm: Math.ceil(this.timer), rd: this.round, msg: this.msg, ts: this.timeScale,
      champ: this.state === 'over' ? this.champ : -1, kf: this.slowT > 0 ? this.koCam : -1, tmode: this.teams ? 1 : 0
    };
  };

  window.RSGame = { Sim, D, SWORD_A, ARENA, STAND_Y, HIP_OFF, SHO_OFF, DIFF, WEAPONS, WLIST, MELEE, RANGED, ARMOUR, DEFAULT_LOADOUT, randomLoadout, sanitizeLoadout, loadoutStats };
})();

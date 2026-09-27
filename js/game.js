/* Ragdoll Slash v3 - active-ragdoll physics + game rules (runs on solo device or on the host) */
(function () {
  'use strict';
  const pl = planck, Vec2 = pl.Vec2;
  const G = 20, ARENA = 9, DT = 1 / 60, WIN_SCORE = 3, ROUND_TIME = 75;
  const D = { tw: 0.15, th: 0.3, hr: 0.14, ua: 0.3, fa: 0.28, thg: 0.43, shn: 0.43, aw: 0.05, fw: 0.045, lw: 0.07 };
  const HIP_OFF = 0.26, SHO_OFF = 0.24;
  const STAND_Y = 0.83 + HIP_OFF;
  const CAT = { GROUND: 1, BODY: 2, BLADE: 4, SENSE: 8, PROJ: 16, DEBRIS: 32, SHIELD: 64 };
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
  // off-hand shields (one-handed weapons only): hp, speed cost, chance to catch a frontal blow when raised, size
  const SHIELDS = [
    { name: 'None', hp: 0, slow: 0 },
    { name: 'Round', hp: 70, slow: 0.025, cover: 0.85, w: 0.27, h: 0.27 },
    { name: 'Kite', hp: 100, slow: 0.045, cover: 0.93, w: 0.22, h: 0.4 },
    { name: 'Tower', hp: 150, slow: 0.09, cover: 1.0, w: 0.24, h: 0.56 }
  ];
  const SWORD_A = (fc) => (fc > 0 ? -1.0 : Math.PI + 1.0);
  const WEAPONS = {
    longsword: { one: 1, name: 'Longsword', kind: 'melee', len: 1.0, w: 0.028, dens: 6, mass: 1.4, sharp: 1.0, kb: 1.0, arm: 1.0, prot: 1.0, edge: 1, style: 'sword', T: [0.16, 0.12, 0.1, 0.16], s0: 0.15, tq: 420 },
    greatsword: { name: 'Greatsword', kind: 'melee', len: 1.38, w: 0.04, dens: 6, mass: 3.0, sharp: 0.95, kb: 1.0, arm: 1.25, prot: 0.9, edge: 1, style: 'heavy', T: [0.34, 0.15, 0.16, 0.3], s0: 0.2, tq: 820, move: 0.9 },
    katana: { one: 1, name: 'Katana', kind: 'melee', len: 1.05, w: 0.022, dens: 4, mass: 1.1, sharp: 1.3, kb: 0.9, arm: 0.6, prot: 1.15, edge: 1, style: 'sword', T: [0.11, 0.1, 0.08, 0.12], s0: 0.15, tq: 360 },
    axe: { one: 1, name: 'Battle axe', kind: 'melee', len: 0.95, w: 0.022, dens: 5, mass: 2.2, sharp: 1.05, kb: 1.0, arm: 1.6, prot: 0.85, edge: 0, style: 'heavy', T: [0.26, 0.13, 0.14, 0.24], s0: 0.62, tq: 560, head: 0.09 },
    spear: { one: 1, name: 'Spear', kind: 'melee', len: 1.75, w: 0.018, dens: 3.5, mass: 1.8, sharp: 1.15, vf: 0.8, kb: 1.0, arm: 0.9, prot: 0.8, edge: 0, style: 'spear', T: [0.18, 0.12, 0.1, 0.2], s0: 1.3, tq: 520 },
    mace: { one: 1, name: 'Mace', kind: 'melee', len: 0.85, w: 0.022, dens: 5, mass: 2.4, sharp: 0.85, kb: 1.15, arm: 2.0, prot: 0.65, edge: 0, style: 'heavy', T: [0.28, 0.13, 0.14, 0.26], s0: 0.58, tq: 600, head: 0.1 },
    pistol: { one: 1, name: 'Pistol', kind: 'gun', len: 0.26, dmg: 19, speed: 60, mag: 8, reload: 1.4, cd: 0.32, pen: 0.3, kb: 1.0, imp: 0.5, spread: 0.015, pellets: 1, grav: 0.1, recoil: 0.6 },
    rifle: { name: 'Rifle', kind: 'gun', len: 0.85, dmg: 11, speed: 85, mag: 20, reload: 2.2, cd: 0.14, auto: true, pen: 0.6, kb: 0.9, imp: 0.6, spread: 0.05, pellets: 1, two: true, grav: 0.05, recoil: 0.5 },
    shotgun: { name: 'Shotgun', kind: 'gun', len: 0.75, dmg: 8, speed: 45, mag: 5, reload: 2.4, cd: 0.8, pen: 0.1, kb: 1.5, imp: 0.45, spread: 0.16, pellets: 7, two: true, grav: 0.1, recoil: 1.6, falloff: true },
    bow: { name: 'Bow', kind: 'bow', len: 0.1, dmg: 42, speed: 34, mag: 1, reload: 0.35, cd: 0.2, pen: 0.4, kb: 1.3, imp: 0.5, spread: 0.01, pellets: 1, grav: 1, recoil: 0 }
  };
  // reaction thresholds on accumulated impact (momentum): flinch < T1 <= stagger < T2 <= knockdown
  const T1 = 12, T2 = 32, GETUP_T = 0.65, ROLL_T = 0.42;
  // attack poses per style: [weapon shoulder, weapon elbow, torso lean (+ = back), crouch]
  const STY = {
    sword: { a: { wind: [2.6, 1.2, 0.12, 0.03], strike: [0.35, 0.1, -0.22, 0.08], follow: [-0.3, 0.25, -0.28, 0.1] },
      b: { wind: [-0.6, 0.35, -0.05, 0.05], strike: [2.3, 0.5, 0.1, 0.04], follow: [2.9, 0.9, 0.14, 0.03] } },
    heavy: { a: { wind: [3.0, 1.7, 0.24, 0.02], strike: [0.2, 0.05, -0.32, 0.12], follow: [-0.55, 0.15, -0.42, 0.16] },
      b: { wind: [-0.8, 0.5, -0.1, 0.08], strike: [2.2, 0.4, 0.15, 0.05], follow: [2.8, 0.8, 0.2, 0.04] } },
    spear: { a: { wind: [0.55, 1.7, 0.12, 0.06], strike: [1.35, 0.02, -0.3, 0.1], follow: [1.3, 0.02, -0.34, 0.1] },
      b: { wind: [1.3, 1.9, 0.1, 0.02], strike: [2.1, 0.0, -0.15, 0.0], follow: [2.1, 0.05, -0.18, 0.0] } }
  };
  const WLIST = Object.keys(WEAPONS);
  WLIST.forEach((k) => (WEAPONS[k].key = k));
  const MELEE = WLIST.filter((k) => WEAPONS[k].kind === 'melee'), RANGED = WLIST.filter((k) => WEAPONS[k].kind !== 'melee');
  const DIFF = {
    easy: { react: 0.5, aggr: 0.35, block: 0.15, dash: 0.02, spacing: 1.5, jump: 0.01, aimErr: 0.22, lead: [0.25, 0.7], feint: 0 },
    normal: { react: 0.28, aggr: 0.6, block: 0.4, dash: 0.1, spacing: 1.45, jump: 0.02, aimErr: 0.1, lead: [0.1, 0.45], feint: 0.04 },
    hard: { react: 0.14, aggr: 0.85, block: 0.7, dash: 0.25, spacing: 1.4, jump: 0.03, aimErr: 0.04, lead: [0.04, 0.24], feint: 0.09 }
  };
  const DEFAULT_LOADOUT = { name: 'You', helmet: 3, chest: 3, arms: 2, legs: 2, color: 0, trim: 3, primary: 'longsword', secondary: 'pistol', shield: 0 };
  const FAT_CHANCE = { easy: 0.3, normal: 0.55, hard: 0.85 };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  function randomLoadout(r) {
    r = r || Math.random; const pick = (a) => a[Math.floor(r() * a.length)];
    const lo = { name: '', helmet: pick([0, 1, 2, 3, 3]), chest: pick([1, 2, 3, 3]), arms: pick([0, 1, 2, 3]), legs: pick([0, 1, 2, 3]),
      color: Math.floor(r() * 8), trim: Math.floor(r() * 8), primary: pick(MELEE), secondary: r() < 0.65 ? pick(RANGED) : pick(MELEE), shield: 0 };
    if (WEAPONS[lo.primary].one && r() < 0.45) lo.shield = pick([1, 2, 3]);
    return lo;
  }
  function sanitizeLoadout(lo) {
    lo = Object.assign({}, DEFAULT_LOADOUT, lo || {});
    for (const k of ['helmet', 'chest', 'arms', 'legs']) lo[k] = clamp(parseInt(lo[k], 10) || 0, 0, 3);
    lo.color = clamp(parseInt(lo.color, 10) || 0, 0, 7); lo.trim = clamp(parseInt(lo.trim, 10) || 0, 0, 7);
    if (!WEAPONS[lo.primary]) lo.primary = 'longsword'; if (!WEAPONS[lo.secondary]) lo.secondary = 'pistol';
    lo.shield = clamp(parseInt(lo.shield, 10) || 0, 0, 3);
    lo.name = String(lo.name || '').slice(0, 12);
    return lo;
  }
  function loadoutStats(lo) {
    const types = [lo.helmet, lo.chest, lo.arms, lo.arms, lo.legs, lo.legs];
    let slow = 0, prot = 0, pw = 0;
    types.forEach((t, i) => { slow += PIECE_W[i] * ARMOUR[t].slow; prot += PIECE_W[i] * ARMOUR[t].prot; pw += PIECE_W[i]; });
    slow += SHIELDS[lo.shield | 0] ? SHIELDS[lo.shield | 0].slow : 0;
    return { speed: 1 - slow, prot: prot / pw };
  }

  function Sim(players, opts) {
    // players: [{name, color, cpu, team, loadout}]
    opts = opts || {};
    this.teams = !!opts.teams;
    this.players = players;
    players.forEach((p, i) => { p.loadout = sanitizeLoadout(p.loadout); p.side = this.teams ? (p.team | 0) : i; });
    this.nSides = this.teams ? 2 : players.length;
    this.inputs = players.map(() => ({ l: 0, r: 0, b: 0, a: 0, j: 0, d: 0, h: 0, am: null, w: 0, rl: 0, k: 0, fx: 0 }));
    this.ai = players.map(() => ({ t: 0, drawT: 0, err: 0, bT: 0, fin: null, fxT: 0 }));
    this.scores = new Array(this.nSides).fill(0);
    this.round = 0; this.events = []; this.netEvents = [];
    this.world = new pl.World({ gravity: Vec2(0, -G) });
    const g = this.ground = this.world.createBody({ type: 'static' });
    const gf = { friction: 0.9, filterCategoryBits: CAT.GROUND, filterMaskBits: 0xffff };
    g.createFixture(new pl.Box(40, 1, Vec2(0, -1), 0), gf);
    g.createFixture(new pl.Box(0.5, 20, Vec2(-ARENA - 0.5, 10), 0), gf);
    g.createFixture(new pl.Box(0.5, 20, Vec2(ARENA + 0.5, 10), 0), gf);
    this.clashQ = []; this.shieldQ = []; this.fin = null; this.fatBanner = 0;
    this.world.on('begin-contact', (c) => {
      const a = c.getFixtureA().getUserData(), b = c.getFixtureB().getUserData();
      if (a && b && a.k === 'blade' && b.k === 'blade') {
        const wm = c.getWorldManifold(null); const p = wm && wm.points && wm.points[0];
        this.clashQ.push([a.f, b.f, p ? { x: p.x, y: p.y } : null]);
      } else if (a && b && ((a.k === 'blade' && b.k === 'shield') || (a.k === 'shield' && b.k === 'blade'))) {
        const wm = c.getWorldManifold(null); const p = wm && wm.points && wm.points[0];
        const bl = a.k === 'blade' ? a : b, sh = a.k === 'blade' ? b : a;
        this.shieldQ.push([bl.f, sh.f, p ? { x: p.x, y: p.y } : null]);
      }
    });
    // resting blades (and a resting blade against a shield) slide past each other instead of levering whole bodies around;
    // only a blade that is actually swinging collides for real
    const swinging = (f) => !!(f && f.atk && (f.atk.ph === 'strike' || f.atk.ph === 'follow')) || !!(f && this.fin && this.fin.fat && this.fin.by === f.id);
    this.world.on('pre-solve', (c) => {
      const a = c.getFixtureA().getUserData(), b = c.getFixtureB().getUserData();
      if (!a || !b) return;
      if ((a.k === 'blade' || a.k === 'shield') && a.f.rollT > 0 || (b.k === 'blade' || b.k === 'shield') && b.f.rollT > 0) { c.setEnabled(false); return; } // tucked in a roll
      if (a.k === 'blade' && b.k === 'blade') { if (!swinging(a.f) && !swinging(b.f)) c.setEnabled(false); }
      else if (a.k === 'blade' && b.k === 'shield') { if (!swinging(a.f)) c.setEnabled(false); }
      else if (a.k === 'shield' && b.k === 'blade') { if (!swinging(b.f)) c.setEnabled(false); }
      else if (a.k === 'body' && b.k === 'body' && a.f !== b.f && (a.f.rollT > 0 || b.f.rollT > 0)) c.setEnabled(false); // a dodge roll slips past
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
    this.fin = null; this.fatBanner = 0; this.shieldQ = [];
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
      reloadT: 0, cd: 0, draw: 0, aim: facing > 0 ? 0 : Math.PI,
      // v3 active ragdoll state
      pst: 'ok', stiff: 1, imp: 0, stagT: 0, downT: 0, getT: 0, flinchT: 0, rollT: 0, rollDir: 1, iT: 0, parryT: 0, parryCd: 0, riposteT: 0,
      kick: null, bash: null, kickCd: 0, legHurt: 0, armHurt: 0, bArmHurt: 0, dazeT: 0, dieT: 0, lfx: 0, shFx: null, jumpPrep: 0, landT: 0, recoil: 0, bHold: 0, pb: 0, pl: 0, pr: 0, lk: 0, wallCd: 0, P: null, t: Math.random() * 6 };
    const ci = this.inputs[idx]; // start in sync with the player's button counters so nothing fires by itself
    f.la = ci.a | 0; f.lj = ci.j | 0; f.ld = ci.d | 0; f.lw = ci.w | 0; f.lrl = ci.rl | 0; f.lk = ci.k | 0; f.lfx = ci.fx | 0; f.pb = ci.b ? 1 : 0; f.pl = ci.l ? 1 : 0; f.pr = ci.r ? 1 : 0;
    const types = [lo.helmet, lo.chest, lo.arms, lo.arms, lo.legs, lo.legs];
    f.pieces = types.map((t) => ({ type: t, hp: ARMOUR[t].hp, max: ARMOUR[t].hp }));
    f.shield = { type: lo.shield | 0, hp: SHIELDS[lo.shield | 0].hp, max: SHIELDS[lo.shield | 0].hp };
    const st = loadoutStats(lo); f.spd = st.speed;
    const ty = STAND_Y + 0.02;
    const fdef = (dens, part) => ({ density: dens, friction: part === 5 || part === 7 ? 1.2 : 0.7, filterGroupIndex: grp, filterCategoryBits: CAT.BODY,
      filterMaskBits: CAT.GROUND | CAT.SENSE, userData: { k: 'body', f, part } });
    const mk = (px, py, shape, dens, part) => {
      const b = w.createBody({ type: 'dynamic', position: Vec2(px, py), angularDamping: part === 0 ? 2 : 1.4, linearDamping: 0.05 });
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
    // balance "gyro": an angle-only motor joint (zero force) between the arena and the torso, solved together with the
    // limb motors so their reaction torques cannot tip the fighter over. Strength follows consciousness (f.stiff).
    f.bal = w.createJoint(new pl.MotorJoint({ maxForce: 0, maxTorque: 0, correctionFactor: 0.2, collideConnected: true }, this.ground, torso));
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
  S.shieldUp = function (f) { return f.shield.type > 0 && f.shield.hp > 0 && !!this.weapon(f).one; };
  S.setShield = function (f) {
    if (f.shFx) { f.b[3].destroyFixture(f.shFx); f.shFx = null; }
    if (!this.shieldUp(f)) return;
    const S = SHIELDS[f.shield.type];
    f.shFx = f.b[3].createFixture(new pl.Box(0.04, S.h, Vec2(0, -D.fa * 0.25), 0), { density: 1.2, friction: 0.4, filterGroupIndex: f.grp,
      filterCategoryBits: CAT.SHIELD, filterMaskBits: CAT.BLADE, userData: { k: 'shield', f } });
  };
  S.setWeapon = function (f) {
    this.setShield(f);
    const b = f.b[9];
    for (const fx of f.wfx) b.destroyFixture(fx);
    f.wfx = []; f.bladeFx = f.senseFx = null;
    const W = this.weapon(f);
    if (W.kind !== 'melee') return;
    const a = SWORD_A(f.facing), dx = Math.cos(a), dy = Math.sin(a), hy = -D.fa / 2;
    const from = -0.12, L = W.len, c = (from + L) / 2, hl = (L - from) / 2;
    const bd = { density: W.dens, friction: 0.3, filterGroupIndex: f.grp, filterCategoryBits: CAT.BLADE, filterMaskBits: CAT.BLADE | CAT.SHIELD, userData: { k: 'blade', f } };
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
    j.setMotorSpeed(clamp((target - j.getJointAngle()) * (gain || 18), -40, 40));
  }
  // two-bone leg IK: joint targets (hip, knee) that put the ankle at (fx, fy) given the hip position and torso angle
  function legIK(hx, hy, fx, fy, fc, tAng) {
    const L1 = D.thg, L2 = D.shn, dx = fx - hx, dy = fy - hy;
    const d = clamp(Math.hypot(dx, dy), 0.15, L1 + L2 - 0.002);
    const phi = Math.atan2(dx, -dy);
    const al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const be = Math.acos(clamp((L2 * L2 + d * d - L1 * L1) / (2 * L2 * d), -1, 1));
    const th = phi + fc * al, sh = phi - fc * be;
    return [wrap(th - tAng), wrap(sh - th)];
  }
  const JN = ['sF', 'eF', 'sB', 'eB', 'hF', 'kF', 'hB', 'kB', 'lean', 'crouch', 'neck'];
  function mkPose() { return { sF: 0.9, eF: 1.0, sB: 0.5, eB: 1.5, hF: 0.35, kF: -0.4, hB: -0.3, kB: -0.25, lean: -0.04, crouch: 0.04, neck: 0 }; }
  S.isEnemy = function (a, b) { return a !== b && a.side !== b.side; };
  S.nearestEnemy = function (f) {
    let best = null, bd = 1e9; const x = f.b[0].getPosition().x;
    for (const o of this.fighters) if (o.alive && o.pst !== 'finish' && this.isEnemy(f, o)) { const d = Math.abs(o.b[0].getPosition().x - x); if (d < bd) { bd = d; best = o; } }
    return best;
  };

  S.autoAim = function (f, W) {
    const tgt = this.nearestEnemy(f), sp = f.b[8].getPosition();
    if (!tgt) return f.facing > 0 ? 0 : Math.PI;
    const tp = tgt.b[0].getPosition(), dx = tp.x - sp.x, dy = tp.y + 0.15 - sp.y;
    const t = Math.hypot(dx, dy) / (W.speed || 30), drop = 0.5 * G * (W.grav || 0) * t * t;
    return Math.atan2(dy + drop, dx);
  };
  S.startReload = function (f, W) { if (f.reloadT > 0 || W.kind === 'melee') return; f.reloadT = W.reload; f.draw = 0; const p = f.b[9].getPosition(); this.ev('reload', p.x, p.y, 0); };

  S.limp = function (f) {
    for (const k in f.j) { f.j[k].setMaxMotorTorque(k === 'neck' ? 1.5 : 2.5); f.j[k].setMotorSpeed(0); }
    if (!f.limpSet) { f.limpSet = true; f.bal.setMaxTorque(0); for (const b of f.b) b.setAngularDamping(0.4); }
  };
  S.com = function (f) {
    let m = 0, x = 0, y = 0;
    for (const b of f.b) { const bm = b.getMass(), q = b.getWorldCenter(); m += bm; x += q.x * bm; y += q.y * bm; }
    return { x: x / m, y: y / m };
  };
  S.addVel = function (f, dvx, dvy) { for (const b of f.b) { const v = b.getLinearVelocity(); b.setLinearVelocity(Vec2(v.x + dvx, v.y + dvy)); } };
  S.canAct = function (f) { return f.alive && f.pst === 'ok' && f.stun <= 0 && !f.kick && !f.bash && f.rollT <= 0; };
  S.knockDown = function (f, t, why) {
    if (f.pst === 'down') { f.downT = Math.min(f.downT + 0.15, 1.6); return; }
    f.pst = 'down'; f.downT = t; f.stiff = 0.04; f.atk = null; f.kick = null; f.draw = 0; f.blocking = false; f.stun = t + GETUP_T;
    const p = f.b[0].getPosition(); this.ev('down', p.x, 0, why || 1);
  };
  S.stagger = function (f, t) {
    if (f.pst === 'down' || f.pst === 'getup') return;
    f.pst = 'stagger'; f.stagT = Math.max(f.stagT, t); f.stiff = Math.min(f.stiff, 0.3); f.atk = null; f.kick = null; f.draw = 0; f.stun = Math.max(f.stun, t);
  };
  // hit reaction scaled by impact (momentum); impacts inside a short window add up (shotgun pellets, combos)
  S.react = function (def, J, dir, tb, pt, nx, ny) {
    if (!def.alive) return;
    def.imp += J;
    const I = def.imp;
    if (tb && pt) tb.applyLinearImpulse(Vec2(nx * J * 0.45, ny * J * 0.45), pt, true);
    if (def.pst === 'down') { this.addVel(def, dir * J * 0.04, 0); return; }
    if (I >= T2 || (def.pst === 'stagger' && I >= T2 * 0.8)) {
      this.knockDown(def, 0.75 + Math.min(0.6, (I - T2) * 0.02));
      this.addVel(def, dir * (3.2 + J * 0.07), 3.2);
      this.hitStop = Math.max(this.hitStop, 0.09);
    } else if (I >= T1) {
      this.stagger(def, 0.32 + I * 0.012);
      this.addVel(def, dir * (1.6 + J * 0.09), 0.4);
      this.hitStop = Math.max(this.hitStop, 0.06);
    } else {
      def.flinchT = 0.2; def.stiff = Math.min(def.stiff, 0.7); def.stun = Math.max(def.stun, 0.1);
      if (def.atk && def.atk.ph === 'wind') def.atk = null;
      this.addVel(def, dir * (0.6 + J * 0.07), 0);
    }
  };

  S.control = function (f, dt) {
    const t = f.b[0];
    f.stun = Math.max(0, f.stun - dt); f.jumpT -= dt; f.dashT -= dt; f.dashCd -= dt; f.atkCd -= dt; f.comboT -= dt; f.clashT -= dt; f.cd -= dt;
    f.wantAtk -= dt; f.wantJump -= dt; f.wantDash -= dt;
    f.flinchT -= dt; f.rollT -= dt; f.iT -= dt; f.parryT -= dt; f.parryCd -= dt; f.riposteT -= dt; f.kickCd -= dt; f.landT -= dt; f.wallCd -= dt;
    f.recoil *= Math.exp(-9 * dt); f.imp *= Math.exp(-4 * dt); f.t += dt;
    let W = this.weapon(f);
    if (f.reloadT > 0) { f.reloadT -= dt; if (f.reloadT <= 0) { f.reloadT = 0; f.ws[f.slot].ammo = W.mag; } }
    if (!f.alive) { if (f.dieT > 0) this.dieControl(f, dt); else this.limp(f); return; }
    if (f.pst === 'finish') { this.finishControl(f, dt); return; }
    if (this.fin && this.fin.fat && this.fin.by === f.id) { this.fatalityControl(f, dt); return; }
    f.dazeT -= dt;
    const frozen = this.state === 'intro' || this.state === 'over';
    const inp = frozen ? { l: 0, r: 0, b: 0, a: f.la, j: f.lj, d: f.ld, h: 0, am: null, w: f.lw, rl: f.lrl, k: f.lk, fx: f.lfx } : this.inputs[f.id];
    const pos = t.getPosition(), v = t.getLinearVelocity(), ang = t.getAngle();
    // ---- posture state machine: ok / stagger / down / getup ----
    let stiffT = 1;
    if (f.pst === 'stagger') {
      f.stagT -= dt; stiffT = 0.3 + 0.7 * clamp(1 - f.stagT / 0.5, 0, 1);
      const c = this.com(f), fm = (f.b[5].getPosition().x + f.b[7].getPosition().x) / 2;
      if (Math.abs(c.x - fm) > 0.8 && Math.abs(v.x) > 3.5 && f.imp > T1 * 1.5) { this.knockDown(f, 0.8, 2); this.addVel(f, 0, 1); } // lost balance
      else if (f.stagT <= 0) { f.pst = 'ok'; f.imp *= 0.5; }
    }
    if (f.pst === 'down') {
      f.downT -= dt; stiffT = 0.05;
      const presses = (inp.a !== f.la) + (inp.j !== f.lj);
      if (presses) f.downT -= 0.12 * presses; // mash to get up faster
      if (f.downT <= 0 && pos.y < 1.2) { f.pst = 'getup'; f.getT = 0; this.ev('getup', pos.x, 0, 0.5); }
    } else if (f.pst === 'getup') {
      f.getT += dt; stiffT = 0.35 + 0.65 * clamp(f.getT / GETUP_T, 0, 1);
      if (f.getT >= GETUP_T) { f.pst = 'ok'; f.iT = 0.4; f.stun = 0; f.imp = 0; }
    }
    if (f.flinchT > 0) stiffT = Math.min(stiffT, 0.75);
    f.stiff += (stiffT - f.stiff) * Math.min(1, dt * (stiffT > f.stiff ? 6 : 30));
    const busy = f.pst !== 'ok';
    // ---- input edges ----
    if ((inp.a | 0) !== f.la) { f.la = inp.a | 0; if (!busy) f.wantAtk = 0.25; }
    if ((inp.j | 0) !== f.lj) { f.lj = inp.j | 0; if (!busy) f.wantJump = 0.15; }
    if ((inp.d | 0) !== f.ld) { f.ld = inp.d | 0; if (!busy) f.wantDash = 0.15; }
    let wantKick = 0;
    if ((inp.k | 0) !== f.lk) { f.lk = inp.k | 0; wantKick = f.facing; }
    if ((inp.fx | 0) !== f.lfx) { f.lfx = inp.fx | 0; if (this.state === 'finish') this.tryFatality(f, null); }
    const bNow = inp.b ? 1 : 0, lNow = inp.l ? 1 : 0, rNow = inp.r ? 1 : 0;
    if (bNow && f.bHold > 0.05) { if (lNow && !f.pl) wantKick = -1; if (rNow && !f.pr) wantKick = 1; } // Block + tap a direction = kick
    if (bNow && !f.pb && f.atk && f.atk.ph === 'wind') { // Block during a wind-up = feint (cancel the swing)
      f.atk = null; f.atkCd = 0.1; const hp = f.b[9].getPosition(); this.ev('feint', hp.x, hp.y + 0.3, 0);
    }
    if (bNow && !f.pb && f.parryCd <= 0 && !busy) { f.parryT = 0.16; f.parryCd = 0.5; } // fresh Block press opens a parry window
    f.bHold = bNow ? f.bHold + dt : 0; f.pb = bNow; f.pl = lNow; f.pr = rNow;
    if ((inp.w | 0) !== f.lw) {
      f.lw = inp.w | 0;
      if (!f.atk && !busy) { f.slot ^= 1; f.reloadT = 0; f.draw = 0; this.setWeapon(f); W = this.weapon(f); f.cd = 0.25; const p = f.b[9].getPosition(); this.ev('swap', p.x, p.y, 0);
        if (W.kind !== 'melee' && f.ws[f.slot].ammo <= 0) this.startReload(f, W); }
    }
    const ranged = W.kind !== 'melee';
    const footY = Math.min(...[5, 7].map((k) => { const b = f.b[k], q = b.getPosition(); return q.y - Math.cos(b.getAngle()) * D.shn / 2; }));
    const grounded = (pos.y < STAND_Y + 0.15 || (footY < 0.14 && pos.y < STAND_Y + 0.4)) && f.jumpT <= 0 && f.jumpPrep <= 0;
    if (grounded && !f.grounded && v.y < -3) { this.ev('land', pos.x, 0, Math.min(1, -v.y / 10)); f.landT = 0.16; }
    f.grounded = grounded;
    if (ranged) {
      const manual = inp.am != null && isFinite(inp.am);
      f.aim = manual ? +inp.am : this.autoAim(f, W);
      if (inp.rl !== f.lrl) { f.lrl = inp.rl; if (f.ws[f.slot].ammo < W.mag) this.startReload(f, W); }
    } else if (inp.rl !== f.lrl) f.lrl = inp.rl;
    // facing
    if (!f.atk && !f.kick && f.dashT <= 0 && f.rollT <= 0 && !busy && f.stun <= 0) {
      let want = f.facing;
      if (ranged) want = Math.cos(f.aim) >= 0 ? 1 : -1;
      else { const tgt = this.nearestEnemy(f); if (tgt) want = Math.sign(tgt.b[0].getPosition().x - pos.x) || f.facing; }
      if (want !== f.facing) { f.turnT += dt; if (f.turnT > 0.1) { this.setFacing(f, want); f.turnT = 0; } } else f.turnT = 0;
    }
    const fc = f.facing, can = this.canAct(f);
    let move = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    if (!can || f.atk && f.atk.ph !== 'rec') move = f.atk && can ? move * 0.3 : 0;
    const shUp = this.shieldUp(f);
    f.blocking = !!inp.b && (!ranged || shUp) && !f.atk && !f.kick && !f.bash && can;
    // during "FINISH HIM" the kick input performs a kick (or shield bash) fatality
    if (wantKick && this.state === 'finish') { this.tryFatality(f, shUp ? 'bash' : 'kick'); wantKick = 0; }
    // kick, or shield bash when a shield is up
    if (wantKick && can && f.kickCd <= 0 && grounded) {
      if (wantKick !== fc && !ranged) this.setFacing(f, wantKick);
      if (shUp) { f.bash = { t: 0, hit: new Set() }; if (grounded) this.addVel(f, f.facing * 3.2, 0); const hp = f.b[3].getPosition(); this.ev('bashgo', hp.x, hp.y, 0); }
      else f.kick = { t: 0, hit: new Set() };
      f.kickCd = 0.75; f.blocking = false; f.atk = null;
    }
    if (f.kick) { f.kick.t += dt; if (f.kick.t > 0.36) f.kick = null; }
    if (f.bash) { f.bash.t += dt; if (f.bash.t > 0.4) f.bash = null; }
    // dodge roll (ground) or dash (air)
    if (f.wantDash > 0 && f.dashCd <= 0 && can) {
      f.wantDash = 0; f.dashCd = 0.85; const dir = move || fc;
      if (grounded) { f.rollT = ROLL_T; f.rollDir = dir; f.iT = ROLL_T + 0.1; f.atk = null; f.draw = 0; this.ev('roll', pos.x, 0, dir); }
      else { f.dashT = 0.17 * (0.6 + 0.4 * f.spd); f.dashDir = dir; this.ev('dash', pos.x, pos.y, dir); }
    }
    const rolling = f.rollT > 0;
    const speed = (f.blocking ? (f.shield.type === 3 && shUp ? 1.2 : 1.6) : 4.4) * f.spd * (W.move || 1) * (ranged && (inp.h || f.draw > 0) ? 0.7 : 1)
      * (1 - 0.45 * f.legHurt) * (f.dazeT > 0 ? 0.7 : 1); // leg wounds make you limp and slow
    // ---- locomotion: whole-body velocity change so limbs do not trail and flop ----
    let tvx = move * speed, acc = grounded ? 0.3 : 0.06;
    if (rolling) { tvx = f.rollDir * 7.2 * (0.7 + 0.3 * f.spd); acc = 0.5; }
    else if (f.dashT > 0) { tvx = f.dashDir * 12; acc = 0.7; }
    else if (busy) acc = f.pst === 'getup' ? 0.15 : grounded ? 0.04 : 0;
    if (f.pst === 'stagger' || f.pst === 'down') tvx = 0;
    if (acc > 0) this.addVel(f, (tvx - v.x) * acc, 0);
    // ---- jump with a crouch wind-up ----
    if (f.wantJump > 0 && grounded && can && f.jumpPrep <= 0) { f.wantJump = 0; f.jumpPrep = 0.07; }
    if (f.jumpPrep > 0) {
      f.jumpPrep -= dt;
      if (f.jumpPrep <= 0) { f.jumpT = 0.3; const jv = 8.6 * (1 - (1 - f.spd) * 0.5) * (1 - 0.35 * f.legHurt);
        for (const b of f.b) { const bv = b.getLinearVelocity(); b.setLinearVelocity(Vec2(bv.x, jv)); } this.ev('jump', pos.x, 0, 0.5); }
    }
    // ---- weapon use ----
    if (ranged) {
      const wsl = f.ws[f.slot];
      if (W.kind === 'gun') {
        if ((f.wantAtk > 0 || (W.auto && inp.h)) && f.cd <= 0 && f.reloadT <= 0 && can) {
          f.wantAtk = 0;
          if (wsl.ammo > 0) { this.fire(f, W, 1); wsl.ammo--; f.cd = W.cd; if (wsl.ammo === 0) this.startReload(f, W); }
          else this.startReload(f, W);
        }
      } else {
        if (inp.h && f.reloadT <= 0 && wsl.ammo > 0 && can) f.draw = Math.min(1, f.draw + dt / 0.6);
        else if (!inp.h && f.draw > 0) { if (f.draw > 0.15 && wsl.ammo > 0 && can) { this.fire(f, W, f.draw); wsl.ammo--; this.startReload(f, W); } f.draw = 0; }
        if (!can) f.draw = 0;
        f.wantAtk = 0;
      }
      f.atk = null;
    } else if (f.wantAtk > 0 && !f.atk && can && f.atkCd <= 0) {
      f.wantAtk = 0;
      const type = !grounded ? 'a' : (f.comboT > 0 && f.lastType === 'a') ? 'b' : 'a';
      f.atk = { type, ph: 'wind', t: 0, hit: new Set() };
    }
    if (f.atk) {
      const A = f.atk; A.t += dt;
      const ah = 1 + 0.35 * f.armHurt; // a wounded weapon arm swings slower
      const PH = { wind: W.T[0] * ah, strike: W.T[1] * ah, follow: W.T[2] * ah, rec: W.T[3] * ah };
      if (A.t > PH[A.ph]) {
        A.t = 0; A.ph = A.ph === 'wind' ? 'strike' : A.ph === 'strike' ? 'follow' : A.ph === 'follow' ? 'rec' : null;
        if (A.ph === 'strike') { this.ev('swing', pos.x, pos.y, W.mass / 1.5); if (grounded) this.addVel(f, fc * (0.6 + W.mass * 0.45 + (f.riposteT > 0 ? 2.6 : 0)), 0); } // step into the blow (a riposte lunges)
        if (!A.ph) { f.lastType = A.type; f.comboT = 0.45; f.atk = null; f.atkCd = 0.04; }
      }
    }
    // ---- target pose (hand-authored, blended) ----
    const P = mkPose(), sp = Math.abs(v.x);
    // guard stance by weapon: sword middle guard, katana high guard, heavy weapons on the shoulder, spear low and forward
    if (!ranged) Object.assign(P, W.style === 'heavy' ? { sF: 2.35, eF: 1.9 } : W.style === 'spear' ? { sF: 1.15, eF: 0.35 } : W.key === 'katana' ? { sF: 1.45, eF: 1.65 } : {});
    if (shUp) { P.sB = 1.25; P.eB = 1.35; }
    P.sF -= 0.5 * f.armHurt; // wounded arm: the guard droops
    P.crouch += Math.sin(f.t * 2.4) * 0.012; P.sF += Math.sin(f.t * 2.4) * 0.03;
    // feet: planted under the centre of mass (capture point) and stepping in a walk/run cycle, solved with IK
    let ik = null;
    if (!grounded) Object.assign(P, { hF: 1.0, kF: -1.4, hB: 0.2, kB: -0.9, crouch: 0 });
    else {
      const st = f.blocking || ranged ? 0.24 : 0.19;
      ik = { cF: st + 0.035 * SUP.fw * Math.sin(f.t * 3.1), cB: -st * 0.9, lF: 0, lB: 0 }; // light footwork in guard
      if (sp < 0.4 && !busy) P.crouch += 0.015 * SUP.fw * Math.sin(f.t * 6.2);
      if (sp > 0.4 && !rolling && f.dashT <= 0 && !busy) {
        const run = clamp((sp - 2) / 2.5, 0, 1), stride = 0.2 + 0.2 * run, lift = 0.1 + 0.08 * run;
        f.walk += v.x * fc * dt * (6.2 - 1.5 * run); const ph = f.walk;
        ik.cF = 0.03 + stride * Math.sin(ph) * (1 - 0.5 * f.legHurt); ik.cB = -0.03 + stride * Math.sin(ph + Math.PI);
        P.crouch += 0.08 * f.legHurt * Math.max(0, Math.sin(ph)); // limp: the body dips onto the wounded leg
        ik.lF = lift * Math.max(0, Math.cos(ph)); ik.lB = lift * Math.max(0, Math.cos(ph + Math.PI));
        P.lean = -0.05 - 0.1 * run * Math.sign(v.x * fc); P.crouch = 0.05 + 0.03 * run;
        if (!shUp) { P.sB = 0.5 - 0.45 * Math.sin(ph); P.eB = 1.3; }
      }
    }
    if (f.blocking) Object.assign(P, shUp ? { sF: 1.9, eF: 2.0, sB: 1.6, eB: 0.8, lean: 0.02, crouch: 0.1 } : { sF: 1.3, eF: 1.7, sB: 0.9, eB: 1.5, lean: 0.06, crouch: 0.09 });
    if (ranged) {
      const shT = wrap(f.aim + Math.PI / 2 - ang + f.recoil * fc);
      P.sF = shT * fc; P.eF = 0.06;
      if (W.kind === 'bow') { P.sB = shT * fc; P.eB = 0.25 + f.draw * 2.1; P.lean = 0.03 + 0.06 * f.draw; }
      else if (W.two) { P.sB = wrap(shT - 0.35 * fc) * fc; P.eB = 0.8; }
      else if (!shUp) { P.sB = 0.4; P.eB = 1.3; }
      else if (f.blocking) { P.sB = 1.6; P.eB = 0.8; }
      if (sp < 0.4 && grounded) P.crouch = 0.06;
      P.lean = (P.lean > 0 ? P.lean : 0.02) + f.recoil * 0.25;
    } else if (f.atk) {
      const A = f.atk, st = STY[W.style][A.type], ph = A.ph === 'rec' ? null : st[A.ph];
      if (ph) {
        [P.sF, P.eF, P.lean, P.crouch] = ph;
        if (shUp) { P.sB = 1.35; P.eB = 1.2; } else { P.sB = A.ph === 'wind' ? 0.9 : -0.5; P.eB = A.ph === 'wind' ? 1.2 : 0.4; }
        if (ik) { if (A.ph === 'wind') { ik.cF = 0.14; ik.cB = -0.2; } else { ik.cF = 0.34; ik.cB = -0.3; } } // lunge
      } else { P.lean = -0.1; P.crouch = 0.06; }
    }
    if (f.kick) {
      const k = f.kick.t, ext = k > 0.1 && k < 0.22;
      Object.assign(P, k < 0.1 ? { hF: 1.8, kF: -2.0 } : ext ? { hF: 1.5, kF: -0.08 } : { hF: 0.9, kF: -1.0 }, { hB: -0.2, kB: -0.25, lean: 0.28, crouch: 0.06 });
    }
    if (f.bash) { const k = f.bash.t; Object.assign(P, k < 0.08 ? { sB: 1.1, eB: 1.8, lean: 0.1 } : { sB: 1.6, eB: 0.1, lean: -0.25 }); if (ik) { ik.cF = 0.36; ik.cB = -0.3; } }
    if (f.dazeT > 0) { P.lean += Math.sin(f.t * 7) * 0.12; P.neck = Math.sin(f.t * 5) * 0.35; }
    if (f.kick || rolling || f.dashT > 0 || f.pst === 'getup' || f.pst === 'down') ik = null;
    if (ik) { // solve IK now so the result blends like any other pose
      const hip = t.getWorldPoint(Vec2(0, -HIP_OFF)), c = this.com(f);
      const cx = f.pst === 'ok' ? c.x + clamp(v.x * 0.06, -0.25, 0.25) : hip.x;
      const hy = (STAND_Y - P.crouch - HIP_OFF) * (1 - SUP.ik) + hip.y * SUP.ik; // mostly the target hip height (steady), partly the real one (feet stay on the floor)
      const a = legIK(hip.x, hy, cx + fc * ik.cF, 0.035 + ik.lF, fc, ang), b = legIK(hip.x, hy, cx + fc * ik.cB, 0.035 + ik.lB, fc, ang);
      P.hF = a[0] * fc; P.kF = a[1] * fc; P.hB = b[0] * fc; P.kB = b[1] * fc;
    }
    if (rolling) Object.assign(P, { hF: 1.9, kF: -2.3, hB: 1.7, kB: -2.3, sF: 1.6, eF: 1.9, sB: 1.6, eB: 2.0, crouch: 0.5 });
    if (f.dashT > 0) Object.assign(P, { hF: 0.9, kF: -0.6, hB: -0.6, kB: -0.3 });
    if (f.jumpPrep > 0 || f.landT > 0) { P.crouch = 0.2; P.lean = -0.12; }
    if (f.flinchT > 0) { P.lean += 0.22; P.neck = -0.35; P.crouch += 0.04; }
    if (f.pst === 'stagger') { P.lean += 0.25; P.neck = -0.4; P.sF -= 0.6; P.sB = -0.4; P.crouch += 0.1; if (ik) { ik.cF = 0.1; ik.cB = -0.32; } }
    if (f.pst === 'getup') {
      const g = clamp(f.getT / GETUP_T, 0, 1);
      Object.assign(P, { hF: 1.6 - 1.25 * g, kF: -2.2 + 1.8 * g, hB: 0.2 - 0.5 * g, kB: -1.5 + 1.25 * g, lean: -0.5 + 0.46 * g, crouch: 0.45 * (1 - g) + 0.04, sB: 0.9, eB: 0.4 });
    }
    // blend toward the target pose; attacks snap harder than locomotion
    if (!f.P) f.P = Object.assign({}, P);
    const rate = 1 - Math.exp(-dt * (f.atk || f.kick || rolling ? 40 : 16));
    for (const k of JN) f.P[k] += (P[k] - f.P[k]) * rate;
    if (f.atk || ranged) { f.P.sF = P.sF; f.P.eF = P.eF; }
    const Q = f.P;
    this.actuate(f, Q, { grounded, rolling, sp, ranged, W, dt });
    if (f.bash) this.checkBash(f);
    if (f.kick) this.checkKick(f);
  };

  // apply a pose: virtual-leg support, balance gyro, stiff joint motors (shared by normal play and scripted moves)
  const SUP = { k: 12, b: 0.6, ag: 0.92, legs: 1, fw: 1, ik: 0.5 };
  S.actuate = function (f, Q, o) {
    const t = f.b[0], pos = t.getPosition(), v = t.getLinearVelocity(), ang = t.getAngle(), fc = f.facing, S2 = f.stiff, W = o.W || this.weapon(f);
    if (!o.noSupport && (o.grounded || f.pst === 'getup') && f.pst !== 'down' && f.jumpPrep <= 0.001) {
      const sup = o.sup != null ? o.sup : f.pst === 'getup' ? 0.4 + 0.6 * clamp(f.getT / GETUP_T, 0, 1) : S2;
      const hT = STAND_Y - Q.crouch;
      const vyDes = clamp((hT - pos.y) * SUP.k, -6, 4);
      t.setLinearVelocity(Vec2(t.getLinearVelocity().x, v.y + (vyDes - v.y) * SUP.b * sup));
      t.applyForceToCenter(Vec2(0, (f.mass - t.getMass()) * G * SUP.ag * sup), true);
    }
    if (o.spin != null) { f.bal.setMaxTorque(0); t.setAngularVelocity(o.spin); }
    else if (o.rolling) { // tuck and roll: spin the whole body about its centre of mass (half scripted, half physics)
      f.bal.setMaxTorque(0);
      const w = -f.rollDir * 2.1 * Math.PI / ROLL_T, c = this.com(f); let vx = 0, vy = 0, m = 0;
      for (const b of f.b) { const bv = b.getLinearVelocity(), bm = b.getMass(); vx += bv.x * bm; vy += bv.y * bm; m += bm; }
      vx /= m; vy /= m;
      for (const b of f.b) { const q = b.getPosition(), bv = b.getLinearVelocity(), tx = vx - w * (q.y - c.y), ty = vy + w * (q.x - c.x);
        b.setLinearVelocity(Vec2(bv.x + (tx - bv.x) * 0.5, bv.y + (ty - bv.y) * 0.5)); b.setAngularVelocity(b.getAngularVelocity() + (w - b.getAngularVelocity()) * 0.5); }
    }
    else if (f.pst === 'down') f.bal.setMaxTorque(0);
    else {
      const tgtAng = Q.lean * fc + clamp(-v.x * 0.02, -0.15, 0.15);
      const bal = o.bal != null ? o.bal : f.pst === 'getup' ? 0.3 + 0.7 * clamp(f.getT / GETUP_T, 0, 1) : S2 * S2;
      f.bal.setAngularOffset(ang + wrap(tgtAng - ang));
      f.bal.setMaxTorque(900 * bal);
    }
    const ranged = o.ranged;
    let armT = o.armT || (ranged ? 380 : f.atk ? W.tq * (f.atk.ph === 'strike' ? 1.5 : f.atk.ph === 'rec' ? 0.6 : 0.9) : (f.blocking ? 320 : 220) * Math.sqrt((W.tq || 420) / 420));
    armT *= 1 - 0.4 * f.armHurt;
    const gA = o.gA || (f.atk && f.atk.ph === 'strike' ? 30 : 22);
    drive(f.j.shF, Q.sF * fc, armT * S2, gA); drive(f.j.elF, Q.eF * fc, armT * 0.75 * S2, gA);
    const bt = (ranged && (W.two || W.kind === 'bow')) || (f.shFx && (f.blocking || f.bash)) ? 260 : f.shFx ? 180 : 120;
    drive(f.j.shB, Q.sB * fc, bt * S2 * (1 - 0.4 * f.bArmHurt), 20); drive(f.j.elB, Q.eB * fc, bt * 0.7 * S2, 20);
    const legT = (o.legT || (f.kick ? 420 : 300 * SUP.legs)) * S2;
    drive(f.j.hipF, Q.hF * fc, legT, 20); drive(f.j.kneeF, Q.kF * fc, legT * 0.85, 20);
    drive(f.j.hipB, Q.hB * fc, 300 * SUP.legs * S2, 20); drive(f.j.kneeB, Q.kB * fc, 255 * SUP.legs * S2, 20);
    drive(f.j.neck, clamp(-ang * 0.6 + Q.neck * fc, -0.55, 0.55), 40 * Math.max(0.2, S2));
  };

  S.checkKick = function (f) {
    const K = f.kick; if (K.t < 0.09 || K.t > 0.26) return;
    const foot = f.b[7].getWorldPoint(Vec2(0, -D.shn / 2)), fv = f.b[7].getLinearVelocityFromWorldPoint(foot);
    for (const o of this.fighters) {
      if (!o.alive || !this.isEnemy(f, o) || K.hit.has(o.id) || o.iT > 0 || o.rollT > 0 || o.pst === 'finish') continue;
      for (const part of [0, 1, 4, 6, 2, 8]) {
        const q = o.b[part].getPosition();
        if (Math.hypot(q.x - foot.x, q.y - foot.y) > 0.3) continue;
        K.hit.add(o.id);
        const dir = Math.sign(o.b[0].getPosition().x - f.b[0].getPosition().x) || f.facing;
        const fs = Math.min(12, Math.hypot(fv.x, fv.y));
        const blocked = o.blocking;
        this.ev('kick', foot.x, foot.y, blocked ? 1 : 0.6);
        if (blocked) { this.stagger(o, 0.55); this.addVel(o, dir * 3.4, 0.5); this.ev('guardbreak', q.x, q.y + 0.4, 1); this.hitStop = Math.max(this.hitStop, 0.07); }
        else {
          const r = this.damage(o, part, 5 + fs * 0.4, { prot: 1, arm: 0.4, pt: Vec2(q.x, q.y), dx: dir, dy: 0 });
          this.react(o, 9 + fs * 0.6, dir, o.b[part], Vec2(q.x, q.y), dir, 0.2);
          if (o.health <= 0) this.ko(o, dir, 0.2, Vec2(q.x, q.y));
          void r;
        }
        break;
      }
    }
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
      f.recoil = Math.min(0.9, f.recoil + W.recoil * 0.28);
      fb.applyLinearImpulse(Vec2(-dx * W.recoil * 0.8, -dy * W.recoil * 0.8), hand, true);
      this.addVel(f, -dx * W.recoil * 0.6, 0);
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
          if (ud.f === p.owner || (this.teams && ud.f.side === p.side && ud.f.alive) || (ud.f.alive && (ud.f.rollT > 0.08 || ud.f.iT > 0.2))) return -1;
          best = { fix, ud, pt: Vec2(pt.x, pt.y), fr }; return fr;
        }
        if (ud && ud.k === 'shield') {
          if (ud.f !== p.owner && ud.f.alive && ud.f.pst !== 'finish' && !(this.teams && ud.f.side === p.side)) { best = { shield: true, ud, pt: Vec2(pt.x, pt.y), fr }; return fr; }
          return -1;
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
      } else if (best.shield) this.projShield(p, best.ud.f, best.pt, v);
      else if (best.blade) { this.ev('block', best.pt.x, best.pt.y, 1); this.removeProj(p); }
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
    if (def.pst === 'finish') { // only the finishing shot counts against a fighter in the FINISH HIM state
      if (p.fatal && this.fin && !this.fin.hit) this.fatalImpact(def, dx * 12, 5 + dy * 3, -Math.sign(dx) * 10);
      else tb.applyLinearImpulse(Vec2(dx * 2, dy * 2), pt, true);
      if (p.arrow) this.stickArrow(p, tb, pt); else this.removeProj(p);
      return;
    }
    // a raised shield covers most of the front even where the shapes don't quite overlap (legs below a round shield less so)
    if (def.alive && def.blocking && def.pst === 'ok' && this.shieldUp(def) && Math.sign(-dx) === def.facing) {
      const S = SHIELDS[def.shield.type], low = ud.part >= 4 && ud.part <= 7;
      if (Math.random() < S.cover * (low ? S.h / 0.56 : 1) * (1 - 0.4 * def.bArmHurt)) { this.projShield(p, def, pt, v); return; }
    }
    let dmg = p.dmg;
    if (W.falloff) dmg *= clamp(1.25 - Math.hypot(pt.x - p.sx, pt.y - p.sy) / 8, 0.35, 1);
    if (p.arrow) dmg *= clamp(sp / W.speed, 0.4, 1.1);
    if (def.alive) {
      if (def.blocking && Math.sign(p.owner.b[0].getPosition().x - def.b[0].getPosition().x) === def.facing) dmg *= 0.6;
      if (def.pst === 'down') dmg *= 0.6;
      const r = this.damage(def, ud.part, dmg, { prot: 1 - W.pen, arm: 0.5 + W.pen, pt, dx, dy });
      this.react(def, r.raw * W.kb * W.imp, Math.sign(dx) || 1, tb, pt, dx, dy);
      if (def.health <= 0) this.ko(def, dx, dy, pt);
    } else { tb.applyLinearImpulse(Vec2(dx * W.kb * 5, dy * W.kb * 5 + 0.5), pt, true); this.ev('armor', pt.x, pt.y, 0.3); }
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
    // wounds by location: legs -> limp and slow, weapon arm -> weaker, slower swings, head -> dazed
    if (def.alive && def.pst !== 'finish') {
      if (part >= 4 && part <= 7) { const b4 = def.legHurt; def.legHurt = Math.min(1, def.legHurt + dmg / 40); if (b4 < 0.4 && def.legHurt >= 0.4) this.ev('limp', o.pt.x, o.pt.y + 0.5, 1); }
      else if (part === 8 || part === 9) { const b4 = def.armHurt; def.armHurt = Math.min(1, def.armHurt + dmg / 35); if (b4 < 0.4 && def.armHurt >= 0.4) this.ev('armhurt', o.pt.x, o.pt.y + 0.5, 1); }
      else if (part === 2 || part === 3) def.bArmHurt = Math.min(1, def.bArmHurt + dmg / 35);
      else if (part === 1 && raw >= 12) { if (def.dazeT <= 0) this.ev('daze', o.pt.x, o.pt.y + 0.3, 1); def.dazeT = Math.max(def.dazeT, 0.5 + raw * 0.02); }
    }
    return { dmg, raw, flesh };
  };
  S.breakPiece = function (def, pi, pt, dx, dy) {
    const pc = def.pieces[pi];
    const partOf = [1, 0, 3, 9, 5, 7][pi], src = def.b[partOf], sp = src.getPosition(), sv = src.getLinearVelocity();
    this.ev('break', pt.x, pt.y, pc.type);
    const shape = pi === 0 ? new pl.Circle(0.13) : pi === 1 ? new pl.Box(0.14, 0.18) : pi < 4 ? new pl.Box(0.055, 0.13) : new pl.Box(0.07, 0.17);
    this.spawnDebris(sp.x, sp.y, src.getAngle(), sv.x + dx * 4 + (Math.random() - 0.5) * 2, sv.y + Math.abs(dy) * 2 + 4, (Math.random() - 0.5) * 20, shape, pi, def.id, pc.type);
  };

  S.projShield = function (p, def, pt, v) {
    const W = WEAPONS[p.w], sh = def.shield, dir = Math.sign(v.x) || 1;
    sh.hp -= p.dmg * (p.arrow ? 0.5 : 0.8);
    this.ev('shield', pt.x, pt.y, Math.min(1.2, p.dmg / 25));
    if (W.pen >= 0.6 && !p.arrow) { this.damage(def, 3, p.dmg * 0.3, { prot: 1, arm: 0.3, pt, dx: dir, dy: 0 }); if (def.health <= 0) { this.ko(def, dir, 0, pt); } }
    this.react(def, p.dmg * W.kb * W.imp * 0.4, dir, def.b[3], pt, dir, 0);
    if (sh.hp <= 0) this.breakShield(def, pt, dir);
    if (p.arrow && def.shFx) this.stickArrow(p, def.b[3], pt); else if (p.arrow) this.stickArrow(p, null, Vec2(pt.x, Math.max(0.05, pt.y * 0))); else this.removeProj(p);
  };
  S.shieldHit = function (att, def, pt, raw, J, dir) {
    const sh = def.shield, W = this.weapon(att);
    sh.hp -= raw * (def.blocking ? 0.55 : 0.8) * (0.6 + 0.4 * (W.arm || 1));
    this.ev('shield', pt.x, pt.y, Math.min(1.5, raw / 20));
    if (att.atk) { att.atk.hit.add(def.id); att.atk.ph = 'rec'; att.atk.t = 0; }
    att.stun = Math.max(att.stun, 0.2);
    this.addVel(att, -dir * 1.4, 0); this.addVel(def, dir * (0.5 + J * 0.04), 0);
    def.health = Math.max(0, def.health - raw * 0.04);
    if (sh.hp <= 0) this.breakShield(def, pt, dir);
    else if (J > 26 || (W.mass >= 2.2 && !def.blocking)) { this.stagger(def, 0.45); this.ev('guardbreak', pt.x, pt.y + 0.4, 1); } // heavy blows knock the guard open
    this.hitStop = Math.max(this.hitStop, 0.04);
    if (def.health <= 0) this.ko(def, dir, 0, pt);
  };
  S.spawnDebris = function (x, y, a, vx, vy, w, shape, piece, fid, type) {
    if (this.debris.length > 18) { const o = this.debris.shift(); this.world.destroyBody(o.b); }
    const b = this.world.createBody({ type: 'dynamic', position: Vec2(x, y), angle: a, angularDamping: 0.3, linearVelocity: Vec2(vx, vy), angularVelocity: w });
    b.createFixture(shape, { density: 4, friction: 0.6, restitution: 0.25, filterCategoryBits: CAT.DEBRIS, filterMaskBits: CAT.GROUND | CAT.DEBRIS });
    this.debris.push({ b, piece, fid, type, life: 8 });
  };
  S.breakShield = function (def, pt, dir, quiet) {
    const sh = def.shield, S = SHIELDS[sh.type]; sh.hp = 0;
    this.ev('splinter', pt.x, pt.y, quiet ? 0 : sh.type);
    const src = def.b[3], sp = src.getPosition();
    for (let i = 0; i < 3; i++) this.spawnDebris(sp.x + (i - 1) * 0.08, sp.y, src.getAngle() + (i - 1) * 0.4, dir * (2 + i) + (Math.random() - 0.5) * 2, 3 + Math.random() * 3,
      (Math.random() - 0.5) * 18, new pl.Box(0.05, S.h * 0.42), 6, def.id, sh.type);
    this.setShield(def);
    if (def.alive) this.stagger(def, 0.35);
  };
  S.checkBash = function (f) {
    const B = f.bash; if (B.t < 0.06 || B.t > 0.24) return;
    const c = f.b[3].getWorldPoint(Vec2(0, -D.fa * 0.25));
    for (const o of this.fighters) {
      if (!o.alive || !this.isEnemy(f, o) || B.hit.has(o.id) || o.iT > 0 || o.rollT > 0 || o.pst === 'finish') continue;
      for (const part of [0, 1, 2, 8, 4, 6]) {
        const q = o.b[part].getPosition();
        if (Math.hypot(q.x - c.x, q.y - c.y) > 0.45) continue;
        B.hit.add(o.id);
        const dir = Math.sign(o.b[0].getPosition().x - f.b[0].getPosition().x) || f.facing;
        this.ev('bash', c.x, c.y, 1);
        if (o.blocking) { this.stagger(o, 0.6); this.addVel(o, dir * 3.8, 0.4); this.ev('guardbreak', q.x, q.y + 0.4, 1); this.hitStop = Math.max(this.hitStop, 0.07); }
        else { this.damage(o, part, 6, { prot: 1, arm: 0.5, pt: Vec2(q.x, q.y), dx: dir, dy: 0 }); this.react(o, 18, dir, o.b[part], Vec2(q.x, q.y), dir, 0.1); if (o.health <= 0) this.ko(o, dir, 0.2, Vec2(q.x, q.y)); }
        break;
      }
    }
  };

  S.bladeGeom = function (f) {
    const b = f.b[9], a = b.getAngle() + SWORD_A(f.facing);
    const hand = b.getWorldPoint(Vec2(0, -D.fa / 2));
    return { hand, dx: Math.cos(a), dy: Math.sin(a) };
  };
  S.checkHits = function (f) {
    const A = f.atk; if (!A || !(A.ph === 'strike' || (A.ph === 'follow' && A.t < this.weapon(f).T[2] * 0.6)) || !f.alive || !f.senseFx) return;
    for (let ce = f.b[9].getContactList(); ce; ce = ce.next) {
      const c = ce.contact; if (!c.isTouching()) continue;
      let fa = c.getFixtureA(), fb = c.getFixtureB();
      if (fb === f.senseFx) { const t = fa; fa = fb; fb = t; }
      if (fa !== f.senseFx) continue;
      const ud = fb.getUserData();
      if (!ud || ud.k !== 'body' || !this.isEnemy(f, ud.f) || !ud.f.alive || A.hit.has(ud.f.id)) continue;
      if (ud.f.rollT > 0.06 || ud.f.iT > 0) continue; // dodge-roll / get-up invulnerability
      this.applyHit(f, ud.f, ud.part, fb.getBody());
      if (!f.atk) return;
    }
  };
  S.applyHit = function (att, def, part, tb) {
    const A = att.atk, W = this.weapon(att); A.hit.add(def.id);
    if (def.pst === 'finish') return;
    const bg = this.bladeGeom(att), tp = tb.getPosition();
    const s = clamp((tp.x - bg.hand.x) * bg.dx + (tp.y - bg.hand.y) * bg.dy, 0.1, W.len);
    const pt = Vec2(bg.hand.x + bg.dx * s, bg.hand.y + bg.dy * s);
    const vs = att.b[9].getLinearVelocityFromWorldPoint(pt), vt = tb.getLinearVelocity();
    const rx = vs.x - vt.x, ry = vs.y - vt.y, rel = Math.hypot(rx, ry);
    // an early graze while the blade is still accelerating doesn't use up the blow
    if (rel < (A.ph === 'strike' && A.t < W.T[1] * 0.6 ? 7.5 : 4)) { A.hit.delete(def.id); return; }
    // momentum = blade speed at the contact point x weapon mass
    const mom = Math.min(rel * (W.vf || 0.5), 15) * W.mass * (1 - 0.35 * att.armHurt), crit = att.riposteT > 0;
    let raw = (3 + mom) * W.sharp * (crit ? 1.4 : 1);
    let J = mom * W.kb * (crit ? 1.3 : 1);
    if (crit) { att.riposteT = 0; this.ev('riposte', pt.x, pt.y + 0.3, 1); }
    this.hitLog && this.hitLog.push({ rT: +def.rollT.toFixed(2), iT: +def.iT.toFixed(2), by: att.id, ph: A.ph, at: +A.t.toFixed(2), part, w: W.key, rel: +rel.toFixed(1), mom: +mom.toFixed(1), raw: +raw.toFixed(1) });
    const ax = att.b[0].getPosition().x, dxp = def.b[0].getPosition().x;
    const facingAtt = Math.sign(ax - dxp) === def.facing;
    const dir = Math.sign(dxp - ax) || att.facing;
    const nx = rel > 0 ? rx / rel : dir, ny = rel > 0 ? ry / rel : 0;
    // parry: Block pressed just before the blow lands
    if (def.parryT > 0 && facingAtt && def.pst === 'ok' && def.alive) {
      def.parryT = 0; def.riposteT = 1.0; def.blocking = true;
      this.stagger(att, 0.75); att.atkCd = 0.3;
      att.b[9].applyAngularImpulse(-att.facing * 1.5, true);
      this.addVel(att, -dir * 1.6, 0);
      this.ev('parry', pt.x, pt.y, 1);
      this.hitStop = Math.max(this.hitStop, 0.1); this.slowT = Math.max(this.slowT, 0.3);
      return;
    }
    if (def.blocking && facingAtt && this.shieldUp(def) && Math.random() < SHIELDS[def.shield.type].cover * (1 - 0.4 * def.bArmHurt)) { this.shieldHit(att, def, pt, raw, J, dir); return; }
    if (def.blocking && facingAtt) {
      att.stun = 0.28; att.atk = null; att.atkCd = 0.2;
      def.health = Math.max(0, def.health - raw * 0.1);
      this.ev('block', pt.x, pt.y, 1);
      this.addVel(att, -dir * 2.2, 0);
      this.addVel(def, dir * (0.8 + J * 0.05), 0);
      if (J > 32) { this.stagger(def, 0.35); this.ev('guardbreak', pt.x, pt.y + 0.4, 1); } // heavy blows smash through a guard
      tb.applyLinearImpulse(Vec2(nx * 1.5, ny * 1.5), pt, true);
      if (def.health <= 0) this.ko(def, nx, ny, pt);
      return;
    }
    // edged weapons can glance off intact plate unless the blow carries enough momentum
    const pc = def.pieces[PART_PIECE[part]];
    if (W.edge && pc.type === 3 && pc.hp > 0 && !crit) {
      const pGl = clamp(1 - (mom * W.arm - 10) / 22, 0, 0.85);
      if (Math.random() < pGl) {
        pc.hp -= raw * W.arm * 0.35; if (pc.hp <= 0) { pc.hp = 0; this.breakPiece(def, PART_PIECE[part], pt, nx, ny); }
        def.health = Math.max(0, def.health - raw * 0.12);
        this.ev('glance', pt.x, pt.y, 1);
        A.ph = 'rec'; A.t = 0; att.stun = Math.max(att.stun, 0.15);
        const wv = att.b[9].getAngularVelocity(); att.b[9].setAngularVelocity(-wv * 0.5);
        this.react(def, J * 0.35, dir, tb, pt, nx, ny);
        if (def.health <= 0) this.ko(def, nx, ny, pt);
        return;
      }
    }
    if (def.pst === 'down') { raw *= 0.6; J *= 0.5; }
    const r = this.damage(def, part, raw, { prot: W.prot, arm: W.arm, pt, dx: nx, dy: ny });
    J *= 1 - (pc.hp > 0 ? ARMOUR[pc.type].prot * 0.25 : 0);
    this.react(def, J, dir, tb, pt, nx, ny);
    if (r.raw > 18) this.hitStop = Math.max(this.hitStop, 0.05 + Math.min(0.05, r.raw * 0.001));
    if (def.health <= 0) this.ko(def, nx, ny, pt);
  };

  S.ko = function (def, nx, ny, pt) {
    if (!def.alive || def.pst === 'finish') return;
    const rest = this.fighters.filter((f) => f.alive && f !== def && f.pst !== 'finish');
    const sides = new Set(rest.map((f) => f.side));
    if (this.state === 'fight' && sides.size === 1 && !sides.has(def.side)) { this.enterFinish(def, [...sides][0]); return; } // round-deciding blow
    def.alive = false; def.atk = null; def.kick = null; def.bash = null; def.blocking = false; def.draw = 0; def.pst = 'ko'; def.dieT = 0.9; // death animation, then limp
    for (const b of def.b) { const v = b.getLinearVelocity(); b.setLinearVelocity(Vec2(v.x + nx * 2.5, v.y + Math.abs(ny) * 1.5 + 1)); }
    this.ev('ko', pt.x, pt.y, 1);
    if (sides.size <= 1 && this.state === 'fight') {
      this.slowT = 1.5; this.koCam = def.id;
      this.endRound(sides.size ? [...sides][0] : -1, 'K.O.!');
    } else this.slowT = Math.max(this.slowT, 0.45);
  };
  // ---- FINISH HIM + fatalities ----
  S.enterFinish = function (def, side) {
    def.pst = 'finish'; def.health = 0; def.atk = null; def.kick = null; def.bash = null; def.blocking = false; def.draw = 0; def.imp = 0; def.stiff = 0.6; def.stun = 0;
    this.state = 'finish'; this.stateT = 0; this.msg = '';
    this.fin = { v: def.id, side, t: 3.6, fat: null, ft: 0, hit: false, by: -1, hitT: 0, slow: 0.5, farT: 0 };
    const p = def.b[0].getPosition(); this.ev('finish', p.x, p.y, 1);
    this.slowT = Math.max(this.slowT, 0.4); this.hitStop = 0.1;
  };
  S.collapse = function () { // nobody finished them in time: a normal death
    const F = this.fin, v = this.fighters[F.v];
    v.pst = 'ko'; v.alive = false; v.dieT = 1.1;
    const p = v.b[0].getPosition(); this.ev('ko', p.x, p.y, 0.7);
    this.fin = null; this.slowT = 1.4; this.koCam = v.id;
    this.endRound(F.side, 'K.O.!');
  };
  S.fatalityType = function (f) {
    const W = this.weapon(f);
    return W.kind === 'gun' ? 'shot' : W.kind === 'bow' ? 'arrow' : W.style === 'spear' ? 'lift' : (W.key === 'axe' || W.key === 'mace') ? 'slam' : 'spin';
  };
  S.tryFatality = function (f, forced) {
    const F = this.fin; if (!F || F.fat || F.hit || !f.alive || f.pst !== 'ok' || f.side !== F.side) return false;
    const v = this.fighters[F.v], type = forced || this.fatalityType(f);
    const dx = v.b[0].getPosition().x - f.b[0].getPosition().x;
    if (Math.abs(dx) > (type === 'shot' || type === 'arrow' ? 12 : 2.6)) { if (F.farT <= 0) { F.farT = 0.8; const p = f.b[0].getPosition(); this.ev('toofar', p.x, p.y + 0.9, 0); } return false; }
    const dir = Math.sign(dx) || f.facing;
    if (dir !== f.facing) this.setFacing(f, dir);
    if (v.facing !== -dir) this.setFacing(v, -dir);
    f.atk = null; f.kick = null; f.bash = null; f.blocking = false; f.draw = 0; f.reloadT = 0; f.rollT = 0; f.dashT = 0;
    if (type === 'shot' && f.ws[f.slot].ammo <= 0) f.ws[f.slot].ammo = 1; // the finisher always has one round left
    Object.assign(F, { fat: type, by: f.id, ft: 0, slow: 0.5, j: 0, carry: false }); this.lastFat = type;
    const p = f.b[0].getPosition(); this.ev('fatstart', p.x, p.y, 1);
    this.koCam = v.id;
    return true;
  };
  const FAT_END = { spin: 1.9, slam: 2.0, lift: 2.1, shot: 2.2, arrow: 2.5, bash: 2.0, kick: 1.8 };
  const FAT_GAP = { spin: 1.25, slam: 1.1, lift: 1.55, bash: 0.8, kick: 0.95 };
  S.fatalityControl = function (a, dt) {
    const F = this.fin, v = this.fighters[F.v], W = this.weapon(a); F.ft += dt;
    const T = F.ft, fc = a.facing, dir = fc, t = a.b[0], pos = t.getPosition(), vel = t.getLinearVelocity(), ang = t.getAngle(), vp = v.b[0].getPosition();
    a.stiff = 1; a.t += dt;
    const Q = mkPose(); Q.lean = -0.05; Q.crouch = 0.06;
    if (this.shieldUp(a)) { Q.sB = 1.25; Q.eB = 1.35; }
    const o = { grounded: pos.y < STAND_Y + 0.2 && T > 0.02, W, armT: 700, gA: 30, legT: 320, ranged: W.kind !== 'melee' };
    if (FAT_GAP[F.fat] && T < 0.3 && !F.hit) { const want = vp.x - dir * FAT_GAP[F.fat]; this.addVel(a, (clamp((want - pos.x) * 9, -9, 9) - vel.x) * 0.5, 0); } // step in
    else if (o.grounded) this.addVel(a, -vel.x * 0.25, 0);
    F.slow = 0.7;
    const hitAt = (tt) => !F.hit && T >= tt;
    const hop = (vy) => { if (!F.j) { F.j = 1; for (const b of a.b) { const bv = b.getLinearVelocity(); b.setLinearVelocity(Vec2(bv.x, vy)); } } };
    switch (F.fat) {
      case 'spin': // spinning slash that knocks them flying
        if (T < 0.3) Object.assign(Q, { sF: 2.7, eF: 1.3, lean: 0.2, crouch: 0.18 });
        else if (T < 0.74) { hop(5.5); if (T - dt < 0.3) this.ev('swing', pos.x, pos.y, 2); Object.assign(Q, { sF: 1.6, eF: 0.05, hF: 1.2, kF: -1.6, hB: 0.6, kB: -1.4 }); o.spin = -fc * 2 * Math.PI / 0.44; o.grounded = false; F.slow = 0.5; }
        if (hitAt(0.52)) this.fatalImpact(v, dir * 13, 8, -fc * 14);
        break;
      case 'slam': // overhead slam into the ground
        if (T < 0.35) Object.assign(Q, { sF: 2.9, eF: 1.5, lean: 0.25, crouch: 0.2 });
        else if (T < 0.6) { hop(6.5); Object.assign(Q, { sF: 3.1, eF: 1.7, lean: 0.3, hF: 1.0, kF: -1.4, hB: 0.2, kB: -0.9 }); o.grounded = false; }
        else { Object.assign(Q, { sF: 0.05, eF: 0.05, lean: -0.45, crouch: 0.2 }); o.armT = 1400; o.gA = 40; if (T - dt < 0.6) this.ev('swing', pos.x, pos.y, 2); }
        if (hitAt(0.7)) { this.fatalImpact(v, dir * 1.5, -15, fc * 3); this.ev('slam', vp.x, 0, 1); }
        break;
      case 'lift': // spear thrust, lift overhead and throw
        if (T < 0.25) Object.assign(Q, { sF: 0.55, eF: 1.7, lean: 0.12, crouch: 0.06 });
        else if (T < 0.45) Object.assign(Q, { sF: 1.35, eF: 0.02, lean: -0.3, crouch: 0.1 });
        else if (T < 1.05) { const k = (T - 0.45) / 0.6; Object.assign(Q, { sF: 1.35 + 1.55 * k, eF: 0.1, lean: 0.1 + 0.25 * k, crouch: 0.12 }); o.armT = 1300; F.slow = 0.7; }
        else Object.assign(Q, { sF: 2.9, eF: 0.2, lean: 0.25 });
        if (T >= 0.35 && !F.carry && !F.hit) { F.carry = true; this.ev('pierce', vp.x, vp.y + 0.2, 1); this.hitStop = 0.08; }
        if (hitAt(1.05)) { F.carry = false; this.fatalImpact(v, dir * 8, 10, -fc * 10); }
        break;
      case 'shot': case 'arrow': { // slow-motion final shot / arrow
        const sh = a.b[8].getPosition(), hd = v.b[1].getPosition();
        const sp = W.speed * (F.fat === 'shot' ? 0.5 : 1), dxh = hd.x - sh.x, dyh = hd.y - sh.y, tt = Math.hypot(dxh, dyh) / sp;
        a.aim = Math.atan2(dyh + 0.5 * G * (W.grav || 0) * tt * tt, dxh);
        const shT = wrap(a.aim + Math.PI / 2 - ang + a.recoil * fc);
        Q.sF = shT * fc; Q.eF = 0.06;
        if (W.kind === 'bow') { a.draw = clamp(T / 0.6, 0, 1); Q.sB = shT * fc; Q.eB = 0.25 + a.draw * 2.1; }
        else if (W.two) { Q.sB = wrap(shT - 0.35 * fc) * fc; Q.eB = 0.8; }
        const fireT = F.fat === 'shot' ? 0.45 : 0.65;
        if (T >= fireT - 0.15 && !F.hit) F.slow = 0.22;
        if (!F.fired && T >= fireT) {
          F.fired = true; a.draw = 0;
          const fb = a.b[9], a0 = fb.getAngle() - Math.PI / 2, hand = fb.getWorldPoint(Vec2(0, -D.fa / 2));
          const mx = hand.x + Math.cos(a0) * W.len, my = hand.y + Math.sin(a0) * W.len;
          const aa = Math.atan2(hd.y - my + 0.5 * G * (W.grav || 0) * tt * tt, hd.x - mx);
          this.spawnProj(a, W, mx, my, aa, sp, 999); this.projs[this.projs.length - 1].fatal = true;
          a.recoil = Math.min(0.9, a.recoil + (W.recoil || 0) * 0.5);
          this.ev(W.key, mx, my, aa);
        }
        if (hitAt(fireT + 1.0)) this.fatalImpact(v, dir * 10, 5, -fc * 10); // safety net if the shot somehow missed
        o.ranged = true;
        break; }
      case 'bash': // shield bash combo, then launch
        if ((T > 0.15 && T < 0.3) || (T > 0.45 && T < 0.6) || (T > 0.8 && T < 1.0)) Object.assign(Q, { sB: 1.6, eB: 0.1, lean: -0.25 }); else Object.assign(Q, { sB: 1.1, eB: 1.8, lean: 0.1 });
        if ((T >= 0.22 && T - dt < 0.22) || (T >= 0.52 && T - dt < 0.52)) { this.addVel(v, dir * 1.2, 0.6); const c = a.b[3].getPosition(); this.ev('bash', c.x, c.y, 1); }
        if (hitAt(0.88)) this.fatalImpact(v, dir * 12, 8, -fc * 9);
        break;
      case 'kick': // launch kick
        if (T < 0.18) Object.assign(Q, { hF: 1.8, kF: -2.0, hB: -0.2, kB: -0.25, lean: 0.25 });
        else Object.assign(Q, { hF: 1.55, kF: -0.05, hB: -0.25, kB: -0.2, lean: 0.32 });
        o.legT = 600;
        if (hitAt(0.24)) this.fatalImpact(v, dir * 14, 10, -fc * 13);
        break;
    }
    if (F.hit && F.ft - F.hitT < 0.3) F.slow = 0.25;
    this.actuate(a, Q, o);
    if (F.ft > FAT_END[F.fat] || (F.hit && F.ft - F.hitT > 1.2 && o.ranged)) this.finishFatality();
  };
  S.fatalImpact = function (v, vx, vy, w) {
    const F = this.fin; if (!F || F.hit) return;
    F.hit = true; F.hitT = F.ft; F.carry = false;
    v.pst = 'ko'; v.alive = false; v.dieT = 0; this.limp(v);
    for (const b of v.b) b.setLinearVelocity(Vec2(vx + (Math.random() - 0.5) * 2, vy + (Math.random() - 0.5) * 2));
    v.b[0].setAngularVelocity(w);
    const d = Math.sign(vx) || 1;
    for (const pi of [0, 1]) { const pc = v.pieces[pi]; if (pc.hp > 0 && pc.type > 0) { pc.hp = 0; this.breakPiece(v, pi, v.b[pi === 0 ? 1 : 0].getPosition(), d, 0.5); } } // armour flies off
    if (v.shield.type && v.shield.hp > 0) this.breakShield(v, v.b[3].getPosition(), d, true);
    const p = v.b[0].getPosition(); this.ev('fatal', p.x, p.y, 1);
    this.hitStop = 0.12; this.msg = '';
  };
  S.finishFatality = function () {
    const F = this.fin; this.fin = null; this.fatBanner = 2.6; this.slowT = 0.9;
    if (!F.hit) { const v = this.fighters[F.v]; v.pst = 'ko'; v.alive = false; v.dieT = 0; }
    this.endRound(F.side, 'FATALITY!');
  };
  S.finishControl = function (v, dt) { // on their knees, swaying, waiting to be finished
    const F = this.fin, t = v.b[0], pos = t.getPosition(), vel = t.getLinearVelocity(); v.t += dt;
    if (F && F.carry) { // lifted on the spear tip
      const a = this.fighters[F.by], W = this.weapon(a), fb = a.b[9], ang = fb.getAngle() + SWORD_A(a.facing), hand = fb.getWorldPoint(Vec2(0, -D.fa / 2));
      const tx = hand.x + Math.cos(ang) * W.len * 0.85, ty = hand.y + Math.sin(ang) * W.len * 0.85 - 0.15;
      t.setLinearVelocity(Vec2((tx - pos.x) * 12, (ty - pos.y) * 12)); v.bal.setMaxTorque(0);
      for (const k in v.j) { v.j[k].setMaxMotorTorque(6); v.j[k].setMotorSpeed(0); }
      return;
    }
    this.addVel(v, -vel.x * 0.15, 0);
    const Q = { sF: 0.2, eF: 0.4, sB: 0.1, eB: 0.4, hF: 1.45, kF: -1.7, hB: -0.15, kB: -2.1, lean: -0.3 + 0.13 * Math.sin(v.t * 2.6), crouch: 0.42 + 0.03 * Math.sin(v.t * 1.7), neck: -0.3 };
    v.stiff = 0.55;
    this.actuate(v, Q, { grounded: true, sup: 0.8, bal: 0.35, armT: 60, legT: 260, W: this.weapon(v) });
  };
  S.dieControl = function (f, dt) { // knees buckle and they topple forward, then go limp
    f.dieT -= dt; const k = clamp(f.dieT / 1.0, 0, 1); f.stiff = 0.5 * k;
    const Q = { sF: 0.3, eF: 0.3, sB: 0.2, eB: 0.3, hF: 1.3, kF: -1.9, hB: 0.2, kB: -1.7, lean: -1.2, crouch: 0.5, neck: -0.4 };
    this.actuate(f, Q, { grounded: f.b[0].getPosition().y < STAND_Y + 0.2, sup: 0.5 * k, bal: 0.25 * k, armT: 50, legT: 200, W: this.weapon(f) });
    if (f.dieT <= 0) this.limp(f);
  };
  S.endRound = function (winner, msg) {
    this.state = 'ko'; this.stateT = 0; this.winner = winner; this.msg = msg;
    if (winner >= 0) this.scores[winner]++;
  };

  // ---- computer players ----
  S.aiThink = function (f, dt) {
    const p = this.players[f.id], dc = DIFF[p.cpu] || DIFF.normal, mem = this.ai[f.id], inp = this.inputs[f.id];
    mem.t -= dt; mem.bT -= dt;
    if (!f.alive) { inp.h = 0; inp.b = 0; return; }
    if (this.state === 'finish' && this.fin) { // winners sometimes walk up and perform a fatality
      inp.l = inp.r = inp.b = inp.h = 0;
      const F = this.fin; if (f.side !== F.side || F.fat || f.pst === 'finish') return;
      if (mem.fin !== F) { mem.fin = F; mem.finGo = Math.random() < (FAT_CHANCE[p.cpu] || 0.5); mem.finDelay = 0.3 + Math.random() * 0.9; mem.finKick = Math.random() < 0.12; }
      if (!mem.finGo) return;
      mem.finDelay -= dt; if (mem.finDelay > 0) return;
      const v = this.fighters[F.v], dx = v.b[0].getPosition().x - f.b[0].getPosition().x, Wf = this.weapon(f);
      if (Math.abs(dx) > (Wf.kind === 'melee' || mem.finKick ? 1.9 : 8)) { dx > 0 ? (inp.r = 1) : (inp.l = 1); return; }
      mem.fxT -= dt; if (mem.fxT <= 0) { mem.fxT = 0.5; if (mem.finKick) inp.k++; else inp.fx++; }
      return;
    }
    if (mem.feintAt > 0) { mem.feintAt -= dt; if (mem.feintAt <= 0 && f.atk && f.atk.ph === 'wind') { inp.b = 1; mem.blocking = true; mem.bT = 0.12; return; } }
    if (f.pst === 'down') { inp.l = inp.r = inp.b = inp.h = 0; if (Math.random() < dc.aggr * 0.08) inp.j++; return; } // mash to get up
    if (f.pst !== 'ok') { inp.l = inp.r = inp.b = 0; return; }
    const tgt = this.nearestEnemy(f);
    if (!tgt) { inp.l = inp.r = inp.b = inp.h = 0; return; }
    const mx = f.b[0].getPosition().x, tx = tgt.b[0].getPosition().x, dx = tx - mx, dist = Math.abs(dx), dir = Math.sign(dx) || 1;
    const W = this.weapon(f), O = WEAPONS[f.ws[1 - f.slot].key], ranged = W.kind !== 'melee';
    const TW = this.weapon(tgt);
    if (ranged) { inp.am = this.autoAim(f, W) + mem.err; } else inp.am = null;
    if (mem.drawT > 0) { mem.drawT -= dt; if (mem.drawT <= 0) inp.h = 0; }
    if (mem.bT <= 0 && mem.blocking) { mem.blocking = false; inp.b = 0; }
    // incoming melee: decide once per swing whether to block (timed near the strike = parry), roll away, or ignore
    const reach = TW.kind === 'melee' ? 1.2 + TW.len : 0;
    const threat = !ranged && tgt.atk && (tgt.atk.ph === 'wind' || tgt.atk.ph === 'strike') && dist < reach + 0.6;
    if (threat && mem.seen !== tgt.atk) {
      mem.seen = tgt.atk;
      const r = Math.random();
      const left = tgt.atk.ph === 'wind' ? TW.T[0] - tgt.atk.t : 0;
      if (r < dc.block) { mem.blockAt = Math.max(0, left - dc.lead[0] - Math.random() * (dc.lead[1] - dc.lead[0])); mem.act = 'block'; }
      else if (r < dc.block + dc.dash * 0.8 && TW.mass > 2) { mem.act = 'roll'; mem.blockAt = dc.react * 0.5; }
      else mem.act = null;
    }
    if (mem.act && mem.seen === tgt.atk && tgt.atk) {
      mem.blockAt -= dt;
      if (mem.blockAt <= 0) {
        if (mem.act === 'block') { inp.b = 1; inp.l = inp.r = 0; mem.blocking = true; mem.bT = 0.45; }
        else { inp.d++; inp.b = 0; dir > 0 ? (inp.l = 1, inp.r = 0) : (inp.r = 1, inp.l = 0); }
        mem.act = null;
      }
      return;
    }
    if (mem.blocking) return;
    if (mem.t > 0) return;
    mem.t = dc.react * (0.6 + Math.random() * 0.8);
    mem.err = (Math.random() - 0.5) * 2 * dc.aimErr;
    inp.l = inp.r = 0; inp.b = 0;
    if (ranged && dist < 2.3 && O.kind === 'melee' && Math.random() < 0.7) { inp.h = 0; inp.w++; return; }
    if (!ranged && O.kind !== 'melee' && dist > 6 && Math.random() < 0.35) { inp.w++; return; }
    if (ranged) {
      const want = W.kind === 'bow' ? 7 : W.key === 'shotgun' ? 3.5 : 6;
      if (dist < 1.6 && Math.random() < dc.aggr) { inp.k++; return; }
      if (dist < want - 1.5) dir > 0 ? (inp.l = 1) : (inp.r = 1);
      else if (dist > want + 2) dir > 0 ? (inp.r = 1) : (inp.l = 1);
      if (W.kind === 'bow') { if (!inp.h && f.reloadT <= 0 && Math.random() < dc.aggr) { inp.h = 1; mem.drawT = 0.45 + Math.random() * 0.35; } }
      else if (W.auto) { inp.h = Math.random() < dc.aggr ? 1 : 0; }
      else if (Math.random() < dc.aggr) inp.a++;
      if (Math.random() < dc.jump) inp.j++;
      return;
    }
    const range = 0.55 + W.len * 0.85, lowHp = f.health < 35;
    // opponent on the floor: close in and wait for them to rise (they are invulnerable while getting up)
    if (tgt.pst === 'down' || tgt.pst === 'getup') {
      if (dist > range + 0.4) dir > 0 ? (inp.r = 1) : (inp.l = 1);
      else if (tgt.pst === 'down' && Math.random() < dc.aggr * 0.3) inp.a++;
      return;
    }
    // riposte window after a parry, or a staggered opponent: punish
    if ((f.riposteT > 0 || tgt.pst === 'stagger') && dist < range + 0.8) { inp.a++; if (dist > range) dir > 0 ? (inp.r = 1) : (inp.l = 1); return; }
    // turtle breaker
    if (tgt.blocking && dist < 1.25 && f.kickCd <= 0 && Math.random() < 0.15 + dc.aggr * 0.3) { inp.k++; return; }
    if (dist > range + 0.3) {
      dir > 0 ? (inp.r = 1) : (inp.l = 1);
      if (dist > 4 && Math.random() < dc.dash * 0.6) inp.d++;
      if (Math.random() < dc.jump) inp.j++;
      if (dist < range + 1.0 && Math.random() < dc.aggr * 0.3) inp.a++;
    } else if (dist < 0.8) {
      if (Math.random() < 0.15 && f.kickCd <= 0) inp.k++;
      else { dir > 0 ? (inp.l = 1) : (inp.r = 1); if (Math.random() < dc.aggr * 0.4) inp.a++; }
    } else {
      if (f.atkCd <= 0 && !f.atk && Math.random() < dc.aggr) { inp.a++; if (Math.random() < dc.feint) mem.feintAt = 0.06 + Math.random() * 0.08; if (Math.random() < 0.4) (dir > 0 ? (inp.r = 1) : (inp.l = 1)); }
      else if (lowHp && Math.random() < 0.3) { dir > 0 ? (inp.l = 1) : (inp.r = 1); }
      else if (Math.random() < 0.25) { Math.random() < 0.5 ? (inp.l = 1) : (inp.r = 1); }
      else if (Math.random() < dc.block * 0.25) { inp.b = 1; mem.blocking = true; mem.bT = 0.3; }
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
    // wall bounce: fighters knocked into the arena walls rebound off them
    for (const f of fs) {
      const t = f.b[0], x = t.getPosition().x, vx = t.getLinearVelocity().x;
      if (f.wallCd > 0 || Math.abs(x) < ARENA - 0.9 || Math.sign(vx) !== Math.sign(x) || Math.abs(vx) < 3.5) continue;
      if (f.alive && f.pst === 'ok' && f.dashT <= 0) continue;
      f.wallCd = 0.5;
      this.addVel(f, -vx * 1.6, 2.2);
      this.ev('wall', Math.sign(x) * ARENA, t.getPosition().y, Math.min(1, Math.abs(vx) / 9));
      if (f.alive) {
        f.health = Math.max(0, f.health - Math.min(8, Math.abs(vx) * 0.7));
        if (f.pst === 'stagger' && Math.abs(vx) > 6) this.knockDown(f, 0.8, 3);
        if (f.health <= 0) this.ko(f, -Math.sign(x), 0.3, t.getPosition());
      }
    }
    this.world.step(DT, 8, 3);
    for (const [a, b, p] of this.clashQ) {
      if (!this.isEnemy(a, b) || a.rollT > 0 || b.rollT > 0) continue;
      if (a.clashT > 0 && b.clashT > 0) continue;
      const sa = a.atk && (a.atk.ph === 'strike' || a.atk.ph === 'follow'), sb = b.atk && (b.atk.ph === 'strike' || b.atk.ph === 'follow');
      if (!sa && !sb) continue;
      const pt = p || this.bladeGeom(a).hand;
      const va = a.b[9].getLinearVelocityFromWorldPoint(pt), vb = b.b[9].getLinearVelocityFromWorldPoint(pt);
      if (Math.hypot(va.x - vb.x, va.y - vb.y) < 4) continue; // resting blades just slide
      a.clashT = b.clashT = 0.2;
      this.ev('clash', pt.x, pt.y, 1);
      if (sa && sb) { // true blade-on-blade exchange: both rebound, the lighter weapon loses more
        for (const f of [a, b]) {
          const o = f === a ? b : a, heavier = this.weapon(o).mass > this.weapon(f).mass * 1.5;
          f.atk.ph = 'rec'; f.atk.t = 0; f.stun = Math.max(f.stun, heavier ? 0.35 : 0.12);
          const wv = f.b[9].getAngularVelocity(); f.b[9].setAngularVelocity(-wv * 0.4);
          if (heavier) this.stagger(f, 0.3);
        }
      } else { // a swing meets a passive guard: a heavy enough blow smashes it aside and carries on
        const att = sa ? a : b, def = sa ? b : a, Wa = this.weapon(att), Wd = this.weapon(def);
        if (def.pst !== 'ok') def.b[9].applyAngularImpulse(-def.facing * 0.4 * Wa.mass, true); // a staggered guard is no guard
        else if (Wa.mass < Wd.mass * 0.8) { att.atk.ph = 'rec'; att.atk.t = 0; att.stun = Math.max(att.stun, 0.12); }
        else def.b[9].applyAngularImpulse(-def.facing * 0.25 * Wa.mass, true);
      }
    }
    this.clashQ.length = 0;
    for (const [att, def, p] of this.shieldQ) { // a swing that physically meets a shield is stopped by it
      const A = att.atk;
      if (!this.isEnemy(att, def) || !A || !(A.ph === 'strike' || A.ph === 'follow') || A.hit.has(def.id) || !def.alive || def.pst === 'finish' || !def.shFx) continue;
      const W = this.weapon(att), pt = p ? Vec2(p.x, p.y) : def.b[3].getPosition();
      const vs = att.b[9].getLinearVelocityFromWorldPoint(pt), vt = def.b[3].getLinearVelocity(), rel = Math.hypot(vs.x - vt.x, vs.y - vt.y);
      if (rel < 3) continue;
      const mom = Math.min(rel * (W.vf || 0.5), 15) * W.mass;
      this.shieldHit(att, def, pt, (3 + mom) * W.sharp, mom * W.kb, Math.sign(def.b[0].getPosition().x - att.b[0].getPosition().x) || att.facing);
    }
    this.shieldQ.length = 0;
    for (const f of this.fighters) this.checkHits(f);
    this.updateProjs();
    for (const d of this.debris.slice()) { d.life -= DT; if (d.life <= 0) { this.debris.splice(this.debris.indexOf(d), 1); this.world.destroyBody(d.b); } }
  };

  S.update = function (realDt) {
    const dt = Math.min(realDt, 0.05);
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    this.slowT -= dt; this.timeScale = this.slowT > 0 ? (this.koCam >= 0 ? 0.25 : 0.4) : 1;
    this.fatBanner = Math.max(0, this.fatBanner - dt);
    if (this.fin && this.fin.fat) { this.timeScale = this.fin.slow || 0.5; this.slowT = Math.max(this.slowT, 0.25); this.koCam = this.fin.v; }
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
    } else if (this.state === 'finish') {
      const F = this.fin;
      if (F) { F.farT -= dt; if (!F.fat) { F.t -= dt; if (F.t <= 0) this.collapse(); } }
      else if (this.state === 'finish') this.state = 'ko';
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
        const fl = (f.alive ? 1 : 0) | (f.blocking ? 2 : 0) | (f.atk && (f.atk.ph === 'strike' || f.atk.ph === 'follow') ? 4 : 0) | (f.stun > 0 ? 8 : 0) |
          (f.pst === 'down' || f.pst === 'getup' ? 16 : 0) | (f.rollT > 0 ? 32 : 0) | (f.kick ? 64 : 0) | (f.pst === 'stagger' ? 128 : 0) | (f.riposteT > 0 ? 256 : 0) | (f.pst === 'finish' ? 512 : 0) | (f.bash ? 1024 : 0);
        const ar = f.pieces.map((pc) => (pc.type === 0 ? '-' : pc.hp <= 0 ? 'x' : String(Math.max(1, Math.ceil(pc.hp / pc.max * 9))))).join('');
        return { p, h: f.health, fa: f.facing, fl, ar, wp: WLIST.indexOf(f.ws[f.slot].key), am: f.ws[f.slot].ammo, rl: f.reloadT > 0 ? 1 : 0, dr: Math.round(f.draw * 10) / 10, sd: f.side,
          sh: f.shield.type ? f.shield.type + (f.shield.hp <= 0 ? 'x' : String(Math.max(1, Math.ceil(f.shield.hp / f.shield.max * 9)))) + (f.shFx ? 'a' : 's') : '',
          hu: '' + Math.round(f.legHurt * 9) + Math.round(f.armHurt * 9) + (f.dazeT > 0 ? 1 : 0) };
      }),
      pr: this.projs.map((p) => { const q = p.b.getPosition(); return [q.x, q.y, p.stuck ? p.b.getAngle() : p.ang, p.arrow ? 1 : 0]; }),
      db: this.debris.map((d) => { const q = d.b.getPosition(); return [q.x, q.y, d.b.getAngle(), d.piece, d.fid, d.type, Math.min(1, d.life / 1.5)]; }),
      sc: this.scores.slice(), st: this.state, tm: Math.ceil(this.timer), rd: this.round, msg: this.msg, ts: this.timeScale,
      champ: this.state === 'over' ? this.champ : -1, kf: this.slowT > 0 ? this.koCam : -1, tmode: this.teams ? 1 : 0,
      fin: this.fin ? [this.fin.v, this.fin.side, Math.max(0, Math.round(this.fin.t * 10) / 10), this.fin.fat || '', this.fin.hit ? 1 : 0, this.fin.by] : null, ban: this.fatBanner > 0 ? 1 : 0
    };
  };

  window.RSGame = { SUP, T1, T2, STY, SHIELDS, Sim, D, SWORD_A, ARENA, STAND_Y, HIP_OFF, SHO_OFF, DIFF, WEAPONS, WLIST, MELEE, RANGED, ARMOUR, DEFAULT_LOADOUT, randomLoadout, sanitizeLoadout, loadoutStats };
})();

/* Ragdoll Slash - physics + game rules (runs on solo device or on the host) */
(function () {
  'use strict';
  const pl = planck, Vec2 = pl.Vec2;
  const G = 20, ARENA = 9, DT = 1 / 60, WIN_SCORE = 3, ROUND_TIME = 60;
  const D = { tw: 0.15, th: 0.3, hr: 0.14, ua: 0.3, fa: 0.28, thg: 0.43, shn: 0.43, aw: 0.05, fw: 0.045, lw: 0.07 };
  const HIP_OFF = 0.26, SHO_OFF = 0.24;
  const STAND_Y = 0.83 + HIP_OFF;
  const CAT = { GROUND: 1, BODY: 2, BLADE: 4, SENSE: 8 };
  // part order: 0 torso,1 head,2 back upper arm,3 back forearm,4 back thigh,5 back shin,6 front thigh,7 front shin,8 sword upper arm,9 sword forearm
  const PART_MUL = [1, 1.5, 0.7, 0.7, 0.75, 0.75, 0.75, 0.75, 0.7, 0.7];
  const SWORD_A = (fc) => (fc > 0 ? -1.0 : Math.PI + 1.0);
  const DIFF = {
    easy: { react: 0.5, aggr: 0.35, block: 0.12, dash: 0.0, spacing: 1.5, jump: 0.01 },
    normal: { react: 0.28, aggr: 0.6, block: 0.4, dash: 0.08, spacing: 1.45, jump: 0.02 },
    hard: { react: 0.14, aggr: 0.85, block: 0.72, dash: 0.2, spacing: 1.4, jump: 0.03 }
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  function Sim(players) {
    // players: [{name, color, cpu: null|'easy'|'normal'|'hard'}]
    this.players = players;
    this.inputs = players.map(() => ({ l: 0, r: 0, b: 0, a: 0, j: 0, d: 0 }));
    this.ai = players.map(() => ({ t: 0 }));
    this.scores = players.map(() => 0);
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
    this.fighters = [];
    this.acc = 0; this.slowT = 0; this.timeScale = 1;
    this.startRound();
  }
  const S = Sim.prototype;

  S.ev = function (type, x, y, p) { const e = [type, +x.toFixed(2), +y.toFixed(2), +(p || 0).toFixed(2)]; this.events.push(e); this.netEvents.push(e); };
  S.drainEvents = function () { const e = this.events; this.events = []; return e; };
  S.drainNetEvents = function () { const e = this.netEvents; this.netEvents = []; return e; };

  S.startRound = function () {
    for (const f of this.fighters) for (const b of f.b) this.world.destroyBody(b);
    this.fighters = [];
    const n = this.players.length;
    const xs = n === 2 ? [-2.4, 2.4] : n === 3 ? [-4, 0, 4] : [-5.4, -1.8, 1.8, 5.4];
    for (let i = 0; i < n; i++) this.fighters.push(this.makeFighter(i, xs[i], xs[i] < 0 ? 1 : -1));
    this.round++; this.state = 'intro'; this.stateT = 0; this.timer = ROUND_TIME; this.winner = -1;
    this.msg = 'Round ' + this.round; this.slowT = 0;
  };
  S.restartMatch = function () { this.scores = this.players.map(() => 0); this.round = 0; this.startRound(); };

  S.makeFighter = function (idx, x, facing) {
    const w = this.world, grp = -(idx + 1);
    const f = { id: idx, b: [], j: {}, facing: 1, health: 100, alive: true, atk: null, atkCd: 0, comboT: 0, lastType: '',
      stun: 0, jumpT: 0, dashT: 0, dashCd: 0, dashDir: 1, walk: 0, turnT: 0, blocking: false, grounded: true,
      la: 0, lj: 0, ld: 0, wantAtk: 0, wantJump: 0, wantDash: 0, clashT: 0 };
    const ty = STAND_Y + 0.02;
    const fdef = (dens, part) => ({ density: dens, friction: 0.7, filterGroupIndex: grp, filterCategoryBits: CAT.BODY,
      filterMaskBits: CAT.GROUND | CAT.SENSE, userData: { k: 'body', f, part } });
    const mk = (px, py, shape, dens, part) => {
      const b = w.createBody({ type: 'dynamic', position: Vec2(px, py), angularDamping: 0.6, linearDamping: 0.05 });
      b.createFixture(shape, fdef(dens, part)); f.b[part] = b; return b;
    };
    const torso = mk(x, ty, new pl.Box(D.tw, D.th), 30, 0);
    const headY = ty + D.th + D.hr + 0.02;
    const head = mk(x, headY, new pl.Circle(D.hr), 20, 1);
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
      const j = w.createJoint(new pl.RevoluteJoint({ enableLimit: true, lowerAngle: lim[0], upperAngle: lim[1], enableMotor: true,
        maxMotorTorque: 50, motorSpeed: 0 }, a, b, anchor));
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
    f.mass = f.b.reduce((m, b) => m + b.getMass(), 0);
    this.setFacing(f, facing);
    f.mass = f.b.reduce((m, b) => m + b.getMass(), 0);
    return f;
  };

  S.setFacing = function (f, fc) {
    f.facing = fc;
    for (const k in f.j) { const j = f.j[k], l = j._lim; if (fc > 0) j.setLimits(l[0], l[1]); else j.setLimits(-l[1], -l[0]); }
    const b = f.b[9];
    if (f.bladeFx) { b.destroyFixture(f.bladeFx); b.destroyFixture(f.senseFx); }
    const a = SWORD_A(fc), dx = Math.cos(a), dy = Math.sin(a), hy = -D.fa / 2;
    f.bladeFx = b.createFixture(new pl.Box(0.56, 0.028, Vec2(dx * 0.44, hy + dy * 0.44), a),
      { density: 6, friction: 0.3, filterGroupIndex: f.grp, filterCategoryBits: CAT.BLADE, filterMaskBits: CAT.BLADE, userData: { k: 'blade', f } });
    f.senseFx = b.createFixture(new pl.Box(0.47, 0.08, Vec2(dx * 0.58, hy + dy * 0.58), a),
      { density: 0, isSensor: true, filterGroupIndex: f.grp, filterCategoryBits: CAT.SENSE, filterMaskBits: CAT.BODY, userData: { k: 'sense', f } });
  };

  function drive(j, target, torque, gain) {
    j.setMaxMotorTorque(torque);
    j.setMotorSpeed(clamp((target - j.getJointAngle()) * (gain || 15), -30, 30));
  }

  S.nearestEnemy = function (f) {
    let best = null, bd = 1e9; const x = f.b[0].getPosition().x;
    for (const o of this.fighters) if (o !== f && o.alive) { const d = Math.abs(o.b[0].getPosition().x - x); if (d < bd) { bd = d; best = o; } }
    return best;
  };

  S.limp = function (f) { for (const k in f.j) { f.j[k].setMaxMotorTorque(k === 'neck' ? 1.5 : 2.5); f.j[k].setMotorSpeed(0); } };

  S.control = function (f, dt) {
    const t = f.b[0];
    f.stun = Math.max(0, f.stun - dt); f.jumpT -= dt; f.dashT -= dt; f.dashCd -= dt; f.atkCd -= dt; f.comboT -= dt; f.clashT -= dt;
    f.wantAtk -= dt; f.wantJump -= dt; f.wantDash -= dt;
    if (!f.alive) { this.limp(f); return; }
    const frozen = this.state === 'intro' || this.state === 'over';
    const inp = frozen ? { l: 0, r: 0, b: 0, a: f.la, j: f.lj, d: f.ld } : this.inputs[f.id];
    if (inp.a !== f.la) { f.la = inp.a; f.wantAtk = 0.25; }
    if (inp.j !== f.lj) { f.lj = inp.j; f.wantJump = 0.15; }
    if (inp.d !== f.ld) { f.ld = inp.d; f.wantDash = 0.15; }
    const pos = t.getPosition(), v = t.getLinearVelocity(), ang = t.getAngle();
    const grounded = pos.y < STAND_Y + 0.15 && f.jumpT <= 0;
    if (grounded && !f.grounded && v.y < -4) this.ev('land', pos.x, 0, Math.min(1, -v.y / 10));
    f.grounded = grounded;
    const tgt = this.nearestEnemy(f);
    if (tgt && !f.atk && f.dashT <= 0 && f.stun <= 0) {
      const want = Math.sign(tgt.b[0].getPosition().x - pos.x) || f.facing;
      if (want !== f.facing) { f.turnT += dt; if (f.turnT > 0.12) { this.setFacing(f, want); f.turnT = 0; } } else f.turnT = 0;
    }
    let move = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    if (f.stun > 0) move = 0;
    f.blocking = !!inp.b && !f.atk && f.stun <= 0;
    const speed = f.blocking ? 1.6 : 4.2;
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
      for (const b of f.b) { const bv = b.getLinearVelocity(); b.setLinearVelocity(Vec2(bv.x, 8.5)); }
      this.ev('jump', pos.x, 0, 0.5);
    }
    if (f.wantDash > 0 && f.dashCd <= 0 && f.stun <= 0) {
      f.wantDash = 0; f.dashCd = 0.9; f.dashT = 0.17; f.dashDir = move || f.facing;
      this.ev('dash', pos.x, pos.y, f.dashDir);
    }
    // attacks
    if (f.wantAtk > 0 && !f.atk && f.stun <= 0 && f.atkCd <= 0) {
      f.wantAtk = 0;
      const type = !grounded ? 'chop' : (f.comboT > 0 && f.lastType === 'chop') ? 'up' : 'chop';
      f.atk = { type, ph: 'wind', t: 0, hit: new Set() };
    }
    if (f.atk) {
      const A = f.atk; A.t += dt;
      const PH = { wind: 0.13, strike: 0.17, rec: 0.16 };
      if (A.t > PH[A.ph]) {
        A.t = 0; A.ph = A.ph === 'wind' ? 'strike' : A.ph === 'strike' ? 'rec' : null;
        if (A.ph === 'strike') this.ev('swing', pos.x, pos.y, 1);
        if (!A.ph) { f.lastType = A.type; f.comboT = 0.45; f.atk = null; f.atkCd = 0.05; }
      }
    }
    // upright
    let tgtAng = clamp(-vx * 0.03, -0.3, 0.3);
    if (f.atk && f.atk.ph === 'strike') tgtAng += -f.facing * 0.25;
    if (f.atk && f.atk.ph === 'wind') tgtAng += f.facing * 0.12;
    if (f.blocking) tgtAng += f.facing * 0.08;
    const bal = f.stun > 0 ? 0.03 : 0.35;
    const w = t.getAngularVelocity();
    const wDes = clamp(wrap(tgtAng - ang) * 14, -12, 12);
    t.setAngularVelocity(w + (wDes - w) * bal);
    const fc = f.facing, st = f.stun > 0 ? 0.25 : 1;
    // sword arm
    let sh = 0.9, el = 0.8, str = 90;
    if (f.blocking) { sh = 1.25; el = 1.6; str = 160; }
    if (f.atk) {
      const P = f.atk.type === 'chop' ? { wind: [2.7, 1.3], strike: [0.2, 0.1], rec: [0.6, 0.5] } : { wind: [-0.9, 0.2], strike: [2.3, 0.7], rec: [1.4, 0.9] };
      [sh, el] = P[f.atk.ph]; str = f.atk.ph === 'strike' ? 260 : f.atk.ph === 'wind' ? 160 : 90;
    }
    drive(f.j.shF, sh * fc, str * st, 22); drive(f.j.elF, el * fc, str * 0.7 * st, 22);
    drive(f.j.shB, (f.atk ? -0.4 : f.blocking ? 0.9 : 0.5) * fc, 40 * st); drive(f.j.elB, 1.5 * fc, 30 * st);
    // legs
    let hF, kF, hB, kB;
    if (!grounded) { hF = 1.0; kF = -1.4; hB = 0.2; kB = -0.9; }
    else if (Math.abs(vx) > 0.4 && f.dashT <= 0) {
      f.walk += vx * fc * dt * 5.5; const p = f.walk;
      hF = 0.55 * Math.sin(p) + 0.1; kF = -0.15 - 0.9 * Math.max(0, Math.cos(p));
      hB = 0.55 * Math.sin(p + Math.PI) + 0.1; kB = -0.15 - 0.9 * Math.max(0, Math.cos(p + Math.PI));
    } else if (f.dashT > 0) { hF = 0.9; kF = -0.6; hB = -0.6; kB = -0.3; }
    else if (f.blocking) { hF = 0.5; kF = -0.6; hB = -0.35; kB = -0.3; }
    else { hF = 0.3; kF = -0.35; hB = -0.25; kB = -0.2; }
    drive(f.j.hipF, hF * fc, 70 * st); drive(f.j.kneeF, kF * fc, 60 * st);
    drive(f.j.hipB, hB * fc, 70 * st); drive(f.j.kneeB, kB * fc, 60 * st);
    drive(f.j.neck, clamp(-ang, -0.5, 0.5), 20 * st);
  };

  S.bladeGeom = function (f) {
    const b = f.b[9], a = b.getAngle() + SWORD_A(f.facing);
    const hand = b.getWorldPoint(Vec2(0, -D.fa / 2));
    return { hand, dx: Math.cos(a), dy: Math.sin(a) };
  };

  S.checkHits = function (f) {
    const A = f.atk; if (!A || A.ph !== 'strike' || !f.alive) return;
    for (let ce = f.b[9].getContactList(); ce; ce = ce.next) {
      const c = ce.contact; if (!c.isTouching()) continue;
      let fa = c.getFixtureA(), fb = c.getFixtureB();
      if (fb === f.senseFx) { const t = fa; fa = fb; fb = t; }
      if (fa !== f.senseFx) continue;
      const ud = fb.getUserData();
      if (!ud || ud.k !== 'body' || ud.f === f || !ud.f.alive || A.hit.has(ud.f.id)) continue;
      this.applyHit(f, ud.f, ud.part, fb.getBody());
      if (!f.atk) return;
    }
  };

  S.applyHit = function (att, def, part, tb) {
    const A = att.atk; A.hit.add(def.id);
    const bg = this.bladeGeom(att), tp = tb.getPosition();
    const s = clamp((tp.x - bg.hand.x) * bg.dx + (tp.y - bg.hand.y) * bg.dy, 0.1, 1.0);
    const pt = Vec2(bg.hand.x + bg.dx * s, bg.hand.y + bg.dy * s);
    const vs = att.b[9].getLinearVelocityFromWorldPoint(pt), vt = tb.getLinearVelocity();
    const rx = vs.x - vt.x, ry = vs.y - vt.y, rel = Math.hypot(rx, ry);
    if (rel < 1.5) { A.hit.delete(def.id); return; }
    let dmg = (6 + Math.min(rel, 20) * 0.95) * PART_MUL[part];
    const ax = att.b[0].getPosition().x, dx = def.b[0].getPosition().x;
    const blocked = def.blocking && Math.sign(ax - dx) === def.facing;
    const dir = Math.sign(dx - ax) || att.facing;
    if (blocked) {
      dmg *= 0.12; att.stun = 0.3; att.atk = null; att.atkCd = 0.2;
      this.ev('block', pt.x, pt.y, 1);
      const at = att.b[0], v = at.getLinearVelocity(); at.setLinearVelocity(Vec2(v.x - dir * 3, v.y));
    } else {
      this.ev('hit', pt.x, pt.y, dmg / 20);
    }
    def.health = Math.max(0, def.health - dmg);
    const nx = rel > 0 ? rx / rel : dir, ny = rel > 0 ? ry / rel : 0;
    const J = blocked ? 1.5 : Math.min(12, 2 + dmg * 0.4);
    tb.applyLinearImpulse(Vec2(nx * J, ny * J), pt, true);
    const t = def.b[0], tv = t.getLinearVelocity();
    t.setLinearVelocity(Vec2(tv.x + dir * (blocked ? 1.2 : 1 + dmg * 0.1), tv.y));
    if (!blocked) { def.stun = Math.max(def.stun, dmg > 16 ? 0.55 : 0.22); if (def.atk && dmg > 10) def.atk = null; }
    if (def.health <= 0) this.ko(def, att, nx, ny, pt);
  };

  S.ko = function (def, att, nx, ny, pt) {
    def.alive = false; def.atk = null; def.blocking = false; this.limp(def);
    for (const b of def.b) { const v = b.getLinearVelocity(); b.setLinearVelocity(Vec2(v.x + nx * 3, v.y + Math.abs(ny) * 2 + 2)); }
    this.ev('ko', pt.x, pt.y, 1);
    const alive = this.fighters.filter((f) => f.alive);
    if (alive.length <= 1 && this.state === 'fight') {
      this.slowT = 1.3;
      this.endRound(alive.length ? alive[0].id : -1, 'K.O.!');
    }
  };

  S.endRound = function (winner, msg) {
    this.state = 'ko'; this.stateT = 0; this.winner = winner; this.msg = msg;
    if (winner >= 0) this.scores[winner]++;
  };

  S.aiThink = function (f, dt) {
    const p = this.players[f.id], dcfg = DIFF[p.cpu] || DIFF.normal, mem = this.ai[f.id], inp = this.inputs[f.id];
    mem.t -= dt;
    if (!f.alive) return;
    const tgt = this.nearestEnemy(f);
    if (!tgt) { inp.l = inp.r = inp.b = 0; return; }
    const mx = f.b[0].getPosition().x, tx = tgt.b[0].getPosition().x, dx = tx - mx, dist = Math.abs(dx), dir = Math.sign(dx) || 1;
    const threat = tgt.atk && tgt.atk.ph !== 'rec' && dist < 2.4;
    // fast reflex check for blocking (still limited by reaction time)
    if (mem.t > 0) {
      if (threat && !mem.threatSeen) { mem.threatSeen = true; mem.blockAt = dcfg.react * 0.8; mem.willBlock = Math.random() < dcfg.block; }
      if (mem.threatSeen && mem.willBlock) { mem.blockAt -= dt; if (mem.blockAt <= 0) { inp.b = 1; inp.l = inp.r = 0; } }
      if (!threat) mem.threatSeen = false;
      return;
    }
    mem.t = dcfg.react * (0.6 + Math.random() * 0.8);
    inp.l = inp.r = inp.b = 0;
    if (!threat) mem.threatSeen = false;
    const range = dcfg.spacing, lowHp = f.health < 35;
    if (threat && mem.willBlock) { inp.b = 1; if (Math.random() < dcfg.dash * 0.5) { inp.d++; inp.b = 0; (dir > 0 ? (inp.l = 1) : (inp.r = 1)); } return; }
    if (dist > range + 0.3) {
      dir > 0 ? (inp.r = 1) : (inp.l = 1);
      if (dist > 3.5 && Math.random() < dcfg.dash) inp.d++;
      if (Math.random() < dcfg.jump) inp.j++;
      if (dist < range + 1.2 && Math.random() < dcfg.aggr * 0.35) inp.a++;
    } else if (dist < 0.85) {
      dir > 0 ? (inp.l = 1) : (inp.r = 1);
      if (Math.random() < dcfg.aggr * 0.5) inp.a++;
    } else {
      if (f.atkCd <= 0 && !f.atk && Math.random() < dcfg.aggr) { inp.a++; if (Math.random() < 0.5) (dir > 0 ? (inp.r = 1) : (inp.l = 1)); }
      else if (lowHp && Math.random() < 0.3) { dir > 0 ? (inp.l = 1) : (inp.r = 1); }
      else if (Math.random() < 0.3) { Math.random() < 0.5 ? (inp.l = 1) : (inp.r = 1); }
      if (tgt.stun > 0 && Math.random() < dcfg.aggr) inp.a++;
      if (Math.random() < dcfg.jump * 2) { inp.j++; inp.a++; }
    }
  };

  S.stepFixed = function () {
    for (const f of this.fighters) { if (this.players[f.id].cpu && this.state !== 'intro') this.aiThink(f, DT); this.control(f, DT); }
    // soft push so fighters don't pass through or tangle
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
  };

  S.update = function (realDt) {
    const dt = Math.min(realDt, 0.05);
    this.slowT -= dt; this.timeScale = this.slowT > 0 ? 0.3 : 1;
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
        const alive = this.fighters.filter((f) => f.alive).sort((a, b) => b.health - a.health);
        const w = alive.length && (alive.length === 1 || alive[0].health > alive[1].health) ? alive[0].id : -1;
        this.endRound(w, 'Time up!');
      }
    } else if (this.state === 'ko') {
      if (this.stateT > 1.4 && this.stateT < 1.5) {
        this.msg = this.winner >= 0 ? this.players[this.winner].name + ' wins the round' : 'Draw';
      }
      if (this.stateT > 3.2) {
        const champ = this.scores.findIndex((s) => s >= WIN_SCORE);
        if (champ >= 0) { this.state = 'over'; this.stateT = 0; this.champ = champ; this.msg = this.players[champ].name + ' wins the match!'; }
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
        return { p, h: f.health, fa: f.facing, fl };
      }),
      sc: this.scores.slice(), st: this.state, tm: Math.ceil(this.timer), rd: this.round, msg: this.msg, ts: this.timeScale,
      champ: this.state === 'over' ? this.champ : -1
    };
  };

  window.RSGame = { Sim, D, SWORD_A, ARENA, STAND_Y, DIFF };
})();

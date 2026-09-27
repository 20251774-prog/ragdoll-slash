// v3 feature tests: active-ragdoll stance, heavy swings, stagger/recover, knockdown/get-up, parry + riposte,
// kick guard-break, dodge roll, plate glance, wall bounce. Runs the real page; scripted inputs; burst screenshots.
const { chromium } = require('playwright-core');
const URL = process.argv[2] || 'http://localhost:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, info) => { results.push(cond); console.log(cond ? 'PASS' : 'FAIL', name, info ? JSON.stringify(info) : ''); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL); await sleep(1000);
  await p.evaluate(() => {
    const V = planck.Vec2;
    window.T = {
      ev: {}, log: [],
      setup(me, en, meArm, enArm) {
        RS.setLoadout(Object.assign(RS.loadout, { primary: me, secondary: 'pistol', shield: 0 }, meArm || {}));
        RS.startSolo('easy', '1v1');
        const s = RS.sim; s.players[1].cpu = null;
        s.players[1].loadout = Object.assign({}, s.players[1].loadout, { primary: en, secondary: 'longsword', shield: 0, helmet: 2, chest: 2, arms: 2, legs: 2 }, enArm || {});
        s.restartMatch(); s.state = 'fight'; s.stateT = 1; s.msg = ''; s.timer = 99;
        T.ev = {}; T.log = []; const o = s.ev; s.ev = function (t, x, y, q) { T.ev[t] = (T.ev[t] || 0) + 1; T.log.push(t); return o.call(this, t, x, y, q); };
      },
      place(dist) { const s = RS.sim; s.fighters.forEach((f, i) => { const x0 = f.b[0].getPosition().x, dx = (i === 0 ? -dist / 2 : dist / 2) - x0;
        for (const bb of f.b) { const q = bb.getPosition(); bb.setTransform(V(q.x + dx, q.y), bb.getAngle()); bb.setLinearVelocity(V(0, 0)); } }); },
      f(i) { return RS.sim.fighters[i]; },
      frames(n) { return new Promise((res) => { let k = 0; const step = () => (++k >= n ? res() : requestAnimationFrame(step)); requestAnimationFrame(step); }); },
      until(fn, ms) { return new Promise((res) => { const t0 = performance.now(); const step = () => { const v = fn(); if (v || performance.now() - t0 > ms) res(v); else requestAnimationFrame(step); }; step(); }); },
      tilt(i) { const a = T.f(i).b[0].getAngle(); return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * 57.3; }
    };
  });
  let n = 0; const shot = async (tag) => { const f = `/tmp/v3c/${tag}_${String(n++).padStart(3, '0')}.png`; await p.screenshot({ path: f }); return f; };
  const burst = async (tag, count, gap) => { for (let i = 0; i < count; i++) { await shot(tag); await sleep(gap); } };

  // 1. stance: both fighters stand in guard; torso upright and steady for 2 s
  await p.evaluate(() => { T.setup('longsword', 'greatsword'); T.place(3.2); });
  await sleep(700);
  const st = await p.evaluate(async () => { let mx = 0; for (let i = 0; i < 90; i++) { await T.frames(1); mx = Math.max(mx, T.tilt(0), T.tilt(1)); } return { maxTiltDeg: +mx.toFixed(1), y: +T.f(0).b[0].getPosition().y.toFixed(2) }; });
  await shot('stance');
  ok('stance: idle fighters stand firm (torso within 12 deg for 1.5 s)', st.maxTiltDeg < 12, st);

  // 2. walking stays upright
  const wk = await p.evaluate(async () => { RS.input.r = 1; let mx = 0; for (let i = 0; i < 40; i++) { await T.frames(1); mx = Math.max(mx, T.tilt(0)); } RS.input.r = 0; return { maxTiltDeg: +mx.toFixed(1), vx: +T.f(0).b[0].getLinearVelocity().x.toFixed(2) }; });
  ok('walk: moves like an athlete, torso within 15 deg while walking', wk.maxTiltDeg < 15 && wk.vx > 1, wk);

  // 3. heavy swing (greatsword) with a long wind-up; knocks the target down, who then gets back up
  await p.evaluate(() => { T.setup('longsword', 'greatsword', { helmet: 0, chest: 1, arms: 0, legs: 0 }); T.place(1.9); });
  await sleep(500);
  await p.evaluate(() => { RS.sim.inputs[1].a++; });
  const heavyShots = []; const t0 = Date.now();
  while (Date.now() - t0 < 900) { heavyShots.push(await shot('heavy')); await sleep(25); }
  const hv = await p.evaluate(async () => { const r = await T.until(() => T.f(0).pst === 'down' || T.f(0).pst === 'stagger', 1500); return { pst: T.f(0).pst, hp: +T.f(0).health.toFixed(1), ev: T.ev }; });
  ok('heavy swing: greatsword blow (after a long wind-up) staggers or knocks down', hv.pst === 'down' || hv.pst === 'stagger' || (hv.ev.down || 0) > 0, hv);
  // make sure we get a knockdown: repeat heavy blows until down
  let kd = await p.evaluate(async () => {
    for (let k = 0; k < 6 && !(T.ev.down > 0); k++) { T.f(0).health = 100; T.place(1.9); await T.frames(20); RS.sim.inputs[1].a++; await T.until(() => T.f(0).pst === 'down', 1200); }
    return { down: T.ev.down || 0, pst: T.f(0).pst };
  });
  const downShots = []; const getShots = [];
  for (let i = 0; i < 40; i++) {
    const s = await p.evaluate(() => T.f(0).pst);
    const f = await shot('kd'); if (s === 'down') downShots.push(f); else if (s === 'getup') getShots.push(f);
    if (s === 'ok' && i > 3) break; await sleep(60);
  }
  kd = Object.assign(kd, await p.evaluate(async () => { await T.until(() => T.f(0).pst === 'ok', 3000); await T.frames(30); return { after: T.f(0).pst, tiltDeg: +T.tilt(0).toFixed(1), getup: T.ev.getup || 0, torsoY: +T.f(0).b[0].getPosition().y.toFixed(2) }; }));
  ok('knockdown then get-up: floored fighter rises back to a firm stance', kd.down > 0 && kd.getup > 0 && kd.after === 'ok' && kd.tiltDeg < 15 && kd.torsoY > 0.95, kd);
  console.log('  knockdown frames', downShots.length, 'getup frames', getShots.length);

  // 4. stagger then recover (longsword hit on an unarmoured, idle target)
  await p.evaluate(() => { T.setup('longsword', 'longsword', {}, { helmet: 0, chest: 0, arms: 0, legs: 0 }); T.place(1.7); });
  await sleep(400);
  const stg = await p.evaluate(async () => {
    let seen = false, mxTilt = 0;
    for (let k = 0; k < 6 && !seen; k++) { T.place(1.7); await T.frames(15); RS.input.a++; for (let i = 0; i < 40; i++) { await T.frames(1); if (T.f(1).pst === 'stagger') { seen = true; break; } } }
    return { seen, ev: T.ev };
  });
  const stagShots = [];
  for (let i = 0; i < 6; i++) { const s = await p.evaluate(() => T.f(1).pst); const f = await shot('stagger'); if (s === 'stagger') stagShots.push(f); await sleep(40); }
  const rec = await p.evaluate(async () => { const t0 = performance.now(); await T.until(() => T.f(1).pst === 'ok', 2500); const dt = (performance.now() - t0) / 1000; await T.frames(20); return { recoveredInS: +dt.toFixed(2), pst: T.f(1).pst, tiltDeg: +T.tilt(1).toFixed(1) }; });
  ok('stagger: a clean hit staggers (partial ragdoll), then the fighter recovers to a stance', stg.seen && rec.pst === 'ok' && rec.tiltDeg < 15, Object.assign({ seen: stg.seen }, rec));

  // 5. parry: Block pressed just before the blow lands -> attacker staggers, defender gets a riposte
  await p.evaluate(() => { T.setup('longsword', 'longsword'); T.place(1.8); });
  await sleep(400);
  const parryShots = [];
  const pr = await p.evaluate(async () => {
    for (let k = 0; k < 8 && !(T.ev.parry > 0); k++) {
      T.place(1.8); RS.input.b = 0; await T.frames(12);
      RS.sim.inputs[1].a++;
      await T.until(() => { const A = T.f(1).atk; return A && A.ph === 'wind' && A.t > 0.1; }, 1000);
      RS.input.b = 1; await T.frames(22); RS.input.b = 0;
    }
    return { parry: T.ev.parry || 0, attackerPst: T.f(1).pst, riposteReady: T.f(0).riposteT > 0 };
  });
  const rp = await p.evaluate(async () => { RS.input.a++; await T.until(() => T.ev.riposte > 0, 1200); return { riposte: T.ev.riposte || 0 }; });
  for (let i = 0; i < 3; i++) parryShots.push(await shot('parry'));
  ok('parry: timed Block staggers the attacker and opens a riposte', pr.parry > 0 && (pr.attackerPst === 'stagger' || pr.riposteReady), pr);
  ok('riposte: the counter-attack after a parry lands as a heavy riposte', rp.riposte > 0, rp);

  // 6. kick breaks a guard (Block + tap toward the enemy)
  await p.evaluate(() => { T.setup('longsword', 'longsword'); T.place(1.1); RS.sim.inputs[1].b = 1; });
  await sleep(500);
  const kickShots = [];
  const kk = await p.evaluate(async () => {
    for (let k = 0; k < 4 && !(T.ev.guardbreak > 0); k++) { T.place(1.0); RS.sim.inputs[1].b = 1; await T.frames(10); RS.input.b = 1; await T.frames(6); RS.input.r = 1; await T.frames(3); RS.input.r = 0; await T.until(() => T.ev.kick > k, 600); await T.frames(4); RS.input.b = 0; await T.frames(40); }
    return { kick: T.ev.kick || 0, guardbreak: T.ev.guardbreak || 0 };
  });
  ok('kick: Block + tap toward enemy kicks and breaks their guard', kk.kick > 0 && kk.guardbreak > 0, kk);
  await p.evaluate(async () => { RS.sim.inputs[1].b = 0; T.place(1.0); await T.frames(10); RS.input.b = 1; await T.frames(6); RS.input.r = 1; await T.frames(3); RS.input.r = 0; RS.input.b = 0; await T.frames(8); });
  kickShots.push(await shot('kick'));

  // 7. dodge roll: Dash on the ground rolls, dodges a blow (invulnerable), and ends upright
  await p.evaluate(() => { T.setup('longsword', 'greatsword'); T.place(2.0); });
  await sleep(400);
  const rl = await p.evaluate(async () => {
    RS.sim.inputs[1].a++; await T.until(() => { const A = T.f(1).atk; return A && A.ph === 'wind' && A.t > 0.2; }, 1000);
    const hp0 = T.f(0).health; RS.input.r = 1; RS.input.d++; let spun = 0, prev = T.f(0).b[0].getAngle(), rolled = false;
    for (let i = 0; i < 26; i++) { await T.frames(1); const a = T.f(0).b[0].getAngle(); spun += a - prev; prev = a; if (T.f(0).rollT > 0) rolled = true; }
    RS.input.r = 0; await T.frames(40);
    return { rolled, spunDeg: Math.round(Math.abs(spun) * 57.3), hpLostDuringRoll: +(hp0 - T.f(0).health).toFixed(1), tiltAfterDeg: +T.tilt(0).toFixed(1), rollEv: T.ev.roll || 0 };
  });
  ok('dodge roll: Dash on the ground does a full roll and recovers upright', rl.rolled && rl.spunDeg > 250 && rl.tiltAfterDeg < 15, rl);

  // 8. edged weapons glance off intact plate
  await p.evaluate(() => { T.setup('katana', 'longsword', {}, { helmet: 3, chest: 3, arms: 3, legs: 3 }); T.place(1.6); });
  await sleep(300);
  const gl = await p.evaluate(async () => { for (let k = 0; k < 14 && !(T.ev.glance > 0); k++) { T.f(1).health = 100; T.place(1.6); await T.frames(10); RS.input.a++; await T.frames(30); } return { glance: T.ev.glance || 0, armor: T.ev.armor || 0 }; });
  const glShot = await shot('glance');
  ok('plate: katana/sword blows can glance off intact plate', gl.glance > 0, gl);

  // 9. wall bounce: a staggered fighter driven into the arena wall rebounds
  const wb = await p.evaluate(async () => {
    T.setup('longsword', 'longsword'); const f = T.f(1), V = planck.Vec2;
    const dx = 7.2 - f.b[0].getPosition().x; for (const bb of f.b) { const q = bb.getPosition(); bb.setTransform(V(q.x + dx, q.y), bb.getAngle()); }
    RS.sim.stagger(f, 0.8); RS.sim.addVel(f, 9, 0);
    let flipped = false; for (let i = 0; i < 40; i++) { await T.frames(1); if (f.b[0].getLinearVelocity().x < -2) flipped = true; }
    return { wall: T.ev.wall || 0, bouncedBack: flipped };
  });
  ok('wall: fighters knocked into the arena wall bounce off it', wb.wall > 0 && wb.bouncedBack, wb);

  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`SUMMARY ${results.filter(Boolean).length}/${results.length} passed`);
  require('fs').writeFileSync('/tmp/v3c/picks.json', JSON.stringify({ heavyShots, downShots, getShots, stagShots, parryShots, kickShots, glShot }));
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });

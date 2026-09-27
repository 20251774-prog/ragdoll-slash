// v3 screenshots: freeze the simulation at the exact moment (the renderer keeps drawing), then capture.
const { chromium } = require('playwright-core');
const URL = process.argv[2] || 'http://localhost:8765/';
const OUT = process.argv[3] || '/tmp/v3s';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL); await sleep(1000);
  await p.evaluate(() => {
    const V = planck.Vec2;
    window.T = {
      ev: {},
      setup(me, en, meLo, enLo) {
        RS.setLoadout(Object.assign(RS.loadout, { primary: me, secondary: 'pistol', helmet: 3, chest: 3, arms: 2, legs: 2, color: 0, trim: 3 }, meLo || {}));
        RS.startSolo('easy', '1v1'); const s = RS.sim; s.players[1].cpu = null;
        s.players[1].loadout = Object.assign({}, s.players[1].loadout, { primary: en, secondary: 'longsword', helmet: 2, chest: 2, arms: 1, legs: 1, color: 1, trim: 2 }, enLo || {});
        s.restartMatch(); s.state = 'fight'; s.stateT = 1; s.msg = ''; s.timer = 75;
        T.ev = {}; const o = s.ev; s.ev = function (t, x, y, q) { T.ev[t] = (T.ev[t] || 0) + 1; return o.call(this, t, x, y, q); };
      },
      place(dist) { RS.sim.fighters.forEach((f, i) => { const dx = (i === 0 ? -dist / 2 : dist / 2) - f.b[0].getPosition().x;
        for (const bb of f.b) { const q = bb.getPosition(); bb.setTransform(V(q.x + dx, q.y), bb.getAngle()); bb.setLinearVelocity(V(0, 0)); } }); },
      f(i) { return RS.sim.fighters[i]; },
      frames(n) { return new Promise((res) => { let k = 0; const st = () => (++k >= n ? res() : requestAnimationFrame(st)); requestAnimationFrame(st); }); },
      until(fn, ms) { return new Promise((res) => { const t0 = performance.now(); const st = () => { const v = fn(); if (v || performance.now() - t0 > ms) res(v); else requestAnimationFrame(st); }; st(); }); },
      freeze() { const s = RS.sim; if (!s._u) { s._u = s.update; s.update = () => {}; } },
      thaw() { const s = RS.sim; if (s._u) { s.update = s._u; s._u = null; } }
    };
  });
  const snap = async (name) => { await sleep(90); await p.screenshot({ path: `${OUT}/${name}.png` }); await p.evaluate(() => T.thaw()); console.log('saved', name); };

  // stance: both in guard, a little apart
  await p.evaluate(() => { T.setup('longsword', 'greatsword'); T.place(2.6); });
  await sleep(1200); await p.evaluate(() => T.freeze()); await snap('stance');

  // heavy swing: greatsword mid-strike toward the player
  await p.evaluate(() => { T.setup('longsword', 'greatsword', { helmet: 1, chest: 1 }); T.place(2.0); });
  await sleep(600);
  await p.evaluate(async () => { RS.sim.inputs[1].a++; await T.until(() => { const A = T.f(1).atk; return A && A.ph === 'strike' && A.t > 0.05; }, 1500); T.freeze(); });
  await snap('heavy-swing');
  await p.evaluate(async () => { await T.until(() => T.ev.blood > 0 || T.ev.armor > 0, 800); await T.frames(2); T.freeze(); });
  await snap('heavy-impact');

  // stagger: longsword hits an unarmoured idle target; freeze mid-stagger
  await p.evaluate(() => { T.setup('longsword', 'longsword', {}, { helmet: 0, chest: 0, arms: 0, legs: 0 }); T.place(1.7); });
  await sleep(500);
  await p.evaluate(async () => {
    for (let k = 0; k < 8; k++) { T.place(1.7); await T.frames(15); RS.input.a++; const got = await T.until(() => T.f(1).pst === 'stagger', 700); if (got) break; }
    await T.frames(4); T.freeze();
  });
  await snap('stagger');

  // knockdown + get-up: mace to an unarmoured player
  await p.evaluate(() => { T.setup('longsword', 'greatsword', { helmet: 0, chest: 1, arms: 0, legs: 0 }); T.place(1.9); });
  await sleep(500);
  await p.evaluate(async () => {
    for (let k = 0; k < 14; k++) { T.f(0).health = 100; await T.until(() => T.f(0).pst === 'ok', 3000); T.place(1.9); await T.frames(20); RS.sim.inputs[1].a++; const got = await T.until(() => T.f(0).pst === 'down', 1200); if (got) break; }
    T.f(0).health = Math.max(T.f(0).health, 40);
    await T.until(() => T.f(0).pst === 'down' && T.f(0).b[0].getPosition().y < 0.45, 1200); await T.frames(4); T.freeze();
  });
  await snap('knockdown');
  await p.evaluate(async () => { await T.until(() => T.f(0).pst === 'getup' && T.f(0).getT > 0.3, 3000); T.freeze(); });
  await snap('getup');

  // parry: the enemy swings, the player blocks just in time
  await p.evaluate(() => { T.setup('longsword', 'longsword'); T.place(1.8); });
  await sleep(500);
  await p.evaluate(async () => {
    for (let k = 0; k < 10 && !(T.ev.parry > 0); k++) {
      T.place(1.8); RS.input.b = 0; await T.frames(12); RS.sim.inputs[1].a++;
      await T.until(() => { const A = T.f(1).atk; return A && A.ph === 'wind' && A.t > 0.1; }, 1000);
      RS.input.b = 1; const got = await T.until(() => T.ev.parry > 0, 500); if (got) break; await T.frames(20); RS.input.b = 0;
    }
    await T.frames(3); T.freeze();
  });
  await snap('parry');
  await p.evaluate(() => { RS.input.b = 0; });

  // kick: Block + tap toward an enemy who is blocking
  await p.evaluate(() => { T.setup('longsword', 'longsword'); T.place(1.0); RS.sim.inputs[1].b = 1; });
  await sleep(500);
  await p.evaluate(async () => { RS.input.b = 1; await T.frames(6); RS.input.r = 1; await T.frames(3); RS.input.r = 0; await T.until(() => T.f(0).kick && T.f(0).kick.t > 0.14, 800); T.freeze(); RS.input.b = 0; });
  await snap('kick');
  console.log('errors', errs);
  await b.close();
})();

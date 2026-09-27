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

  // shield: kite shield raised, a sword blow thunks into it
  for (let k = 0; k < 3; k++) {
    await p.evaluate(() => { T.setup('longsword', 'longsword', { shield: 2, helmet: 3, chest: 2 }); T.place(1.75); RS.input.b = 1; });
    await sleep(700);
    const got = await p.evaluate(async () => { RS.sim.inputs[1].a++; const g = await T.until(() => T.ev.shield > 0, 1200); if (g) { await T.frames(1); T.freeze(); } return !!g; });
    if (got) { await snap('shield' + k); }
  }
  await p.evaluate(() => { RS.input.b = 0; });
  // tower shield with arrows stuck in it
  await p.evaluate(() => { T.setup('spear', 'bow', { shield: 3, helmet: 2 }); T.place(5.5); RS.sim.players[1].cpu = 'hard'; RS.input.b = 1; });
  await p.evaluate(async () => { await T.until(() => RS.sim.projs.filter((q) => q.stuck).length >= 2, 9000); await T.frames(2); T.freeze(); });
  await snap('shield-tower');
  await p.evaluate(() => { RS.input.b = 0; });

  // finish him: the loser on their knees, winner walking up
  await p.evaluate(() => { T.setup('axe', 'longsword', { shield: 1 }); T.place(3.0); });
  await sleep(500);
  await p.evaluate(async () => { const f = T.f(1); f.health = 0; RS.sim.ko(f, 1, 0, f.b[0].getPosition()); await T.frames(50); T.freeze(); });
  await snap('finish-him');

  // fatalities: spin (longsword), slam (mace), lift (spear), shot (pistol) - freeze just after the finishing blow
  for (const [w, lo, d, lag] of [['longsword', {}, 1.6, 3], ['mace', {}, 1.5, 2], ['spear', {}, 1.8, 6], ['pistol', {}, 3.5, 2], ['longsword', {}, 1.6, 10]]) {
    await p.evaluate(({ w, lo, d }) => { T.setup(w, 'longsword', lo); T.place(d); }, { w, lo, d });
    await sleep(500);
    await p.evaluate(async (lag) => { const f = T.f(1); f.health = 0; RS.sim.ko(f, 1, 0, f.b[0].getPosition()); await T.frames(20); RS.input.fx++; await T.until(() => T.ev.fatal > 0, 6000); await T.frames(lag); T.freeze(); }, lag);
    await snap('fatality-' + w + lag);
  }
  console.log('errors', errs);
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });

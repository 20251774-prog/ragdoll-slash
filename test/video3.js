// v3 gameplay video (~18 s): guard stances + footwork, heavy swing, parry/riposte, shield block + bash, dodge roll, knockdown/get-up,
// FINISH HIM and a FATALITY. Recorded with Playwright's recordVideo at 960x432; converted to mp4 with ffmpeg afterwards.
const { chromium } = require('playwright-core');
const URL = process.argv[2] || 'http://localhost:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 960, height: 432 }, deviceScaleFactor: 1, isMobile: false, hasTouch: true, });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const fs = require('fs'); fs.rmSync('/tmp/v3frames', { recursive: true, force: true }); fs.mkdirSync('/tmp/v3frames');
  const cdp = await ctx.newCDPSession(p); const frames = []; let fn = 0;
  cdp.on('Page.screencastFrame', async (e) => { const f = `/tmp/v3frames/f${String(fn++).padStart(5, '0')}.jpg`; fs.writeFileSync(f, Buffer.from(e.data, 'base64')); frames.push([f, e.metadata.timestamp]); cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {}); });
  const t0 = Date.now(); const mark = (s) => console.log(((Date.now() - t0) / 1000).toFixed(1), s);
  await p.addInitScript(() => { Element.prototype.requestFullscreen = undefined; }); // headless fullscreen resizes the page; not wanted for the recording
  await p.goto(URL); await sleep(900);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 960, maxHeight: 432, everyNthFrame: 1 });
  await p.evaluate(() => {
    const V = planck.Vec2;
    window.T = {
      ev: {},
      setup(me, en, meLo, enLo, cpu) {
        RS.setLoadout(Object.assign(RS.loadout, { primary: me, secondary: 'pistol', shield: 0, helmet: 3, chest: 3, arms: 2, legs: 2, color: 0, trim: 3 }, meLo || {}));
        RS.startSolo('normal', '1v1'); const s = RS.sim; s.players[1].cpu = cpu || null;
        s.players[1].loadout = Object.assign({}, s.players[1].loadout, { primary: en, secondary: 'longsword', shield: 0, helmet: 2, chest: 2, arms: 1, legs: 1, color: 1, trim: 2 }, enLo || {});
        s.restartMatch(); s.state = 'fight'; s.stateT = 1; s.msg = ''; s.timer = 75;
        T.ev = {}; const o = s.ev; s.ev = function (t, x, y, q) { T.ev[t] = (T.ev[t] || 0) + 1; return o.call(this, t, x, y, q); };
      },
      place(dist) { RS.sim.fighters.forEach((f, i) => { const dx = (i === 0 ? -dist / 2 : dist / 2) - f.b[0].getPosition().x;
        for (const bb of f.b) { const q = bb.getPosition(); bb.setTransform(V(q.x + dx, q.y), bb.getAngle()); bb.setLinearVelocity(V(0, 0)); } }); },
      f(i) { return RS.sim.fighters[i]; },
      frames(n) { return new Promise((res) => { let k = 0; const st = () => (++k >= n ? res() : requestAnimationFrame(st)); requestAnimationFrame(st); }); },
      until(fn, ms) { return new Promise((res) => { const t0 = performance.now(); const st = () => { const v = fn(); if (v || performance.now() - t0 > ms) res(v); else requestAnimationFrame(st); }; st(); }); }
    };
  });
  // 1) guard stances + footwork: greatsword on the shoulder vs longsword + kite shield, circling
  await p.evaluate(() => { T.setup('longsword', 'greatsword', { shield: 2 }); T.place(3.2); });
  mark('stances');
  await p.evaluate(async () => { RS.input.r = 1; await T.frames(22); RS.input.r = 0; await T.frames(10); RS.input.l = 1; await T.frames(14); RS.input.l = 0; await T.frames(10); });
  // 2) heavy swing crashes into the raised shield (guard knocked open), then a shield bash
  mark('heavy vs shield');
  await p.evaluate(async () => { T.place(1.9); RS.input.b = 1; await T.frames(10); RS.sim.inputs[1].a++; await T.until(() => T.ev.shield > 0, 1500); await T.frames(40); RS.input.b = 0; await T.frames(8);
    T.place(1.0); RS.sim.inputs[1].b = 1; await T.frames(6); RS.input.b = 1; await T.frames(5); RS.input.r = 1; await T.frames(3); RS.input.r = 0; await T.frames(22); RS.input.b = 0; RS.sim.inputs[1].b = 0; await T.frames(30); });
  // 3) parry + riposte (katana vs longsword)
  mark('parry');
  await p.evaluate(async () => { T.setup('katana', 'longsword'); T.place(1.8); await T.frames(20);
    for (let k = 0; k < 4 && !(T.ev.parry > 0); k++) { T.place(1.8); RS.input.b = 0; await T.frames(10); RS.sim.inputs[1].a++; await T.until(() => { const A = T.f(1).atk; return A && A.ph === 'wind' && A.t > 0.1; }, 1000); RS.input.b = 1; await T.frames(12); RS.input.b = 0; }
    RS.input.a++; await T.until(() => T.ev.riposte > 0, 1000); await T.frames(50); });
  // 4) dodge roll under a greatsword, then knockdown + get-up
  mark('roll');
  await p.evaluate(async () => { T.setup('longsword', 'greatsword', { helmet: 1, chest: 1 }); T.place(2.1); await T.frames(15);
    RS.sim.inputs[1].a++; await T.until(() => { const A = T.f(1).atk; return A && A.ph === 'wind' && A.t > 0.2; }, 1000); RS.input.r = 1; RS.input.d++; await T.frames(26); RS.input.r = 0; await T.frames(35); });
  mark('knockdown');
  await p.evaluate(async () => { for (let k = 0; k < 5; k++) { T.f(0).health = 100; await T.until(() => T.f(0).pst === 'ok', 2500); T.place(1.9); await T.frames(12); RS.sim.inputs[1].a++; const got = await T.until(() => T.f(0).pst === 'down', 1100); if (got) break; }
    await T.until(() => T.f(0).pst === 'ok', 3500); await T.frames(15); });
  // 5) FINISH HIM + spinning-slash FATALITY
  mark('finish');
  await p.evaluate(async () => { T.setup('longsword', 'mace', {}, {}); T.place(2.2); await T.frames(20); RS.input.a++; await T.frames(25);
    const f = T.f(1); f.health = 0; RS.sim.ko(f, 1, 0, f.b[0].getPosition()); await T.frames(70); RS.input.r = 1; await T.frames(8); RS.input.r = 0; RS.input.fx++;
    await T.until(() => RS.sim.state === 'ko', 7000); await T.frames(70); });
  mark('end');
  await cdp.send('Page.stopScreencast'); await sleep(200);
  // ffmpeg concat list with the real frame durations
  let list = ''; for (let i = 0; i < frames.length; i++) { const d = i + 1 < frames.length ? frames[i + 1][1] - frames[i][1] : 0.04; list += `file '${frames[i][0]}'\nduration ${Math.max(0.005, d).toFixed(4)}\n`; }
  list += `file '${frames[frames.length - 1][0]}'\n`; fs.writeFileSync('/tmp/v3frames/list.txt', list);
  const sizes = new Set(); console.log('frames', frames.length, 'span s', (frames[frames.length - 1][1] - frames[0][1]).toFixed(1));
  await ctx.close(); await b.close();
  console.log('errors', errs);
})().catch((e) => { console.error('FAILED', e); process.exit(1); });

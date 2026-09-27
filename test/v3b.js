// v3 part 2: shields, location wounds, feints, FINISH HIM state, fatalities (every type), AI fatality, Fatality button.
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
      ev: {},
      setup(me, en, meX, enX) {
        RS.setLoadout(Object.assign(RS.loadout, { primary: me, secondary: 'pistol', shield: 0, helmet: 1, chest: 1, arms: 1, legs: 1 }, meX || {}));
        RS.startSolo('easy', '1v1');
        const s = RS.sim; s.players[1].cpu = null;
        s.players[1].loadout = Object.assign({}, s.players[1].loadout, { primary: en, secondary: 'longsword', shield: 0, helmet: 1, chest: 1, arms: 1, legs: 1 }, enX || {});
        s.restartMatch(); s.state = 'fight'; s.stateT = 1; s.msg = ''; s.timer = 99;
        T.ev = {}; const o = s.ev; s.ev = function (t, x, y, q) { T.ev[t] = (T.ev[t] || 0) + 1; return o.call(this, t, x, y, q); };
      },
      place(dist) { const s = RS.sim; s.fighters.forEach((f, i) => { const x0 = f.b[0].getPosition().x, dx = (i === 0 ? -dist / 2 : dist / 2) - x0;
        for (const bb of f.b) { const q = bb.getPosition(); bb.setTransform(V(q.x + dx, q.y), bb.getAngle()); bb.setLinearVelocity(V(0, 0)); } }); },
      f(i) { return RS.sim.fighters[i]; },
      frames(n) { return new Promise((res) => { let k = 0; const step = () => (++k >= n ? res() : requestAnimationFrame(step)); requestAnimationFrame(step); }); },
      until(fn, ms) { return new Promise((res) => { const t0 = performance.now(); const step = () => { const v = fn(); if (v || performance.now() - t0 > ms) res(v); else requestAnimationFrame(step); }; step(); }); },
      kill(i) { const f = T.f(i), q = f.b[0].getPosition(); f.health = 0; RS.sim.ko(f, i ? 1 : -1, 0, q); }
    };
  });
  let n = 0; const shot = async (tag) => { const f = `/tmp/v3d/${tag}_${String(n++).padStart(3, '0')}.png`; await p.screenshot({ path: f }); return f; };

  // 1. a raised shield stops frontal sword blows
  await p.evaluate(() => { T.setup('longsword', 'longsword', { shield: 2 }); T.place(1.7); RS.input.b = 1; });
  await sleep(400);
  const shieldShots = [];
  const s1 = await p.evaluate(async () => { const hp0 = T.f(0).health; for (let k = 0; k < 5; k++) { T.place(1.7); await T.frames(8); RS.sim.inputs[1].a++; await T.frames(45); }
    return { shield: T.ev.shield || 0, blood: T.ev.blood || 0, hpLost: +(hp0 - T.f(0).health).toFixed(1), shieldHp: Math.round(T.f(0).shield.hp), snapSh: RS.lastSnap.f[0].sh };
  });
  ok('shield block: a raised kite shield catches frontal sword blows (little damage gets through)', s1.shield >= 3 && s1.hpLost < 12 && s1.shieldHp < 100, s1);
  for (let k = 0; k < 8; k++) { await p.evaluate(async () => { T.place(1.7); await T.frames(6); RS.sim.inputs[1].a++; await T.until(() => T.f(1).atk && T.f(1).atk.ph === 'strike', 800); await T.frames(3); }); shieldShots.push(await shot('shield')); await sleep(300); }
  await p.evaluate(() => { RS.input.b = 0; });

  // 2. a raised shield stops arrows
  await p.evaluate(() => { T.setup('mace', 'bow', { shield: 3 }); T.place(6); RS.sim.players[1].cpu = 'hard'; RS.input.b = 1; T.f(0).health = 100; });
  const s2 = await p.evaluate(async () => { for (let i = 0; i < 360; i++) { await T.frames(1); T.place(6); if (T.f(1).health < 100) T.f(1).health = 100; } return { bow: T.ev.bow || 0, shield: T.ev.shield || 0, hp: +T.f(0).health.toFixed(1), stuck: RS.sim.projs.filter((q) => q.stuck).length }; });
  ok('shield vs arrows: a raised tower shield stops arrows', s2.bow >= 2 && s2.shield >= Math.min(2, s2.bow) && s2.hp > 80, s2);
  await p.evaluate(() => { RS.input.b = 0; });

  // 3. shield health runs out: it splinters and breaks, and the shield is gone
  await p.evaluate(() => { T.setup('longsword', 'greatsword', { shield: 1 }); T.place(1.9); RS.input.b = 1; T.f(0).shield.hp = 12; });
  const s3 = await p.evaluate(async () => { for (let k = 0; k < 6 && !(T.ev.splinter > 0); k++) { T.place(1.9); T.f(0).health = 100; await T.frames(8); RS.sim.inputs[1].a++; await T.frames(60); }
    await T.frames(2); return { splinter: T.ev.splinter || 0, hp: T.f(0).shield.hp, up: RS.sim.shieldUp(T.f(0)), snapSh: RS.lastSnap.f[0].sh, debris: RS.sim.debris.filter((d) => d.piece === 6).length }; });
  const splShot = await shot('splinter');
  ok('shield break: a worn-out shield splinters into pieces and stops protecting', s3.splinter > 0 && !s3.up && /x/.test(s3.snapSh) && s3.debris > 0, s3);
  await p.evaluate(() => { RS.input.b = 0; });

  // 4. heavy weapons knock a raised shield guard open
  await p.evaluate(() => { T.setup('longsword', 'greatsword', { shield: 1 }); T.place(1.9); RS.input.b = 1; });
  const s4 = await p.evaluate(async () => { for (let k = 0; k < 6 && !(T.ev.guardbreak > 0); k++) { T.place(1.9); T.f(0).health = 100; T.f(0).shield.hp = 70; await T.frames(8); RS.sim.inputs[1].a++; await T.frames(60); } return { shield: T.ev.shield || 0, guardbreak: T.ev.guardbreak || 0 }; });
  ok('heavy blows: a greatsword knocks the shield guard open', s4.shield > 0 && s4.guardbreak > 0, s4);
  await p.evaluate(() => { RS.input.b = 0; });

  // 5. shield bash (Block + tap toward) breaks the enemy guard
  await p.evaluate(() => { T.setup('longsword', 'longsword', { shield: 1 }); T.place(1.0); RS.sim.inputs[1].b = 1; });
  const s5 = await p.evaluate(async () => { for (let k = 0; k < 4 && !(T.ev.bash > 0 && T.ev.guardbreak > 0); k++) { T.place(0.95); RS.sim.inputs[1].b = 1; await T.frames(10); RS.input.b = 1; await T.frames(6); RS.input.r = 1; await T.frames(3); RS.input.r = 0; await T.frames(25); RS.input.b = 0; await T.frames(30); }
    return { bashgo: T.ev.bashgo || 0, bash: T.ev.bash || 0, guardbreak: T.ev.guardbreak || 0, kick: T.ev.kick || 0 }; });
  ok('shield bash: Block + tap toward the enemy bashes with the shield and breaks their guard', s5.bash > 0 && s5.guardbreak > 0 && s5.kick === 0, s5);
  await p.evaluate(() => { RS.sim.inputs[1].b = 0; });

  // 6. location wounds: legs slow you down, arms weaken swings, head dazes
  const w = await p.evaluate(async () => {
    T.setup('longsword', 'longsword', {}, { helmet: 0, chest: 0, arms: 0, legs: 0 }); T.place(6);
    const e = T.f(1), s = RS.sim, V = planck.Vec2, pt = e.b[5].getPosition();
    const walk = async () => { T.place(6); await T.frames(5); s.inputs[1] = Object.assign({}, s.inputs[1], { l: 1 }); let mx = 0; for (let i = 0; i < 45; i++) { await T.frames(1); mx = Math.max(mx, -e.b[0].getLinearVelocity().x); } s.inputs[1] = Object.assign({}, s.inputs[1], { l: 0 }); await T.frames(20); return mx; };
    const v0 = await walk();
    s.damage(e, 5, 30, { prot: 1, arm: 1, pt, dx: 1, dy: 0 }); e.health = 100;
    const v1 = await walk();
    const wind = async () => { T.place(6); await T.frames(10); s.inputs[1] = Object.assign({}, s.inputs[1], { a: (s.inputs[1].a | 0) + 1 }); let t = 0; await T.until(() => e.atk, 500); const t0 = performance.now(); await T.until(() => !e.atk || e.atk.ph !== 'wind', 1500); t = performance.now() - t0; await T.frames(40); return Math.round(t); };
    const w0 = await wind();
    s.damage(e, 9, 30, { prot: 1, arm: 1, pt: e.b[9].getPosition(), dx: 1, dy: 0 }); e.health = 100;
    const w1 = await wind();
    s.damage(e, 1, 20, { prot: 1, arm: 1, pt: e.b[1].getPosition(), dx: 1, dy: 0 }); e.health = 100;
    await T.frames(2);
    return { legHurt: +e.legHurt.toFixed(2), walkSpeedBefore: +v0.toFixed(2), walkSpeedAfter: +v1.toFixed(2), armHurt: +e.armHurt.toFixed(2), windMsBefore: w0, windMsAfter: w1, dazed: e.dazeT > 0, hu: RS.lastSnap.f[1].hu, ev: { limp: T.ev.limp || 0, armhurt: T.ev.armhurt || 0, daze: T.ev.daze || 0 } };
  });
  const woundShot = await shot('wounds');
  ok('wounds: a leg hit makes them limp and slower, an arm hit slows their swing, a head hit dazes', w.legHurt >= 0.4 && w.walkSpeedAfter < w.walkSpeedBefore * 0.85 && w.armHurt >= 0.4 && w.windMsAfter > w.windMsBefore && w.dazed && w.ev.limp && w.ev.armhurt, w);

  // 7. feint: Block during your own wind-up cancels the swing
  await p.evaluate(() => { T.setup('greatsword', 'longsword'); T.place(3); });
  const ft = await p.evaluate(async () => { RS.input.a++; await T.until(() => T.f(0).atk && T.f(0).atk.ph === 'wind' && T.f(0).atk.t > 0.05, 800); RS.input.b = 1; await T.frames(3); const r = { feint: T.ev.feint || 0, atk: !!T.f(0).atk }; RS.input.b = 0; await T.frames(20); return r; });
  ok('feint: pressing Block during a wind-up cancels the attack', ft.feint > 0 && !ft.atk, ft);

  // 8. FINISH HIM: the round-deciding KO puts the loser on their knees; the button shows; nobody finishes -> normal collapse
  await p.evaluate(() => { T.setup('longsword', 'longsword'); T.place(4); });
  await sleep(300);
  const fh = await p.evaluate(async () => { T.kill(1); await T.frames(10); const s = RS.sim, sn = RS.lastSnap;
    return { state: s.state, fin: sn.fin, victimAlive: T.f(1).alive, victimPst: T.f(1).pst, torsoY: +T.f(1).b[0].getPosition().y.toFixed(2), btnShown: !document.getElementById('fatBtn').classList.contains('hidden') }; });
  const finShots = []; for (let i = 0; i < 4; i++) { finShots.push(await shot('finish')); await sleep(220); }
  const fh2 = await p.evaluate(async () => { const t0 = performance.now(); await T.until(() => RS.sim.state !== 'finish', 5000); const dt = (performance.now() - t0) / 1000; await T.frames(5);
    return { after: RS.sim.state, waitedS: +dt.toFixed(1), msg: RS.sim.msg, victim: T.f(1).pst, fat: T.ev.fatal || 0, btnHidden: document.getElementById('fatBtn').classList.contains('hidden'), score: RS.sim.scores.join(':') }; });
  ok('finish him: round-deciding KO -> kneeling FINISH HIM state with a Fatality button', fh.state === 'finish' && fh.fin && fh.fin[1] === 0 && fh.victimPst === 'finish' && fh.btnShown, fh);
  ok('finish timeout: if nobody finishes within ~3.6 s they collapse (normal K.O.)', fh2.after === 'ko' && /K\.O/.test(fh2.msg) && fh2.victim === 'ko' && fh2.fat === 0 && fh2.btnHidden && fh2.score === '1:0', fh2);

  // 9. too far away: the fatality needs you close
  await p.evaluate(() => { T.setup('longsword', 'longsword'); T.place(6); });
  const tf = await p.evaluate(async () => { T.kill(1); await T.frames(5); RS.input.fx++; await T.frames(5); return { toofar: T.ev.toofar || 0, fat: RS.sim.fin && RS.sim.fin.fat }; });
  ok('fatality range: pressing Fatality from across the arena says "Get closer!"', tf.toofar > 0 && !tf.fat, tf);

  // 10. every fatality type (weapon-dependent), pressed by the player (E key / touch button / kick)
  const types = [['longsword', {}, 'fx', 'spin', 1.6], ['axe', {}, 'fx', 'slam', 1.5], ['mace', {}, 'fx', 'slam', 1.5], ['spear', {}, 'fx', 'lift', 1.8], ['pistol', {}, 'fx', 'shot', 3.5], ['bow', {}, 'fx', 'arrow', 4], ['longsword', { shield: 1 }, 'k', 'bash', 1.3], ['greatsword', {}, 'k', 'kick', 1.3], ['katana', {}, 'btn', 'spin', 1.6]];
  const fatShots = {};
  for (const [wpn, x, how, want, d] of types) {
    await p.evaluate(({ wpn, x, d }) => { T.setup(wpn, 'longsword', x); T.place(d); }, { wpn, x, d });
    await sleep(250);
    await p.evaluate(() => T.kill(1)); await sleep(350);
    if (how === 'btn') { const fb = p.locator('#fatBtn'); await fb.waitFor({ state: 'visible', timeout: 2000 }); await fb.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true }); await fb.dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true }); } else await p.evaluate((how) => { RS.input[how]++; }, how);
    const shots = [];
    const t0 = Date.now(); let r;
    while (Date.now() - t0 < 9000) {
      r = await p.evaluate(() => ({ st: RS.sim.state, fat: RS.sim.fin && RS.sim.fin.fat, hit: !!(RS.sim.fin && RS.sim.fin.hit), msg: RS.sim.msg, ban: RS.lastSnap.ban }));
      if (want === 'spin' && how === 'fx' || want === 'slam' && wpn === 'axe' || want === 'lift' || want === 'shot') shots.push(await shot('fat-' + want));
      if (r.st === 'ko' || r.st === 'over') break;
      await sleep(want === 'spin' || want === 'slam' || want === 'lift' || want === 'shot' ? 60 : 150);
    }
    const res = await p.evaluate(() => ({ st: RS.sim.state, msg: RS.sim.msg, fatal: T.ev.fatal || 0, fatstart: T.ev.fatstart || 0, victim: T.f(1).pst, alive: T.f(1).alive, score: RS.sim.scores.join(':') }));
    fatShots[want + '-' + wpn] = shots;
    ok(`fatality ${want} (${wpn}${x.shield ? ' + shield' : ''}, via ${how === 'fx' ? 'E / fx' : how === 'k' ? 'kick input' : 'touch button'})`, res.fatstart > 0 && res.fatal > 0 && res.msg === 'FATALITY!' && res.victim === 'ko' && !res.alive && res.score === '1:0', Object.assign({ type: (await p.evaluate(() => RS.sim.lastFat || null)) }, res));
  }

  // 11. computer opponents do fatalities too
  const ai = await p.evaluate(async () => {
    const seen = []; let tries = 0;
    for (; tries < 6 && !seen.some((x) => x.fat); tries++) {
      T.setup('longsword', 'longsword', {}, {}); RS.sim.players[1].cpu = 'hard'; T.place(2.0);
      await T.frames(10); T.kill(0);
      await T.until(() => RS.sim.state !== 'finish', 9000);
      seen.push({ fat: T.ev.fatal || 0, msg: RS.sim.msg });
    }
    return { tries, seen };
  });
  ok('computer fatality: a hard computer opponent finishes the player with a fatality', ai.seen.some((x) => x.fat > 0 && x.msg === 'FATALITY!'), ai);

  console.log('page errors:', errs.length ? errs : 'none');
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  console.log(`SUMMARY ${results.filter(Boolean).length}/${results.length} passed`);
  require('fs').writeFileSync('/tmp/v3d/picks.json', JSON.stringify({ shieldShots, splShot, woundShot, finShots, fatShots }));
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });

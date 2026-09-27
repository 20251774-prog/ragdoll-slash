const { chromium } = require('playwright-core');
const URL = process.argv[2] || 'http://localhost:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, info) => { results.push([cond ? 'PASS' : 'FAIL', name, info || '']); console.log(cond ? 'PASS' : 'FAIL', name, info ? JSON.stringify(info) : ''); };
async function waitFor(p, fn, ms, arg) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await p.evaluate(fn, arg).catch(() => null); if (v) return v; await sleep(100); } return null; }
const hookEvents = (p) => p.evaluate(() => { window.EVC = {}; const s = RS.sim, o = s.ev; s.ev = function (t, ...a) { EVC[t] = (EVC[t] || 0) + 1; return o.call(this, t, ...a); }; });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL); await sleep(1200);
  let n = 0; const shot = async (tag) => { const f = `/tmp/v2c_${tag}_${n++}.png`; await p.screenshot({ path: f }); return f; };

  // ---- customise + persistence ----
  await p.click('text=Customise fighter'); await sleep(300);
  await p.click('#customOpts .opt[data-key=helmet] [data-v="3"]');
  await p.click('#customOpts .opt[data-key=chest] [data-v="3"]');
  await p.click('#customOpts .opt[data-key=arms] [data-v="2"]');
  await p.click('#customOpts .opt[data-key=legs] [data-v="3"]');
  await p.click('#customOpts .opt[data-key=color] [data-v="4"]');
  await p.click('#customOpts .opt[data-key=trim] [data-v="3"]');
  await p.click('#customOpts .opt[data-key=primary] [data-v="greatsword"]');
  await p.click('#customOpts .opt[data-key=secondary] [data-v="shotgun"]');
  await p.fill('#loName', 'Paul');
  await sleep(300); await p.screenshot({ path: '../screenshots/v2-customise.png' });
  await p.reload(); await sleep(800);
  const lo = await p.evaluate(() => RS.loadout);
  ok('customise saved in localStorage and restored after reload', lo.name === 'Paul' && lo.primary === 'greatsword' && lo.secondary === 'shotgun' && lo.color === 4 && lo.legs === 3, lo);

  // ---- solo 1v1 through the menus ----
  await p.click('text=Play vs computer'); await p.click('#soloMode [data-mode="1v1"]'); await p.click('[data-diff=normal]');
  await sleep(300); await p.evaluate(() => { RS.sim.players[0].cpu = 'hard'; }); await hookEvents(p);
  const r1 = await waitFor(p, () => RS.sim.scores.reduce((a, c) => a + c, 0) >= 1 && { sc: RS.sim.scores, ev: EVC }, 60000);
  ok('solo 1v1: round resolves', !!r1, r1);
  await p.evaluate(() => RS.show('menu'));

  // ---- solo 2v2 through the menus ----
  await p.evaluate(() => RS.setLoadout(Object.assign(RS.loadout, { primary: 'longsword', secondary: 'pistol' })));
  await p.click('text=Play vs computer'); await p.click('#soloMode [data-mode="2v2"]'); await p.click('[data-diff=normal]');
  await sleep(300);
  const t2 = await p.evaluate(() => ({ n: RS.sim.fighters.length, teams: RS.sim.teams, sides: RS.sim.fighters.map((f) => f.side), names: RS.meta.map((m) => m.name) }));
  ok('solo 2v2: 4 fighters in 2 teams', t2.n === 4 && t2.teams && t2.sides.join() === '0,1,0,1', t2);
  await p.evaluate(() => { RS.sim.players[0].cpu = 'normal'; }); await hookEvents(p);
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const s = await p.evaluate(() => { const sn = RS.lastSnap; return sn && { alive: sn.f.filter((f) => f.fl & 1).length, strike: sn.f.some((f) => f.fl & 4), st: sn.st }; });
    if (s && s.alive === 4 && s.strike && s.st === 'fight') await shot('2v2');
  }
  const r2 = await waitFor(p, () => RS.sim.scores.reduce((a, c) => a + c, 0) >= 1 && { sc: RS.sim.scores, ev: EVC }, 60000);
  ok('solo 2v2: team round resolves (friendly fire off)', !!r2, r2);
  await p.evaluate(() => RS.show('menu'));

  // ---- guns: rifle (drag-to-aim joystick), swap to shotgun, reload ----
  await p.evaluate(() => { RS.setLoadout(Object.assign(RS.loadout, { primary: 'rifle', secondary: 'shotgun' })); RS.startSolo('easy', '1v1');
    RS.sim.players[1].loadout = Object.assign({}, RS.sim.players[1].loadout, { primary: 'pistol', secondary: 'rifle', helmet: 2, chest: 3 }); RS.sim.restartMatch(); });
  await hookEvents(p);
  await waitFor(p, () => RS.sim.state === 'fight', 5000);
  const box = await p.locator('#atkBtn').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const pe = (type, x, y) => p.locator('#atkBtn').dispatchEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, bubbles: true });
  const e0 = await p.evaluate(() => ({ h: RS.sim.fighters[1].health, arm: RS.sim.fighters[1].pieces.map((x) => x.hp) }));
  await pe('pointerdown', cx, cy);
  // drag toward the enemy (to the right, slightly up)
  await pe('pointermove', cx + 40, cy); await sleep(120);
  const aimSet = await p.evaluate(() => RS.input.am);
  for (let i = 0; i < 6; i++) { await sleep(150); const s = await p.evaluate(() => RS.lastSnap.pr.length); if (s) await shot('gun'); }
  await pe('pointerup', cx + 40, cy);
  await sleep(300);
  const e1 = await p.evaluate(() => ({ h: RS.sim.fighters[1].health, arm: RS.sim.fighters[1].pieces.map((x) => x.hp), ammo: RS.sim.fighters[0].ws[0].ammo, ev: EVC }));
  ok('touch aim joystick sets an aim angle', typeof aimSet === 'number' && Math.abs(aimSet) < 0.1, { aimSet });
  ok('rifle: auto fire, bullets hit (health/armour down), ammo used', (e1.ev.rifle || 0) >= 3 && e1.ammo < 20 && (e1.h < e0.h || e1.arm.join() !== e0.arm.join()), { shots: e1.ev.rifle, ammo: e1.ammo, before: e0, after: { h: e1.h, arm: e1.arm } });
  // swap
  const sw = await p.locator('[data-k=w]');
  await sw.dispatchEvent('pointerdown', { pointerId: 8, pointerType: 'touch', bubbles: true }); await sw.dispatchEvent('pointerup', { pointerId: 8, pointerType: 'touch', bubbles: true });
  await sleep(400);
  const wk = await p.evaluate(() => ({ key: RS.sim.fighters[0].ws[RS.sim.fighters[0].slot].key, label: document.getElementById('atkBtn').textContent }));
  ok('Swap button changes weapon (rifle -> shotgun)', wk.key === 'shotgun', wk);
  for (let i = 0; i < 6; i++) { await pe('pointerdown', cx, cy); await sleep(60); await pe('pointerup', cx, cy); await sleep(850); if (i === 1) await shot('gun'); }
  const e2 = await p.evaluate(() => ({ ev: EVC, ammo: RS.sim.fighters[0].ws[1].ammo, rl: RS.sim.fighters[0].reloadT }));
  ok('shotgun: tap fires pellets; empties and reloads', (e2.ev.shotgun || 0) >= 4 && (e2.ev.reload || 0) >= 1, e2);
  // gunfight candidates: both sides shooting
  await p.evaluate(() => { RS.sim.players[0].cpu = 'normal'; });
  for (let i = 0; i < 30; i++) { await sleep(200); const s = await p.evaluate(() => RS.lastSnap.pr.filter((q) => !q[3]).length); if (s >= 2) await shot('gun'); }
  await p.evaluate(() => RS.show('menu'));

  // ---- bow ----
  await p.evaluate(() => { RS.setLoadout(Object.assign(RS.loadout, { primary: 'bow', secondary: 'katana' })); RS.startSolo('easy', '1v1');
    RS.sim.players[1].cpu = 'easy'; RS.sim.players[1].loadout = Object.assign({}, RS.sim.players[1].loadout, { primary: 'rifle', secondary: 'rifle' }); RS.sim.restartMatch(); });
  await hookEvents(p);
  await waitFor(p, () => RS.sim.state === 'fight', 5000);
  let arrowSeen = 0;
  for (let k = 0; k < 5; k++) {
    await p.evaluate(() => RS.attackDown()); await sleep(750);
    const drawn = await p.evaluate(() => RS.sim.fighters[0].draw);
    if (k === 0) await shot('bowdraw');
    await p.evaluate(() => RS.attackUp());
    for (let i = 0; i < 8; i++) { await sleep(40); const a = await p.evaluate(() => RS.lastSnap.pr.some((q) => q[3] === 1 && Math.abs(q[1]) > 0.3)); if (a) { arrowSeen++; await shot('bow'); break; } }
    await sleep(600);
    if (k === 0) ok('bow: holding draws the string', drawn > 0.8, { drawn });
  }
  const eb = await p.evaluate(() => ({ ev: EVC, h: RS.sim.fighters[1].health, arm: RS.sim.fighters[1].pieces.map((x) => Math.round(x.hp)) }));
  ok('bow: arrows fly as physics projectiles and hit', (eb.ev.bow || 0) >= 3 && arrowSeen >= 2 && ((eb.ev.armor || 0) + (eb.ev.blood || 0)) >= 1, eb);
  await p.evaluate(() => RS.show('menu'));

  // ---- armour breaking ----
  await p.evaluate(() => { RS.setLoadout(Object.assign(RS.loadout, { primary: 'mace', secondary: 'axe' })); RS.startSolo('easy', '1v1');
    RS.sim.players[0].cpu = 'hard'; RS.sim.players[1].loadout = Object.assign({}, RS.sim.players[1].loadout, { helmet: 3, chest: 3, arms: 3, legs: 3, primary: 'longsword' }); RS.sim.restartMatch(); });
  await hookEvents(p);
  let brokeShots = 0;
  for (let i = 0; i < 450 && brokeShots < 6; i++) {
    await sleep(100);
    const s = await p.evaluate(() => ({ db: RS.lastSnap.db.filter((d) => d[6] > 0.9 && d[1] > 0.25).length, ar: RS.lastSnap.f[1].ar }));
    if (s.db > 0) { await shot('armour'); brokeShots++; await sleep(60); }
  }
  const ea = await p.evaluate(() => ({ ev: EVC, ar: RS.lastSnap.f.map((f) => f.ar), db: RS.lastSnap.db.length }));
  ok('armour: pieces dent, break and fall off as physics debris', (ea.ev.break || 0) >= 1 && brokeShots >= 1, ea);
  // exposed part takes more damage: compare damage to a part with and without armour
  const dm = await p.evaluate(() => {
    const s = new RSGame.Sim([{ name: 'a', cpu: null, loadout: { chest: 3 } }, { name: 'b', cpu: null }]);
    const f = s.fighters[0], pt = { x: 0, y: 1 };
    const a = s.damage(f, 0, 20, { prot: 1, arm: 1, pt, dx: 1, dy: 0 }).dmg;
    f.pieces[1].hp = 0; const b2 = s.damage(f, 0, 20, { prot: 1, arm: 1, pt, dx: 1, dy: 0 }).dmg;
    return { armoured: +a.toFixed(1), broken: +b2.toFixed(1) };
  });
  ok('armour: body part takes much more damage after its armour breaks', dm.broken > dm.armoured * 2.5, dm);
  const sp = await p.evaluate(() => ({ none: RSGame.loadoutStats({ helmet: 0, chest: 0, arms: 0, legs: 0 }).speed, plate: RSGame.loadoutStats({ helmet: 3, chest: 3, arms: 3, legs: 3 }).speed }));
  ok('armour types trade protection for speed', sp.plate < sp.none, sp);

  console.log('page errors:', errs.length ? errs : 'none');
  console.log('SUMMARY', results.filter((r) => r[0] === 'PASS').length + '/' + results.length + ' passed');
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });

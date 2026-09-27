// Multiplayer test: host + N joiners in separate browser contexts, pairing via real QR images fed to a fake camera.
const { chromium } = require('playwright-core');
const N = parseInt(process.argv[2] || '3', 10);
const MODE = process.argv[3] || 'teams'; // teams | ffa
const FILL = (process.argv[4] || '1') === '1';
const URL = process.argv[5] || 'http://localhost:8765/';
const WEAP = ['katana', 'rifle', 'bow'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(p, fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await p.evaluate(fn).catch(() => null); if (v) return v; await sleep(150); }
  throw new Error('timeout: ' + label);
}
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const mk = async (name) => {
    const ctx = await b.newContext({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, permissions: ['camera'] });
    await ctx.addInitScript(() => {
      window.__feed = null;
      const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md);
      md.getUserMedia = async (c) => {
        const real = await orig(c); real.getTracks().forEach((t) => t.stop()); // real permission, like a phone
        const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const x = cv.getContext('2d'); const img = new Image(); let src = null;
        setInterval(() => { x.fillStyle = '#6a6a6a'; x.fillRect(0, 0, 640, 480);
          if (window.__feed) { if (src !== window.__feed) { src = window.__feed; img.src = src; } if (img.complete && img.naturalWidth) { x.save(); x.translate(320, 240); x.rotate(0.08); x.drawImage(img, -170, -170, 340, 340); x.restore(); } } }, 60);
        return cv.captureStream(15);
      };
    });
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', (e) => p.errs.push(name + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) p.errs.push(name + ' console: ' + m.text()); });
    await p.goto(URL); await sleep(600);
    return p;
  };
  const host = await mk('host');
  const joiners = [];
  await host.evaluate(() => RS.setLoadout(Object.assign(RS.loadout, { name: 'Paul', primary: 'greatsword', secondary: 'pistol' })));
  await host.click('text=Host a game');
  await host.click(`#hostMode [data-mode="${MODE}"]`);
  await host.evaluate((f) => { const c = document.getElementById('hostFill'); if (c.checked !== f) c.click(); }, FILL);
  for (let k = 0; k < N; k++) {
    if (k > 0) await host.click('#hostAdd');
    const hcode = await waitFor(host, () => !document.getElementById('hostScan').classList.contains('hidden') && RS.hostCode, 15000, 'host code');
    const hqr = await host.evaluate(() => document.getElementById('hostQR').toDataURL());
    console.log(`slot ${k + 1}: host offer code ${hcode.length} chars`);
    const j = await mk('join' + (k + 1)); joiners.push(j);
    await j.evaluate(([k, w]) => RS.setLoadout(Object.assign(RS.loadout, { name: 'Phone ' + (k + 2), primary: w, secondary: 'longsword', color: k + 4 })), [k, WEAP[k % 3]]);
    await j.evaluate((d) => { window.__feed = d; }, hqr);
    await j.click('text=Join a game');
    const jcode = await waitFor(j, () => RS.joinCode, 20000, 'joiner scanned host QR + made answer');
    const jqr = await j.evaluate(() => document.getElementById('joinQR').toDataURL());
    console.log(`slot ${k + 1}: joiner scanned host QR by camera; answer code ${jcode.length} chars`);
    await host.evaluate((d) => { window.__feed = d; }, jqr);
    await host.click('#hostScan');
    await waitFor(host, () => RS.connected >= 1 + 0 && document.getElementById('hostStart').offsetParent !== null && RS.connected, 20000, 'host connected');
    await waitFor(j, () => RS.connected, 10000, 'joiner connected');
    console.log(`slot ${k + 1}: CONNECTED (host scanned joiner QR by camera). host peers=${await host.evaluate(() => RS.connected)}`);
  }
  const sdpInfo = await host.evaluate(() => RSNet.decode(RS.hostCode).sdp.match(/a=candidate.*/g));
  console.log('candidates in host code:', sdpInfo);
  await host.click('#hostStart');
  for (const j of joiners) await waitFor(j, () => RS.mode === 'client' && RS.snaps.length > 1, 10000, 'client receives snapshots');
  console.log('game started; clients receive snapshots');
  const hp = await host.evaluate(() => ({ teams: RS.sim.teams, tmode: RS.sim.snapshot().tmode, pl: RS.sim.players.map((p) => `${p.name}[team ${p.team}${p.cpu ? ', cpu' : ''}] ${p.loadout.primary}/${p.loadout.secondary}`) }));
  console.log('host sim players:', JSON.stringify(hp));
  const cm = await joiners[0].evaluate(() => RS.meta.map((m) => `${m.name}:${m.teams ? 'team ' + m.team : 'ffa'}`));
  console.log('client 1 sees:', cm.join(', '));
  const expectN = FILL ? 4 : N + 1;
  const loadoutsOk = hp.pl.length === expectN && joiners.every((_, k) => hp.pl[k + 1].startsWith('Phone ' + (k + 2)) && hp.pl[k + 1].includes(WEAP[k % 3]));
  const modeOk = MODE === 'teams' ? !!hp.tmode : !hp.tmode;
  console.log(`CHECK players/loadouts from phones reached host: ${loadoutsOk ? 'PASS' : 'FAIL'}; mode ${MODE}: ${modeOk ? 'PASS' : 'FAIL'}`);
  await sleep(2200);
  // sync check: compare torso x of each fighter host vs client
  const hx = await host.evaluate(() => RS.sim.snapshot().f.map((f) => f.p[0].toFixed(2)));
  const cx = await joiners[0].evaluate(() => RS.snaps[RS.snaps.length - 1].f.map((f) => f.p[0].toFixed(2)));
  console.log('host torso x:', hx, ' client torso x:', cx);
  // client input check: joiner 1 walks toward host fighter
  const x0 = await host.evaluate(() => RS.sim.fighters[1].b[0].getPosition().x);
  await joiners[0].evaluate(() => { RS.input.l = 1; });
  await sleep(700);
  await joiners[0].evaluate(() => { RS.input.l = 0; });
  const x1 = await host.evaluate(() => RS.sim.fighters[1].b[0].getPosition().x);
  console.log(`client 1 held LEFT: its fighter on host moved ${x0.toFixed(2)} -> ${x1.toFixed(2)}`);
  // fight: host player is driven by the host's computer AI for the test; clients spam attacks toward nearest enemy
  await host.evaluate(() => { RS.sim.players[0].cpu = 'easy'; });
  let shot = false; const t0 = Date.now(); let res = null;
  while (Date.now() - t0 < 90000) {
    for (const [i, j] of joiners.entries()) await j.evaluate(() => {
      const s = RS.snaps[RS.snaps.length - 1]; if (!s) return;
      const me = s.f[window.__me ?? 0]; });
    for (const [i, j] of joiners.entries()) await j.evaluate((slot) => {
      const s = RS.snaps[RS.snaps.length - 1]; if (!s) return;
      const me = s.f[slot]; let best = null, bd = 1e9;
      s.f.forEach((f, k) => { if (k !== slot && (f.fl & 1) && !(RS.meta[k].teams && RS.meta[k].team === RS.meta[slot].team)) { const d = Math.abs(f.p[0] - me.p[0]); if (d < bd) { bd = d; best = f; } } });
      RS.input.l = RS.input.r = 0;
      if (best) { const dx = best.p[0] - me.p[0]; if (Math.abs(dx) > 1.5) (dx > 0 ? RS.input.r = 1 : RS.input.l = 1); else if (Math.random() < 0.5) RS.input.a++; if (Math.abs(dx) < 9 && Math.random() < 0.3) RS.input.a++; }
    }, i + 1);
    if (!shot) {
      const hit = await joiners[0].evaluate(() => { const s = RS.snaps[RS.snaps.length - 1]; return s && s.f.some((f) => f.fl & 4) && s.f.some((f) => f.h < 80); });
      if (hit) { await joiners[0].screenshot({ path: `../screenshots/v2-mp-${MODE}-client-view.png` }); shot = true; }
    }
    res = await joiners[0].evaluate(() => { const s = RS.snaps[RS.snaps.length - 1]; return { sc: s.sc, st: s.st, h: s.f.map((f) => Math.round(f.h)), msg: s.msg }; });
    if (res.sc.reduce((a, c) => a + c, 0) >= 1 && res.st === 'ko') break;
    await sleep(120);
  }
  const hs = await host.evaluate(() => ({ sc: RS.sim.scores, st: RS.sim.state }));
  console.log('client view after fight:', JSON.stringify(res), ' host:', JSON.stringify(hs));
  await sleep(600);
  await host.screenshot({ path: `../screenshots/v2-mp-${MODE}-host-view-${N + 1}phones.png` });
  const hpN = await host.evaluate(() => RS.sim.players.length);
  // v3: FINISH HIM + fatality over the network. Host-authoritative: the host decides the KO, phone 1's team wins,
  // phone 1 taps its FATALITY button, the host runs the cinematic and every phone sees it.
  let fatOk = false;
  if (!hs.st || hs.st !== 'over') {
    await waitFor(host, () => RS.sim.state === 'fight', 15000, 'next round starts');
    for (const j of joiners) await j.evaluate(() => { RS.input.l = RS.input.r = 0; });
    const setup = await host.evaluate(() => {
      const s = RS.sim, me = s.fighters[1], side = me.side, V = planck.Vec2;
      s.players.forEach((p, k) => { if (k !== 1 && s.fighters[k].side === side) { p.cpu = null; } });
      s.players.forEach((p, k) => { if (k !== 1 && s.fighters[k].side === side && p.slot > 0) p.slot = -p.slot; }); // mute teammates' phone inputs for the test
      s.fighters.forEach((f, k) => { if (k !== 1 && f.side === side) s.inputs[k] = { l: 0, r: 0, b: 0, a: 0, j: 0, d: 0, w: 0, rl: 0, k: 0, fx: 0 }; });
      const foes = s.fighters.filter((f) => f.alive && f.side !== side), last = foes.pop();
      foes.forEach((f) => { f.health = 0; s.ko(f, 1, 0, f.b[0].getPosition()); });
      const mx = me.b[0].getPosition().x, tx = Math.max(-6, Math.min(6, mx + (mx < 0 ? 1.5 : -1.5))), dx = tx - last.b[0].getPosition().x;
      for (const bb of last.b) { const q = bb.getPosition(); bb.setTransform(V(q.x + dx, q.y), bb.getAngle()); bb.setLinearVelocity(V(0, 0)); }
      last.health = 0; s.ko(last, 1, 0, last.b[0].getPosition());
      return { state: s.state, victim: last.id, side, winnerWeapon: s.weapon(me).key };
    });
    console.log('host forced the round-deciding KO:', JSON.stringify(setup));
    const cseen = await waitFor(joiners[0], () => { const s = RS.snaps[RS.snaps.length - 1]; return s && s.fin && !s.fin[3] && !document.getElementById('fatBtn').classList.contains('hidden') && JSON.stringify(s.fin); }, 5000, 'phone 1 sees FINISH HIM + its Fatality button');
    const other = joiners[1] ? await joiners[1].evaluate(() => ({ fin: !!(RS.snaps[RS.snaps.length - 1] || {}).fin, btn: !document.getElementById('fatBtn').classList.contains('hidden') })) : null;
    console.log('phone 1 sees fin', cseen, '; phone 2 (other side or teammate) sees', JSON.stringify(other));
    await joiners[0].screenshot({ path: '../screenshots/v3-mp-finish-client.png' });
    const fb = joiners[0].locator('#fatBtn');
    await fb.dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true, bubbles: true }); await fb.dispatchEvent('pointerup', { pointerId: 11, pointerType: 'touch', isPrimary: true, bubbles: true });
    const hfat = await waitFor(host, () => RS.sim.fin && RS.sim.fin.fat && { fat: RS.sim.fin.fat, by: RS.sim.fin.by }, 4000, 'host runs the fatality for phone 1');
    console.log('host fatality started:', JSON.stringify(hfat));
    let mid = false;
    const cfat = await waitFor(joiners[0], () => { const s = RS.snaps[RS.snaps.length - 1]; if (s && s.fin && s.fin[4]) window.__sawHit = 1; return s && (s.ban || s.msg === 'FATALITY!') && { ban: s.ban, msg: s.msg, sawHit: !!window.__sawHit }; }, 12000, 'phone 1 sees FATALITY');
    await joiners[0].screenshot({ path: '../screenshots/v3-mp-fatality-client.png' });
    const others = await Promise.all(joiners.slice(1).map((j) => j.evaluate(() => { const s = RS.snaps[RS.snaps.length - 1]; return s && (s.ban || s.msg === 'FATALITY!'); })));
    const hmsg = await host.evaluate(() => ({ msg: RS.sim.msg, st: RS.sim.state, victim: RS.sim.fighters.find((f) => f.pst === 'ko' && !f.alive) ? 1 : 0 }));
    console.log('phone 1 view:', JSON.stringify(cfat), ' other phones see FATALITY:', others, ' host:', JSON.stringify(hmsg));
    fatOk = hfat.by === 1 && !!cfat && others.every(Boolean) && hmsg.msg === 'FATALITY!';
    console.log('CHECK multiplayer fatality (phone taps FATALITY, host runs it, all phones see it):', fatOk ? 'PASS' : 'FAIL');
  }
  const errs = [host, ...joiners].flatMap((p) => p.errs);
  console.log('errors:', errs.length ? errs : 'none');
  console.log(res && res.sc.reduce((a, c) => a + c, 0) >= 1 && loadoutsOk && modeOk && fatOk && !errs.length ? 'RESULT: PASS - round resolved and synced, multiplayer fatality works' : 'RESULT: FAIL');
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });

// Comparison check: a standing fighter's torso under light hits, v2 (ragdoll-ish) vs v3 (active ragdoll).
// Light hits = pistol bullets to the chest every 0.6 s, plus a light shove on the head every 0.6 s (pure physics).
global.window = {}; global.planck = require('./node_modules/planck');
function load(file) { delete require.cache[require.resolve(file)]; window.RSGame = null; require(file); return window.RSGame; }
function run(G, label, mode) {
  const lo = { primary: 'longsword', secondary: 'pistol', helmet: 2, chest: 2, arms: 2, legs: 2 };
  const s = new G.Sim([{ name: 'stand', cpu: null, loadout: lo }, { name: 'shooter', cpu: null, loadout: lo }], {});
  s.state = 'fight'; s.stateT = 0; s.timer = 999;
  const f = s.fighters[0], sh = s.fighters[1];
  let t = 0, maxTilt = 0, sum = 0, n = 0, over20 = 0, hits = 0, fell = false, recover = [];
  let lastHit = -1, backT = null, base = null;
  for (let i = 0; i < 60 * 12; i++) {
    f.health = 100; for (const pc of f.pieces) pc.hp = pc.max; // never KO / never break: isolate balance
    if (i > 60 && i % 36 === 0) {
      const tp = f.b[0].getPosition();
      if (mode === 'bullet') s.spawnProj(sh, G.WEAPONS.pistol, tp.x + 1.2, tp.y + 0.05, Math.PI, 60, 19);
      else f.b[1].applyLinearImpulse(planck.Vec2(-3.5, 0), f.b[1].getPosition(), true);
      hits++; lastHit = t; backT = null;
    }
    s.update(1 / 60); t += 1 / 60;
    const raw = ((f.b[0].getAngle() + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (i === 60) base = raw; // the fighter's own guard stance angle before any hit
    const a = Math.abs(raw - (base == null ? raw : base));
    if (i > 60) { maxTilt = Math.max(maxTilt, a); sum += a; n++; if (a > 20 * Math.PI / 180) over20++; }
    if (f.b[0].getPosition().y < 0.7) fell = true;
    if (lastHit >= 0 && backT === null && t - lastHit > 0.05 && a < 5 * Math.PI / 180) { backT = t - lastHit; recover.push(backT); }
  }
  const deg = (r) => +(r * 180 / Math.PI).toFixed(1);
  const res = { label, mode, hits, stanceDeg: deg(base), maxTiltDeg: deg(maxTilt), meanTiltDeg: deg(sum / n), pctTimeOver20deg: +(100 * over20 / n).toFixed(1), fellOver: fell,
    meanRecoverS: recover.length ? +(recover.reduce((a, b) => a + b, 0) / recover.length).toFixed(2) : null, recoveredAfter: recover.length + '/' + hits };
  console.log(JSON.stringify(res));
  return res;
}
const out = [];
for (const mode of ['bullet', 'shove']) {
  out.push(run(load('./ref_game_v2.js'), 'v2', mode));
  out.push(run(load('../js/game.js'), 'v3', mode));
}
const v2b = out[0], v3b = out[1], v2s = out[2], v3s = out[3];
const pass = !v3b.fellOver && !v3s.fellOver && v3b.maxTiltDeg < 20 && v3s.maxTiltDeg < 25 && v3b.meanTiltDeg < v2b.meanTiltDeg && v3s.meanTiltDeg < v2s.meanTiltDeg;
console.log(pass ? 'RESULT: PASS - v3 torso stays upright under light hits and is steadier than v2' : 'RESULT: FAIL');

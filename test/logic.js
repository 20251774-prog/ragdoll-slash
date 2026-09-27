const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  await p.goto(process.argv[2] || 'http://localhost:8765/'); await p.waitForTimeout(500);
  const cases = [
    ['1v1 melee normal', false, [['normal', { primary: 'longsword', secondary: 'katana' }], ['normal', { primary: 'greatsword', secondary: 'mace' }]]],
    ['1v1 hard vs easy', false, [['hard', {}], ['easy', {}]]],
    ['1v1 guns', false, [['normal', { primary: 'pistol', secondary: 'rifle' }], ['normal', { primary: 'shotgun', secondary: 'axe' }]]],
    ['1v1 bow vs spear', false, [['normal', { primary: 'bow', secondary: 'longsword' }], ['normal', { primary: 'spear', secondary: 'bow' }]]],
    ['2v2 teams random', true, [['normal', 'R'], ['normal', 'R'], ['normal', 'R'], ['normal', 'R']]],
    ['FFA 4 random', false, [['normal', 'R'], ['normal', 'R'], ['normal', 'R'], ['normal', 'R']]],
  ];
  for (const [name, teams, ps] of cases) {
    const r = await p.evaluate(([teams, ps]) => {
      const players = ps.map(([d, lo], i) => ({ name: 'P' + i, cpu: d, team: i % 2, loadout: lo === 'R' ? RSGame.randomLoadout() : Object.assign({}, RSGame.DEFAULT_LOADOUT, lo) }));
      const s = new RSGame.Sim(players, { teams });
      const cnt = {}; let t = 0, ff = 0;
      while (s.state !== 'over' && t < 900) { s.update(1 / 60); t += 1 / 60;
        for (const e of s.drainEvents()) cnt[e[0]] = (cnt[e[0]] || 0) + 1; s.drainNetEvents();
        for (const f of s.fighters) { const q = f.b[0].getPosition(); if (!isFinite(q.x) || Math.abs(q.x) > 12) return 'BAD POS'; }
      }
      return { t: t.toFixed(0), scores: s.scores, state: s.state, ev: cnt, lo: players.map(p => p.loadout.primary + '/' + p.loadout.secondary) };
    }, [teams, ps]);
    console.log(name, JSON.stringify(r));
  }
  // friendly fire check: teammates only, no enemies near -> nobody on team takes damage from teammate
  const ff = await p.evaluate(() => {
    const s = new RSGame.Sim([{ name: 'a', cpu: null, team: 0, loadout: { primary: 'shotgun' } }, { name: 'b', cpu: null, team: 0 }, { name: 'c', cpu: null, team: 1 }], { teams: true });
    s.state = 'fight';
    const f0 = s.fighters[0], f1 = s.fighters[1];
    // put teammate right in front and fire several times
    for (let k = 0; k < 120; k++) { if (k % 30 === 0) s.inputs[0].a++; s.inputs[0].am = 0; s.stepFixed(); }
    return { mate: f1.health, enemy: s.fighters[2].health };
  });
  console.log('friendly fire test (teammate health should be 100):', JSON.stringify(ff));
  console.log('errors', errs); await b.close();
})();

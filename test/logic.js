const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(500);
  for (const [d1, d2] of [['normal', 'normal'], ['hard', 'easy'], ['easy', 'hard'], ['hard', 'hard']]) {
    const r = await p.evaluate(([d1, d2]) => {
      const s = new RSGame.Sim([{ name: 'A', color: 0, cpu: d1 }, { name: 'B', color: 1, cpu: d2 }]);
      const log = []; let prev = s.state, t = 0, hits = 0, blocks = 0, clashes = 0, kos = 0;
      while (s.state !== 'over' && t < 600) { s.update(1 / 60); t += 1 / 60;
        for (const e of s.drainEvents()) { if (e[0] === 'hit') hits++; if (e[0] === 'block') blocks++; if (e[0] === 'clash') clashes++; if (e[0] === 'ko') kos++; }
        s.drainNetEvents();
        if (s.state !== prev) { if (s.state === 'ko') log.push(s.msg + ' w=' + s.winner + ' t=' + t.toFixed(0)); prev = s.state; }
        for (const f of s.fighters) { const q = f.b[0].getPosition(); if (!isFinite(q.x) || Math.abs(q.x) > 12) return 'BAD POS'; }
      }
      return { d1, d2, t: t.toFixed(0), scores: s.scores, hits, blocks, clashes, kos, log };
    }, [d1, d2]);
    console.log(JSON.stringify(r));
  }
  console.log('errors', errs); await b.close();
})();

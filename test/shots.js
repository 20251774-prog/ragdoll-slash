const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  await p.evaluate(() => { RS.startSolo('hard'); RS.sim.players[0].cpu = 'hard'; });
  let n = 0; const seen = {};
  for (let i = 0; i < 400 && n < 16; i++) {
    await p.waitForTimeout(50);
    const s = await p.evaluate(() => { const sn = RS.sim.snapshot(); return { st: sn.st, ts: sn.ts, strike: sn.f.some(f => f.fl & 4), hp: sn.f.map(f => f.h | 0) }; });
    const key = s.ts < 1 ? 'ko' : s.strike ? 'strike' : null;
    if (key && (seen[key] || 0) < 8 && i % 2 === 0) { seen[key] = (seen[key] || 0) + 1; await p.screenshot({ path: `/tmp/rs_${key}_${n}.png` }); n++; }
  }
  console.log(n, errs); await b.close();
})();

const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(1500);
  await p.screenshot({ path: '/tmp/v2_menu.png' });
  await p.evaluate(() => RS.show('custom')); await p.waitForTimeout(400);
  await p.screenshot({ path: '/tmp/v2_custom.png' });
  await p.evaluate(() => { RS.setLoadout({ primary: 'rifle', secondary: 'greatsword' }); RS.startSolo('normal', '2v2'); RS.sim.players[0].cpu = 'hard'; });
  await p.waitForTimeout(5000); await p.screenshot({ path: '/tmp/v2_g1.png' });
  await p.waitForTimeout(3000); await p.screenshot({ path: '/tmp/v2_g2.png' });
  console.log(errs); await b.close();
})();

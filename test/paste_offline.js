const { chromium } = require('playwright-core');
const URL = process.argv[2] || 'http://localhost:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(p, fn, ms, label) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await p.evaluate(fn).catch(() => null); if (v) return v; await sleep(150); } throw new Error('timeout: ' + label); }
(async () => {
  const b = await chromium.launch();
  // --- paste fallback, camera denied on both phones ---
  const mk = async () => { const c = await b.newContext({ viewport: { width: 800, height: 360 } });
    await c.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
    const p = await c.newPage(); await p.goto(URL); await sleep(500); return p; };
  const H = await mk(), J = await mk();
  await H.click('text=Host a game');
  const code = await waitFor(H, () => !document.getElementById('hostCopy').classList.contains('hidden') && RS.hostCode, 15000, 'host code');
  await J.click('text=Join a game');
  await waitFor(J, () => document.getElementById('joinErr').textContent, 5000, 'camera error shown');
  console.log('joiner camera error message:', await J.textContent('#joinErr'));
  await J.click('#joinPasteBtn'); await J.fill('#joinPaste', code); await J.click('#joinPasteGo');
  const ans = await waitFor(J, () => RS.joinCode, 15000, 'answer');
  await H.click('#hostPasteBtn'); await H.fill('#hostPaste', ans); await H.click('#hostPasteGo');
  await waitFor(H, () => RS.connected, 15000, 'host connected via paste');
  await waitFor(J, () => RS.connected, 15000, 'joiner connected via paste');
  const cands = await H.evaluate(() => RSNet.decode(RS.hostCode).sdp.match(/a=candidate.*/g));
  console.log('PASTE FALLBACK: connected (no camera; candidates:', cands, ')');
  await H.click('#hostStart'); await waitFor(J, () => RS.mode === 'client' && RS.snaps.length > 2, 8000, 'snaps');
  console.log('PASTE FALLBACK: game started, client receiving state');
  await H.context().close(); await J.context().close();
  // --- offline ---
  const c = await b.newContext({ viewport: { width: 800, height: 360 } }); const p = await c.newPage();
  await p.goto(URL); await p.evaluate(() => navigator.serviceWorker.ready); await sleep(1500);
  await p.reload(); await sleep(800);
  console.log('controlled by SW:', await p.evaluate(() => !!navigator.serviceWorker.controller));
  await c.setOffline(true);
  await p.reload(); await sleep(1500);
  const ok = await p.evaluate(() => typeof RS === 'object' && typeof planck === 'object' && typeof jsQR === 'function' && typeof qrcode === 'function' && typeof LZString === 'object');
  await p.evaluate(() => RS.startSolo('easy')); await sleep(2500);
  const st = await p.evaluate(() => RS.sim.state);
  console.log('OFFLINE reload: app + libs loaded =', ok, ', solo state =', st);
  const man = await p.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  const icon = await p.evaluate(async () => (await fetch('icons/icon-512.png')).ok);
  console.log('OFFLINE manifest:', man.name, man.display, man.orientation, 'icon ok', icon);
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });

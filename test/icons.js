const { chromium } = require('playwright-core'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const p = await b.newPage();
  const out = await p.evaluate(() => {
    function draw(S, mask) {
      const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
      const g = x.createRadialGradient(S / 2, S * 0.4, S * 0.05, S / 2, S / 2, S * 0.75); g.addColorStop(0, '#e0782a'); g.addColorStop(0.55, '#7a2418'); g.addColorStop(1, '#1b1420');
      x.fillStyle = g;
      if (mask) x.fillRect(0, 0, S, S); else { x.beginPath(); x.roundRect(0, 0, S, S, S * 0.2); x.fill(); }
      const k = mask ? 0.72 : 0.9; x.translate(S / 2, S / 2); x.scale(S * k / 100, S * k / 100);
      function sword(rot) {
        x.save(); x.rotate(rot);
        const bg = x.createLinearGradient(-4, 0, 4, 0); bg.addColorStop(0, '#5d6670'); bg.addColorStop(0.45, '#f4f8fc'); bg.addColorStop(0.55, '#ffffff'); bg.addColorStop(1, '#4c5560');
        x.fillStyle = bg; x.beginPath(); x.moveTo(-4, 22); x.lineTo(-3.5, -30); x.lineTo(0, -40); x.lineTo(3.5, -30); x.lineTo(4, 22); x.closePath(); x.fill();
        x.fillStyle = '#e8c060'; x.fillRect(-14, 22, 28, 5); x.fillStyle = '#3b2616'; x.fillRect(-3, 27, 6, 13); x.fillStyle = '#e8c060'; x.beginPath(); x.arc(0, 42, 4.5, 0, 7); x.fill();
        x.restore();
      }
      sword(-0.7); sword(0.7);
      return c.toDataURL('image/png');
    }
    return [draw(192), draw(512), draw(512, true)];
  });
  ['icon-192', 'icon-512', 'maskable-512'].forEach((n, i) => fs.writeFileSync('../icons/' + n + '.png', Buffer.from(out[i].split(',')[1], 'base64')));
  await b.close();
})();

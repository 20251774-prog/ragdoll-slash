/* Ragdoll Slash - app glue: menus, input, game loop, host/client sync */
(function () {
  'use strict';
  const R = window.RSRender, Net = window.RSNet, Sim = window.RSGame.Sim;
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  R.init(canvas);

  let mode = null, sim = null, meta = [], paused = false, last = performance.now(), sendAcc = 0, overShown = false;
  let hostPeers = {}, hostInputs = {}, slotOrder = [], nextSlot = 1, curPeer = null, scanner = null;
  let clientPeer = null, snaps = [], idleSnap = null;

  // ---------- screens ----------
  const SCREENS = ['menu', 'solo', 'host', 'join', 'help', 'controls', 'pause', 'over'];
  function show(name) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    $('touch').classList.toggle('hidden', name !== null);
    checkRotate();
  }
  function toast(t, ms) { const e = $('toast'); e.textContent = t; e.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.add('hidden'), ms || 3000); }
  function checkRotate() { $('rotate').classList.toggle('hidden', !(mode && innerHeight > innerWidth)); }
  addEventListener('resize', checkRotate);

  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    Sound.unlock();
    const g = b.dataset.go;
    if (g === 'menu') { leaveAll(); show('menu'); }
    else if (g === 'host') startHostLobby();
    else if (g === 'join') startJoin();
    else show(g);
  }));
  document.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => startSolo(b.dataset.diff)));

  function goFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { })).catch(() => { });
  }

  // ---------- input ----------
  const input = { l: 0, r: 0, b: 0, a: 0, j: 0, d: 0 };
  const held = { l: new Set(), r: new Set(), b: new Set() };
  function press(k, src) {
    if (k === 'a' || k === 'j' || k === 'd') input[k]++;
    else { held[k].add(src); input[k] = 1; }
  }
  function release(k, src) { if (held[k]) { held[k].delete(src); input[k] = held[k].size ? 1 : 0; } }
  const KEYS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'j', KeyW: 'j', Space: 'j', KeyJ: 'a', KeyZ: 'a', KeyK: 'b', KeyX: 'b', KeyL: 'd', ShiftLeft: 'd', ShiftRight: 'd', KeyC: 'd' };
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && mode === 'solo') { togglePause(); return; }
    const k = KEYS[e.code]; if (!k || !mode) return;
    e.preventDefault(); if (e.repeat) return; press(k, 'key' + e.code);
  });
  addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) release(k, 'key' + e.code); });
  document.querySelectorAll('#touch [data-k]').forEach((b) => {
    const k = b.dataset.k;
    const down = (e) => { e.preventDefault(); Sound.unlock(); b.classList.add('on'); press(k, 'p' + e.pointerId); };
    const up = (e) => { b.classList.remove('on'); release(k, 'p' + e.pointerId); };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  $('bPause').addEventListener('click', () => { if (mode === 'solo') togglePause(); else show('pause'); });
  function togglePause() { paused = !paused; show(paused ? 'pause' : null); last = performance.now(); }
  $('pResume').addEventListener('click', () => { paused = false; show(null); last = performance.now(); });
  $('pQuit').addEventListener('click', () => { leaveAll(); show('menu'); });
  $('oMenu').addEventListener('click', () => { leaveAll(); show('menu'); });
  $('oAgain').addEventListener('click', () => {
    overShown = false; R.reset();
    if (mode === 'solo') { sim.restartMatch(); show(null); }
    else if (mode === 'host') { sim.restartMatch(); broadcastStart(); show(null); }
  });

  // ---------- solo ----------
  function startSolo(diff) {
    leaveAll(); goFullscreen();
    meta = [{ name: 'You', color: 0 }, { name: 'Computer (' + diff + ')', color: 1 }];
    sim = new Sim([{ name: 'You', color: 0, cpu: null }, { name: 'Computer', color: 1, cpu: diff }]);
    mode = 'solo'; R.me = 0; R.reset(); paused = false; overShown = false; show(null);
  }

  // ---------- host ----------
  async function startHostLobby() {
    leaveAll(); show('host');
    mode = null; hostPeers = {}; hostInputs = {}; slotOrder = []; nextSlot = 1;
    $('hostErr').textContent = ''; $('hostPlayers').textContent = '';
    $('hostStep').textContent = 'Allow the camera if asked. It is used to scan your friend\'s code.';
    await Net.warmCamera();
    newHostOffer();
  }
  async function newHostOffer() {
    const slot = nextSlot;
    ['hostScan', 'hostCopy', 'hostPasteBtn', 'hostAdd', 'hostStart'].forEach((id) => $(id).classList.add('hidden'));
    $('hostPasteBox').classList.add('hidden');
    $('hostVideo').classList.add('hidden'); $('hostQR').classList.remove('hidden');
    $('hostStep').textContent = 'Making a code…';
    const p = new Net.Peer(); curPeer = p;
    try { p.code = await p.makeOffer(slot); } catch (e) { $('hostErr').textContent = 'Could not start: ' + e.message; return; }
    Net.drawQR($('hostQR'), p.code);
    $('hostStep').innerHTML = '<b>Player ' + (slot + 1) + ':</b> tap <b>Join a game</b> on your phone and scan this code. Then tap the button below to scan the code your phone shows.';
    ['hostScan', 'hostCopy', 'hostPasteBtn'].forEach((id) => $(id).classList.remove('hidden'));
    p.on('open', () => {
      hostPeers[slot] = p; slotOrder.push(slot); nextSlot++;
      p.send({ t: 'lobby', n: slotOrder.length + 1 }, true);
      for (const s of slotOrder) hostPeers[s].send({ t: 'lobby', n: slotOrder.length + 1 }, true);
      hostLobbyUpdate();
    });
    p.on('msg', (m) => { if (m.t === 'i') hostInputs[slot] = m; });
    p.on('close', () => onHostPeerLost(slot));
    p.on('fail', () => { if (curPeer === p) $('hostErr').textContent = 'Could not connect. Make sure both phones are on the same Wi-Fi, then tap Back and try again.'; });
  }
  function hostLobbyUpdate() {
    stopScanner();
    const n = slotOrder.length + 1;
    $('hostVideo').classList.add('hidden'); $('hostQR').classList.remove('hidden');
    const c = $('hostQR'); c.width = c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 300);
    x.fillStyle = '#2a8a3e'; x.font = 'bold 120px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('✓', 150, 150);
    $('hostStep').textContent = 'Connected! ' + n + ' players ready.';
    $('hostPlayers').textContent = 'Players: You' + slotOrder.map((s) => ', Player ' + (s + 1)).join('');
    ['hostScan', 'hostCopy', 'hostPasteBtn'].forEach((id) => $(id).classList.add('hidden'));
    $('hostPasteBox').classList.add('hidden');
    $('hostErr').textContent = '';
    $('hostStart').classList.remove('hidden');
    $('hostAdd').classList.toggle('hidden', n >= 4);
  }
  function onHostPeerLost(slot) {
    delete hostPeers[slot];
    const idx = slotOrder.indexOf(slot);
    if (mode === 'host' && sim) {
      const pi = idx + 1;
      if (sim.players[pi]) { sim.players[pi].cpu = 'normal'; toast(meta[pi].name + ' left. The computer took over.'); }
    } else if (idx >= 0) { slotOrder.splice(idx, 1); if ($('host').classList.contains('hidden') === false) { if (slotOrder.length) hostLobbyUpdate(); else newHostOffer(); } }
  }
  $('hostAdd').addEventListener('click', () => newHostOffer());
  $('hostScan').addEventListener('click', () => {
    $('hostErr').textContent = '';
    $('hostQR').classList.add('hidden'); $('hostVideo').classList.remove('hidden');
    $('hostStep').textContent = 'Point the camera at the code on your friend\'s phone.';
    startScanner($('hostVideo'), hostGotAnswer, () => { $('hostErr').textContent = 'Camera not available. Use "Paste friend\'s code" instead.'; $('hostVideo').classList.add('hidden'); $('hostQR').classList.remove('hidden'); });
  });
  async function hostGotAnswer(code) {
    stopScanner();
    $('hostVideo').classList.add('hidden'); $('hostQR').classList.remove('hidden');
    $('hostStep').textContent = 'Connecting…';
    try { await curPeer.acceptAnswer(code); } catch (e) { $('hostErr').textContent = e.message; $('hostStep').textContent = 'Try scanning again.'; return; }
    setTimeout(() => { if (curPeer && !curPeer.open) $('hostErr').textContent = 'Still connecting… check both phones are on the same Wi-Fi.'; }, 8000);
  }
  $('hostCopy').addEventListener('click', () => copyText(curPeer && curPeer.code));
  $('hostPasteBtn').addEventListener('click', () => $('hostPasteBox').classList.toggle('hidden'));
  $('hostPasteGo').addEventListener('click', () => hostGotAnswer($('hostPaste').value));
  $('hostStart').addEventListener('click', () => {
    goFullscreen();
    const players = [{ name: 'Player 1', color: 0, cpu: null }].concat(slotOrder.map((s, i) => ({ name: 'Player ' + (i + 2), color: (i + 1) % 4, cpu: null })));
    meta = players.map((p) => ({ name: p.name, color: p.color }));
    sim = new Sim(players);
    mode = 'host'; R.me = 0; R.reset(); overShown = false; paused = false;
    broadcastStart(); show(null);
  });
  function broadcastStart() {
    slotOrder.forEach((s, i) => { const p = hostPeers[s]; if (p) p.send({ t: 'start', players: meta, you: i + 1 }, true); });
  }

  // ---------- join ----------
  async function startJoin() {
    leaveAll(); show('join');
    $('joinErr').textContent = ''; $('joinQR').classList.add('hidden'); $('joinVideo').classList.remove('hidden');
    $('joinCopy').classList.add('hidden'); $('joinPasteBtn').classList.remove('hidden'); $('joinPasteBox').classList.add('hidden');
    $('joinStep').textContent = 'Point your camera at the code on the host phone.';
    startScanner($('joinVideo'), joinGotOffer, () => { $('joinErr').textContent = 'Camera not available. Tap "Paste host\'s code instead".'; });
  }
  async function joinGotOffer(code) {
    stopScanner();
    $('joinErr').textContent = ''; $('joinStep').textContent = 'Making your code…';
    if (clientPeer) clientPeer.close();
    const p = new Net.Peer(); clientPeer = p;
    try { p.code = await p.acceptOffer(code); } catch (e) { $('joinErr').textContent = e.message; startJoin(); return; }
    $('joinVideo').classList.add('hidden'); $('joinQR').classList.remove('hidden');
    Net.drawQR($('joinQR'), p.code);
    $('joinStep').innerHTML = 'Now show this code to the host. The host taps <b>Scan friend\'s code</b>.';
    $('joinCopy').classList.remove('hidden'); $('joinPasteBtn').classList.add('hidden'); $('joinPasteBox').classList.add('hidden');
    p.on('open', () => { $('joinStep').textContent = 'Connected! Waiting for the host to start the fight…'; $('joinCopy').classList.add('hidden');
      const c = $('joinQR'), x = c.getContext('2d'); c.width = c.height = 300; x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 300); x.fillStyle = '#2a8a3e'; x.font = 'bold 120px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('✓', 150, 150); });
    p.on('msg', onClientMsg);
    p.on('close', () => { if (clientPeer === p) { leaveAll(); show('menu'); toast('Lost connection to the host.', 5000); } });
    p.on('fail', () => { $('joinErr').textContent = 'Could not connect. Check you are on the host\'s Wi-Fi hotspot.'; });
  }
  function onClientMsg(m) {
    if (m.t === 'lobby') { if (mode !== 'client') $('joinStep').textContent = 'Connected! ' + m.n + ' players so far. Waiting for the host to start…'; }
    else if (m.t === 'start') {
      meta = m.players; R.me = m.you; R.reset(); snaps = []; overShown = false;
      mode = 'client'; show(null);
    } else if (m.t === 's' && mode === 'client') {
      const snap = decodeSnap(m); snap.rt = performance.now();
      snaps.push(snap); if (snaps.length > 3) snaps.shift();
      if (m.ev && m.ev.length) R.addEvents(m.ev);
    }
  }
  $('joinCopy').addEventListener('click', () => copyText(clientPeer && clientPeer.code));
  $('joinPasteBtn').addEventListener('click', () => $('joinPasteBox').classList.toggle('hidden'));
  $('joinPasteGo').addEventListener('click', () => joinGotOffer($('joinPaste').value));

  // ---------- helpers ----------
  function startScanner(video, cb, err) { stopScanner(); scanner = new Net.Scanner(video, cb, err); scanner.start(); }
  function stopScanner() { if (scanner) { scanner.stop(); scanner = null; } }
  function copyText(t) {
    if (!t) return;
    const done = () => toast('Code copied. Send it to your friend.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { prompt('Copy this code:', t); } ta.remove(); }
  }
  function leaveAll() {
    stopScanner();
    for (const s in hostPeers) hostPeers[s].close();
    if (curPeer) curPeer.close();
    hostPeers = {}; curPeer = null; slotOrder = [];
    if (clientPeer) { const p = clientPeer; clientPeer = null; p.close(); }
    mode = null; sim = null; paused = false; snaps = [];
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => { });
    checkRotate();
  }

  // snapshot packing for the network
  function encodeSnap(s, ev) {
    return { t: 's', f: s.f.map((f) => ({ p: f.p.map((v) => Math.round(v * 1000)), h: Math.round(f.h * 10) / 10, fa: f.fa, fl: f.fl })),
      sc: s.sc, st: s.st, tm: s.tm, rd: s.rd, msg: s.msg, ts: s.ts, champ: s.champ, ev };
  }
  function decodeSnap(m) { return { f: m.f.map((f) => ({ p: f.p.map((v) => v / 1000), h: f.h, fa: f.fa, fl: f.fl })), sc: m.sc, st: m.st, tm: m.tm, rd: m.rd, msg: m.msg, ts: m.ts, champ: m.champ }; }
  function lerpSnap(a, b, t) {
    if (!a || a.f.length !== b.f.length) return b;
    const out = Object.assign({}, b);
    out.f = b.f.map((fb, i) => {
      const fa = a.f[i], p = new Array(fb.p.length);
      for (let k = 0; k < p.length; k++) {
        if (k % 3 === 2) { let d = fb.p[k] - fa.p[k]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; p[k] = fa.p[k] + d * t; }
        else p[k] = fa.p[k] + (fb.p[k] - fa.p[k]) * t;
      }
      return { p, h: fb.h, fa: fb.fa, fl: fb.fl };
    });
    return out;
  }

  // menu background: a slow demo fight between two computer knights
  function makeIdle() { idleSnap = new Sim([{ name: 'A', color: 0, cpu: 'hard' }, { name: 'B', color: 1, cpu: 'hard' }]); }
  makeIdle();

  // ---------- loop ----------
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let snap = null;
    if ((mode === 'solo' || mode === 'host') && sim) {
      if (!paused) {
        sim.inputs[0] = { l: input.l, r: input.r, b: input.b, a: input.a, j: input.j, d: input.d };
        if (mode === 'host') slotOrder.forEach((s, i) => { const m = hostInputs[s]; if (m && !sim.players[i + 1].cpu) sim.inputs[i + 1] = m; });
        sim.update(dt);
      }
      snap = sim.snapshot();
      R.addEvents(sim.drainEvents());
      if (mode === 'host') {
        sendAcc += dt;
        if (sendAcc >= 1 / 30) {
          sendAcc = 0;
          const pkt = encodeSnap(snap, sim.drainNetEvents());
          for (const s of slotOrder) if (hostPeers[s]) hostPeers[s].send(pkt);
        }
      } else sim.drainNetEvents();
      R.draw(snap, meta, paused ? 0 : dt);
    } else if (mode === 'client') {
      if (clientPeer) clientPeer.send({ t: 'i', l: input.l, r: input.r, b: input.b, a: input.a, j: input.j, d: input.d });
      if (snaps.length) {
        const b = snaps[snaps.length - 1], a = snaps[snaps.length - 2];
        const iv = a ? Math.max(16, b.rt - a.rt) : 33;
        snap = lerpSnap(a, b, Math.min(1, (now - b.rt) / iv));
        R.draw(snap, meta, dt);
      }
    } else {
      idleSnap.update(dt * 0.6); idleSnap.drainNetEvents(); idleSnap.drainEvents();
      if (idleSnap.state === 'over' || idleSnap.round > 3) makeIdle();
      const s = idleSnap.snapshot(); s.msg = ''; R.me = -1;
      R.draw(s, [{ name: 'Red', color: 0 }, { name: 'Blue', color: 1 }], dt);
    }
    if (snap && snap.st === 'over' && !overShown && mode) {
      overShown = true;
      setTimeout(() => {
        if (!mode) return;
        $('overTitle').textContent = snap.champ >= 0 ? (snap.champ === R.me ? 'You win the match!' : meta[snap.champ].name + ' wins the match!') : 'Match over';
        $('oAgain').classList.toggle('hidden', mode === 'client'); $('oWait').classList.toggle('hidden', mode !== 'client');
        show('over');
      }, 1500);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- offline ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }

  // test hooks
  window.RS = {
    get mode() { return mode; }, get sim() { return sim; }, get meta() { return meta; }, get snaps() { return snaps; },
    get hostCode() { return curPeer && curPeer.code; }, get joinCode() { return clientPeer && clientPeer.code; },
    get connected() { return clientPeer ? !!clientPeer.open : slotOrder.length; },
    input, startSolo, hostGotAnswer: (c) => hostGotAnswer(c), joinGotOffer: (c) => joinGotOffer(c)
  };
})();

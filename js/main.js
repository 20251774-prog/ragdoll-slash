/* Ragdoll Slash v3 - app glue: menus, customise, input (incl. aim/fire), game loop, host/client sync */
(function () {
  'use strict';
  const R = window.RSRender, Net = window.RSNet, G = window.RSGame, Sim = G.Sim;
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  R.init(canvas);

  let mode = null, sim = null, meta = [], paused = false, last = performance.now(), sendAcc = 0, overShown = false;
  let hostPeers = {}, hostInputs = {}, hostLoadouts = {}, slotOrder = [], nextSlot = 1, curPeer = null, scanner = null;
  let clientPeer = null, snaps = [], idle = null, lastSnap = null;
  let soloMode = '1v1', hostMode = 'teams', reloading = false, fatShown = false;
  R.touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

  // ---------- loadout ----------
  function loadLoadout() { try { return G.sanitizeLoadout(JSON.parse(localStorage.getItem('rs-loadout') || 'null')); } catch (e) { return G.sanitizeLoadout(null); } }
  let loadout = loadLoadout();
  function saveLoadout() { try { localStorage.setItem('rs-loadout', JSON.stringify(loadout)); } catch (e) { } }
  const myName = (fallback) => loadout.name && loadout.name.trim() ? loadout.name.trim() : fallback;

  function buildCustom() {
    const box = $('customOpts'); box.innerHTML = '';
    const row = (title, html) => { const d = document.createElement('div'); d.className = 'opt'; d.innerHTML = '<b>' + title + '</b>' + html; box.appendChild(d); return d; };
    const nm = row('Name', '<input type="text" id="loName" maxlength="12" placeholder="Your name">');
    nm.querySelector('input').value = loadout.name || '';
    nm.querySelector('input').addEventListener('input', (e) => { loadout.name = e.target.value.slice(0, 12); saveLoadout(); });
    const chips = (key, items) => {
      const d = row(key === 'helmet' ? 'Helmet' : key === 'chest' ? 'Chest' : key === 'arms' ? 'Arms' : 'Legs',
        '<div class="chips">' + items.map((t, i) => '<button class="chip" data-v="' + i + '">' + t + '</button>').join('') + '</div>');
      d.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { loadout[key] = +b.dataset.v; saveLoadout(); refreshCustom(); }));
      d.dataset.key = key;
    };
    for (const k of ['helmet', 'chest', 'arms', 'legs']) chips(k, G.ARMOUR.map((a) => a.name));
    const sw = (key, title) => {
      const d = row(title, '<div class="chips">' + R.COLORS.map((c, i) => '<button class="sw" data-v="' + i + '" title="' + c.name + '" style="background:' + c.c + '"></button>').join('') + '</div>');
      d.querySelectorAll('.sw').forEach((b) => b.addEventListener('click', () => { loadout[key] = +b.dataset.v; saveLoadout(); refreshCustom(); }));
      d.dataset.key = key;
    };
    sw('color', 'Main colour'); sw('trim', 'Trim and plume colour');
    const wp = (key, title) => {
      const d = row(title, '<div class="chips">' + G.WLIST.map((k) => '<button class="chip" data-v="' + k + '">' + G.WEAPONS[k].name + '</button>').join('') + '</div>');
      d.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { loadout[key] = b.dataset.v; saveLoadout(); refreshCustom(); }));
      d.dataset.key = key;
    };
    wp('primary', 'First weapon (you start with this)'); wp('secondary', 'Second weapon (tap Swap)');
    const sd = row('Shield (one-handed weapons only)', '<div class="chips">' + G.SHIELDS.map((s, i) => '<button class="chip" data-v="' + i + '">' + s.name + '</button>').join('') + '</div><div class="shnote" id="shNote"></div>');
    sd.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { loadout.shield = +b.dataset.v; saveLoadout(); refreshCustom(); }));
    sd.dataset.key = 'shield';
    refreshCustom();
  }
  function refreshCustom() {
    document.querySelectorAll('#customOpts .opt').forEach((d) => {
      const k = d.dataset.key; if (!k) return;
      d.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', String(loadout[k]) === b.dataset.v));
    });
    R.drawPreview($('prevCv'), loadout);
    const sn = $('shNote');
    if (sn) { const one = !!G.WEAPONS[loadout.primary].one, S = G.SHIELDS[loadout.shield | 0];
      sn.textContent = !(loadout.shield | 0) ? 'No shield.' : !one ? G.WEAPONS[loadout.primary].name + ' needs both hands: the shield stays on your back until you swap to a one-handed weapon.' : S.name + ' shield: ' + S.hp + ' health, ' + Math.round(S.cover * 100) + '% of frontal blows caught when raised.'; }
    const st = G.loadoutStats(loadout);
    $('stSpeed').style.width = Math.round(st.speed * 100) + '%';
    $('stProt').style.width = Math.round(st.prot / 0.65 * 100) + '%';
  }

  // ---------- screens ----------
  const SCREENS = ['menu', 'solo', 'custom', 'host', 'join', 'help', 'controls', 'pause', 'over'];
  function show(name) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    $('touch').classList.toggle('hidden', name !== null);
    if (name === 'custom') buildCustom();
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
  document.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => startSolo(b.dataset.diff, soloMode)));
  const HINTS = { '1v1': 'You against one computer knight.', '2v2': 'You and a computer friend (Red team) against two computer knights (Blue team).', ffa: 'Four knights, every one for themselves.' };
  document.querySelectorAll('#soloMode [data-mode]').forEach((b) => b.addEventListener('click', () => {
    soloMode = b.dataset.mode; document.querySelectorAll('#soloMode .btn').forEach((x) => x.classList.toggle('on', x === b)); $('soloModeHint').textContent = HINTS[soloMode];
  }));
  document.querySelectorAll('#hostMode [data-mode]').forEach((b) => b.addEventListener('click', () => {
    hostMode = b.dataset.mode; document.querySelectorAll('#hostMode .btn').forEach((x) => x.classList.toggle('on', x === b));
  }));

  function goFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { })).catch(() => { });
  }

  // ---------- input ----------
  const input = { l: 0, r: 0, b: 0, a: 0, j: 0, d: 0, h: 0, am: null, w: 0, rl: 0, k: 0, fx: 0 };
  const held = { l: new Set(), r: new Set(), b: new Set() };
  function myWeapon() { const f = lastSnap && lastSnap.f[R.me]; return f ? G.WEAPONS[G.WLIST[f.wp | 0]] : G.WEAPONS[loadout.primary]; }
  function attackDown() { const W = myWeapon(); input.h = 1; if (W.kind === 'melee') input.a++; }
  function attackUp() { const W = myWeapon(); if (input.h && W.kind === 'gun' && !W.auto) input.a++; input.h = 0; }
  function press(k, src) {
    if (k === 'a') attackDown();
    else if (k === 'j' || k === 'd' || k === 'w' || k === 'rl' || k === 'k' || k === 'fx') input[k]++;
    else { held[k].add(src); input[k] = 1; }
  }
  function release(k, src) { if (k === 'a') attackUp(); else if (held[k]) { held[k].delete(src); input[k] = held[k].size ? 1 : 0; } }
  const KEYS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'j', KeyW: 'j', Space: 'j', KeyJ: 'a', KeyZ: 'a', KeyK: 'b', KeyX: 'b', KeyL: 'd', ShiftLeft: 'd', ShiftRight: 'd', KeyC: 'd', KeyQ: 'w', KeyR: 'rl', KeyF: 'k', KeyV: 'k', KeyE: 'fx' };
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && mode === 'solo') { togglePause(); return; }
    const k = KEYS[e.code]; if (!k || !mode) return;
    e.preventDefault(); if (e.repeat) return; press(k, 'key' + e.code);
  });
  addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) release(k, 'key' + e.code); });
  document.querySelectorAll('#touch [data-k]').forEach((b) => {
    const k = b.dataset.k;
    if (k === 'a') return;
    const down = (e) => { e.preventDefault(); Sound.unlock(); b.classList.add('on'); press(k, 'p' + e.pointerId); };
    const up = (e) => { b.classList.remove('on'); release(k, 'p' + e.pointerId); };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  // attack / fire button doubles as an aim joystick for guns and the bow
  const atk = $('atkBtn'); let atkPid = null, atkStart = null, clearAim = null;
  atk.addEventListener('contextmenu', (e) => e.preventDefault());
  atk.addEventListener('pointerdown', (e) => {
    e.preventDefault(); Sound.unlock(); if (atkPid !== null) return;
    atkPid = e.pointerId; atkStart = { x: e.clientX, y: e.clientY }; try { atk.setPointerCapture(e.pointerId); } catch (err) { } atk.classList.add('on');
    clearTimeout(clearAim); input.am = null; R.aim.on = false; attackDown();
  });
  atk.addEventListener('pointermove', (e) => {
    if (e.pointerId !== atkPid || myWeapon().kind === 'melee') return;
    const dx = e.clientX - atkStart.x, dy = e.clientY - atkStart.y;
    if (Math.hypot(dx, dy) > 14) { input.am = Math.atan2(-dy, dx); R.aim.on = true; R.aim.a = input.am; }
  });
  const atkEnd = (e) => {
    if (e.pointerId !== atkPid) return;
    atkPid = null; atk.classList.remove('on'); attackUp();
    clearAim = setTimeout(() => { if (atkPid === null) { input.am = null; R.aim.on = false; } }, 250);
  };
  atk.addEventListener('pointerup', atkEnd); atk.addEventListener('pointercancel', atkEnd);
  // desktop: mouse aims, click fires
  let mouseAimT = 0;
  canvas.addEventListener('mousemove', (e) => {
    if (!mode || !lastSnap) return; const f = lastSnap.f[R.me]; if (!f) return;
    const sp = R.w2s(f.p[24], f.p[25]); input.am = Math.atan2(-(e.clientY - sp.y), e.clientX - sp.x); mouseAimT = performance.now();
    R.aim.on = myWeapon().kind !== 'melee'; R.aim.a = input.am;
  });
  canvas.addEventListener('mousedown', (e) => { if (mode && e.button === 0) attackDown(); });
  addEventListener('mouseup', (e) => { if (mode && e.button === 0) attackUp(); });
  function updateAtkLabel() {
    const W = myWeapon(), t = W.kind === 'melee' ? 'Slash' : W.kind === 'bow' ? 'Shoot' : 'Fire';
    if (atk.textContent !== t) atk.textContent = t;
    if (atkPid === null && mouseAimT && performance.now() - mouseAimT > 2500) { mouseAimT = 0; input.am = null; R.aim.on = false; }
  }

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

  // ---------- building a match ----------
  function cpuPlayer(name, team, diff) { const lo = G.randomLoadout(); lo.name = name; return { name, cpu: diff, team, loadout: lo }; }
  function metaFrom(players, teams) {
    return players.map((p) => ({ name: p.name, color: p.loadout.color, trim: p.loadout.trim, team: p.team | 0, teams: !!teams,
      arm: [p.loadout.helmet, p.loadout.chest, p.loadout.arms, p.loadout.legs] }));
  }
  function startSolo(diff, sm) {
    leaveAll(); goFullscreen();
    sm = sm || '1v1';
    const me = { name: 'You', cpu: null, team: 0, loadout: Object.assign({}, loadout, { name: 'You' }) };
    let players, teams = false;
    if (sm === '2v2') { teams = true; players = [me, cpuPlayer('Blue 1', 1, diff), cpuPlayer('Ally', 0, diff), cpuPlayer('Blue 2', 1, diff)]; }
    else if (sm === 'ffa') players = [me, cpuPlayer('Knight 2', 1, diff), cpuPlayer('Knight 3', 2, diff), cpuPlayer('Knight 4', 3, diff)];
    else players = [me, cpuPlayer('Computer', 1, diff)];
    if (!teams) players.forEach((p, i) => { if (i > 0 && p.loadout.color === loadout.color) p.loadout.color = (loadout.color + i) % 8; });
    sim = new Sim(players, { teams });
    meta = metaFrom(players, teams);
    mode = 'solo'; R.me = 0; R.reset(); paused = false; overShown = false; resetInput(); show(null);
  }
  function resetInput() { Object.assign(input, { l: 0, r: 0, b: 0, h: 0, am: null, a: 0, j: 0, d: 0, w: 0, rl: 0, k: 0, fx: 0 }); held.l.clear(); held.r.clear(); held.b.clear(); R.aim.on = false; }

  // ---------- host ----------
  async function startHostLobby() {
    leaveAll(); show('host');
    mode = null; hostPeers = {}; hostInputs = {}; hostLoadouts = {}; slotOrder = []; nextSlot = 1;
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
    if (slotOrder.length) $('hostStart').classList.remove('hidden');
    p.on('open', () => {
      hostPeers[slot] = p; slotOrder.push(slot); nextSlot++;
      for (const s of slotOrder) hostPeers[s].send({ t: 'lobby', n: slotOrder.length + 1 }, true);
      hostLobbyUpdate();
    });
    p.on('msg', (m) => { if (m.t === 'i') hostInputs[slot] = m; else if (m.t === 'hello') { hostLoadouts[slot] = G.sanitizeLoadout(m.lo); if (!mode) hostLobbyUpdate(); } });
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
    $('hostPlayers').textContent = 'Players: ' + myName('You') + slotOrder.map((s) => ', ' + ((hostLoadouts[s] && hostLoadouts[s].name) || 'Player ' + (s + 1))).join('');
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
      const pi = sim.players.findIndex((p) => p.slot === slot);
      if (pi >= 0) { sim.players[pi].cpu = 'normal'; toast(meta[pi].name + ' left. The computer took over.'); }
    } else if (idx >= 0) { slotOrder.splice(idx, 1); if (!$('host').classList.contains('hidden')) { if (slotOrder.length) hostLobbyUpdate(); else newHostOffer(); } }
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
    if (!slotOrder.length) return;
    goFullscreen();
    const teams = hostMode === 'teams', fill = $('hostFill').checked;
    const players = [{ name: myName('Player 1'), cpu: null, team: 0, slot: 0, loadout: Object.assign({}, loadout) }];
    slotOrder.forEach((s, i) => {
      const lo = hostLoadouts[s] || G.randomLoadout();
      players.push({ name: (lo.name && lo.name.trim()) || 'Player ' + (i + 2), cpu: null, team: (i + 1) % 2, slot: s, loadout: lo });
    });
    if (fill) { let k = 1; while (players.length < 4) { const t = players.length % 2; players.push(Object.assign(cpuPlayer('Computer ' + k++, t, 'normal'), { slot: -1 })); } }
    if (!teams) { const used = new Set(); players.forEach((p) => { while (used.has(p.loadout.color)) p.loadout.color = (p.loadout.color + 1) % 8; used.add(p.loadout.color); }); }
    sim = new Sim(players, { teams });
    meta = metaFrom(players, teams);
    mode = 'host'; R.me = 0; R.reset(); overShown = false; paused = false; resetInput();
    broadcastStart(); show(null);
  });
  function broadcastStart() {
    sim.players.forEach((p, i) => { if (p.slot > 0 && hostPeers[p.slot]) hostPeers[p.slot].send({ t: 'start', players: meta, you: i }, true); });
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
    p.on('open', () => {
      p.send({ t: 'hello', lo: loadout }, true);
      $('joinStep').textContent = 'Connected! Waiting for the host to start the fight…'; $('joinCopy').classList.add('hidden');
      const c = $('joinQR'), x = c.getContext('2d'); c.width = c.height = 300; x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 300); x.fillStyle = '#2a8a3e'; x.font = 'bold 120px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('✓', 150, 150);
    });
    p.on('msg', onClientMsg);
    p.on('close', () => { if (clientPeer === p) { leaveAll(); show('menu'); toast('Lost connection to the host.', 5000); } });
    p.on('fail', () => { $('joinErr').textContent = 'Could not connect. Check you are on the host\'s Wi-Fi hotspot.'; });
  }
  function onClientMsg(m) {
    if (m.t === 'lobby') { if (mode !== 'client') $('joinStep').textContent = 'Connected! ' + m.n + ' players so far. Waiting for the host to start…'; }
    else if (m.t === 'start') {
      meta = m.players; R.me = m.you; R.reset(); snaps = []; overShown = false; resetInput();
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
    mode = null; sim = null; paused = false; snaps = []; lastSnap = null;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => { });
    checkRotate();
  }

  const q3 = (v) => Math.round(v * 1000);
  function encodeSnap(s, ev) {
    return { t: 's', f: s.f.map((f) => ({ p: f.p.map(q3), h: Math.round(f.h * 10) / 10, fa: f.fa, fl: f.fl, ar: f.ar, wp: f.wp, am: f.am, rl: f.rl, dr: f.dr, sd: f.sd, sh: f.sh, hu: f.hu })),
      pr: s.pr.map((q) => [q3(q[0]), q3(q[1]), q3(q[2]), q[3]]), db: s.db.map((d) => [q3(d[0]), q3(d[1]), q3(d[2]), d[3], d[4], d[5], Math.round(d[6] * 100) / 100]),
      sc: s.sc, st: s.st, tm: s.tm, rd: s.rd, msg: s.msg, ts: s.ts, champ: s.champ, kf: s.kf, tmode: s.tmode, fin: s.fin, ban: s.ban, ev };
  }
  function decodeSnap(m) {
    return { f: m.f.map((f) => Object.assign({}, f, { p: f.p.map((v) => v / 1000) })),
      pr: (m.pr || []).map((q) => [q[0] / 1000, q[1] / 1000, q[2] / 1000, q[3]]), db: (m.db || []).map((d) => [d[0] / 1000, d[1] / 1000, d[2] / 1000, d[3], d[4], d[5], d[6]]),
      sc: m.sc, st: m.st, tm: m.tm, rd: m.rd, msg: m.msg, ts: m.ts, champ: m.champ, kf: m.kf, tmode: m.tmode, fin: m.fin || null, ban: m.ban || 0 };
  }
  function lerpSnap(a, b, t) {
    if (!a || a.f.length !== b.f.length) return b;
    const out = Object.assign({}, b);
    out.f = b.f.map((fb, i) => {
      const fa = a.f[i], p = new Array(fb.p.length);
      for (let k = 0; k < p.length; k++) {
        if (k % 3 === 2) { let d = fb.p[k] - fa.p[k]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; p[k] = fa.p[k] + d * t; }
        else p[k] = fa.p[k] + (fb.p[k] - fa.p[k]) * t;
      }
      return Object.assign({}, fb, { p });
    });
    return out;
  }

  // menu background: a demo 2 vs 2 between computer knights
  function makeIdle() {
    const ps = [cpuPlayer('Red', 0, 'hard'), cpuPlayer('Blue', 1, 'hard'), cpuPlayer('Red', 0, 'normal'), cpuPlayer('Blue', 1, 'normal')];
    idle = { sim: new Sim(ps, { teams: true }), meta: metaFrom(ps, true) };
  }
  makeIdle();

  // ---------- loop ----------
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let snap = null;
    if ((mode === 'solo' || mode === 'host') && sim) {
      if (!paused) {
        sim.inputs[0] = Object.assign({}, input);
        if (mode === 'host') sim.players.forEach((p, i) => { if (p.slot > 0 && !p.cpu) { const m = hostInputs[p.slot]; if (m) sim.inputs[i] = m; } });
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
      if (clientPeer) clientPeer.send(Object.assign({ t: 'i' }, input));
      if (snaps.length) {
        const b = snaps[snaps.length - 1], a = snaps[snaps.length - 2];
        const iv = a ? Math.max(16, b.rt - a.rt) : 33;
        snap = lerpSnap(a, b, Math.min(1, (now - b.rt) / iv));
        R.draw(snap, meta, dt);
      }
    } else {
      idle.sim.update(dt * 0.6); idle.sim.drainNetEvents(); idle.sim.drainEvents();
      if (idle.sim.state === 'over' || idle.sim.round > 3) makeIdle();
      const s = idle.sim.snapshot(); s.msg = ''; R.me = -1;
      R.draw(s, idle.meta, dt);
    }
    if (snap) { lastSnap = snap; if (mode) updateAtkLabel(); }
    { const me = snap && mode && snap.f[R.me], fin = snap && snap.fin;
      const showFat = !!(me && fin && snap.st === 'finish' && !fin[3] && (me.fl & 1) && (me.sd | 0) === fin[1]);
      if (showFat !== fatShown) { fatShown = showFat; $('fatBtn').classList.toggle('hidden', !showFat); } }
    if (snap && snap.st === 'over' && !overShown && mode) {
      overShown = true;
      setTimeout(() => {
        if (!mode) return;
        const me = snap.f[R.me], mySide = me ? me.sd : -1;
        let title = 'Match over';
        if (snap.champ >= 0) title = snap.champ === mySide ? (snap.tmode ? 'Your team wins the match!' : 'You win the match!') : (snap.tmode ? (snap.champ === 0 ? 'Red' : 'Blue') + ' team wins the match!' : meta[snap.champ].name + ' wins the match!');
        $('overTitle').textContent = title;
        $('oAgain').classList.toggle('hidden', mode === 'client'); $('oWait').classList.toggle('hidden', mode !== 'client');
        show('over');
      }, 1500);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- offline ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = !!navigator.serviceWorker.controller;
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
    // a new version took over: reload once so the new files are used (not in the middle of a fight)
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !mode && !reloading) { reloading = true; location.reload(); } });
  }

  // test hooks
  window.RS = {
    get mode() { return mode; }, get sim() { return sim; }, get meta() { return meta; }, get snaps() { return snaps; }, get lastSnap() { return lastSnap; },
    get hostCode() { return curPeer && curPeer.code; }, get joinCode() { return clientPeer && clientPeer.code; },
    get connected() { return clientPeer ? !!clientPeer.open : slotOrder.length; },
    get loadout() { return loadout; }, setLoadout(lo) { loadout = G.sanitizeLoadout(lo); saveLoadout(); },
    input, startSolo, show, attackDown, attackUp, hostGotAnswer: (c) => hostGotAnswer(c), joinGotOffer: (c) => joinGotOffer(c)
  };
})();

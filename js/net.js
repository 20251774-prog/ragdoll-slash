/* Ragdoll Slash - serverless WebRTC with manual QR / text signalling. No internet needed. */
(function () {
  'use strict';
  const RTC_CFG = { iceServers: [] };
  const Net = { RTC_CFG };

  function waitIce(pc, ms) {
    return new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, ms || 4000);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }
  function channels(pc) {
    return {
      ctl: pc.createDataChannel('ctl', { negotiated: true, id: 0, ordered: true }),
      st: pc.createDataChannel('st', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 })
    };
  }

  // ---- SDP squeeze: keep only what a data channel needs ----
  Net.encode = function (sdp, kind, slot) {
    const g = (re) => (sdp.match(re) || [])[1];
    const ufrag = g(/a=ice-ufrag:(\S+)/), pwd = g(/a=ice-pwd:(\S+)/), fp = g(/a=fingerprint:sha-256 (\S+)/), setup = g(/a=setup:(\S+)/) || 'actpass';
    const cands = []; const re = /a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ host/g; let m;
    while ((m = re.exec(sdp))) { const c = m[1] + ' ' + m[2]; if (!cands.includes(c)) cands.push(c); }
    // prefer real IPv4 addresses, then mDNS names, then IPv6
    const rank = (c) => (/^\d+\.\d+\.\d+\.\d+ /.test(c) ? 0 : /\.local /.test(c) ? 1 : 2);
    cands.sort((a, b) => rank(a) - rank(b));
    const fpB = btoa(String.fromCharCode.apply(null, fp.split(':').map((h) => parseInt(h, 16))));
    const raw = [kind, slot, ufrag, pwd, fpB, setup === 'actpass' ? 'x' : setup[0], cands.slice(0, 5).map((c) => c.replace(' ', '/')).join(',')].join('~');
    const z = LZString.compressToEncodedURIComponent(raw);
    return z.length < raw.length ? 'Z' + z : 'R' + raw;
  };
  Net.decode = function (code) {
    code = (code || '').trim().replace(/\s+/g, '');
    let raw = code[0] === 'Z' ? LZString.decompressFromEncodedURIComponent(code.slice(1)) : code[0] === 'R' ? code.slice(1) : null;
    if (!raw) throw new Error('That code did not work. Try again.');
    const [kind, slot, ufrag, pwd, fpB, su, cs] = raw.split('~');
    if (!ufrag || !pwd || !fpB) throw new Error('That code did not work. Try again.');
    const fp = Array.from(atob(fpB)).map((ch) => ('0' + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-2)).join(':');
    const setup = su === 'x' ? 'actpass' : su === 'a' ? 'active' : 'passive';
    const cands = (cs || '').split(',').filter(Boolean).map((c, i) => {
      const k = c.lastIndexOf('/'); const ip = c.slice(0, k), port = c.slice(k + 1);
      return 'a=candidate:' + (i + 1) + ' 1 udp ' + (2122260223 - i * 10) + ' ' + ip + ' ' + port + ' typ host generation 0';
    });
    const sdp = ['v=0', 'o=- ' + (Math.floor(Math.random() * 1e15) + 1e15) + ' 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0',
      'a=msid-semantic: WMS', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0'].concat(cands, [
      'a=end-of-candidates', 'a=ice-ufrag:' + ufrag, 'a=ice-pwd:' + pwd, 'a=ice-options:trickle', 'a=fingerprint:sha-256 ' + fp,
      'a=setup:' + setup, 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144']).join('\r\n') + '\r\n';
    return { kind, slot: parseInt(slot, 10), sdp };
  };

  function Peer() { this.handlers = {}; this.open = false; this.pc = new RTCPeerConnection(RTC_CFG); const c = channels(this.pc); this.ctl = c.ctl; this.st = c.st; this.wire(); }
  Peer.prototype.on = function (ev, fn) { this.handlers[ev] = fn; return this; };
  Peer.prototype.emit = function (ev, a) { if (this.handlers[ev]) this.handlers[ev](a); };
  Peer.prototype.wire = function () {
    let opened = 0;
    const onOpen = () => { if (++opened === 2) { this.open = true; this.emit('open'); } };
    this.ctl.onopen = onOpen; this.st.onopen = onOpen;
    const onMsg = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } this.emit('msg', m); };
    this.ctl.onmessage = onMsg; this.st.onmessage = onMsg;
    this.ctl.onclose = () => { if (this.open) { this.open = false; this.emit('close'); } };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if ((s === 'failed' || s === 'closed' || s === 'disconnected') && this.open) {
        if (s === 'disconnected') { clearTimeout(this._dt); this._dt = setTimeout(() => { if (this.pc.connectionState !== 'connected' && this.open) { this.open = false; this.emit('close'); } }, 4000); }
        else { this.open = false; this.emit('close'); }
      }
      if (s === 'failed' && !this.open) this.emit('fail');
    };
  };
  Peer.prototype.send = function (m, reliable) {
    const ch = reliable ? this.ctl : this.st;
    if (ch.readyState === 'open') { try { ch.send(JSON.stringify(m)); } catch (e) { } }
  };
  Peer.prototype.close = function () { try { this.pc.close(); } catch (e) { } this.open = false; };

  // host side: one Peer per friend
  Peer.prototype.makeOffer = async function (slot) {
    this.slot = slot;
    const o = await this.pc.createOffer(); await this.pc.setLocalDescription(o); await waitIce(this.pc, 3000);
    return Net.encode(this.pc.localDescription.sdp, 'O', slot);
  };
  Peer.prototype.acceptAnswer = async function (code) {
    const d = Net.decode(code);
    if (d.kind !== 'A') throw new Error('That is the host code. Scan the code on your friend\'s phone.');
    if (d.slot !== this.slot) throw new Error('That code is for another player. Scan the newest code.');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
  };
  // joiner side
  Peer.prototype.acceptOffer = async function (code) {
    const d = Net.decode(code);
    if (d.kind !== 'O') throw new Error('That is a friend\'s code. Scan the code on the host phone.');
    this.slot = d.slot;
    await this.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
    const a = await this.pc.createAnswer(); await this.pc.setLocalDescription(a); await waitIce(this.pc, 3000);
    return Net.encode(this.pc.localDescription.sdp, 'A', d.slot);
  };

  Net.Peer = Peer;

  // ---- QR drawing ----
  Net.drawQR = function (canvas, text) {
    const qr = qrcode(0, 'L'); qr.addData(text, 'Byte'); qr.make();
    const n = qr.getModuleCount(), quiet = 4, cell = Math.max(4, Math.floor(560 / (n + quiet * 2)));
    canvas.width = canvas.height = (n + quiet * 2) * cell;
    const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, canvas.width, canvas.height); c.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) c.fillRect((x + quiet) * cell, (y + quiet) * cell, cell, cell);
    return n;
  };

  // ---- QR scanning with camera (BarcodeDetector if present, else jsQR) ----
  Net.Scanner = function (video, onCode, onError) {
    this.video = video; this.onCode = onCode; this.onError = onError; this.running = false;
    this.cv = document.createElement('canvas'); this.cx = this.cv.getContext('2d', { willReadFrequently: true });
  };
  Net.Scanner.prototype.start = async function () {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) { this.onError && this.onError(e); return false; }
    this.video.srcObject = this.stream; this.video.setAttribute('playsinline', ''); this.video.muted = true;
    try { await this.video.play(); } catch (e) { }
    if ('BarcodeDetector' in window) {
      try { const f = await BarcodeDetector.getSupportedFormats(); if (f.includes('qr_code')) this.det = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { }
    }
    this.running = true; this.loop();
    return true;
  };
  Net.Scanner.prototype.loop = async function () {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.videoWidth) {
      let txt = null;
      if (this.det) { try { const r = await this.det.detect(v); if (r.length) txt = r[0].rawValue; } catch (e) { this.det = null; } }
      if (!txt) {
        const sc = Math.min(1, 640 / v.videoWidth), w = Math.round(v.videoWidth * sc), h = Math.round(v.videoHeight * sc);
        this.cv.width = w; this.cv.height = h; this.cx.drawImage(v, 0, 0, w, h);
        const img = this.cx.getImageData(0, 0, w, h);
        const r = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
        if (r && r.data) txt = r.data;
      }
      if (txt && /^[ZR]/.test(txt)) { this.stop(); this.onCode(txt); return; }
    }
    setTimeout(() => this.loop(), 120);
  };
  Net.Scanner.prototype.stop = function () {
    this.running = false;
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    this.video.srcObject = null;
  };
  // Ask for camera once so Chrome shares real local IPs (instead of hidden .local names) in the code.
  Net.warmCamera = async function () {
    try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); return true; } catch (e) { return false; }
  };

  window.RSNet = Net;
})();

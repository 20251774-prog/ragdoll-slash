# Ragdoll Slash

Ragdoll sword fighting for Android Chrome (a PWA that works offline). Play: https://20251774-prog.github.io/ragdoll-slash/

- **Play vs computer**: Easy, Normal or Hard.
- **Local multiplayer (2 to 4 phones)** over one phone's Wi-Fi hotspot, with **no internet**. It uses WebRTC DataChannels with `iceServers: []` and pairs by QR code with no server: the host shows a code, the friend scans it and shows a reply code, then the host scans that. If the camera doesn't work you can copy and paste the codes instead.
- The physics is planck.js. jsQR, qrcode-generator and lz-string are bundled in `lib/`, and nothing loads from a CDN.

Controls: on screen ◀ ▶, Jump, Slash, Block, Dash. On a keyboard: A/D, W/Space, J, K, L/Shift.

Tests (`test/`) use Playwright: `logic.js` (AI vs AI matches), `shots.js` (screenshots), `mp.js N` (host + N joiners paired through real QR images fed to a fake camera), and `paste_offline.js` (the paste fallback and an offline reload).

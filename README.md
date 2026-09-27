# Ragdoll Slash

Brutal ragdoll sword and gun fighting for Android Chrome (a PWA that works offline). Play: https://20251774-prog.github.io/ragdoll-slash/

## Modes
- **Solo vs computer** (Easy, Normal, Hard): **1 vs 1**, **2 vs 2** (you and a computer ally against two computer enemies) or a **4-way free-for-all**.
- **Local multiplayer (2 to 4 phones)** over one phone's Wi-Fi hotspot, with **no internet**. The host picks **Teams 2 vs 2** or **Free for all**, and can fill empty slots with computer fighters. Pairing uses WebRTC DataChannels with `iceServers: []` and QR codes, with no server involved. If the camera doesn't work you can copy and paste the codes instead.
- In teams mode, friendly fire is off. Teams are red and blue, with markers above each fighter.

## Weapons
- **Melee**, each with its own weight, reach and damage: longsword, greatsword, katana, axe, spear and mace.
- **Ranged**: pistol, rifle (automatic), shotgun (7 pellets) and bow (hold to draw, release to shoot).
  - Bullets and arrows are physics projectiles, and they push limbs when they hit. Arrows stick in the ground and in fighters.
  - Every ranged weapon has ammo and needs reloading.
- You carry a primary and a secondary weapon; **Swap** switches between them.

## Armour
- Each part (helmet, chest, arms and legs) has its own armour HP.
- Armour dents, then cracks, then breaks and falls off as a physics piece. After that, the bare part takes much more damage.
- There are four armour types: none, leather, chainmail and plate. Heavier armour protects more but slows you down.

## Customise
Pick your name, armour pieces, colours, and primary and secondary weapons, with a live preview. It's saved on the phone (localStorage).

## Controls
- **On screen**: ◀ ▶, Jump, Dash, Block, Swap, and the Slash/Fire button.
  - With a gun or bow, tap Fire to shoot with auto-aim. To aim yourself, press and drag from the Fire button like a joystick and release to shoot. The rifle keeps firing while held.
- **Keyboard**: A/D to move, W/Space to jump, J to attack or fire, K to block, L/Shift to dash, Q to swap, R to reload. The mouse aims.

## Feel
Heavy hits, knockback, floppy limbs, armour flying off, red hit sparks and small red marks that fade, screen shake, hit-stop, slow motion on a K.O., and a K.O. camera. There's no gore.

## Tech and tests
- The physics is planck.js. jsQR, qrcode-generator and lz-string are bundled in `lib/`, and nothing loads from a CDN.
- Tests in `test/` use Playwright's bundled Chromium:
  - `logic.js`: computer-vs-computer matches in every mode, plus a friendly-fire check.
  - `v2.js`: customise screen, solo 1v1 and 2v2, touch aim, rifle, swap, shotgun, bow and armour breaking.
  - `mp.js N teams|ffa fill(1|0)`: a host plus N joiners paired through real QR images fed to a fake camera.
  - `paste_offline.js`: the paste fallback and an offline reload.

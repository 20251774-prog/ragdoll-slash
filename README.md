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

## Shields
- Round wooden, kite or tower shield on the off hand (one-handed weapons only: longsword, katana, axe, spear, mace, pistol). With a two-handed weapon the shield hangs on your back until you swap.
- Hold **Block** to raise it: it catches most blows and arrows from the front (round 85%, kite 93%, tower 100%), and arrows stick in it. Bigger shields slow you down more.
- Shields have their own health: they crack, then **splinter and break** into pieces.
- Heavy weapons, kicks and bashes knock a raised shield guard open. With a shield up, Block + ◀/▶ is a **shield bash**.

## Customise
Pick your name, armour pieces, colours, primary and secondary weapons and a shield, with a live preview. It's saved on the phone (localStorage).

## Controls
- **On screen**: ◀ ▶, Jump, Dash, Block, Swap, and the Slash/Fire button.
  - With a gun or bow, tap Fire to shoot with auto-aim. To aim yourself, press and drag from the Fire button like a joystick and release to shoot. The rifle keeps firing while held.
- **Keyboard**: A/D to move, W/Space to jump, J to attack or fire, K to block, L/Shift to dash or roll, F to kick or bash, E for a fatality, Q to swap, R to reload. The mouse aims.
- **Moves**: tap Block just as a blow lands to **parry** (the attacker staggers and your next hit is a lunging **riposte**). Tap Block during your own wind-up to **feint**. Block + ◀/▶ **kicks** (breaks a guard). Dash on the ground is a **dodge roll** that slips under blows. When you're knocked down, mash Slash or Jump to get up faster.

## Fighting (v3)
- **Active ragdoll**: the fighters are still full physics ragdolls, but stiff joint motors drive them toward hand-authored poses. A balance controller keeps the torso upright, and the feet are planted under the centre of mass with leg IK, so they stand, walk and swing like athletes. They only go partly limp on big hits (stagger, then recover) and fully limp on a K.O.
- **Guard stances and footwork** per weapon: sword in a middle guard, katana held high, greatsword/axe/mace on the shoulder, spear low and forward, plus a light footwork shuffle. Each weapon has its own wind-up, strike and follow-through; heavy weapons are slower but hit much harder. Guns are held steady and recover from recoil; the bow is drawn back.
- **Damage from momentum**: blade speed at the contact point x weapon mass. Reactions scale with the force: flinch, stagger, knockdown (then get up), with wall bounces at the arena edge. Swords can glance off intact plate.
- **Location wounds**: leg hits make a fighter limp and slow down, weapon-arm hits weaken and slow their swings and drop the guard, and hard head hits daze them for a moment. Shown as LIMPING / ARM HURT / DAZED under the health bar.
- **FINISH HIM**: the round-deciding K.O. doesn't go limp straight away. The loser drops to their knees, swaying, for about 3.6 s with a big FINISH HIM prompt and a **FATALITY** button for the winner. Press it (or E/F) while close for a cinematic finishing move that depends on the weapon: sword or katana a spinning slash that knocks them flying; axe or mace an overhead slam into the ground; spear a thrust, lift and throw; gun a slow-motion final shot; bow a slow-motion arrow; shield a bash combo; kick input or a two-handed weapon a launch kick. It uses camera zoom, slow motion, heavy shake and a big FATALITY banner, then the body goes limp. If nobody presses it in time they collapse in a normal death animation. The computer opponents do fatalities too (more often on Hard). In multiplayer the host runs it (host-authoritative), so any phone on the winning side can trigger it and every phone sees it.
- Stylised: red sparks only; no gore, dismemberment or decapitation.

## Feel
Heavy hits, knockback, armour flying off, red hit sparks and small red marks that fade, screen shake, hit-stop, slow motion and a K.O. camera. There's no gore.

## Tech and tests
- The physics is planck.js. jsQR, qrcode-generator and lz-string are bundled in `lib/`, and nothing loads from a CDN.
- Tests in `test/` use Playwright's bundled Chromium:
  - `logic.js`: computer-vs-computer matches in every mode (10 set-ups, including the FINISH HIM state and computer fatalities), an upright-time metric, and a friendly-fire check.
  - `upright.js`: v3 vs v2 comparison of torso tilt under light hits (bullets and shoves).
  - `v3.js`: stance, walking, heavy swing, knockdown and get-up, stagger and recover, parry, riposte, kick guard break, dodge roll, plate glance, wall bounce.
  - `v3b.js`: shields (melee blocks, arrows, splintering, guard knocked open, bash), wounds, feints, FINISH HIM and its timeout, every fatality type, the touch Fatality button and a computer fatality.
  - `shots3.js`, `shots3b.js`, `video3.js`: the v3 screenshots and gameplay video.
  - `v2.js`: customise screen, solo 1v1 and 2v2, touch aim, rifle, swap, shotgun, bow and armour breaking.
  - `mp.js N teams|ffa fill(1|0)`: a host plus N joiners paired through real QR images fed to a fake camera. It now also forces a FINISH HIM, has a phone tap FATALITY, and checks that the host runs it and every phone sees it.
  - `paste_offline.js`: the paste fallback and an offline reload.

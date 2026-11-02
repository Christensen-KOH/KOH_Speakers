# Gimkit "Snowbrawl" adaptation spec for TankKit (battle-city-rem)

Standing rules for every session working on this repo. Read before changing
gameplay, HUD, controls or co-op networking.

## Load-sharing & token rules
1. Do NOT run `npm test` and do NOT scan unrelated files.
2. Keep this spec referenced from `CLAUDE.md`.
3. Finish each task with `npm run build`, then commit and push to `origin main`.

## 1. Gimkit-style 2D arena & 360° smooth tank movement
- **Bright top-down arena floor:** bright, clean tiled floor (light slate/grey
  grid with clear zone borders) on the 51x51 scrolling map. No pitch-black
  background.
- **Smooth movement & corner sliding:** fluid driving with circle-to-box corner
  sliding (never stuck on wall edges) and a small flame/exhaust trail behind
  moving tanks.
- **360° aiming & firing:**
  - Desktop/controller: drive with WASD / left stick, aim and shoot toward the
    mouse cursor or right stick / D-pad.
  - Mobile touch (`100dvw x 100dvh` fullscreen): touching/dragging the map
    ONLY drives the tank (never fires on drag/move). A dedicated bottom-right
    `[ 🔥 Fire ]` button shoots and a bottom-left `[ ⚡ Answer Questions ]`
    button opens the questions, like Gimkit.

## 2. Health (100 HP) + Shield (50) & respawns
- Player tanks have **100 HP** (green bar) and up to **50 Shield** (blue bar),
  shown in the top-left HUD and as compact bars above tanks.
- Shield absorbs damage first.
- At `0 HP` the attacker gets a **Knockout**, a live Kill Feed toast is shown,
  and the player respawns after **3 seconds** (unless Base Defense lives are
  exhausted).

## 3. Non-intrusive quiz-for-ammo loop
- **CRITICAL UX RULE:** running out of shells or fuel NEVER opens the question
  modal automatically. Show a small, non-blocking toast instead:
  `"Out of Shells! Tap [Answer Questions] to reload"`.
- The question modal opens **only** on an explicit `[ ⚡ Answer Questions ]`
  click/tap or the `Q` / `Tab` keys.
- When open it covers the screen (`z-index: 9999`), auto-pauses Solo mode (or
  shields the player in Co-op) and returns straight to the fullscreen map
  when closed.

## 4. On-map vending machines & gadget stations
- Physical stations on the arena floor with floating signs: `GADGETS`,
  `SHIELD STATION`, `REPAIR BAY`.
- Driving up to one shows a prompt, e.g.
  `[Tap / Press E] Buy Shield Can ($20) -> +25 Shield` or `Upgrade Cannon`.
- Repair (med pack) needs standing still for 2 seconds; moving cancels the
  channel, like Snowbrawl.

## 5. Host-authoritative state & security
- Keep zero-cost PeerJS + Netlify (static hosting, 6-digit room codes).
- Clients only send inputs (move vector, fire angle, submitted answer).
- The host owns HP, Shield, Ammo, Cash and Knockout counts, and never sends
  the correct quiz answer to clients in advance.

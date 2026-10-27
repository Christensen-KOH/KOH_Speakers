# TankKit: Battle City 2D: architecture and refactoring plan

TankKit is built **on top of** the existing Cattle Bity engine rather than as a
rewrite. The engine already provides scenes, a scene-graph renderer, swept
collision, per-level scripts on an event bus, local 2-player input (keyboard and
gamepad), 35 maps and a level editor. The Gimkit layer plugs into those seams.

## Folder map

| Requested module      | Location                                   | Status                                     |
| --------------------- | ------------------------------------------ | ------------------------------------------ |
| `src/core`            | `src/core`                                 | Existing engine, unchanged                 |
| `src/entities`        | `src/entities` (+ classic `src/gameObjects`, `src/tank`, `src/terrain`) | **New in Step 2**: pads, Auto-Turret, sprite tinter, particles, screen shake |
| `src/gimkit-economy`  | `src/gimkit-economy`                       | **New**: Fuel/Shells/Cash/Streak, payout table, co-op shared cash |
| `src/kits`            | `src/kits`                                 | **New**: built-in A1–B2 kits, spaced-repetition queue, CSV/JSON import, localStorage library |
| `src/ui`              | `src/ui`                                   | **New**: DOM overlay, question sheet + controller, TTS, Kit Manager |
| `src/match`           | `src/match`                                | **New in Step 5**: modes, host settings, Blitz clock, knockouts, report builder |
| `src/live`, `server/`  | `src/live`, `server`                       | **Live class**: WebSocket protocol, client session, Node room server |
| (legacy)              | `src/education`                            | Earlier prototype, unused; superseded by `src/kits` + `src/ui`. Safe to delete |

`EconomySession` is created in `main.ts` and passed to every scene and script as
`updateArgs.economy`. `UiRoot` wraps the canvas in a `.tk-stage` box; DOM
widgets mount into `uiRoot.getLayer()` and scale with the canvas.

## Integration points in the existing engine

| Gimkit feature             | Hook                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| Shells per shot            | `PlayerTankBehavior` → gate `tank.fire()` with `economy.tryFire()`    |
| Fuel drain / 20% crawl     | `Tank` movement (`translateY(moveSpeed * dt)`) × `consumeMovement(dt)` |
| Q / B / 1-4 hotkeys        | New controls in `input/contexts/LevelPlayInputContext` + bindings    |
| Bullet-time while answering | Scale `updateArgs.deltaTime` in `LevelPlayScene` while the modal is open |
| Upgrade/Recharge pads      | New `TerrainType`s + `TerrainFactory` tiles + editor brush           |
| Weapon tiers               | `TankAttributesFactory` (bullet speed/count) + `TankBulletWallDamage` (steel) |
| Steel Fortress / Brick Builder | `LevelBaseScript` (already swaps base walls for the shovel power-up) |
| EMP Blast                  | Reuse the existing freeze power-up path in `LevelPowerupScript`      |
| Waves / boss / gold tanks  | `LevelEnemyScript` + `TankType` / `TankFactory`                      |
| Host Options / Report      | New scenes in `scenes/` registered in `GameSceneRouter`              |

## Remaining steps

1. **Step 1 (done):** Webpack 4/TS 3.9 → Vite 6/TS 5/Vitest, module scaffolding,
   economy core with tests, overlay root.
2. **Step 2 (done): Engine additions.** See below.
3. **Step 3 (done): Kit Modal and Kit Manager.** See below.
4. **Step 4 (done): Economy wiring and Shop.** See below.
5. **Step 5 (done): Host Options, modes and Report.** See below.

## Step 2: what was added

- **Pads** (`entities/pads`): `recharge-pad` and `upgrade-pad` terrain types,
  64×64 and procedurally drawn. They never block movement or bullets and can
  be painted in the level editor. `withDefaultPads` gives every map without
  pads a Recharge Pad on each player spawn and one Upgrade Pad on the first
  free cell beside the base. `LevelPadScript` emits `padEntered` /
  `padExited` events (for the shop and the question safe zone) and refuels
  tanks parked on a Recharge Pad (`RECHARGE_PAD_FUEL_PER_SECOND`).
- **Gold and Boss tanks**: `TankType.variant` (`TankVariant`). Gold is a fast
  tier B with 2 HP and a $75 cash bounty. Boss is a tier D with 12 HP,
  two fast shells and steel-breaking shots, plus a $200 bounty.
  Skins are generated at load time by `TankSpriteTinter` (no new art).
- **Waves** (`level/WavePlan.ts`): each level's 20 enemies become 4 waves of
  5 with a 4 s break between them and a "WAVE n/4" banner. Two Gold Tanks
  replace regular tanks (never ones carrying a power-up), and every 5th level
  ends with a Boss ("BOSS WAVE").
- **Auto-Turret** (`entities/AutoTurret.ts`, `LevelTurretScript.placeTurret`):
  mounts above the base and fires up, left or right at enemies in its lane.
  Its shells fly through player tanks and don't break the base's walls.
  The shop (Step 4) will call `placeTurret`.
- **FX**: `ParticleBurst` on kills, player deaths and base loss, and
  `ScreenShake` (a CSS transform on the canvas, off under
  `prefers-reduced-motion`).
- **Dev tools**: in `npm run dev`, a "TankKit" debug menu spawns Gold/Boss
  tanks, places the turret, kills all enemies and tests the shake.

## Step 3: what was added

- **Question sheet** (`ui/QuestionModal.ts`, `ui/QuestionController.ts`):
  - **Q** or **Tab** opens it during play. **1–4** answer choice questions,
    **Enter** submits typed answers, **R** replays audio, and **Q** / **Esc** /
    **Tab** close it.
  - While it is open the game runs at 20% speed. It stops completely while the
    tank is parked on a Recharge Pad.
  - The keyboard belongs to the sheet while it is open, so answering never
    drives or fires the tank.
  - Correct answers pay out through `PlayerEconomy.recordAnswer` (cash,
    shells, fuel, streak).
  - A wrong answer shows the correct one with its explanation and speaks it
    aloud (TTS). The sheet stays locked for `wrongAnswerCooldown` (2 s) and
    can't be closed during that time.
  - Every answer is logged in `questionController.getHistory()`, ready for
    the Step 5 report and Mistake Review Vault.
- **Question kinds** (`kits/Question.ts`): multiple choice, listening (the
  prompt is spoken with speechSynthesis) and fill-in-the-blank. Typed answers
  ignore case, extra spaces, curly apostrophes and end punctuation, and a
  question can accept several answers.
- **Spaced repetition** (`kits/QuestionQueue.ts`): fresh questions come from a
  shuffled deck with no back-to-back repeats. A missed question returns
  3–4 turns later and stays in rotation until it's answered correctly.
- **Built-in kits** (`kits/builtInKits.ts`): A1 Sight Words & Animals, A2
  Past Simple Irregulars, B1 Phrasal Verbs and B2 Idioms & Conditionals.
  Each has 18 questions mixing all three kinds.
- **Kit Manager** (MODES → ENGLISH KITS, `ui/KitManagerPanel.ts`):
  - Pick the active kit.
  - Import by pasting CSV, a spreadsheet selection (TSV) or JSON, or by
    opening a file. Bad rows are skipped and reported by line.
  - Export any kit as JSON, delete custom kits, and download a CSV template.
  - Custom kits are saved in `localStorage` (`tankkit.customKits`).
- **Dev handle**: `window.tankKit` exposes the economy, kit library and
  question controller in `npm run dev`.

CSV columns: `type, prompt, answer, wrong1, wrong2, wrong3, speak, explanation`.
`type` is `choice`, `listen` or `fill`; it is inferred when left blank.
Separate accepted answers with `|`. Without a header row, the columns are
`prompt, answer, wrong1, wrong2, wrong3`.

## Step 4: what was added

- **Resource gating** (`gameObjects/PlayerTank.ts`):
  - Every shot costs a shell. Shots the tank can't take anyway (shell
    limit, rapid-fire throttle) cost nothing.
  - Driving burns fuel. An empty tank crawls at 20% speed.
  - Pressing fire with no shells, or clicking the playfield, opens the
    question sheet (at most once every 2 s for a held fire key).
  - Enemy tanks are not gated.
- **Overlay gate** (`ui/OverlayGate.ts`): one in-level overlay (questions or
  shop) at a time, owning the keyboard. The level runs at 20% speed while one
  is open, and stops on either pad. **B** in the sheet goes to the shop and
  **Q** in the shop goes to the questions.
- **Upgrade Shop** (`gimkit-economy/Shop.ts` rules, `ui/ShopController.ts`
  panel): **B** anywhere, or drive onto an Upgrade Pad. Keys **1–0** buy.
  - Twin-Blaster $50 → Plasma Cannon $150 → Scatter Shot $400 (bought in order)
  - Speed Boost $75 (+30% speed, −40% fuel use)
  - Heavy Armor $120 (+2 hearts per life)
  - Brick Builder $60, Steel Fortress $200 (60 s), Auto-Turret $250 (one
    at a time)
  - EMP Blast $100 (8 s freeze)
  - Question Multiplier $100 / $300 / $800 (×1.5 / ×2.5 / ×4 cash)
- **Upgrades are a per-player loadout** in the economy. `applyLoadout` layers
  them on the tier attributes, so they stack with star power-ups, survive
  respawns and reset when a new game starts (`Session.started`).
  `LevelShopScript` applies the in-level effects.
- **HUD** (`ui/Hud.ts`):
  - Top bar with cash, fuel bar, shells, streak, armor hearts and the wave
    counter (P2 gets a second group in 2-player games).
  - "LOW FUEL / OUT OF SHELLS: press Q" alerts and a one-time safe-zone tip.
  - Floating +$ / +shells popups on answers, and −$ on purchases.
  - +$ bounty popups where Gold and Boss tanks die.
  - Driven by `LevelEconomyScript`.
- **Fix**: `Sound` no longer logs unhandled AbortErrors when a sound is
  restarted before it finished starting.

## Step 5: what was added

- **Game Options** (`scenes/main/MainHostScene.ts`, `ui/HostOptionsPanel.ts`):
  - 1 PLAYER and 2 PLAYERS now open a host screen before stage select.
  - Pick the mode (Base Defense, Tycoon Blitz, Co-op Defense, Tank Brawl),
    the English kit, Reward per question (Low / Balanced / High) and
    Movement costs fuel (On / Off).
  - Also Co-op cash (Shared / Separate) and Blitz length (3 / 5 / 8 min).
  - Choices are remembered in `localStorage` (`tankkit.matchSettings`) and
    applied when the game starts (`Session.started` → `Match.begin`,
    `toEconomySettings`).
- **Modes** (`match/Match.ts`):
  - **Tycoon Blitz**: a countdown in the HUD that runs on real time, so
    bullet-time doesn't stretch it (`LevelBlitzScript`). It has 6 Gold
    tanks per level and goes straight to the report when time is up.
  - **Co-op Defense**: two players, with optional shared cash.
  - **Tank Brawl**: two players with separate wallets. Rival shells deal
    real damage (`PlayerTank.receiveFriendlyFire`); a knockout pays $50 and
    counts toward the win (most KOs, then most cash).
- **Player 2 answering and shopping** (`ui/overlayKeys.ts`):
  - With the default 2-player schemes, P1 drives with WASD + F and uses
    **Q** (questions) and **B** (shop). P2 drives with the arrows + K and uses
    **P** and **M**.
  - Overlays show whose turn it is. Stepping on an Upgrade Pad opens that
    player's shop, and empty-fire opens that player's questions.
  - The time scale follows the active player's safe zone.
- **Gimkit Report** (`scenes/main/MatchReportScene.ts`, `ui/ReportPanel.ts`,
  `match/MatchReport.ts`):
  - Shown after every match (game over, victory, time up), before high
    scores.
  - Per player: accuracy, correct/answered, longest streak, cash earned,
    score, and knockouts (in Brawl).
  - **Mistake Review Vault**: each missed question with the player's
    answer, the right answer, the explanation and a 🔊 button. Listening
    items replay their audio. A badge marks questions that spaced repetition
    later fixed.
  - **Save mistakes as a practice kit** turns them into a custom kit.

## Live class: shared co-op battlefield

One game for the whole class: every student tank on the same map, the same
enemies and one shared base. See [live-class.md](live-class.md) for running
it.

- **Authority**: the teacher's browser runs the battle (`LiveHostScene` +
  `coop/CoopHostBattle.ts`). It is built from the regular level scripts
  (base, enemies and waves, spawns, explosions, effects, turret) plus
  `CoopPlayersScript`, whose `RemoteTankBehavior` drives each student's
  tank from network input. `CoopRoster` seats up to 8 students (15 s grace
  on disconnect); the rest watch. Stages advance when cleared, and a fallen
  base ends the game. `BackgroundTicker` (a Web Worker metronome) keeps the
  battle running when the host page's frames stall (hidden or occluded
  window).
- **Network** (`src/live/protocol.ts`, `server/rooms.ts`): the Node server
  only relays. Students send `coop:input` (direction, fire held, a fire
  counter so short taps count, mouse/tap aim, crawl, thinking, loadout)
  and `coop:action` (base gadgets). The host broadcasts `coop:world` at
  20 Hz: tanks, enemies, bullets, base, turret, wave and one-off events.
  The map travels as a 52×52 grid string (`coop/grid.ts`), sent when it
  changes and as a 1 s keyframe.
- **Students** (`coop/CoopClientScene.ts`, `coop/WorldReplica.ts`): render
  snapshots ~110 ms in the past and blend between them
  (`coop/SnapshotBuffer.ts`), using the real sprites. Only changed 64 px
  map blocks are rebuilt. Name tags with HP bars and 💭 come from
  `coop/TankLabels.ts`.
  - Cash, shells, fuel, questions and the shop stay local: shells are
    charged per shot the host confirms, fuel per second of driving, and kill
    bounties arrive as events.
- **Codes**: 6 digits. Live mode with one map per device was replaced by the
  shared battlefield.

## Device-adaptive controls

`ui/AdaptiveControls.ts` picks controls by the device actually used
(`(pointer: coarse)` at start, then the last pointer or key type):

- **Desktop**: nothing on screen. WASD aliases the arrows in single
  player, Space fires, left-click turns toward the cursor and fires
  (`aimFire`), right-click toggles questions, Q/E open questions, B opens
  the shop.
- **Touch**: an invisible two-half layer. On the left, a floating joystick
  (opacity 0.35) appears under the thumb; on the right, tap or hold fires.
  Two pills (⚡ +Ammo / $, 🛒 Shop) show in levels.
- Movement and fire go through virtual keys
  (`InputManager.pressVirtual`), so menus, rebinding and both game types
  work unchanged. Touch layers hide while any panel, the question sheet or
  the shop is open.

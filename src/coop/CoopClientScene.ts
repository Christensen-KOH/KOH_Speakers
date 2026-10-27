import { GameUpdateArgs, Rotation } from '../game';
import { PlayerEconomy } from '../gimkit-economy';
import { LevelPlayInputContext } from '../input';
import { CoopWorld } from '../live/protocol';
import { MatchOutcome } from '../match';
import { GameScene } from '../scenes/GameScene';
import { GameSceneType } from '../scenes/GameSceneType';
import type { FieldPoint } from '../ui';

import { CoopLocalPlayer, RawControls, SHOP_ACTIONS } from './CoopLocalPlayer';
import { TankLabels } from './TankLabels';
import { WorldReplica } from './WorldReplica';

const INPUT_HEARTBEAT_MS = 200;

const DIRECTIONS: [number[], Rotation][] = [
  [LevelPlayInputContext.MoveUp, Rotation.Up],
  [LevelPlayInputContext.MoveDown, Rotation.Down],
  [LevelPlayInputContext.MoveLeft, Rotation.Left],
  [LevelPlayInputContext.MoveRight, Rotation.Right],
];

/**
 * A student's view of the shared co-op battlefield. Renders locally at 60fps
 * no matter when network ticks arrive: the student's own tank is predicted
 * on this device, everything else glides toward the host's newest snapshot.
 * Cash, shells, fuel, questions and the shop stay local; shells are charged
 * when the host confirms a shot and base gadgets are sent to the host.
 */
export class CoopClientScene extends GameScene {
  private args: GameUpdateArgs;
  private replica: WorldReplica;
  private local: CoopLocalPlayer;
  private labels: TankLabels;
  private spectate: HTMLDivElement;
  private connecting: HTMLDivElement;
  private player: PlayerEconomy;
  private lastSentKey = '';
  private sinceSentMs = 0;
  private lastStage = 1;
  private latest: CoopWorld | null = null;
  private baseLost = false;
  private done = false;
  private readonly unsubscribers: (() => void)[] = [];

  protected setup(args: GameUpdateArgs): void {
    this.args = args;
    const { economy, hud, liveSession, overlayGate, shopController, uiRoot, controls } = args;
    this.player = economy.getPlayer(0);

    this.replica = new WorldReplica(this.root, args.spriteLoader);
    this.local = new CoopLocalPlayer(args, this.player, () => this.replica.getSolids());
    this.labels = new TankLabels(uiRoot.getLayer());

    this.spectate = document.createElement('div');
    this.spectate.className = 'tk-spectate tk-glass';
    this.spectate.textContent =
      'The battlefield is full (8 tanks). You are watching; keep answering questions, and you get a tank when a spot opens.';
    this.spectate.hidden = true;
    this.connecting = document.createElement('div');
    this.connecting.className = 'tk-coop-connecting';
    this.connecting.textContent = 'Joining the battlefield…';
    uiRoot.getLayer().append(this.spectate, this.connecting);

    hud.show(1);
    overlayGate.attachLevel({
      canOpen: () => !this.done && !this.local.isFrozen(),
      // The shared world never pauses for one student
      isInSafeZone: () => false,
      hasTurret: () => this.latest?.turret != null,
      playerCount: () => 1,
    });

    this.unsubscribers.push(
      liveSession.worldReceived.addListener(this.handleWorld),
      liveSession.roomChanged.addListener((room) => {
        if (room.status === 'ended') {
          this.finish(this.baseLost ? MatchOutcome.GameOver : MatchOutcome.TimeUp);
        }
      }),
      liveSession.removed.addListener(() => this.finish(MatchOutcome.GameOver)),
      shopController.purchased.addListener(({ item }) => {
        const action = SHOP_ACTIONS[item.id];
        if (action !== undefined) {
          liveSession.sendCoopAction(action);
        }
      }),
      controls.aimFire.addListener((point) => this.local.aimFire(point)),
      this.player.answered.addListener((result) => {
        if (result.payout !== null) {
          hud.popupAtStat(0, 'cash', `+$${result.payout.cash}`, 'cash');
          hud.popupAtStat(0, 'shells', `+${result.payout.shells}`, 'shells');
        }
      }),
    );
  }

  protected update(args: GameUpdateArgs): void {
    this.local.update(args.deltaTime, this.readRawControls());

    // Changes go out at once; otherwise a slow heartbeat keeps it fresh
    const input = this.local.getInput();
    this.sinceSentMs += args.deltaTime * 1000;
    const key = JSON.stringify(input);
    if (key !== this.lastSentKey || this.sinceSentMs >= INPUT_HEARTBEAT_MS) {
      this.args.liveSession.sendCoopInput(input);
      this.lastSentKey = key;
      this.sinceSentMs = 0;
    }

    // Drawn every frame (60fps), independent of when snapshots arrive
    if (this.latest !== null && this.replica.hasMap()) {
      this.replica.render(this.latest, args.deltaTime, this.local.getView());
      this.renderLabels(this.latest);
    }

    // Replica objects (explosions, water, particles) animate themselves
    this.root.traverseDescedants((child) => child.invokeUpdate(args));

    this.local.renderHud();
  }

  // --- Input ---------------------------------------------------------------

  private readRawControls(): RawControls {
    const { inputManager } = this.args;
    const method = inputManager.getActiveMethod();
    let dir = -1;
    for (const [controls, rotation] of DIRECTIONS) {
      if (method.isHoldLastAny(controls)) {
        dir = rotation;
      }
    }
    return {
      dir,
      pressed: method.isDownAny(LevelPlayInputContext.Fire),
      held: method.isHoldAny(LevelPlayInputContext.RapidFire),
    };
  }

  // --- World ---------------------------------------------------------------

  private handleWorld = (world: CoopWorld): void => {
    if (this.done) {
      return;
    }
    this.latest = world;
    if (world.grid !== undefined) {
      this.replica.applyGrid(world.grid);
      this.connecting.hidden = true;
    }

    const myId = this.args.liveSession.getPlayerId();
    const myTank = world.tanks.find((tank) => tank.id === myId) ?? null;
    this.spectate.hidden = myTank !== null || !world.waiting.includes(myId);

    // Shells are charged for shots the host actually fired
    this.local.setTank(myTank);

    if (world.stage > this.lastStage) {
      this.lastStage = world.stage;
      this.args.session.activateNextLevel();
    }

    this.replica.playEvents(world.events);
    this.local.applyEvents(world.events, (x, y, cash) =>
      this.args.hud.popupAtField(x, y, `+${cash}`, 'cash'),
    );
    world.events.forEach((event) => {
      const { hud } = this.args;
      if (event.k === 'toast') {
        hud.toast(event.text, 3500);
      } else if (event.k === 'wave') {
        hud.setWave(event.n, event.total, event.boss);
      } else if (event.k === 'baseLost') {
        this.baseLost = true;
        hud.toast('The base has fallen!', 4000);
      }
    });
  };

  private renderLabels(world: CoopWorld): void {
    const room = this.args.liveSession.getRoom();
    const names = new Map((room?.players ?? []).map((p) => [p.id, p.nickname]));
    const myId = this.args.liveSession.getPlayerId();
    this.labels.update(
      world.tanks
        .filter((tank) => tank.alive)
        .map((tank) => ({
          id: tank.id,
          slot: tank.slot,
          name: names.get(tank.id) ?? '',
          // Follow the sprite (predicted / gliding), not the raw snapshot
          x: this.replica.getTankCenter(tank.id)?.x ?? tank.x,
          y: this.replica.getTankCenter(tank.id)?.y ?? tank.y,
          hp: tank.hp,
          maxHp: tank.maxHp,
          thinking: tank.thinking,
          isMe: tank.id === myId,
        })),
    );
  }

  // --- Ending --------------------------------------------------------------

  private finish(outcome: MatchOutcome): void {
    if (this.done) {
      return;
    }
    this.done = true;
    const { hud, match, overlayGate } = this.args;
    overlayGate.detachLevel();
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.labels.destroy();
    this.spectate.remove();
    this.connecting.remove();
    hud.hide();
    match.setOutcome(outcome);
    this.args.collisionSystem.reset();
    this.navigator.clearAndPush(GameSceneType.MatchReport);
  }
}

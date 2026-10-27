import { GameObject, Timer } from '../../core';
import { BackgroundTicker } from '../../coop/BackgroundTicker';
import { CoopHostBattle } from '../../coop/CoopHostBattle';
import { CoopLocalPlayer, SHOP_ACTIONS } from '../../coop/CoopLocalPlayer';
import { HOST_PLAYER_ID, HostPilot } from '../../coop/HostPilot';
import { CoopRoster } from '../../coop/CoopRoster';
import { TankLabels } from '../../coop/TankLabels';
import { GameState, GameUpdateArgs } from '../../game';
import { SceneMenuTitle } from '../../gameObjects';
import { InputManager } from '../../input';
import { COOP_TICK_MS, LiveRoomState, LiveSession } from '../../live';
import { MapConfig } from '../../map';
import { resetGameBalance, setGameBalance } from '../../match/GameBalance';
import { loadStudioSettings, toGameBalance } from '../../studio/StudioSettings';
import { cardsFromKit } from '../../studio/flashcards';
import { FlashcardViewer } from '../../ui/FlashcardViewer';
import { HostPill } from '../../ui/HostPill';
import { LiveHostPanel } from '../../ui/LiveHostPanel';

import { GameScene } from '../GameScene';
import { GameSceneType } from '../GameSceneType';

// Pause between a cleared stage and the next one, and after the base falls.
const STAGE_BREAK = 3;
const BASE_LOST_DELAY = 3;
// What the teacher's action buttons do.
const FREEZE_SECONDS = 8;
const BONUS_CASH = 100;

/**
 * Teacher's live class (MODES → HOST LIVE CLASS). Runs the one shared co-op
 * battlefield while the game plays, broadcasts it to students and shows it
 * on this screen (the projector view). The teacher is a full player: own
 * tank, HUD, ⚡ Hub (questions and upgrades), cash and ammo, with the host
 * actions tucked into the [ 👑 Host ] pill in the top bar.
 */
export class LiveHostScene extends GameScene {
  private panel: LiveHostPanel;
  private hostPill: HostPill;
  private local: CoopLocalPlayer | null = null;
  private inputManager: InputManager;
  private live: LiveSession;
  private updateArgs: GameUpdateArgs;
  private title: SceneMenuTitle;
  private labels: TankLabels;
  private readonly roster = new CoopRoster();
  private readonly pilot = new HostPilot();
  private localPlayer: unknown = null;
  private flashcards: { overlay: HTMLElement; viewer: FlashcardViewer } | null = null;
  private battle: CoopHostBattle | null = null;
  private battleRoot: GameObject | null = null;
  private loadingStage = false;
  private sinceSnapshotMs = 0;
  private readonly stageTimer = new Timer();
  private pendingStage: number | null = null;
  private readonly unsubscribers: (() => void)[] = [];
  private ticker: BackgroundTicker;

  protected setup(updateArgs: GameUpdateArgs): void {
    const { inputManager, kitLibrary, liveSession, uiRoot } = updateArgs;
    this.updateArgs = updateArgs;

    this.title = new SceneMenuTitle('LIVE CLASS');
    this.root.add(this.title);

    this.inputManager = inputManager;
    this.inputManager.unlisten();
    this.live = liveSession;

    this.labels = new TankLabels(uiRoot.getLayer());
    this.panel = new LiveHostPanel(uiRoot.getLayer(), liveSession, kitLibrary);
    this.panel.setSlotLookup((playerId) => this.roster.seatOf(playerId)?.slot ?? null);
    this.panel.exitRequested.addListener(this.handleExit);

    this.hostPill = new HostPill(uiRoot.getTopBar().getSlot(), {
      freeze: () => this.battle?.freezeClass(FREEZE_SECONDS, HOST_PLAYER_ID),
      bonus: () => {
        this.battle?.bonusDrop(BONUS_CASH);
        this.local?.grantBonus(BONUS_CASH);
      },
      details: () => this.panel.showDetails(),
      flashcard: () => this.toggleFlashcards(),
      end: () => {
        if (window.confirm('End the game for everyone?')) {
          this.live.endGame();
        }
      },
    });

    this.stageTimer.done.addListener(() => {
      if (this.pendingStage !== null) {
        this.loadStage(this.pendingStage);
        this.pendingStage = null;
      }
    });

    this.unsubscribers.push(
      liveSession.roomChanged.addListener(this.handleRoom),
      liveSession.coopInput.addListener(({ playerId, input }) => {
        this.roster.setInput(playerId, input);
      }),
      liveSession.coopAction.addListener(({ playerId, nickname, action }) => {
        this.battle?.applyAction(action, playerId, nickname);
      }),
      // The teacher's own shop purchases build on the shared battlefield too
      updateArgs.shopController.purchased.addListener(({ item }) => {
        const action = SHOP_ACTIONS[item.id];
        if (action !== undefined) {
          this.battle?.applyAction(action, HOST_PLAYER_ID, 'Teacher');
        }
      }),
      updateArgs.controls.aimFire.addListener((point) => this.local?.aimFire(point)),
    );

    // Keeps the battlefield running if the teacher hides this window
    this.ticker = new BackgroundTicker(33, (deltaTime) => {
      this.step({ ...this.updateArgs, deltaTime });
    });

    // Resuming a game that is already running (teacher reloaded the page)
    const room = liveSession.getRoom();
    if (room !== null) {
      this.handleRoom(room);
    }
  }

  protected update(updateArgs: GameUpdateArgs): void {
    this.ticker.markFrame();
    this.step(updateArgs);
  }

  private step(updateArgs: GameUpdateArgs): void {
    // The battle owns its own subtree; the menu title is static
    this.stageTimer.update(updateArgs.deltaTime);
    if (this.battle === null) {
      super.update(updateArgs);
      return;
    }

    updateArgs.gameState.set(GameState.Playing);
    // The keyboard stops steering while the Hub is open
    this.pilot.setActive(this.live.getRoom()?.status === 'playing' && updateArgs.overlayGate.isFree() && this.flashcards === null);
    if (this.local !== null) {
      this.local.update(updateArgs.deltaTime, this.pilot.takeRaw());
      this.roster.setInput(HOST_PLAYER_ID, this.local.getInput());
    }
    this.battle.update(updateArgs);

    this.sinceSnapshotMs += updateArgs.deltaTime * 1000;
    if (this.sinceSnapshotMs >= COOP_TICK_MS) {
      this.sinceSnapshotMs = 0;
      this.live.sendWorld(this.battle.snapshot());
    }

    const tanks = this.battle.getTanks();
    this.local?.setTank(tanks.find((tank) => tank.id === HOST_PLAYER_ID) ?? null);
    this.local?.renderHud();
    this.hostPill.setTimer(this.formatRemaining());

    this.labels.update(
      tanks.filter((tank) => tank.alive).map((tank) => ({
        id: tank.id,
        slot: tank.slot,
        name: this.roster.seatOf(tank.id)?.nickname ?? '',
        x: tank.x,
        y: tank.y,
        hp: tank.hp,
        maxHp: tank.maxHp,
        thinking: tank.thinking,
      })),
    );
  }

  // Teacher's quick flashcard warm-up on the projector, mid-game
  private toggleFlashcards(): void {
    if (this.flashcards !== null) {
      this.closeFlashcards();
      return;
    }
    const kit = this.updateArgs.kitLibrary.getActive();
    const overlay = document.createElement('div');
    overlay.className = 'tk-fc-overlay';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tk-st-btn';
    close.textContent = '✕ Close flashcards';
    close.addEventListener('click', () => this.closeFlashcards());
    const viewer = new FlashcardViewer(cardsFromKit(kit));
    overlay.append(close, viewer.element);
    document.body.append(overlay);
    viewer.focus();
    this.flashcards = { overlay, viewer };
  }

  private closeFlashcards(): void {
    this.flashcards?.viewer.destroy();
    this.flashcards?.overlay.remove();
    this.flashcards = null;
  }

  private formatRemaining(): string {
    const remaining = this.live.getRemainingMs();
    if (remaining === null) {
      return '';
    }
    const total = Math.ceil(remaining / 1000);
    return `⏱ ${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  private handleRoom = (room: LiveRoomState): void => {
    this.hostPill.setCode(room.code);
    this.hostPill.setVisible(room.status === 'playing');
    this.roster.sync(
      room.status === 'playing' ? [HostPilot.summary(), ...room.players] : room.players,
      Date.now(),
    );
    this.pilot.setActive(room.status === 'playing');

    if (room.status === 'playing' && this.battle === null && !this.loadingStage) {
      const { session, mapLoader, match } = this.updateArgs;
      // Teacher Studio rules apply to the battlefield and the teacher's own tank
      const studio = loadStudioSettings();
      setGameBalance(toGameBalance(studio));
      match.setSettings({
        ...match.getSettings(),
        movementCostsFuel: room.settings.movementCostsFuel,
        startShells: room.settings.startShells,
        startCash: room.settings.startCash,
        rewardMultiplier: room.settings.rewardMultiplier,
      });
      session.reset();
      session.setMultiplayer(true);
      session.start(1, mapLoader.getItemsCount());
      this.loadStage(1);
    } else if (room.status !== 'playing' && (this.battle !== null || this.loadingStage)) {
      this.stopBattle();
    }
  };

  private loadStage(stage: number): void {
    const { mapLoader } = this.updateArgs;
    this.loadingStage = true;
    const handleLoaded = (mapConfig: MapConfig): void => {
      mapLoader.error.removeListener(handleError);
      this.loadingStage = false;
      if (this.live.getRoom()?.status === 'playing') {
        this.startBattle(mapConfig, stage);
      }
    };
    const handleError = (): void => {
      mapLoader.loaded.removeListener(handleLoaded);
      this.loadingStage = false;
      // Skip a broken map rather than stall the class
      this.loadStage(this.nextStage(stage));
    };
    mapLoader.loaded.addListenerOnce(handleLoaded);
    mapLoader.error.addListenerOnce(handleError);
    mapLoader.loadAsync(stage);
  }

  private startBattle(mapConfig: MapConfig, stage: number): void {
    this.clearBattle();
    // Mark the title's area so the renderer erases it
    this.title.dirtyPaintBox();
    this.title.removeSelf();

    this.battleRoot = new GameObject();
    this.battleRoot.size.copyFrom(this.root.size);
    this.root.add(this.battleRoot);

    const battle = new CoopHostBattle(this.battleRoot, mapConfig, this.roster, stage, this.updateArgs);
    battle.toast.addListener((text) => this.updateArgs.hud.toast(text, 3500));
    battle.waveStarted.addListener(({ n, total, boss }) =>
      this.updateArgs.hud.setWave(n, total, boss),
    );
    battle.stageCleared.addListener(() => {
      this.pendingStage = this.nextStage(stage);
      this.stageTimer.reset(STAGE_BREAK);
      this.updateArgs.hud.toast(`Stage ${stage} cleared! Next stage coming up…`, 3000);
    });
    battle.baseLost.addListener(() => {
      this.updateArgs.hud.toast('The base has fallen!', 3000);
      window.setTimeout(() => this.live.endGame(), BASE_LOST_DELAY * 1000);
    });
    this.battle = battle;
    this.sinceSnapshotMs = COOP_TICK_MS;
    this.attachTeacherPlayer(battle);
  }

  // The teacher plays: HUD, Hub (questions + shop), cash, ammo, fuel
  private attachTeacherPlayer(battle: CoopHostBattle): void {
    const { economy, hud, overlayGate } = this.updateArgs;
    const player = economy.getPlayer(0);
    if (this.local === null || this.localPlayer !== player) {
      // The teacher's tank is the real one on this machine: nothing to predict
      this.local = new CoopLocalPlayer(this.updateArgs, player, () => []);
      this.localPlayer = player;
    }
    hud.show(1);
    overlayGate.attachLevel({
      canOpen: () => this.battle !== null && !this.local?.isFrozen(),
      // The shared world never pauses for one player
      isInSafeZone: () => false,
      hasTurret: () => battle.hasTurret(),
      playerCount: () => 1,
    });
  }

  private nextStage(stage: number): number {
    const count = this.updateArgs.mapLoader.getItemsCount();
    return (stage % count) + 1;
  }

  private clearBattle(): void {
    this.updateArgs.overlayGate.detachLevel();
    this.updateArgs.hud.hide();
    if (this.battleRoot !== null) {
      this.battleRoot.removeSelf();
      this.battleRoot = null;
    }
    this.battle = null;
    this.updateArgs.collisionSystem.reset();
    this.labels.clear();
  }

  private stopBattle(): void {
    this.clearBattle();
    this.loadingStage = false;
    this.pendingStage = null;
    this.stageTimer.stop();
    if (this.title.parent === null) {
      this.title = new SceneMenuTitle('LIVE CLASS');
      this.root.add(this.title);
    }
  }

  private handleExit = (): void => {
    const room = this.live.getRoom();
    if (room !== null && room.status !== 'ended') {
      const leave = window.confirm(
        'Students are still connected. End the game for everyone and exit?',
      );
      if (!leave) {
        return;
      }
      this.live.endGame();
    }
    this.live.leave();
    this.stopBattle();
    resetGameBalance();

    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.ticker.destroy();
    this.pilot.destroy();
    this.hostPill.destroy();
    this.closeFlashcards();
    this.labels.destroy();
    this.panel.destroy();
    this.inputManager.listen();
    this.navigator.clearAndPush(GameSceneType.MainMenu);
  };
}

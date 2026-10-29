import { GameUpdateArgs, Rotation } from '../game';
import {
  applyLoadout,
  DEFAULT_ECONOMY_SETTINGS,
  getKillBounty,
  PlayerEconomy,
  ShopItemId,
} from '../gimkit-economy';
import type { CoopAction, CoopEvent, CoopInput, CoopTankState } from '../live/protocol';
import { emptyCoopInput } from '../live/protocol';
import { TankParty, TankType } from '../tank';
import type { TankTier, TankVariant } from '../tank';
import { TankAttributesFactory } from '../tank/TankAttributesFactory';
import type { FieldPoint } from '../ui';
import { battleCamera } from '../ui/Camera';
import { QUESTION_KEY_LABELS } from '../ui/overlayKeys';
import { isTouchUi } from '../ui/touchUi';

import { LocalPrediction } from './LocalPrediction';
import type { LocalTankView, SolidRect } from './WorldReplica';

export const SHOP_ACTIONS: Partial<Record<ShopItemId, CoopAction>> = {
  [ShopItemId.BrickBuilder]: 'brick-builder',
  [ShopItemId.SteelFortress]: 'steel-fortress',
  [ShopItemId.AutoTurret]: 'auto-turret',
  [ShopItemId.EmpBlast]: 'emp-blast',
};

/** What the keyboard (or touch pad) asks for this frame. */
export interface RawControls {
  // Direction held, in degrees, or -1.
  dir: number;
  // Fire pressed this frame / held.
  pressed: boolean;
  held: boolean;
}

function cardinal(dx: number, dy: number): Rotation {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? Rotation.Right : Rotation.Left;
  }
  return dy > 0 ? Rotation.Down : Rotation.Up;
}

/**
 * Everything one person playing on the shared co-op battlefield does on
 * their own device, whether they are a student or the teacher: turns
 * keyboard / mouse / touch into the input sent to the host, spends shells
 * and fuel, predicts their own tank at 60fps, and applies personal events
 * (kill bounty, teacher's bonus and freeze).
 */
export class CoopLocalPlayer {
  public readonly prediction = new LocalPrediction();
  private readonly args: GameUpdateArgs;
  private readonly player: PlayerEconomy;
  private readonly getSolids: () => SolidRect[];
  private input: CoopInput = emptyCoopInput();
  private tank: CoopTankState | null = null;
  private lastShots: number | null = null;
  private face = -1;
  private frozenUntil = 0;
  private speedKey = '';
  private speed = 0;

  constructor(
    args: GameUpdateArgs,
    player: PlayerEconomy,
    getSolids: () => SolidRect[],
  ) {
    this.args = args;
    this.player = player;
    this.getSolids = getSolids;
  }

  public getInput(): CoopInput {
    return this.input;
  }

  public getTank(): CoopTankState | null {
    return this.tank;
  }

  public isFrozen(): boolean {
    return performance.now() < this.frozenUntil;
  }

  /** Where to draw the local tank (predicted), or null to use the host's. */
  public getView(): LocalTankView | null {
    if (this.tank === null || !this.prediction.isActive()) {
      return null;
    }
    const { x, y, r, moving } = this.prediction;
    return { id: this.tank.id, x, y, r, moving };
  }

  /** The host's newest view of this player's tank; charges confirmed shots. */
  public setTank(tank: CoopTankState | null): void {
    this.tank = tank;
    if (tank === null) {
      return;
    }
    if (this.lastShots !== null && tank.shots > this.lastShots) {
      for (let i = this.lastShots; i < tank.shots; i += 1) {
        this.player.tryFire();
      }
    }
    this.lastShots = tank.shots;
  }

  public applyEvents(
    events: CoopEvent[],
    onCash: (x: number, y: number, cash: number) => void,
  ): void {
    events.forEach((event) => {
      if (event.k === 'kill' && this.tank !== null && event.slot === this.tank.slot) {
        const bounty = getKillBounty(event.variant as TankVariant);
        if (bounty > 0) {
          this.player.earn(bounty);
          onCash(event.x, event.y, bounty);
        }
      } else if (event.k === 'freeze') {
        this.frozenUntil = performance.now() + event.seconds * 1000;
      } else if (event.k === 'bonus') {
        this.grantBonus(event.cash);
      }
    });
  }

  public grantBonus(cash: number): void {
    this.player.earn(cash);
    this.args.hud.popupAtStat(0, 'cash', `+$${cash}`, 'cash');
  }

  /** Left-click / tap on the battlefield: face the point and fire. */
  public aimFire(point: FieldPoint): void {
    const tank = this.tank;
    if (tank === null || !tank.alive || this.isFrozen()) {
      return;
    }
    if (this.player.getShells() === 0) {
      this.args.questionController.open(0);
      return;
    }
    const origin = this.prediction.isActive() ? this.prediction : tank;
    const aim = cardinal(point.x - origin.x, point.y - origin.y);
    this.input = { ...this.input, fireSeq: this.input.fireSeq + 1, aim };
  }

  public update(deltaTime: number, raw: RawControls): void {
    const { overlayGate, controls, questionController } = this.args;
    const thinking = !overlayGate.isFree();
    const tank = this.tank;
    const canAct = !thinking && !this.isFrozen() && tank !== null;

    // Keyboard first, then the mouse (right-click / drag toward the cursor)
    let dir = -1;
    if (canAct) {
      dir = raw.dir;
      if (dir < 0) {
        const origin = this.prediction.isActive() ? this.prediction : tank;
        dir = controls.getMouseDriveRotation(origin);
      }
    }

    // Moving the mouse turns the tank in place; any drive cancels it
    let face = this.face;
    if (dir >= 0) {
      face = -1;
    } else if (canAct) {
      const aim = controls.consumeMouseAim();
      if (aim !== null && !controls.isMouseDriving()) {
        const origin = this.prediction.isActive() ? this.prediction : tank;
        face = cardinal(aim.x - origin.x, aim.y - origin.y);
      }
    }
    this.face = face;

    let { fireSeq, aim } = this.input;
    let firing = false;
    if (canAct) {
      if (this.player.getShells() === 0 && (raw.pressed || raw.held)) {
        // Out of shells: off to the questions, Gimkit style
        questionController.open(0);
      } else {
        if (raw.pressed) {
          fireSeq += 1;
          aim = -1;
        }
        firing = raw.held;
      }
    }

    // Fuel is personal: drive costs it, an empty tank crawls
    const crawl = this.player.isOutOfFuel();
    if (dir >= 0 && !crawl) {
      this.player.consumeMovement(deltaTime);
    }

    const { loadout } = this.player;
    this.input = {
      dir,
      firing,
      fireSeq,
      aim,
      face,
      crawl,
      thinking,
      loadout: {
        weaponTier: loadout.weaponTier,
        speedBoost: loadout.speedBoost,
        heavyArmor: loadout.heavyArmor,
      },
    };

    this.prediction.step(
      deltaTime,
      {
        dir,
        speedFactor: crawl ? DEFAULT_ECONOMY_SETTINGS.emptyFuelSpeedFactor : 1,
      },
      this.getSpeed(),
      this.getSolids(),
      tank,
    );
  }

  /** Cash, fuel, shells, hearts, timer and the out-of-resource warning. */
  public renderHud(): void {
    const { hud, liveSession, overlayGate } = this.args;
    const tank = this.tank;
    hud.render(0, {
      cash: this.player.cash.getBalance(),
      fuel: this.player.getFuel() / this.player.getMaxFuel(),
      shells: this.player.getShells(),
      streak: this.player.getStreak(),
      hearts: tank && tank.alive ? tank.hp : 0,
    });

    if (tank && tank.alive) {
      battleCamera.follow({ x: tank.x, y: tank.y, rotation: tank.r, moving: tank.moving });
    }

    const remaining = liveSession.getRemainingMs();
    if (remaining !== null) {
      const rank = liveSession.getRank();
      hud.setTimer(remaining / 1000, rank ? ` · #${rank.rank}/${rank.of}` : '');
    }

    const press = isTouchUi()
      ? 'Tap ⚡ to answer questions'
      : `Press ${QUESTION_KEY_LABELS[0]} to answer questions`;
    let alert: string = null;
    if (this.player.isOutOfFuel()) {
      alert = `LOW FUEL! ${press}`;
    } else if (this.player.getShells() === 0) {
      alert = `OUT OF SHELLS! ${press}`;
    }
    hud.setAlert(overlayGate.isFree() && tank !== null ? alert : null);
  }

  // The same speed the host applies to this tank (tier + shop upgrades)
  private getSpeed(): number {
    const tank = this.tank;
    if (tank === null) {
      return 0;
    }
    const { loadout } = this.input;
    const key = `${tank.tier}|${loadout.weaponTier}|${loadout.speedBoost}|${loadout.heavyArmor}`;
    if (key !== this.speedKey) {
      const base = TankAttributesFactory.create(
        new TankType(TankParty.Player, tank.tier as TankTier),
      );
      this.speed = applyLoadout(base, loadout).moveSpeed;
      this.speedKey = key;
    }
    return this.speed;
  }
}

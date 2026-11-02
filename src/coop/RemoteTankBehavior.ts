import { GameUpdateArgs, Rotation } from '../game';
import { PlayerTank, TankState } from '../gameObjects';
import { DEFAULT_ECONOMY_SETTINGS } from '../gimkit-economy';
import { TankBehavior } from '../tank/TankBehavior';

import type { CoopSeat } from './CoopRoster';

/**
 * Drives a student's tank on the host from their latest network input,
 * the same way PlayerTankBehavior drives it from the keyboard.
 */
export class RemoteTankBehavior extends TankBehavior {
  private readonly seat: CoopSeat;
  private lastFireSeq: number;

  constructor(seat: CoopSeat) {
    super();
    this.seat = seat;
    // Presses made before this tank existed don't fire it
    this.lastFireSeq = seat.input.fireSeq;
  }

  public setup(tank: PlayerTank): void {
    // 360° driving with circle wall sliding, like local players
    tank.omni = true;
  }

  public update(tank: PlayerTank, { deltaTime }: GameUpdateArgs): void {
    const { input } = this.seat;

    // Fire before moving, like the keyboard behaviour (the shell starts at
    // the barrel's current position).
    if (input.fireSeq !== this.lastFireSeq) {
      this.lastFireSeq = input.fireSeq;
      // Mouse/tap aim: face that way first
      if (input.aim >= 0 && !tank.isSliding()) {
        tank.rotate(input.aim as Rotation);
      }
      this.tryFire(tank);
    } else if (input.firing) {
      this.tryFire(tank);
    }

    // Older clients only send the side they hold
    let { mx, my } = input;
    if (mx === 0 && my === 0 && input.dir >= 0) {
      const rad = (input.dir * Math.PI) / 180;
      mx = Math.round(Math.sin(rad));
      my = -Math.round(Math.cos(rad));
    }
    const driving = mx !== 0 || my !== 0;

    if (!tank.isSliding() && !tank.isStunned() && driving) {
      const speed = input.crawl ? DEFAULT_ECONOMY_SETTINGS.emptyFuelSpeedFactor : 1;
      tank.moveVector(mx, my, deltaTime * speed);
    } else if (!driving && tank.state !== TankState.Idle) {
      tank.idle();
    }

    // Standing still: the mouse cursor turns the barrel
    if (!driving && input.face >= 0 && !tank.isSliding() && !tank.isStunned()) {
      tank.rotate(input.face as Rotation);
    }
  }

  private tryFire(tank: PlayerTank): void {
    if (tank.fire()) {
      this.seat.shots += 1;
    }
  }
}

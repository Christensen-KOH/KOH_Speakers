import type { CoopTankState } from '../live/protocol';
import * as config from '../config';

import type { SolidRect } from './WorldReplica';

const HALF = config.TILE_SIZE_LARGE / 2;
// Forgiveness on the sideways axis so a tank slips past wall corners.
const CORNER_SLIP = 3;
// Gap (px) between the predicted and the host's tank that gets corrected.
export const RECONCILE_DISTANCE = 12;
// Fraction of the excess pulled back each 60fps frame.
const RECONCILE_RATE = 0.35;
// Too far off (respawn, teleport): jump to the host's position.
const SNAP_DISTANCE = 96;
// The host's snapshot is always a little old; a moving tank is allowed
// that much extra lead (seconds of travel) before it counts as drifting.
const LATENCY_ALLOWANCE = 0.1;

export interface PredictionInput {
  // Held direction in degrees, or -1.
  dir: number;
  // Fraction of full speed (1, or the crawl factor when out of fuel).
  speedFactor: number;
}

/**
 * Moves the local player's tank on their own screen the moment they press a
 * key, using the same wall rules as the host, then eases it back toward the
 * host's authoritative position only when the two drift apart.
 */
export class LocalPrediction {
  public x = 0;
  public y = 0;
  public r = 0;
  public moving = false;
  private active = false;

  public isActive(): boolean {
    return this.active;
  }

  public step(
    deltaTime: number,
    input: PredictionInput,
    speed: number,
    solids: SolidRect[],
    auth: CoopTankState | null,
  ): void {
    if (auth === null || !auth.alive) {
      this.active = false;
      this.moving = false;
      return;
    }

    if (!this.active || Math.hypot(auth.x - this.x, auth.y - this.y) > SNAP_DISTANCE) {
      this.x = auth.x;
      this.y = auth.y;
      this.r = auth.r;
      this.active = true;
    }

    this.moving = input.dir >= 0;
    if (this.moving) {
      this.r = input.dir;
      this.drive(input.dir, speed * input.speedFactor * deltaTime, solids);
    } else {
      // Aimed shots turn the tank on the host: follow when standing still
      this.r = auth.r;
    }

    this.reconcile(deltaTime, auth, speed);
  }

  private drive(dir: number, distance: number, solids: SolidRect[]): void {
    const dx = dir === 90 ? distance : dir === 270 ? -distance : 0;
    const dy = dir === 180 ? distance : dir === 0 ? -distance : 0;
    this.x = clamp(this.x + dx, HALF, config.FIELD_SIZE - HALF);
    this.y = clamp(this.y + dy, HALF, config.FIELD_SIZE - HALF);

    for (const solid of solids) {
      const left = this.x - HALF;
      const right = this.x + HALF;
      const top = this.y - HALF;
      const bottom = this.y + HALF;
      if (dx !== 0) {
        const hits =
          top + CORNER_SLIP < solid.y + solid.height &&
          bottom - CORNER_SLIP > solid.y &&
          left < solid.x + solid.width &&
          right > solid.x;
        if (hits) {
          this.x = dx > 0 ? solid.x - HALF : solid.x + solid.width + HALF;
        }
      } else if (dy !== 0) {
        const hits =
          left + CORNER_SLIP < solid.x + solid.width &&
          right - CORNER_SLIP > solid.x &&
          top < solid.y + solid.height &&
          bottom > solid.y;
        if (hits) {
          this.y = dy > 0 ? solid.y - HALF : solid.y + solid.height + HALF;
        }
      }
    }
  }

  // Drifting more than 12px: ease back toward the host, never past the limit
  private reconcile(deltaTime: number, auth: CoopTankState, speed: number): void {
    const limit = RECONCILE_DISTANCE + (this.moving ? speed * LATENCY_ALLOWANCE : 0);
    const gap = Math.hypot(auth.x - this.x, auth.y - this.y);
    if (gap <= limit) {
      return;
    }
    const keep = limit / gap;
    const targetX = auth.x + (this.x - auth.x) * keep;
    const targetY = auth.y + (this.y - auth.y) * keep;
    const k = 1 - Math.pow(1 - RECONCILE_RATE, deltaTime * 60);
    this.x += (targetX - this.x) * k;
    this.y += (targetY - this.y) * k;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

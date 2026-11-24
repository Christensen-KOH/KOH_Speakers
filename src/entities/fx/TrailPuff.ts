import { GameObject, Vector } from '../../core';
import { getTrail, TrailId } from '../../cosmetics/Cosmetics';
import * as config from '../../config';

import { ParticleBurst } from './ParticleBurst';

// Seconds between puffs while a tank drives.
export const TRAIL_EMIT_SECONDS = 0.07;
// How far behind the tank centre puffs appear.
const BEHIND_DISTANCE = 22;

/** A few cosmetic pixels left behind a driving tank, under the tanks. */
class TrailPuff extends ParticleBurst {
  public zIndex = config.ENEMY_TANK_Z_INDEX;
}

/**
 * Drops one puff of `trailId` behind a tank at `center` facing `rotation`
 * (degrees, 0 = up). Does nothing for "none".
 */
export function emitTrail(
  field: GameObject,
  center: { x: number; y: number },
  rotation: number,
  trailId: TrailId,
): void {
  const trail = getTrail(trailId);
  if (trail.count === 0) {
    return;
  }
  const radians = (rotation * Math.PI) / 180;
  const jitter = (Math.random() - 0.5) * 14;
  // Facing (sin, -cos); behind is the opposite, jittered sideways
  const x = center.x - Math.sin(radians) * BEHIND_DISTANCE + Math.cos(radians) * jitter;
  const y = center.y + Math.cos(radians) * BEHIND_DISTANCE + Math.sin(radians) * jitter;
  field.add(
    new TrailPuff(new Vector(x, y), {
      count: trail.count,
      colors: trail.colors,
      speed: trail.speed,
      life: trail.life,
      size: trail.size,
    }),
  );
}

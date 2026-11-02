import { Rotation } from '../game/Rotation';

// Free (360°) driving shared by local tanks, co-op tanks on the host and the
// co-op client's prediction, so all three move and collide identically.

// Circle hitbox: a little inside the 64px sprite so tanks fit 64px gaps and
// round corners instead of snagging on them.
export const OMNI_RADIUS = 30;
const PUSH_PASSES = 3;
// Keep facing the current side while the drive direction is within ~53° of it
const FACING_KEEP_DOT = 0.6;

const FACING_VECTORS: Record<number, [number, number]> = {
  [Rotation.Up]: [0, -1],
  [Rotation.Right]: [1, 0],
  [Rotation.Down]: [0, 1],
  [Rotation.Left]: [-1, 0],
};

export interface OmniBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Side the sprite faces (and shoots toward) while driving along (dx, dy). */
export function facingFor(dx: number, dy: number, current: number): Rotation {
  const length = Math.hypot(dx, dy);
  const vector = FACING_VECTORS[current];
  if (vector !== undefined && length > 0 && (vector[0] * dx + vector[1] * dy) / length > FACING_KEEP_DOT) {
    return current as Rotation;
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? Rotation.Right : Rotation.Left;
  }
  return dy > 0 ? Rotation.Down : Rotation.Up;
}

/**
 * Circle-vs-box push-out: moves a circle at (x, y) out of every box along
 * the shortest way, so brushing a wall or corner at an angle slides along it
 * instead of stopping dead. Returns the new centre.
 */
export function pushCircleOut(
  x: number,
  y: number,
  radius: number,
  boxes: OmniBox[],
): { x: number; y: number } {
  let cx = x;
  let cy = y;

  for (let pass = 0; pass < PUSH_PASSES; pass += 1) {
    let pushed = false;

    for (const box of boxes) {
      const nearestX = Math.min(box.maxX, Math.max(box.minX, cx));
      const nearestY = Math.min(box.maxY, Math.max(box.minY, cy));
      const dx = cx - nearestX;
      const dy = cy - nearestY;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq >= radius * radius) {
        continue;
      }
      pushed = true;

      if (distanceSq > 0.0001) {
        const distance = Math.sqrt(distanceSq);
        const push = (radius - distance) / distance;
        cx += dx * push;
        cy += dy * push;
        continue;
      }

      // Centre inside the box: leave through the nearest side
      const left = cx - box.minX + radius;
      const right = box.maxX - cx + radius;
      const up = cy - box.minY + radius;
      const down = box.maxY - cy + radius;
      const shortest = Math.min(left, right, up, down);
      if (shortest === left) {
        cx -= left;
      } else if (shortest === right) {
        cx += right;
      } else if (shortest === up) {
        cy -= up;
      } else {
        cy += down;
      }
    }

    if (!pushed) {
      break;
    }
  }

  return { x: cx, y: cy };
}

/** Sum of held directions (degrees) as a unit-or-zero vector: 8-way keys. */
export function heldVector(rotations: number[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const rotation of rotations) {
    const vector = FACING_VECTORS[rotation];
    if (vector !== undefined) {
      x += vector[0];
      y += vector[1];
    }
  }
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

// How far behind the newest snapshot students render. Two to three ticks
// at 20Hz hides jitter on classroom Wi-Fi.
export const INTERPOLATION_DELAY_MS = 110;
const MAX_SNAPSHOTS = 30;

export interface TimedSnapshot<T> {
  at: number;
  world: T;
}

export interface Sample<T> {
  from: T;
  to: T;
  // 0 → `from`, 1 → `to`.
  alpha: number;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Keeps recent world snapshots with their arrival times and finds the pair
 * to blend for a render time slightly in the past.
 */
export class SnapshotBuffer<T> {
  private snapshots: TimedSnapshot<T>[] = [];

  public push(world: T, at: number): void {
    this.snapshots.push({ world, at });
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
  }

  public clear(): void {
    this.snapshots = [];
  }

  public latest(): T | null {
    return this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1].world
      : null;
  }

  public sample(now: number, delay = INTERPOLATION_DELAY_MS): Sample<T> | null {
    if (this.snapshots.length === 0) {
      return null;
    }
    const renderAt = now - delay;
    const list = this.snapshots;

    // Older than everything we have: hold the oldest
    if (renderAt <= list[0].at) {
      return { from: list[0].world, to: list[0].world, alpha: 0 };
    }

    for (let i = list.length - 1; i > 0; i -= 1) {
      const to = list[i];
      const from = list[i - 1];
      if (renderAt >= from.at && renderAt <= to.at) {
        const span = to.at - from.at;
        return {
          from: from.world,
          to: to.world,
          alpha: span > 0 ? (renderAt - from.at) / span : 1,
        };
      }
    }

    // Newer than the latest (late packet): hold the latest, no guessing
    const last = list[list.length - 1].world;
    return { from: last, to: last, alpha: 1 };
  }
}

// Analog stick travel ignored around center, so worn sticks don't drift.
const STICK_DEAD_ZONE = 0.2;

export interface DriveVector {
  x: number;
  y: number;
}

/**
 * Free-direction drive for the local player (single player only): the
 * mouse/touch drive target, else the first gamepad left stick past the dead
 * zone. Null means "use the keys / D-pad".
 */
class AnalogDrive {
  private pointer: DriveVector | null = null;

  /** Direction toward the mouse/touch drive target, or null when not driving. */
  public setPointer(vector: DriveVector | null): void {
    this.pointer = vector;
  }

  public get(): DriveVector | null {
    if (this.pointer !== null) {
      return this.pointer;
    }
    return this.readStick();
  }

  /** First gamepad left stick past the dead zone, or null. */
  public readStick(): DriveVector | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) {
        continue;
      }
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      if (Math.hypot(x, y) >= STICK_DEAD_ZONE) {
        return { x, y };
      }
    }
    return null;
  }
}

export const analogDrive = new AnalogDrive();

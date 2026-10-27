import type { LivePlayerSummary } from '../live/protocol';

import type { RawControls } from './CoopLocalPlayer';

// Seat id of the host's own tank on the shared battlefield.
export const HOST_PLAYER_ID = 'host-local';

const DIRECTION_KEYS: Record<string, number> = {
  arrowup: 0,
  w: 0,
  arrowright: 90,
  d: 90,
  arrowdown: 180,
  s: 180,
  arrowleft: 270,
  a: 270,
};

function isTypingTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  return (
    node !== null &&
    (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT')
  );
}

/**
 * Keyboard half of the teacher's own tank on the shared battlefield: WASD or
 * arrows to move, Space to fire. CoopLocalPlayer adds the mouse, shells,
 * fuel and upgrades, exactly like a student's device.
 */
export class HostPilot {
  private readonly held: string[] = [];
  private firing = false;
  private fireSeq = 0;
  private takenFireSeq = 0;
  private active = false;

  constructor() {
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.release);
  }

  /** The summary that seats the host like any connected student. */
  public static summary(): LivePlayerSummary {
    return {
      id: HOST_PLAYER_ID,
      nickname: 'Teacher',
      connected: true,
      stats: { cashEarned: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, stage: 1 },
    };
  }

  /** Only steer while a battle is running. */
  public setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.release();
    }
  }

  /** This frame's keyboard state; a fire press is reported once. */
  public takeRaw(): RawControls {
    const last = this.held[this.held.length - 1];
    const pressed = this.fireSeq !== this.takenFireSeq;
    this.takenFireSeq = this.fireSeq;
    return {
      dir: last === undefined ? -1 : DIRECTION_KEYS[last],
      pressed,
      held: this.firing,
    };
  }

  public destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.release);
  }

  private release = (): void => {
    this.held.length = 0;
    this.firing = false;
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.active || isTypingTarget(event.target)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key in DIRECTION_KEYS) {
      event.preventDefault();
      if (!this.held.includes(key)) {
        this.held.push(key);
      }
    } else if (key === ' ') {
      event.preventDefault();
      if (!event.repeat) {
        this.fireSeq += 1;
      }
      this.firing = true;
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    const index = this.held.indexOf(key);
    if (index !== -1) {
      this.held.splice(index, 1);
    }
    if (key === ' ') {
      this.firing = false;
    }
  };
}

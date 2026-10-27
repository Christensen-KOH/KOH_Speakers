import { Subject } from '../core/Subject';
import type { InputManager } from '../input';

// Game speed while an overlay is open: bullet-time in the open field, full
// stop while parked on a pad (the safe zones).
const TIME_SCALE_OPEN = 0.2;
const TIME_SCALE_SAFE_ZONE = 0;

export interface LevelOverlayContext {
  // False while paused, during intro/game over, etc.
  canOpen(): boolean;
  isInSafeZone(playerIndex: number): boolean;
  hasTurret(): boolean;
  playerCount(): number;
}

/**
 * Lets one in-level overlay (question sheet or shop) own the screen at a
 * time. The owner gets the keyboard (game input is suspended) and the level
 * runs slowed down or stopped while anything is open.
 */
export class OverlayGate {
  public readonly attached = new Subject<LevelOverlayContext>();
  public readonly detached = new Subject<void>();
  // Any attach/detach/acquire/release (for UI that follows overlay state).
  public readonly changed = new Subject<void>();
  private readonly inputManager: InputManager;
  private level: LevelOverlayContext = null;
  private owner: string = null;
  // Player using the open overlay (whose safe zone counts).
  private ownerPlayer = 0;

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager;
  }

  public attachLevel(level: LevelOverlayContext): void {
    this.level = level;
    this.attached.notify(level);
    this.changed.notify(null);
  }

  /** Level is ending: overlays force-close and stop taking input. */
  public detachLevel(): void {
    if (this.level === null) {
      return;
    }
    this.detached.notify(null);
    this.level = null;
    this.changed.notify(null);
  }

  public getLevel(): LevelOverlayContext | null {
    return this.level;
  }

  public isFree(): boolean {
    return this.owner === null;
  }

  public isHeldBy(owner: string): boolean {
    return this.owner === owner;
  }

  public canOpen(owner: string): boolean {
    return (
      this.level !== null &&
      (this.owner === null || this.owner === owner) &&
      this.level.canOpen()
    );
  }

  public acquire(owner: string, playerIndex = 0): boolean {
    if (!this.canOpen(owner)) {
      return false;
    }
    if (this.owner === null) {
      this.inputManager.unlisten();
    }
    this.owner = owner;
    this.ownerPlayer = playerIndex;
    this.changed.notify(null);
    return true;
  }

  public getPlayerCount(): number {
    return this.level ? this.level.playerCount() : 1;
  }

  public release(owner: string): void {
    if (this.owner !== owner) {
      return;
    }
    this.owner = null;
    this.inputManager.listen();
    this.changed.notify(null);
  }

  public getTimeScale(): number {
    if (this.owner === null || this.level === null) {
      return 1;
    }
    return this.level.isInSafeZone(this.ownerPlayer)
      ? TIME_SCALE_SAFE_ZONE
      : TIME_SCALE_OPEN;
  }
}

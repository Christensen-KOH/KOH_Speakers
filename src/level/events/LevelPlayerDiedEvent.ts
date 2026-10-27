import { Vector } from '../../core';
import { TankType } from '../../tank';

export interface LevelPlayerDiedEvent {
  type: TankType;
  centerPosition: Vector;
  partyIndex: number;
  // Tank Brawl: rival player who knocked this tank out, if any.
  knockedOutBy?: number | null;
}

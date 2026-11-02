import { Vector } from '../../core';
import { TankType } from '../../tank';

export interface LevelEnemyHitEvent {
  type: TankType;
  centerPosition: Vector;
}

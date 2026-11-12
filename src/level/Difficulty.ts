import { TankType } from '../tank/TankType';
import * as config from '../config';

/**
 * Stage-based difficulty ramp. Everything is derived from the stage number so
 * the solo game and the co-op host stay in step.
 */

const STAGES_PER_STEP = 5;

function step(levelNumber: number): number {
  return Math.floor((Math.max(levelNumber, 1) - 1) / STAGES_PER_STEP);
}

/** Extra enemies on top of the map's authored list: +5 at once, +5 every 5 stages. */
export function getExtraEnemyCount(levelNumber: number): number {
  return Math.min(
    config.ENEMY_EXTRA_PER_STEP * (step(levelNumber) + 1),
    config.ENEMY_EXTRA_MAX_COUNT,
  );
}

/**
 * Lengthens a map's enemy list for the stage by repeating its own tanks, so
 * the mix of tiers (and power-up carriers) stays the way the map was authored.
 */
export function scaleEnemyList(
  baseList: TankType[],
  levelNumber: number,
  // Teacher Studio "enemies per stage" multiplier
  countFactor = 1,
): TankType[] {
  if (baseList.length === 0) {
    return [];
  }

  const rampedCount = baseList.length + getExtraEnemyCount(levelNumber);
  const totalCount = Math.max(1, Math.round(rampedCount * countFactor));
  const list: TankType[] = [];
  for (let i = 0; i < totalCount; i += 1) {
    const type = baseList[i % baseList.length];
    list.push(new TankType(type.party, type.tier, type.hasDrop, type.variant));
  }
  return list;
}

/** Enemies per wave: 5 early on, 10 from stage 11. */
export function getWaveSize(levelNumber: number): number {
  return levelNumber > 10 ? config.WAVE_SIZE * 2 : config.WAVE_SIZE;
}

/** Enemies allowed on the field at once: +1 every 10 stages, up to +4. */
export function getMaxAliveCount(
  levelNumber: number,
  isMultiplayer: boolean,
): number {
  const base = isMultiplayer
    ? config.ENEMY_MAX_ALIVE_COUNT_MULTIPLAYER
    : config.ENEMY_MAX_ALIVE_COUNT;
  return base + Math.min(Math.floor((Math.max(levelNumber, 1) - 1) / 10), 4);
}

/** Seconds between enemy spawns: 3 s on stage 1 down to 1.2 s. */
export function getEnemySpawnDelay(levelNumber: number, gapFactor = 1): number {
  const delay = config.ENEMY_SPAWN_DELAY - 0.05 * (Math.max(levelNumber, 1) - 1);
  return Math.max(delay, config.ENEMY_MIN_SPAWN_DELAY) * gapFactor;
}

/** Enemy movement speed multiplier: creeps up to +20% by stage 41. */
export function getEnemySpeedFactor(levelNumber: number): number {
  return 1 + Math.min(0.005 * (Math.max(levelNumber, 1) - 1), 0.2);
}

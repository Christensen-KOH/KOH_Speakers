import { TankTier } from '../tank/TankTier';
import { TankType } from '../tank/TankType';
import { TankVariant } from '../tank/TankVariant';
import * as config from '../config';

/**
 * Stage-based difficulty ramp. Everything is derived from the stage number so
 * the solo game and the co-op host stay in step, and every value moves a
 * little on every single stage from stage 1 to the final stage (70): army
 * size, field cap, spawn pace, speed, shells, fire rate and how hard the AI
 * hunts players and the Eagle.
 */

/** 0 on stage 1, 1 on the final stage (clamped). */
export function getStageProgress(levelNumber: number): number {
  const stage = Math.max(levelNumber, 1);
  return Math.min(1, (stage - 1) / (config.DIFFICULTY_FINAL_STAGE - 1));
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Stage army size before Teacher Studio scaling: 22 → 55 (stage 35) → 90
 * (stage 70), roughly +1 every stage, never capped early.
 */
export function getStageEnemyCount(levelNumber: number): number {
  const stage = Math.max(levelNumber, 1);
  const mid = config.ENEMY_COUNT_MID_STAGE_NUMBER;
  if (stage <= mid) {
    return Math.round(
      lerp(config.ENEMY_COUNT_FIRST_STAGE, config.ENEMY_COUNT_MID_STAGE, (stage - 1) / (mid - 1)),
    );
  }
  const t = Math.min(1, (stage - mid) / (config.DIFFICULTY_FINAL_STAGE - mid));
  return Math.round(lerp(config.ENEMY_COUNT_MID_STAGE, config.ENEMY_COUNT_FINAL_STAGE, t));
}

// Deterministic 0..1 noise per (stage, index), so a stage always has the
// same army mix.
function noise(levelNumber: number, index: number): number {
  const x = Math.sin(levelNumber * 127.1 + index * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Late stages field more fast (B), power (C) and armoured (D) tanks: from
 * none promoted on stage 1 to ~60% of regular tanks on stage 70, leaning
 * towards armour at the end.
 */
function promoteTier(type: TankType, levelNumber: number, index: number): TankTier {
  if (type.variant !== TankVariant.Normal || type.tier === TankTier.D) {
    return type.tier;
  }
  const t = getStageProgress(levelNumber);
  if (noise(levelNumber, index) >= 0.6 * t) {
    return type.tier;
  }
  const pick = noise(levelNumber + 1000, index);
  const armorShare = 0.25 + 0.2 * t;
  if (pick < armorShare) {
    return TankTier.D;
  }
  if (pick < armorShare + 0.4) {
    return TankTier.B;
  }
  return TankTier.C;
}

/**
 * Builds the stage's enemy list from a map's authored list: lengthened to
 * the stage army size by repeating the map's own tanks (keeping power-up
 * carriers), with tiers promoted more often the later the stage.
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

  const rampedCount = Math.max(baseList.length, getStageEnemyCount(levelNumber));
  const totalCount = Math.max(1, Math.round(rampedCount * countFactor));
  const list: TankType[] = [];
  for (let i = 0; i < totalCount; i += 1) {
    const type = baseList[i % baseList.length];
    const tier = promoteTier(type, levelNumber, i);
    list.push(new TankType(type.party, tier, type.hasDrop, type.variant));
  }
  return list;
}

/** Enemies per wave: 5 → 10 (stage 11) → 12 (stage 36) → 15 (stage 60). */
export function getWaveSize(levelNumber: number): number {
  if (levelNumber >= 60) {
    return 15;
  }
  if (levelNumber > 35) {
    return 12;
  }
  return levelNumber > 10 ? config.WAVE_SIZE * 2 : config.WAVE_SIZE;
}

/**
 * Enemies allowed on the field at once, rising steadily: solo 4 → 11,
 * co-op 6 → 12 (10+ from about stage 60).
 */
export function getMaxAliveCount(
  levelNumber: number,
  isMultiplayer: boolean,
): number {
  const t = getStageProgress(levelNumber);
  const [from, to] = isMultiplayer
    ? [config.ENEMY_MAX_ALIVE_COUNT_MULTIPLAYER, config.ENEMY_MAX_ALIVE_FINAL_MULTIPLAYER]
    : [config.ENEMY_MAX_ALIVE_COUNT, config.ENEMY_MAX_ALIVE_FINAL];
  return Math.round(lerp(from, to, t));
}

/** Seconds between enemy spawns: 3 s on stage 1 down to 0.85 s on stage 70. */
export function getEnemySpawnDelay(levelNumber: number, gapFactor = 1): number {
  const t = getStageProgress(levelNumber);
  return lerp(config.ENEMY_SPAWN_DELAY, config.ENEMY_MIN_SPAWN_DELAY, t) * gapFactor;
}

/** Enemy movement speed multiplier: 1× on stage 1 to 1.35× on stage 70. */
export function getEnemySpeedFactor(levelNumber: number): number {
  return lerp(1, 1.35, getStageProgress(levelNumber));
}

/** Enemy shell speed multiplier: 1× on stage 1 to 1.4× on stage 70. */
export function getEnemyBulletSpeedFactor(levelNumber: number): number {
  return lerp(1, 1.4, getStageProgress(levelNumber));
}

/** Shells an enemy may have in flight: a second one from stage ~49. */
export function getEnemyBulletMaxCount(levelNumber: number, base: number): number {
  return getStageProgress(levelNumber) >= 0.7 ? Math.max(base, 2) : base;
}

/** How hard the enemy AI hunts (see AiTankBehavior). */
export interface AiAggression {
  // Seconds between shot attempts are random in [0, fireMaxDelay].
  fireMaxDelay: number;
  // % chance, on each turn, to head for the target (nearby player or Eagle).
  targetChance: number;
  // Same, when far from the target (open arena).
  targetFarChance: number;
  // A player within this many px becomes the target instead of the Eagle.
  chaseRadius: number;
  // % chance to fire when blocked (shoots through walls toward the target).
  stuckFireChance: number;
  // % chance per tile to re-think the route while driving (flanking).
  rethinkChance: number;
}

export const BASE_AGGRESSION: AiAggression = {
  fireMaxDelay: 1.5,
  targetChance: 30,
  targetFarChance: 55,
  chaseRadius: config.TILE_SIZE_LARGE * 6,
  stuckFireChance: 30,
  rethinkChance: 5,
};

/** Stage 1 plays like the classic AI; stage 70 is relentless. */
export function getEnemyAggression(levelNumber: number): AiAggression {
  const t = getStageProgress(levelNumber);
  return {
    fireMaxDelay: lerp(BASE_AGGRESSION.fireMaxDelay, 0.55, t),
    targetChance: Math.round(lerp(BASE_AGGRESSION.targetChance, 65, t)),
    targetFarChance: Math.round(lerp(BASE_AGGRESSION.targetFarChance, 85, t)),
    chaseRadius: lerp(BASE_AGGRESSION.chaseRadius, config.TILE_SIZE_LARGE * 10, t),
    stuckFireChance: Math.round(lerp(BASE_AGGRESSION.stuckFireChance, 60, t)),
    rethinkChance: Math.round(lerp(BASE_AGGRESSION.rethinkChance, 10, t)),
  };
}

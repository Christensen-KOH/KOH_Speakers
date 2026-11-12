import { CLASSIC_BALANCE, GameBalance } from '../match/GameBalance';

const STORAGE_KEY = 'tankkit.studioSettings';

export type EnemySpeed = 'slow' | 'normal' | 'fast';

export const HP_OPTIONS = [5, 10, 20];
export const ENEMY_SPEED_FACTORS: Record<EnemySpeed, number> = {
  slow: 0.7,
  normal: 1,
  fast: 1.4,
};
// The pace knob moves enemy speed and the gap between spawns together
export const SPAWN_GAP_FACTORS: Record<EnemySpeed, number> = {
  slow: 1.4,
  normal: 1,
  fast: 0.7,
};
export const ENEMY_COUNT_OPTIONS = [0.5, 1, 1.5, 2];
export const MAX_START_STAGE = 999;
export const REWARD_MULTIPLIER_OPTIONS = [0.5, 1, 1.5, 2, 3];

/** Default classroom rules, saved on the teacher's device. */
export interface StudioSettings {
  // Stage a game begins on (clamped to the number of stages when used)
  startStage: number;
  enemyCountMultiplier: number;
  startingHp: number;
  enemySpeed: EnemySpeed;
  waveGraceSeconds: number;
  startShells: number;
  startCash: number;
  rewardMultiplier: number;
  movementCostsFuel: boolean;
}

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  startStage: 1,
  enemyCountMultiplier: 1,
  startingHp: 5,
  enemySpeed: 'normal',
  waveGraceSeconds: 4,
  startShells: 10,
  startCash: 0,
  rewardMultiplier: 1,
  movementCostsFuel: true,
};

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export function sanitizeStudioSettings(raw: unknown): StudioSettings {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_STUDIO_SETTINGS;
  return {
    startStage: Math.round(num(data.startStage, 1, MAX_START_STAGE, d.startStage)),
    enemyCountMultiplier: ENEMY_COUNT_OPTIONS.includes(data.enemyCountMultiplier as number)
      ? (data.enemyCountMultiplier as number)
      : d.enemyCountMultiplier,
    startingHp: HP_OPTIONS.includes(data.startingHp as number)
      ? (data.startingHp as number)
      : d.startingHp,
    enemySpeed: data.enemySpeed === 'slow' || data.enemySpeed === 'fast' ? data.enemySpeed : 'normal',
    waveGraceSeconds: Math.round(num(data.waveGraceSeconds, 0, 30, d.waveGraceSeconds)),
    startShells: Math.round(num(data.startShells, 0, 99, d.startShells)),
    startCash: Math.round(num(data.startCash, 0, 9999, d.startCash)),
    rewardMultiplier: num(data.rewardMultiplier, 0.5, 5, d.rewardMultiplier),
    movementCostsFuel:
      typeof data.movementCostsFuel === 'boolean' ? data.movementCostsFuel : d.movementCostsFuel,
  };
}

export function loadStudioSettings(): StudioSettings {
  try {
    const json = window.localStorage.getItem(STORAGE_KEY);
    return sanitizeStudioSettings(json ? JSON.parse(json) : null);
  } catch {
    return { ...DEFAULT_STUDIO_SETTINGS };
  }
}

export function saveStudioSettings(settings: StudioSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not persisted; this session still uses them
  }
}

export function toGameBalance(settings: StudioSettings): GameBalance {
  return {
    startingHp: settings.startingHp,
    enemySpeedFactor: ENEMY_SPEED_FACTORS[settings.enemySpeed],
    waveGraceSeconds: settings.waveGraceSeconds,
    enemyCountFactor: settings.enemyCountMultiplier,
    spawnGapFactor: SPAWN_GAP_FACTORS[settings.enemySpeed],
  };
}

/**
 * Solo games keep the classic tank HP and wave rest; only the difficulty
 * knobs (enemy count, speed and spawn gap) carry over from the studio.
 */
export function toSoloBalance(settings: StudioSettings): GameBalance {
  return {
    ...CLASSIC_BALANCE,
    enemySpeedFactor: ENEMY_SPEED_FACTORS[settings.enemySpeed],
    enemyCountFactor: settings.enemyCountMultiplier,
    spawnGapFactor: SPAWN_GAP_FACTORS[settings.enemySpeed],
  };
}

export function clampStartStage(settings: StudioSettings, stageCount: number): number {
  return Math.min(Math.max(settings.startStage, 1), Math.max(stageCount, 1));
}

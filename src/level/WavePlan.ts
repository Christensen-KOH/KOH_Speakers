import { TankParty } from '../tank/TankParty';
import { TankType } from '../tank/TankType';
import { TankVariant } from '../tank/TankVariant';
import * as config from '../config';

export interface WavePlan {
  list: TankType[];
  // Exclusive end index into `list` for each wave.
  waveEnds: number[];
}

// Where gold tanks replace regular enemies, as a fraction of the list.
export const DEFAULT_GOLD_SLOTS = [0.3, 0.65];
// Tycoon Blitz is about cash: many more high-value targets.
export const BLITZ_GOLD_SLOTS = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85];

function copyType(type: TankType): TankType {
  return new TankType(type.party, type.tier, type.hasDrop, type.variant);
}

/**
 * Turns a map's flat enemy list into Base Defense waves: swaps a couple of
 * regular tanks for Gold Tanks, makes the last tank a Boss on every
 * BOSS_LEVEL_INTERVAL-th level, and splits the list into waves of WAVE_SIZE.
 * The total enemy count is unchanged, so the side-panel counter still fits.
 */
export function buildWavePlan(
  baseList: TankType[],
  levelNumber: number,
  goldSlots: number[] = DEFAULT_GOLD_SLOTS,
): WavePlan {
  const list = baseList.map(copyType);
  const count = list.length;

  goldSlots.forEach((fraction) => {
    // Skip tanks carrying a power-up so drops are never lost.
    for (let index = Math.floor(count * fraction); index < count; index += 1) {
      const type = list[index];
      if (!type.hasDrop && !type.isSpecial()) {
        list[index] = TankType.EnemyGold();
        break;
      }
    }
  });

  if (count > 0 && levelNumber % config.BOSS_LEVEL_INTERVAL === 0) {
    list[count - 1] = TankType.EnemyBoss();
  }

  const waveEnds: number[] = [];
  for (let end = config.WAVE_SIZE; end < count; end += config.WAVE_SIZE) {
    waveEnds.push(end);
  }
  waveEnds.push(count);

  return { list, waveEnds };
}

export function waveHasBoss(plan: WavePlan, waveIndex: number): boolean {
  const start = waveIndex === 0 ? 0 : plan.waveEnds[waveIndex - 1];
  return plan.list
    .slice(start, plan.waveEnds[waveIndex])
    .some(
      (type) =>
        type.party === TankParty.Enemy && type.variant === TankVariant.Boss,
    );
}

import { describe, expect, it } from 'vitest';

import { TankType } from '../tank/TankType';
import { TankVariant } from '../tank/TankVariant';

import { buildWavePlan, waveHasBoss } from './WavePlan';

function classicList(): TankType[] {
  return Array.from({ length: 20 }, (_, index) =>
    TankType.EnemyA().setHasDrop(index === 6),
  );
}

describe('buildWavePlan', () => {
  it('splits 20 enemies into 4 waves of 5', () => {
    expect(buildWavePlan(classicList(), 1).waveEnds).toEqual([5, 10, 15, 20]);
  });

  it('keeps the enemy count and adds two gold tanks', () => {
    const { list } = buildWavePlan(classicList(), 1);
    expect(list).toHaveLength(20);
    expect(list.filter((type) => type.variant === TankVariant.Gold)).toHaveLength(2);
  });

  it('never replaces a tank that carries a power-up', () => {
    const { list } = buildWavePlan(classicList(), 1);
    expect(list[6].hasDrop).toBe(true);
    expect(list[6].variant).toBe(TankVariant.Normal);
  });

  it('puts a boss in the final wave every 5th level only', () => {
    const level4 = buildWavePlan(classicList(), 4);
    const level5 = buildWavePlan(classicList(), 5);
    expect(level4.list[19].variant).toBe(TankVariant.Normal);
    expect(level5.list[19].variant).toBe(TankVariant.Boss);
    expect(waveHasBoss(level5, 3)).toBe(true);
    expect(waveHasBoss(level5, 2)).toBe(false);
  });

  it('does not mutate the map list', () => {
    const base = classicList();
    buildWavePlan(base, 5);
    expect(base.every((type) => type.variant === TankVariant.Normal)).toBe(true);
  });

  it('handles an empty list', () => {
    expect(buildWavePlan([], 5)).toEqual({ list: [], waveEnds: [0] });
  });
});

describe('Tycoon Blitz waves', () => {
  it('swaps in six gold tanks', async () => {
    const { BLITZ_GOLD_SLOTS } = await import('./WavePlan');
    const { list } = buildWavePlan(classicList(), 1, BLITZ_GOLD_SLOTS);
    expect(list.filter((type) => type.variant === TankVariant.Gold)).toHaveLength(6);
  });
});

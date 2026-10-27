import { describe, expect, it } from 'vitest';

import { EconomySession } from './EconomySession';
import { DEFAULT_ECONOMY_SETTINGS, RewardLevel } from './EconomySettings';
import { getPayout } from './PayoutTable';

function createPlayer(overrides = {}) {
  const session = new EconomySession(1);
  session.start({ ...DEFAULT_ECONOMY_SETTINGS, ...overrides }, 1);
  return session.getPlayer(0);
}

describe('PayoutTable', () => {
  it('pays $10 + 3 shells at streak level 1', () => {
    expect(getPayout(0, RewardLevel.Balanced)).toMatchObject({
      cash: 10,
      shells: 3,
    });
  });

  it('pays $100 + 10 shells at streak level 5', () => {
    expect(getPayout(10, RewardLevel.Balanced)).toMatchObject({
      cash: 100,
      shells: 10,
    });
  });

  it('scales cash by income multiplier tier', () => {
    expect(getPayout(0, RewardLevel.Balanced, 3).cash).toBe(40);
  });
});

describe('PlayerEconomy', () => {
  it('starts with 10 shells and spends one per shot', () => {
    const player = createPlayer();
    expect(player.getShells()).toBe(10);
    expect(player.tryFire()).toBe(true);
    expect(player.getShells()).toBe(9);
  });

  it('refuses to fire with no shells', () => {
    const player = createPlayer({ startShells: 0 });
    expect(player.tryFire()).toBe(false);
  });

  it('builds a streak and resets it on a wrong answer', () => {
    const player = createPlayer();
    player.recordAnswer(true);
    player.recordAnswer(true);
    expect(player.getStreak()).toBe(2);
    expect(player.getStreakLevel()).toBe(2);

    player.recordAnswer(false);
    expect(player.getStreak()).toBe(0);
    expect(player.getBestStreak()).toBe(2);
    expect(player.getAccuracy()).toBeCloseTo(2 / 3);
  });

  it('crawls at reduced speed when out of fuel', () => {
    const player = createPlayer({ startFuel: 1, fuelDrainPerSecond: 10 });
    expect(player.consumeMovement(1)).toBe(1);
    expect(player.isOutOfFuel()).toBe(true);
    expect(player.consumeMovement(1)).toBe(0.2);
  });

  it('does not drain fuel when movement is free', () => {
    const player = createPlayer({ movementCostsFuel: false });
    player.consumeMovement(100);
    expect(player.getFuel()).toBe(100);
  });
});

describe('EconomySession', () => {
  it('shares one cash account between co-op players when enabled', () => {
    const session = new EconomySession();
    session.start({ ...DEFAULT_ECONOMY_SETTINGS, sharedCash: true });
    session.getPlayer(0).recordAnswer(true);
    expect(session.getPlayer(1).cash.getBalance()).toBe(10);
  });
});

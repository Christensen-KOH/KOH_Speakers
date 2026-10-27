import { RewardLevel } from './EconomySettings';

export interface Payout {
  cash: number;
  shells: number;
  fuel: number;
}

// Streak level N is reached once the streak count hits STREAK_THRESHOLDS[N-1].
const STREAK_THRESHOLDS = [0, 2, 4, 7, 10];

// Base payouts per streak level (1..5).
const STREAK_PAYOUTS: Payout[] = [
  { cash: 10, shells: 3, fuel: 20 },
  { cash: 25, shells: 4, fuel: 22 },
  { cash: 45, shells: 6, fuel: 25 },
  { cash: 70, shells: 8, fuel: 28 },
  { cash: 100, shells: 10, fuel: 30 },
];

// Host "Reward per Question" slider scales ammo and fuel, not cash.
const REWARD_LEVEL_FACTORS: Record<RewardLevel, number> = {
  [RewardLevel.Low]: 0.6,
  [RewardLevel.Balanced]: 1,
  [RewardLevel.High]: 1.6,
};

// Cash multiplier per purchased "Question Multiplier" upgrade tier (0..3).
export const INCOME_MULTIPLIER_TIERS = [1, 1.5, 2.5, 4];

export const MAX_STREAK_LEVEL = STREAK_THRESHOLDS.length;

export function getStreakLevel(streak: number): number {
  let level = 1;
  STREAK_THRESHOLDS.forEach((threshold, index) => {
    if (streak >= threshold) {
      level = index + 1;
    }
  });
  return level;
}

/**
 * Reward for a correct answer, given the streak count *before* this answer.
 */
export function getPayout(
  streak: number,
  rewardLevel: RewardLevel,
  incomeTier = 0,
  multiplier = 1,
): Payout {
  const base = STREAK_PAYOUTS[getStreakLevel(streak) - 1];
  const rewardFactor = REWARD_LEVEL_FACTORS[rewardLevel];
  const tier = Math.max(
    0,
    Math.min(incomeTier, INCOME_MULTIPLIER_TIERS.length - 1),
  );
  const incomeFactor = INCOME_MULTIPLIER_TIERS[tier];

  return {
    cash: Math.round(base.cash * incomeFactor * multiplier),
    shells: Math.max(1, Math.round(base.shells * rewardFactor * multiplier)),
    fuel: Math.round(base.fuel * rewardFactor * multiplier),
  };
}

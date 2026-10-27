export enum RewardLevel {
  Low = 'low',
  Balanced = 'balanced',
  High = 'high',
}

/**
 * Host-controlled balance knobs, picked on the Host Options screen before a
 * match starts.
 */
export interface EconomySettings {
  rewardLevel: RewardLevel;
  // When off, driving is free; only shooting and upgrades need answers.
  movementCostsFuel: boolean;
  // Co-op: both players spend from one cash account.
  sharedCash: boolean;
  maxFuel: number;
  startFuel: number;
  startShells: number;
  startCash: number;
  // Teacher Studio: scales every correct-answer reward (1 = as designed).
  rewardMultiplier: number;
  // Fuel drained per second while the tank is moving.
  fuelDrainPerSecond: number;
  // Speed multiplier applied when the tank runs out of fuel.
  emptyFuelSpeedFactor: number;
  // Seconds the question modal locks after a wrong answer (review time).
  wrongAnswerCooldown: number;
}

export const DEFAULT_ECONOMY_SETTINGS: EconomySettings = {
  rewardLevel: RewardLevel.Balanced,
  movementCostsFuel: true,
  sharedCash: false,
  maxFuel: 100,
  startFuel: 100,
  startShells: 10,
  startCash: 0,
  rewardMultiplier: 1,
  fuelDrainPerSecond: 2.5,
  emptyFuelSpeedFactor: 0.2,
  wrongAnswerCooldown: 2,
};

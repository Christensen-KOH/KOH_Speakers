/**
 * Battlefield balance chosen in the Teacher Studio. It only applies on the
 * teacher's host (enemies and tanks live there); everything stays classic
 * until a live battle sets it.
 */
export interface GameBalance {
  // Hit points of each player tank (classic = 1).
  startingHp: number;
  // Multiplier on enemy tank movement speed.
  enemySpeedFactor: number;
  // Seconds of rest between enemy waves.
  waveGraceSeconds: number;
}

export const CLASSIC_BALANCE: GameBalance = {
  startingHp: 1,
  enemySpeedFactor: 1,
  waveGraceSeconds: 4,
};

export const gameBalance: GameBalance = { ...CLASSIC_BALANCE };

export function setGameBalance(balance: GameBalance): void {
  Object.assign(gameBalance, balance);
}

export function resetGameBalance(): void {
  Object.assign(gameBalance, CLASSIC_BALANCE);
}

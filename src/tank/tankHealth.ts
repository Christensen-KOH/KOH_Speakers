// Gimkit Snowbrawl health model for player tanks: 100 HP plus up to 50
// Shield, which soaks damage first.
export const PLAYER_MAX_HP = 100;
export const PLAYER_MAX_SHIELD = 50;
// HP removed per point of shell damage (a regular enemy shell deals 1).
export const HP_PER_SHELL_DAMAGE = 25;

export interface TankHealth {
  hp: number;
  shield: number;
}

/** Shield absorbs the hit first; whatever is left comes off HP. */
export function applyDamage(health: TankHealth, amount: number): TankHealth {
  const absorbed = Math.min(health.shield, amount);
  return {
    shield: health.shield - absorbed,
    hp: Math.max(0, health.hp - (amount - absorbed)),
  };
}

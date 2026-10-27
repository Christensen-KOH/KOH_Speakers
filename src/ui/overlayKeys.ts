// Per-player keys for the in-level overlays (index = player index).
// Two players share the keyboard: by default P1 drives with WASD + F (left
// hand, so Q/B) and P2 with the arrows + K (right hand, so P/M).
const QUESTION_KEYS = [['q', 'tab'], ['p']];
const SHOP_KEYS = [['b'], ['m']];

export const QUESTION_KEY_LABELS = ['Q', 'P'];
export const SHOP_KEY_LABELS = ['B', 'M'];

function findPlayer(
  map: string[][],
  key: string,
  playerCount: number,
): number | null {
  const normalized = key.toLowerCase();
  for (let index = 0; index < Math.min(playerCount, map.length); index += 1) {
    if (map[index].includes(normalized)) {
      return index;
    }
  }
  return null;
}

/** Player whose "open questions" key this is, or null. */
export function questionKeyPlayer(
  key: string,
  playerCount: number,
): number | null {
  // Single player: E works too (next to WASD)
  if (playerCount === 1 && key.toLowerCase() === 'e') {
    return 0;
  }
  return findPlayer(QUESTION_KEYS, key, playerCount);
}

/** Player whose "open shop" key this is, or null. */
export function shopKeyPlayer(key: string, playerCount: number): number | null {
  return findPlayer(SHOP_KEYS, key, playerCount);
}

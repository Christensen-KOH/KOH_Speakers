import { QUESTION_KEY_LABELS } from './overlayKeys';
import { isTouchUi } from './touchUi';

export type EmptyResource = 'shells' | 'fuel';

/**
 * Non-blocking "out of shells / fuel" message. Running dry never opens the
 * question sheet by itself: the player chooses when to answer.
 */
export function outOfResourceText(
  resource: EmptyResource,
  playerIndex = 0,
  playerCount = 1,
): string {
  const what = resource === 'shells' ? 'Out of Shells!' : 'Out of Fuel!';
  const who = playerCount > 1 ? `P${playerIndex + 1}: ` : '';
  const how =
    isTouchUi() && playerCount === 1
      ? 'Tap [⚡ Answer Questions] to reload'
      : `Press ${QUESTION_KEY_LABELS[playerIndex] ?? 'Q'} or ⚡ Hub to reload`;
  return `${who}${what} ${how}`;
}

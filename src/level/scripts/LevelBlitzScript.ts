import { GameUpdateArgs } from '../../game';

import { LevelScript } from '../LevelScript';

/**
 * Tycoon Blitz clock. Runs on real frame time, so answering questions in
 * bullet-time doesn't stretch the match; stops while the game is paused.
 */
export class LevelBlitzScript extends LevelScript {
  protected update({ deltaTime, match, realDeltaTime }: GameUpdateArgs): void {
    if (match.tickBlitz(realDeltaTime ?? deltaTime)) {
      this.eventBus.matchTimeUp.notify(null);
    }
  }
}

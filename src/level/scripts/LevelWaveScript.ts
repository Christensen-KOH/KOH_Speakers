import { Timer } from '../../core';
import { GameUpdateArgs } from '../../game';
import { SpriteText } from '../../gameObjects';
import * as config from '../../config';

import { LevelScript } from '../LevelScript';
import { LevelWaveStartedEvent } from '../events';

const BANNER_DURATION = 2.4;
const BLINK_DELAY = 0.2;
const CHAR_WIDTH = 28;
const CHAR_SPACING = 4;

/** Blinking "WAVE 2/4" / "BOSS WAVE" banner across the middle of the field. */
export class LevelWaveScript extends LevelScript {
  private banner: SpriteText = null;
  private bannerTimer = new Timer();
  private blinkTimer = new Timer();

  protected setup(): void {
    this.eventBus.waveStarted.addListener(this.handleWaveStarted);

    this.bannerTimer.done.addListener(this.removeBanner);
    this.blinkTimer.done.addListener(() => {
      if (this.banner === null) {
        return;
      }
      this.banner.setVisible(!this.banner.getVisible());
      this.banner.dirtyPaintBox();
      this.banner.setNeedsPaint();
      this.blinkTimer.reset(BLINK_DELAY);
    });
  }

  protected update({ deltaTime }: GameUpdateArgs): void {
    this.bannerTimer.update(deltaTime);
    this.blinkTimer.update(deltaTime);
  }

  private handleWaveStarted = (event: LevelWaveStartedEvent): void => {
    this.removeBanner();

    const text = event.hasBoss
      ? 'BOSS WAVE'
      : `WAVE ${event.waveNumber}/${event.totalWaves}`;
    const color = event.hasBoss ? config.COLOR_RED : config.COLOR_YELLOW;

    this.banner = new SpriteText(text, { color });
    this.banner.setZIndex(config.PAUSE_NOTICE_Z_INDEX);

    const width = text.length * (CHAR_WIDTH + CHAR_SPACING) - CHAR_SPACING;
    this.banner.position.set(
      Math.round((config.FIELD_SIZE - width) / 2),
      Math.round((config.FIELD_SIZE - CHAR_WIDTH) / 2),
    );
    this.world.field.add(this.banner);

    this.bannerTimer.reset(BANNER_DURATION);
    this.blinkTimer.reset(BLINK_DELAY);
  };

  private removeBanner = (): void => {
    if (this.banner === null) {
      return;
    }
    this.banner.dirtyPaintBox();
    this.banner.removeSelf();
    this.banner = null;
    this.bannerTimer.stop();
    this.blinkTimer.stop();
  };
}

import { Vector } from '../../core';
import { ParticleBurst, ParticleBurstOptions, ScreenShake } from '../../entities/fx';
import { GameUpdateArgs } from '../../game';
import { TankVariant } from '../../tank';
import * as config from '../../config';

import { LevelScript } from '../LevelScript';
import {
  LevelEnemyDiedEvent,
  LevelEnemyHitEvent,
  LevelPlayerDiedEvent,
} from '../events';

const ENEMY_BURSTS: Record<TankVariant, ParticleBurstOptions> = {
  [TankVariant.Normal]: {
    count: 22,
    colors: ['#ffffff', '#ffd84d', '#ff9f43', '#d74000'],
    speed: 260,
    life: 0.55,
  },
  [TankVariant.Gold]: {
    count: 34,
    colors: ['#ffffff', '#ffe27a', '#ffcf3d', '#ffb800'],
    speed: 320,
    life: 0.7,
  },
  [TankVariant.Boss]: {
    count: 60,
    colors: ['#ffffff', '#ff6b3d', '#eb3048', '#7a1020'],
    speed: 380,
    life: 0.9,
    size: 8,
  },
};

const ENEMY_SHAKES: Record<TankVariant, [number, number]> = {
  [TankVariant.Normal]: [4, 0.2],
  [TankVariant.Gold]: [6, 0.3],
  [TankVariant.Boss]: [16, 0.7],
};

const PLAYER_BURST: ParticleBurstOptions = {
  count: 30,
  colors: ['#ffffff', '#ffd84d', '#4dd4ff'],
  speed: 280,
  life: 0.6,
};

const BASE_BURST: ParticleBurstOptions = {
  count: 70,
  colors: ['#ffffff', '#ff6b3d', '#d74000', '#636363'],
  speed: 360,
  life: 1,
  size: 8,
};

/** Screen shake and particle sprays for kills, deaths and boss hits. */
export class LevelFxScript extends LevelScript {
  private screenShake: ScreenShake;

  protected setup({ screenShake }: GameUpdateArgs): void {
    this.screenShake = screenShake;

    this.eventBus.enemyDied.addListener(this.handleEnemyDied);
    this.eventBus.enemyHit.addListener(this.handleEnemyHit);
    this.eventBus.playerDied.addListener(this.handlePlayerDied);
    this.eventBus.baseDied.addListener(this.handleBaseDied);
  }

  private burst(center: Vector, options: ParticleBurstOptions): void {
    this.world.field.add(new ParticleBurst(center, options));
  }

  private handleEnemyDied = (event: LevelEnemyDiedEvent): void => {
    const { variant } = event.type;
    this.burst(event.centerPosition, ENEMY_BURSTS[variant]);
    this.screenShake.shake(...ENEMY_SHAKES[variant]);
  };

  private handleEnemyHit = (event: LevelEnemyHitEvent): void => {
    if (event.type.variant === TankVariant.Boss) {
      this.screenShake.shake(3, 0.12);
    }
  };

  private handlePlayerDied = (event: LevelPlayerDiedEvent): void => {
    this.burst(event.centerPosition, PLAYER_BURST);
    this.screenShake.shake(8, 0.35);
  };

  private handleBaseDied = (): void => {
    const { x, y } = config.BASE_DEFAULT_POSITION;
    const { width } = config.BASE_DEFAULT_SIZE;
    this.burst(new Vector(x + width / 2, y + 64), BASE_BURST);
    this.screenShake.shake(18, 0.9);
  };
}

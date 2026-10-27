import { Timer, Vector } from '../../core';
import { GameUpdateArgs, Rotation } from '../../game';
import { EnemyTank } from '../../gameObjects';
import { gameBalance } from '../../match/GameBalance';
import { PowerupType } from '../../powerup';
import { TankDeathReason, TankFactory, TankParty, TankType } from '../../tank';
import * as config from '../../config';

import { LevelScript } from '../LevelScript';
import {
  BLITZ_GOLD_SLOTS,
  buildWavePlan,
  DEFAULT_GOLD_SLOTS,
  WavePlan,
  waveHasBoss,
} from '../WavePlan';
import {
  LevelEnemySpawnCompletedEvent,
  LevelPowerupPickedEvent,
} from '../events';

export class LevelEnemyScript extends LevelScript {
  private list: TankType[] = [];
  private listIndex = 0;
  private aliveTanks: EnemyTank[] = [];
  private positions: Vector[] = [];
  private positionIndex = 0;
  private spawnTimer = new Timer();
  private freezeTimer = new Timer();
  private spawningCount = 0;
  private wavePlan: WavePlan;
  private waveIndex = 0;
  private announcedWaveIndex = -1;
  private waveBreakTimer = new Timer();

  protected setup({ match }: GameUpdateArgs): void {
    this.eventBus.enemySpawnCompleted.addListener(this.handleSpawnCompleted);
    this.eventBus.powerupPicked.addListener(this.handlePowerupPicked);

    this.wavePlan = buildWavePlan(
      this.mapConfig.getEnemySpawnList(),
      this.session.getLevelNumber(),
      match.isBlitz() ? BLITZ_GOLD_SLOTS : DEFAULT_GOLD_SLOTS,
    );
    this.list = this.wavePlan.list;

    this.positions = this.mapConfig.getEnemySpawnPositions();

    this.spawnTimer.reset(config.ENEMY_FIRST_SPAWN_DELAY);
    this.spawnTimer.done.addListener(this.handleSpawnTimer);

    this.freezeTimer.done.addListener(this.handleFreezeTimer);

    this.waveBreakTimer.done.addListener(() => {
      this.spawnTimer.reset(config.ENEMY_FIRST_SPAWN_DELAY);
    });
  }

  /** Spawns an enemy outside the wave list (debug tools, gadgets). */
  public spawnExtra(type: TankType): void {
    const position = this.positions[this.positionIndex];
    this.positionIndex = (this.positionIndex + 1) % this.positions.length;

    this.spawningCount += 1;
    this.eventBus.enemySpawnRequested.notify({
      type,
      position,
      partyIndex: this.list.length + this.spawningCount + this.aliveTanks.length,
      unspawnedCount: this.getUnspawnedCount(),
    });
  }

  protected update({ deltaTime }: GameUpdateArgs): void {
    this.spawnTimer.update(deltaTime);
    this.freezeTimer.update(deltaTime);
    this.waveBreakTimer.update(deltaTime);
  }

  private handleSpawnTimer = (): void => {
    // Happens after max enemies spawn
    if (this.aliveTanks.length >= this.getMaxAliveCount()) {
      this.spawnTimer.stop();
      return;
    }

    // No more tanks to spawn
    if (this.listIndex >= this.list.length) {
      this.spawnTimer.stop();
      return;
    }

    // Current wave fully spawned, or resting between waves: the next wave
    // starts once the field is cleared (see handleWaveCleared)
    if (
      this.waveBreakTimer.isActive() ||
      this.listIndex >= this.getCurrentWaveEnd()
    ) {
      this.spawnTimer.stop();
      return;
    }

    this.announceWave();

    this.requestSpawn();

    // Start timer to spawn next enemy
    this.spawnTimer.reset(config.ENEMY_SPAWN_DELAY);
  };

  private handleSpawnCompleted = (
    event: LevelEnemySpawnCompletedEvent,
  ): void => {
    this.spawningCount -= 1;

    const { type } = event;

    if (type.party !== TankParty.Enemy) {
      return;
    }

    const tank = TankFactory.createEnemy(event.partyIndex, type);
    // Teacher Studio: Slow / Normal / Fast enemies
    tank.attributes.moveSpeed = Math.round(
      tank.attributes.moveSpeed * gameBalance.enemySpeedFactor,
    );
    tank.updateMatrix(); // Origin should be in before setting center
    tank.rotate(Rotation.Down);
    tank.setCenter(event.centerPosition);
    tank.updateMatrix();

    if (this.freezeTimer.isActive()) {
      tank.freezeState.set(true);
    }

    tank.hit.addListener(() => {
      this.eventBus.enemyHit.notify({
        type: tank.type,
      });
    });

    tank.died.addListener((deathEvent) => {
      this.eventBus.enemyDied.notify({
        type: tank.type,
        centerPosition: tank.getCenter(),
        reason: deathEvent.reason,
        hitterPartyIndex: deathEvent.hitterPartyIndex,
      });

      tank.removeSelf();

      // Remove from alive
      this.aliveTanks = this.aliveTanks.filter((aliveTank) => {
        return aliveTank !== tank;
      });

      // If timer was stopped because max count of alive enemies has been
      // reached, restart it, because one of alive tanks has just been killed
      if (!this.spawnTimer.isActive() && !this.waveBreakTimer.isActive()) {
        this.spawnTimer.reset(config.ENEMY_SPAWN_DELAY);
      }

      if (this.areAllDead()) {
        this.eventBus.enemyAllDied.notify(null);
      } else {
        this.handleWaveCleared();
      }
    });

    this.aliveTanks.push(tank);

    this.world.field.add(tank);
  };

  /** Freezes every enemy, including ones spawning during it (EMP). */
  public freezeAll(duration: number): void {
    this.freezeTimer.reset(duration);
    this.aliveTanks.forEach((tank) => {
      tank.freezeState.set(true);
    });
  }

  /** Debug: kill every alive enemy as if player 1 shot it. */
  public killAll(): void {
    [...this.aliveTanks].forEach((tank) => {
      tank.discardDrop();
      tank.die(TankDeathReason.Bullet, 0);
    });
  }

  private requestSpawn(): void {
    this.spawningCount += 1;

    const type = this.list[this.listIndex];
    const position = this.positions[this.positionIndex];

    const partyIndex = this.listIndex;

    // Go to next tank
    this.listIndex += 1;

    // Take turns for positions where to spawn tanks
    this.positionIndex += 1;
    if (this.positionIndex >= this.positions.length) {
      this.positionIndex = 0;
    }

    const unspawnedCount = this.getUnspawnedCount();

    this.eventBus.enemySpawnRequested.notify({
      type,
      position,
      partyIndex,
      unspawnedCount,
    });
  }

  private getCurrentWaveEnd(): number {
    return this.wavePlan.waveEnds[this.waveIndex] ?? this.list.length;
  }

  private announceWave(): void {
    if (this.announcedWaveIndex === this.waveIndex) {
      return;
    }
    this.announcedWaveIndex = this.waveIndex;
    this.eventBus.waveStarted.notify({
      waveNumber: this.waveIndex + 1,
      totalWaves: this.wavePlan.waveEnds.length,
      hasBoss: waveHasBoss(this.wavePlan, this.waveIndex),
    });
  }

  private handleWaveCleared(): void {
    const isWaveCleared =
      this.listIndex >= this.getCurrentWaveEnd() &&
      this.aliveTanks.length === 0 &&
      this.spawningCount === 0;
    if (!isWaveCleared || this.waveBreakTimer.isActive()) {
      return;
    }

    this.waveIndex += 1;
    this.spawnTimer.stop();
    this.waveBreakTimer.reset(gameBalance.waveGraceSeconds);
    this.announceWave();
  }

  private getUnspawnedCount(): number {
    return this.list.length - this.listIndex;
  }

  private areAllDead(): boolean {
    const spawningCount = this.spawningCount;
    const unspawnedCount = this.getUnspawnedCount();
    const aliveCount = this.aliveTanks.length;

    const areAllDead =
      spawningCount === 0 && unspawnedCount === 0 && aliveCount === 0;

    return areAllDead;
  }

  private handleFreezeTimer = (): void => {
    this.aliveTanks.forEach((tank) => {
      tank.freezeState.set(false);
    });
  };

  private handlePowerupPicked = (event: LevelPowerupPickedEvent): void => {
    const { type: powerupType } = event;

    if (powerupType === PowerupType.Freeze) {
      this.freezeTimer.reset(config.FREEZE_POWERUP_DURATION);

      this.aliveTanks.forEach((tank) => {
        tank.freezeState.set(true);
      });
    }

    if (powerupType === PowerupType.Wipeout) {
      this.aliveTanks.forEach((tank) => {
        // Enemy with drop cant drop it when killed by powerup
        tank.discardDrop();

        // Pass death reason because picking up this powerup does not award
        // per-enemy points. Only powerup pickup points are awarded.
        tank.die(TankDeathReason.WipeoutPowerup);
      });
    }
  };

  private getMaxAliveCount(): number {
    if (this.session.isMultiplayer()) {
      return config.ENEMY_MAX_ALIVE_COUNT_MULTIPLAYER;
    }
    return config.ENEMY_MAX_ALIVE_COUNT;
  }
}

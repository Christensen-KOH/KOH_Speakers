import { Subject } from '../core';

import {
  LevelEnemyDiedEvent,
  LevelEnemyExplodedEvent,
  LevelEnemyHitEvent,
  LevelEnemySpawnCompletedEvent,
  LevelEnemySpawnRequestedEvent,
  LevelMapTileDestroyedEvent,
  LevelPadEvent,
  LevelPlayerDiedEvent,
  LevelPlayerSpawnCompletedEvent,
  LevelPlayerSpawnRequestedEvent,
  LevelPowerupPickedEvent,
  LevelPowerupSpawnedEvent,
  LevelWaveStartedEvent,
} from './events';

export class LevelEventBus {
  public baseDied = new Subject();

  public enemyAllDied = new Subject();
  public enemyDied = new Subject<LevelEnemyDiedEvent>();
  public enemyExploded = new Subject<LevelEnemyExplodedEvent>();
  public enemyHit = new Subject<LevelEnemyHitEvent>();
  public enemySpawnCompleted = new Subject<LevelEnemySpawnCompletedEvent>();
  public enemySpawnRequested = new Subject<LevelEnemySpawnRequestedEvent>();

  public mapTileDestroyed = new Subject<LevelMapTileDestroyedEvent>();

  public levelPaused = new Subject();
  public levelUnpaused = new Subject();
  public levelGameOverMoveBlocked = new Subject();
  public levelGameOverCompleted = new Subject();
  public levelWinCompleted = new Subject();

  public playerDied = new Subject<LevelPlayerDiedEvent>();
  public playerFired = new Subject();
  public playerSlided = new Subject();
  public playerSpawnCompleted = new Subject<LevelPlayerSpawnCompletedEvent>();
  public playerSpawnRequested = new Subject<LevelPlayerSpawnRequestedEvent>();

  public powerupSpawned = new Subject<LevelPowerupSpawnedEvent>();
  public powerupPicked = new Subject<LevelPowerupPickedEvent>();
  public powerupRevoked = new Subject();

  public padEntered = new Subject<LevelPadEvent>();
  public padExited = new Subject<LevelPadEvent>();
  public waveStarted = new Subject<LevelWaveStartedEvent>();
  // Tycoon Blitz clock reached zero.
  public matchTimeUp = new Subject();
}

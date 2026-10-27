import {
  DebugCollisionMenu,
  DebugLevelTankKitMenu,
  DebugTankKitAction,
} from '../../debug';
import { ScreenShake } from '../../entities/fx';
import { withDefaultPads } from '../../entities/pads';
import { GameUpdateArgs, GameState, Rotation, Session } from '../../game';
import type { FieldPoint } from '../../ui';
import { Border, PlayerTank } from '../../gameObjects';
import { InputManager } from '../../input';
import { PowerupType } from '../../powerup';
import { TankDeathReason, TankType } from '../../tank';
import { TerrainFactory } from '../../terrain';

import { MatchOutcome } from '../../match';
import type { OverlayGate } from '../../ui';
import * as config from '../../config';

import { LevelEventBus, LevelScript, LevelWorld } from '../../level';
import {
  LevelEnemyDiedEvent,
  LevelPlayerDiedEvent,
  LevelPowerupPickedEvent,
} from '../../level/events';
import {
  LevelAudioScript,
  LevelBaseScript,
  LevelBlitzScript,
  LevelEconomyScript,
  LevelEnemyScript,
  LevelExplosionScript,
  LevelFxScript,
  LevelGameOverScript,
  LevelInfoScript,
  LevelIntroScript,
  LevelPadScript,
  LevelPauseScript,
  LevelPlayerOverScript,
  LevelPlayerScript,
  LevelPointsScript,
  LevelPowerupScript,
  LevelShopScript,
  LevelSpawnScript,
  LevelTurretScript,
  LevelWaveScript,
  LevelWinScript,
} from '../../level/scripts';

import { GameScene } from '../GameScene';
import { GameSceneType } from '../GameSceneType';

import { LevelPlayLocationParams } from './params';

// Debug menus live in the DOM; keep one across level restarts.
let activeTankKitMenu: DebugLevelTankKitMenu = null;

export class LevelPlayScene extends GameScene<LevelPlayLocationParams> {
  private world: LevelWorld;
  private eventBus: LevelEventBus;
  private session: Session;
  private inputManager: InputManager;
  private debugCollisionMenu: DebugCollisionMenu;
  private overlayGate: OverlayGate;
  private screenShake: ScreenShake;

  private allScripts: LevelScript[] = [];
  private alwaysUpdateScripts: LevelScript[] = [];
  private playingUpdateScripts: LevelScript[] = [];

  private audioScript: LevelAudioScript;
  private baseScript: LevelBaseScript;
  private enemyScript: LevelEnemyScript;
  private explosionScript: LevelExplosionScript;
  private gameOverScript: LevelGameOverScript;
  private infoScript: LevelInfoScript;
  private introScript: LevelIntroScript;
  private playerOverScript: LevelPlayerOverScript;
  private playerScript: LevelPlayerScript;
  private pointsScript: LevelPointsScript;
  private powerupScript: LevelPowerupScript;
  private pauseScript: LevelPauseScript;
  private spawnScript: LevelSpawnScript;
  private winScript: LevelWinScript;
  private fxScript: LevelFxScript;
  private padScript: LevelPadScript;
  private turretScript: LevelTurretScript;
  private waveScript: LevelWaveScript;
  private economyScript: LevelEconomyScript;
  private blitzScript: LevelBlitzScript;
  private shopScript: LevelShopScript;

  protected setup(updateArgs: GameUpdateArgs): void {
    const { collisionSystem, inputManager, session } = updateArgs;

    this.overlayGate = updateArgs.overlayGate;
    this.screenShake = updateArgs.screenShake;

    this.debugCollisionMenu = new DebugCollisionMenu(
      collisionSystem,
      this.root,
      { top: 470 },
    );
    if (config.IS_DEV) {
      this.debugCollisionMenu.attach();
      this.debugCollisionMenu.show();
    }

    this.world = new LevelWorld(this.root);

    this.root.add(new Border());

    this.world.field.position.set(
      config.BORDER_LEFT_WIDTH,
      config.BORDER_TOP_BOTTOM_HEIGHT,
    );
    this.root.add(this.world.field);

    this.eventBus = new LevelEventBus();

    this.inputManager = inputManager;
    this.session = session;

    const { mapConfig } = this.params;

    const terrainRegions = withDefaultPads(
      mapConfig.getTerrainRegions(),
      mapConfig.getPlayerSpawnPositions(),
    );
    const tiles = TerrainFactory.createMapFromRegionConfigs(terrainRegions);

    for (const tile of tiles) {
      tile.destroyed.addListener(() => {
        this.eventBus.mapTileDestroyed.notify({
          type: tile.type,
          position: tile.position.clone(),
          size: tile.size.clone(),
        });
      });
    }

    this.world.field.add(...tiles);

    this.audioScript = new LevelAudioScript();
    this.baseScript = new LevelBaseScript();
    this.enemyScript = new LevelEnemyScript();
    this.explosionScript = new LevelExplosionScript();
    this.gameOverScript = new LevelGameOverScript();
    this.infoScript = new LevelInfoScript();
    this.introScript = new LevelIntroScript();
    this.pauseScript = new LevelPauseScript();
    this.playerOverScript = new LevelPlayerOverScript();
    this.playerScript = new LevelPlayerScript();
    this.pointsScript = new LevelPointsScript();
    this.powerupScript = new LevelPowerupScript();
    this.spawnScript = new LevelSpawnScript();
    this.winScript = new LevelWinScript();
    this.fxScript = new LevelFxScript();
    this.padScript = new LevelPadScript();
    this.turretScript = new LevelTurretScript();
    this.waveScript = new LevelWaveScript();
    this.economyScript = new LevelEconomyScript();
    this.blitzScript = new LevelBlitzScript();
    this.shopScript = new LevelShopScript(
      this.baseScript,
      this.enemyScript,
      this.turretScript,
    );

    this.allScripts = [
      this.audioScript,
      this.baseScript,
      this.enemyScript,
      this.explosionScript,
      this.gameOverScript,
      this.infoScript,
      this.introScript,
      this.pauseScript,
      this.playerOverScript,
      this.playerScript,
      this.pointsScript,
      this.powerupScript,
      this.spawnScript,
      this.winScript,
      this.fxScript,
      this.padScript,
      this.turretScript,
      this.waveScript,
      this.economyScript,
      this.shopScript,
      this.blitzScript,
    ];

    this.allScripts.forEach((script) => {
      script.invokeInit(this.world, this.eventBus, session, mapConfig);
    });

    // When intro starts, enable only it and audio
    this.alwaysUpdateScripts = [this.audioScript, this.introScript];

    // When intro is completed, enable the rest of the scripts
    this.introScript.completed.addListener(() => {
      this.alwaysUpdateScripts.push(
        this.gameOverScript,
        this.pauseScript,
        this.winScript,
      );

      this.playingUpdateScripts.push(
        this.baseScript,
        this.explosionScript,
        this.infoScript,
        this.enemyScript,
        this.spawnScript,
        this.playerOverScript,
        this.playerScript,
        this.pointsScript,
        this.powerupScript,
        this.fxScript,
        this.padScript,
        this.turretScript,
        this.waveScript,
        this.economyScript,
        this.shopScript,
        this.blitzScript,
      );

      // Questions and shop open once the battle has started
      this.overlayGate.attachLevel({
        canOpen: () =>
          updateArgs.gameState.is(GameState.Playing) &&
          !this.session.isGameOver(),
        // Both pads are safe zones: time stops while answering or shopping
        isInSafeZone: (playerIndex) =>
          this.padScript.getPlayerPadType(playerIndex) !== null,
        hasTurret: () => this.turretScript.hasTurret(),
        playerCount: () => (this.session.isMultiplayer() ? 2 : 1),
      });

      // Left-click on the playfield: turn toward the cursor and fire
      const unsubscribeAim = updateArgs.controls.aimFire.addListener(this.handleAimFire);
      this.overlayGate.detached.addListenerOnce(unsubscribeAim);
    });

    if (config.IS_DEV) {
      activeTankKitMenu?.detach();
      activeTankKitMenu = new DebugLevelTankKitMenu({
        top: 200,
        left: 0,
        right: null,
      });
      activeTankKitMenu.action.addListener(this.handleDebugTankKitAction);
      activeTankKitMenu.attach();
    }

    this.eventBus.baseDied.addListener(this.handleBaseDied);
    this.eventBus.enemyAllDied.addListener(this.handleEnemyAllDied);
    this.eventBus.enemyDied.addListener(this.handleEnemyDied);
    this.eventBus.playerDied.addListener(this.handlePlayerDied);
    this.eventBus.powerupPicked.addListener(this.handlePowerupPicked);
    this.eventBus.levelGameOverCompleted.addListener(
      this.handleLevelGameOverCompleted,
    );
    this.eventBus.levelGameOverMoveBlocked.addListener(
      this.handleLevelGameOverMoveBlocked,
    );
    this.eventBus.levelWinCompleted.addListener(this.handleLevelWinCompleted);
    this.eventBus.matchTimeUp.addListener(() => {
      // Blitz is over: straight to the report, the score is in the session
      this.overlayGate.detachLevel();
      this.session.setGameOver();
      updateArgs.match.setOutcome(MatchOutcome.TimeUp);
      updateArgs.audioManager.stopAll();
      this.navigator.replace(GameSceneType.MatchReport);
    });
  }

  protected update(frameArgs: GameUpdateArgs): void {
    // Bullet-time (or a full stop in the safe zone) while answering
    const timeScale = this.overlayGate.getTimeScale();
    const updateArgs =
      timeScale === 1
        ? frameArgs
        : {
            ...frameArgs,
            deltaTime: frameArgs.deltaTime * timeScale,
            realDeltaTime: frameArgs.deltaTime,
          };

    const { collisionSystem, gameState } = updateArgs;

    this.updateMouseControl(updateArgs);

    this.alwaysUpdateScripts.forEach((script) => {
      script.invokeUpdate(updateArgs);
    });

    if (!gameState.is(GameState.Paused)) {
      // These scripts won't run when game is paused
      this.playingUpdateScripts.forEach((script) => {
        // Extra check not to run same script twice
        if (this.alwaysUpdateScripts.includes(script)) {
          return;
        }

        script.invokeUpdate(updateArgs);
      });
    }

    // Update all objects on the scene
    this.root.traverseDescedants((node) => {
      const shouldUpdate = gameState.is(GameState.Playing) || node.ignorePause;
      if (shouldUpdate) {
        node.invokeUpdate(updateArgs);
      }
    });

    this.root.updateWorldMatrix(false, true);

    collisionSystem.update();

    if (config.IS_DEV) {
      this.debugCollisionMenu.update();
    }

    collisionSystem.collide();
  }

  // Mouse: the cursor turns the tank, holding right-click (or left-click +
  // drag) drives toward it.
  private updateMouseControl({ controls }: GameUpdateArgs): void {
    if (this.session.isMultiplayer()) {
      return;
    }
    const tank = this.world.getPlayerTanks()[0];
    if (!tank || !tank.isAlive()) {
      controls.syncMouseDrive(null);
      return;
    }
    // Drive first: it holds the movement key the tank behaviour reads
    controls.syncMouseDrive(tank.getCenter());

    const aim = controls.consumeMouseAim();
    if (aim !== null && !controls.isMouseDriving() && !tank.isSliding()) {
      this.turnToward(tank, aim);
    }
  }

  private turnToward(tank: PlayerTank, point: FieldPoint): void {
    const center = tank.getCenter();
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    // Cardinal direction toward the cursor (the dominant axis wins)
    if (Math.abs(dx) > Math.abs(dy)) {
      tank.rotate(dx > 0 ? Rotation.Right : Rotation.Left);
    } else {
      tank.rotate(dy > 0 ? Rotation.Down : Rotation.Up);
    }
  }

  private handleAimFire = (point: FieldPoint): void => {
    if (this.session.isMultiplayer()) {
      return;
    }
    const tank = this.world.getPlayerTanks()[0];
    if (!tank || !tank.isAlive() || tank.isSliding()) {
      return;
    }
    this.turnToward(tank, point);
    tank.fire();
  };

  private handlePlayerDied = (event: LevelPlayerDiedEvent): void => {
    const playerSession = this.session.getPlayer(event.partyIndex);
    playerSession.removeLife();

    if (this.session.isAnyPlayerAlive()) {
      // If other player is alive, but current player is dead - show
      // notification for dead player that his game is over. Only the first
      // player who dies gets this notification.
      if (!playerSession.isAlive()) {
        this.playerOverScript.setPlayerIndex(event.partyIndex);
        this.playerOverScript.enable();
      }
      return;
    }

    // If both players die - game is lost

    this.session.setGameOver();
    this.overlayGate.detachLevel();

    this.pauseScript.disable();
    this.playerScript.disable();
    this.gameOverScript.enable();

    // Game can be lost even after level is won if the base is killed
    this.winScript.disable();
  };

  private handleEnemyAllDied = (): void => {
    this.overlayGate.detachLevel();
    this.pauseScript.disable();
    this.winScript.enable();
  };

  private handleEnemyDied = (event: LevelEnemyDiedEvent): void => {
    // Only kills are awarded
    if (event.reason === TankDeathReason.WipeoutPowerup) {
      return;
    }

    const playerSession = this.session.getPlayer(event.hitterPartyIndex);

    playerSession.addKillPoints(event.type.tier);
  };

  private handleDebugTankKitAction = (action: DebugTankKitAction): void => {
    switch (action) {
      case DebugTankKitAction.SpawnGold:
        this.enemyScript.spawnExtra(TankType.EnemyGold());
        break;
      case DebugTankKitAction.SpawnBoss:
        this.enemyScript.spawnExtra(TankType.EnemyBoss());
        break;
      case DebugTankKitAction.PlaceTurret:
        this.turretScript.placeTurret(0);
        break;
      case DebugTankKitAction.KillAll:
        this.enemyScript.killAll();
        break;
      case DebugTankKitAction.Shake:
        this.screenShake.shake(12, 0.5);
        break;
    }
  };

  private handlePowerupPicked = (event: LevelPowerupPickedEvent): void => {
    const playerSession = this.session.getPlayer(event.partyIndex);

    playerSession.addPowerupPoints(event.type);

    if (event.type === PowerupType.Life) {
      playerSession.addLife();
    }
  };

  private handleBaseDied = (): void => {
    this.session.setGameOver();
    this.overlayGate.detachLevel();

    this.pauseScript.disable();
    this.playerScript.disable();
    this.gameOverScript.enable();

    // Player can lose even after level is won
    this.winScript.disable();
  };

  // Block user input after some delay when game is over
  private handleLevelGameOverMoveBlocked = (): void => {
    this.inputManager.unlisten();
  };

  private handleLevelGameOverCompleted = (): void => {
    // Restore input
    this.inputManager.listen();

    if (this.session.isPlaytest()) {
      this.navigator.replace(GameSceneType.EditorMenu);
      return;
    }

    this.navigator.replace(GameSceneType.LevelScore);
  };

  private handleLevelWinCompleted = (): void => {
    if (this.session.isPlaytest()) {
      this.navigator.replace(GameSceneType.EditorMenu);
      return;
    }

    this.navigator.replace(GameSceneType.LevelScore);
  };
}

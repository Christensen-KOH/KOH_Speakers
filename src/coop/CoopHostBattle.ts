import { GameObject, Rect, Subject } from '../core';
import { AutoTurret } from '../entities/AutoTurret';
import { withDefaultPads } from '../entities/pads';
import { GameUpdateArgs } from '../game';
import { Border, Bullet, EnemyTank, TankState, TerrainTile } from '../gameObjects';
import { EMP_DURATION, STEEL_FORTRESS_DURATION } from '../gimkit-economy';
import { LevelEventBus, LevelScript, LevelWorld } from '../level';
import {
  LevelBaseScript,
  LevelEnemyScript,
  LevelExplosionScript,
  LevelFxScript,
  LevelSpawnScript,
  LevelTurretScript,
  LevelWaveScript,
} from '../level/scripts';
import { CoopAction, CoopEvent, CoopTankState, CoopWorld } from '../live/protocol';
import { MapConfig } from '../map';
import { gameBalance } from '../match/GameBalance';
import { TankDeathReason } from '../tank';
import { TerrainFactory } from '../terrain';
import * as config from '../config';

import { COOP_SPAWNS, CoopPlayersScript } from './CoopPlayersScript';
import { CoopRoster } from './CoopRoster';
import { encodeGrid, GridTile } from './grid';

// A full map keyframe this often, for students who just joined.
// The map itself only travels when it changes, so this stays rare.
const GRID_KEYFRAME_EVERY = 80;

const ACTION_TOASTS: Record<CoopAction, (name: string) => string> = {
  'brick-builder': (name) => `🧱 ${name} rebuilt the base walls!`,
  'steel-fortress': (name) => `🏰 ${name} turned the base walls to steel!`,
  'auto-turret': (name) => `🗼 ${name} built an Auto-Turret!`,
  'emp-blast': (name) => `🌀 ${name} froze every enemy with an EMP!`,
};

/**
 * The one shared co-op battlefield, run on the teacher's host. Builds a
 * stage from the regular level scripts plus networked student tanks, and
 * turns it into world snapshots for the students.
 */
export class CoopHostBattle {
  public readonly stageCleared = new Subject<void>();
  public readonly baseLost = new Subject<void>();
  public readonly toast = new Subject<string>();
  public readonly waveStarted = new Subject<{ n: number; total: number; boss: boolean }>();
  public readonly stage: number;

  private readonly root: GameObject;
  private readonly world: LevelWorld;
  private readonly eventBus = new LevelEventBus();
  private readonly roster: CoopRoster;
  private readonly scripts: LevelScript[];
  private readonly baseScript = new LevelBaseScript();
  private readonly enemyScript = new LevelEnemyScript();
  private readonly turretScript = new LevelTurretScript();
  private readonly playersScript: CoopPlayersScript;
  private readonly bulletIds = new WeakMap<Bullet, number>();
  private nextBulletId = 1;
  private events: CoopEvent[] = [];
  private seq = 0;
  private lastGrid: string | null = null;
  private wave: CoopWorld['wave'] = null;
  private baseAlive = true;

  constructor(
    root: GameObject,
    mapConfig: MapConfig,
    roster: CoopRoster,
    stage: number,
    updateArgs: GameUpdateArgs,
  ) {
    this.root = root;
    this.roster = roster;
    this.stage = stage;

    this.world = new LevelWorld(root);
    root.add(new Border());
    this.world.field.position.set(config.BORDER_LEFT_WIDTH, config.BORDER_TOP_BOTTOM_HEIGHT);
    root.add(this.world.field);

    // Every student spawn must be drivable
    COOP_SPAWNS.forEach(({ x, y }) => {
      mapConfig.clearTerrainRect(new Rect(x, y, config.TILE_SIZE_LARGE, config.TILE_SIZE_LARGE));
    });
    const regions = withDefaultPads(
      mapConfig.getTerrainRegions(),
      mapConfig.getPlayerSpawnPositions(),
    );
    this.world.field.add(...TerrainFactory.createMapFromRegionConfigs(regions));

    this.playersScript = new CoopPlayersScript(roster);
    this.scripts = [
      this.baseScript,
      this.enemyScript,
      new LevelSpawnScript(),
      new LevelExplosionScript(),
      new LevelFxScript(),
      new LevelWaveScript(),
      this.turretScript,
      this.playersScript,
    ];
    this.scripts.forEach((script) =>
      script.invokeInit(this.world, this.eventBus, updateArgs.session, mapConfig),
    );

    this.eventBus.enemyDied.addListener((event) => {
      const x = Math.round(event.centerPosition.x);
      const y = Math.round(event.centerPosition.y);
      this.events.push({ k: 'boom', x, y, big: true, variant: event.type.variant });
      const seat =
        event.reason !== TankDeathReason.WipeoutPowerup && event.hitterPartyIndex !== null
          ? this.roster.bySlot(event.hitterPartyIndex)
          : null;
      if (seat !== null) {
        seat.kills += 1;
        this.events.push({ k: 'kill', slot: seat.slot, variant: event.type.variant, x, y });
      }
    });
    this.eventBus.playerDied.addListener((event) => {
      const x = Math.round(event.centerPosition.x);
      const y = Math.round(event.centerPosition.y);
      this.events.push({ k: 'boom', x, y, big: true });
    });
    this.eventBus.baseDied.addListener(() => {
      this.baseAlive = false;
      this.events.push({ k: 'baseLost' });
      this.baseLost.notify(null);
    });
    this.eventBus.waveStarted.addListener((event) => {
      this.wave = { n: event.waveNumber, total: event.totalWaves, boss: event.hasBoss };
      this.events.push({ k: 'wave', ...this.wave });
      this.waveStarted.notify(this.wave);
    });
    this.eventBus.enemyAllDied.addListener(() => this.stageCleared.notify(null));
  }

  public update(updateArgs: GameUpdateArgs): void {
    const { collisionSystem } = updateArgs;
    this.scripts.forEach((script) => script.invokeUpdate(updateArgs));
    this.root.traverseDescedants((node) => node.invokeUpdate(updateArgs));
    this.root.updateWorldMatrix(false, true);
    collisionSystem.update();
    collisionSystem.collide();
  }

  /** A student bought a battlefield gadget in their shop. */
  public applyAction(action: CoopAction, playerId: string, nickname: string): void {
    const seat = this.roster.seatOf(playerId);
    switch (action) {
      case 'brick-builder':
        this.baseScript.repairWalls();
        break;
      case 'steel-fortress':
        this.baseScript.fortify(STEEL_FORTRESS_DURATION);
        break;
      case 'auto-turret':
        if (!this.turretScript.placeTurret(seat ? seat.slot : 0)) {
          return;
        }
        break;
      case 'emp-blast':
        this.enemyScript.freezeAll(EMP_DURATION);
        break;
    }
    const text = ACTION_TOASTS[action](nickname);
    this.events.push({ k: 'toast', text });
    this.toast.notify(text);
  }

  /** Teacher: every student tank holds still for a while. */
  public freezeClass(seconds: number, exceptPlayerId: string | null): void {
    this.roster.getSeats().forEach((seat) => {
      if (seat.playerId !== exceptPlayerId) {
        this.playersScript.getTank(seat.slot)?.stun(seconds);
      }
    });
    this.events.push({ k: 'freeze', seconds });
    const text = `❄️ Class frozen for ${seconds} seconds!`;
    this.events.push({ k: 'toast', text });
    this.toast.notify(text);
  }

  /** Teacher: everyone, students and teacher, gets bonus cash. */
  public bonusDrop(cash: number): void {
    this.events.push({ k: 'bonus', cash });
    const text = `🎁 Bonus drop! Everyone gets ${cash}`;
    this.events.push({ k: 'toast', text });
    this.toast.notify(text);
  }

  public hasTurret(): boolean {
    return this.turretScript.hasTurret();
  }

  /** Student tanks, for the name tags on the host's projector view. */
  public getTanks(): CoopTankState[] {
    return this.collectTanks();
  }

  public snapshot(): CoopWorld {
    this.seq += 1;
    const field = this.world.field;
    const enemies: CoopWorld['enemies'] = [];
    const bullets: CoopWorld['bullets'] = [];
    let turret: CoopWorld['turret'] = null;

    field.children.forEach((child) => {
      if (child instanceof EnemyTank) {
        const { x, y } = child.getCenter();
        enemies.push({
          id: child.partyIndex,
          x: Math.round(x),
          y: Math.round(y),
          r: child.rotation,
          tier: child.type.tier,
          variant: child.type.variant,
          drop: child.type.hasDrop,
          moving: child.state === TankState.Moving,
        });
      } else if (child instanceof Bullet) {
        let id = this.bulletIds.get(child);
        if (id === undefined) {
          id = this.nextBulletId++;
          this.bulletIds.set(child, id);
        }
        const { x, y } = child.getCenter();
        bullets.push({ id, x: Math.round(x), y: Math.round(y), r: child.getWorldRotation() });
      } else if (child instanceof AutoTurret) {
        const { x, y } = child.getCenter();
        turret = { x, y, aim: child.painter.aim };
      }
    });

    const grid = this.encodeTerrain();
    const sendGrid = grid !== this.lastGrid || this.seq % GRID_KEYFRAME_EVERY === 0;
    this.lastGrid = grid;

    const world: CoopWorld = {
      seq: this.seq,
      stage: this.stage,
      baseAlive: this.baseAlive,
      turret,
      tanks: this.collectTanks(),
      enemies,
      bullets,
      events: this.events,
      wave: this.wave,
      waiting: this.roster.getWaiting(),
    };
    if (sendGrid) {
      world.grid = grid;
    }
    this.events = [];
    return world;
  }

  private collectTanks(): CoopTankState[] {
    return this.roster.getSeats().map((seat) => {
      const tank = this.playersScript.getTank(seat.slot);
      const maxHp = gameBalance.startingHp + (seat.input.loadout.heavyArmor ? 2 : 0);
      const center = tank ? tank.getCenter() : null;
      return {
        id: seat.playerId,
        slot: seat.slot,
        x: center ? Math.round(center.x) : 0,
        y: center ? Math.round(center.y) : 0,
        r: tank ? tank.rotation : 0,
        tier: tank ? tank.type.tier : 'a',
        hp: tank ? tank.attributes.health : 0,
        maxHp,
        moving: tank ? tank.state === TankState.Moving : false,
        thinking: seat.input.thinking,
        shots: seat.shots,
        kills: seat.kills,
        alive: tank !== null && tank.isAlive(),
        shield: tank !== null && tank.shield !== null,
      };
    });
  }

  private encodeTerrain(): string {
    const fieldMin = this.world.field.getWorldBoundingBox().min;
    const tiles: GridTile[] = [];
    this.world.field.traverseDescedants((node) => {
      if (node instanceof TerrainTile && !node.isRemoved) {
        const box = node.getWorldBoundingBox();
        tiles.push({
          type: node.type,
          x: box.min.x - fieldMin.x,
          y: box.min.y - fieldMin.y,
          width: box.max.x - box.min.x,
          height: box.max.y - box.min.y,
        });
      }
    });
    return encodeGrid(tiles);
  }
}

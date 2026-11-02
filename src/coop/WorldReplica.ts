import {
  GameObject,
  Rect,
  Sprite,
  SpriteAlignment,
  SpriteLoader,
  SpritePainter,
  Vector,
} from '../core';
import { AutoTurretPainter } from '../entities/AutoTurret';
import { ParticleBurst } from '../entities/fx';
import { Rotation } from '../game';
import { Border, Explosion, SmallExplosion, TerrainTile } from '../gameObjects';
import {
  CoopBulletState,
  CoopEnemyState,
  CoopEvent,
  CoopTankState,
  CoopWorld,
} from '../live/protocol';
import {
  PLAYER_COLORS,
  TankColor,
  TankParty,
  TankSpriteId,
  TankTier,
  TankType,
} from '../tank';
import { TerrainFactory, TerrainType } from '../terrain';
import * as config from '../config';

import { blockRegions, changedBlocks } from './grid';

const TANK_SIZE = 64;
const BULLET_SIZE = 16;
const TURRET_SIZE = config.TILE_SIZE_MEDIUM;
// Track animation frame swap while moving, and drop-blink speed.
const TRACK_FRAME_SECONDS = 0.07;
const DROP_BLINK_SECONDS = 0.12;
// Remote things glide toward their newest known spot by this fraction of the
// gap every 60fps frame, so 25Hz network ticks look like smooth motion.
const SMOOTHING = 0.35;
// A jump this big (respawn, teleport) snaps instead of gliding.
const SNAP_DISTANCE = 96;

const BURST_COLORS: Record<string, string[]> = {
  normal: ['#ffffff', '#ffd84d', '#ff9f43', '#d74000'],
  gold: ['#ffffff', '#ffe27a', '#ffcf3d', '#ffb800'],
  boss: ['#ffffff', '#ff6b3d', '#eb3048', '#7a1020'],
};

export interface LocalTankView {
  id: string;
  x: number;
  y: number;
  r: number;
  moving: boolean;
}

export interface SolidRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Terrain tanks drive over (everything else blocks them).
const PASSABLE_TERRAIN: string[] = [
  TerrainType.Jungle,
  TerrainType.Ice,
  TerrainType.RechargePad,
  TerrainType.UpgradePad,
];

function rotationName(rotation: number): string {
  return { 0: 'up', 90: 'right', 180: 'down', 270: 'left' }[rotation] ?? 'up';
}

class SpriteObject extends GameObject {
  public painter = new SpritePainter();
  // Where the object is drawn right now (centre), gliding toward its target.
  public px = 0;
  public py = 0;
  public placed = false;

  constructor(size: number, zIndex: number) {
    super(size, size);
    this.painter.alignment = SpriteAlignment.MiddleCenter;
    this.zIndex = zIndex;
  }

  /** Moves the object's centre, repainting only when something changed. */
  /** Glides toward (tx, ty); frame-rate independent. Returns the new spot. */
  public glide(tx: number, ty: number, deltaTime: number): void {
    if (!this.placed || Math.hypot(tx - this.px, ty - this.py) > SNAP_DISTANCE) {
      this.px = tx;
      this.py = ty;
      this.placed = true;
      return;
    }
    const k = 1 - Math.pow(1 - SMOOTHING, deltaTime * 60);
    this.px += (tx - this.px) * k;
    this.py += (ty - this.py) * k;
  }

  public place(x: number, y: number, sprite: Sprite): void {
    const left = Math.round(x - this.size.width / 2);
    const top = Math.round(y - this.size.height / 2);
    if (left === this.position.x && top === this.position.y && sprite === this.painter.sprite) {
      return;
    }
    this.dirtyPaintBox();
    this.position.set(left, top);
    this.painter.sprite = sprite;
    this.updateMatrix();
    this.setNeedsPaint();
  }
}

class ReplicaTank extends SpriteObject {
  public readonly shield = new SpriteObject(TANK_SIZE, config.SHIELD_Z_INDEX);
  public frame = 1;
  public frameTime = 0;
}

/**
 * Student-side copy of the host's battlefield, built only from world
 * snapshots: no physics, no AI, just the same sprites in the same places.
 */
export class WorldReplica {
  public readonly field = new GameObject(config.FIELD_SIZE, config.FIELD_SIZE);
  private readonly spriteLoader: SpriteLoader;
  private readonly sprites = new Map<string, Sprite>();
  private readonly blocks = new Map<number, TerrainTile[]>();
  private readonly tanks = new Map<string, ReplicaTank>();
  private readonly enemies = new Map<number, ReplicaTank>();
  private readonly bullets = new Map<number, SpriteObject>();
  private readonly heart = new SpriteObject(64, config.BASE_HEART_Z_INDEX);
  private turret: GameObject = null;
  private grid: string | null = null;
  private solids: SolidRect[] | null = null;
  private clock = 0;

  constructor(root: GameObject, spriteLoader: SpriteLoader) {
    this.spriteLoader = spriteLoader;
    root.add(new Border());
    this.field.position.set(config.BORDER_LEFT_WIDTH, config.BORDER_TOP_BOTTOM_HEIGHT);
    root.add(this.field);
    this.field.add(this.heart);
  }

  /** Rebuilds the 64px blocks of the map that changed. */
  public applyGrid(grid: string): void {
    changedBlocks(this.grid, grid).forEach((block) => {
      (this.blocks.get(block) ?? []).forEach((tile) => {
        tile.collider?.unregister();
        // Mark the old area so the renderer erases it
        tile.dirtyPaintBox();
        tile.removeSelf();
      });
      const tiles: TerrainTile[] = [];
      blockRegions(grid, block).forEach((region) => {
        tiles.push(
          ...TerrainFactory.createFromRegions(region.type, [
            new Rect(region.x, region.y, region.width, region.height),
          ]),
        );
      });
      this.blocks.set(block, tiles);
      if (tiles.length > 0) {
        this.field.add(...tiles);
      }
    });
    this.grid = grid;
    this.solids = null;
  }

  public hasMap(): boolean {
    return this.grid !== null;
  }

  /** Plays one-off effects carried by a snapshot. */
  public playEvents(events: CoopEvent[]): void {
    events.forEach((event) => {
      if (event.k === 'boom') {
        const explosion = new Explosion();
        explosion.updateMatrix();
        explosion.setCenter(new Vector(event.x, event.y));
        this.field.add(explosion);
        const colors = BURST_COLORS[event.variant ?? 'normal'] ?? BURST_COLORS.normal;
        this.field.add(
          new ParticleBurst(new Vector(event.x, event.y), {
            count: event.variant === 'boss' ? 50 : 24,
            colors,
            speed: 280,
            life: 0.6,
          }),
        );
      }
    });
  }

  /**
   * Draws the newest snapshot every frame. Remote tanks, enemies and shells
   * glide toward it; the local player's own tank is drawn where the client
   * predicts it, not where the host last saw it.
   */
  public render(world: CoopWorld, deltaTime: number, local: LocalTankView | null): void {
    this.clock += deltaTime;

    this.heart.place(
      config.BASE_DEFAULT_POSITION.x + 64,
      config.BASE_DEFAULT_POSITION.y + 64,
      this.sprite(world.baseAlive ? 'base.heart.alive' : 'base.heart.dead'),
    );

    this.syncTanks(world.tanks, deltaTime, local);
    this.syncEnemies(world.enemies, deltaTime);
    this.syncBullets(world.bullets, deltaTime);
    this.syncTurret(world.turret);
  }

  /** Where a player's tank is drawn right now (field coordinates). */
  public getTankCenter(id: string): { x: number; y: number } | null {
    const object = this.tanks.get(id);
    return object !== undefined && object.placed ? { x: object.px, y: object.py } : null;
  }

  /** Solid terrain (field coordinates) a tank cannot drive through. */
  public getSolids(): SolidRect[] {
    if (this.solids === null) {
      const solids: SolidRect[] = [
        // The base heart is drawn from its own object, not a terrain tile
        {
          x: config.BASE_DEFAULT_POSITION.x + 32,
          y: config.BASE_DEFAULT_POSITION.y + 32,
          width: 64,
          height: 64,
        },
      ];
      this.blocks.forEach((tiles) =>
        tiles.forEach((tile) => {
          if (!PASSABLE_TERRAIN.includes(tile.type) && !tile.isRemoved) {
            solids.push({
              x: tile.position.x,
              y: tile.position.y,
              width: tile.size.width,
              height: tile.size.height,
            });
          }
        }),
      );
      this.solids = solids;
    }
    return this.solids;
  }

  // --- Entities ------------------------------------------------------------

  private syncTanks(
    to: CoopTankState[],
    deltaTime: number,
    local: LocalTankView | null,
  ): void {
    const seen = new Set<string>();

    to.forEach((state) => {
      if (!state.alive) {
        return;
      }
      seen.add(state.id);
      let object = this.tanks.get(state.id);
      if (object === undefined) {
        object = new ReplicaTank(TANK_SIZE, config.PLAYER_TANK_Z_INDEX);
        this.tanks.set(state.id, object);
        this.field.add(object, object.shield);
      }
      const mine = local !== null && local.id === state.id;
      if (mine) {
        // Predicted on this device: no waiting for the host
        object.px = local.x;
        object.py = local.y;
        object.placed = true;
      } else {
        object.glide(state.x, state.y, deltaTime);
      }
      const x = object.px;
      const y = object.py;

      this.animate(object, mine ? local.moving : state.moving, deltaTime);
      const type = new TankType(TankParty.Player, state.tier as TankTier);
      const color = PLAYER_COLORS[state.slot % PLAYER_COLORS.length];
      const rotation = (mine ? local.r : state.r) as Rotation;
      object.place(x, y, this.sprite(TankSpriteId.create(type, color, rotation, object.frame)));

      const shieldFrame = Math.floor(this.clock / 0.06) % 2 === 0 ? 'shield.1' : 'shield.2';
      if (state.shield) {
        object.shield.place(x, y, this.sprite(shieldFrame));
      } else if (object.shield.painter.sprite !== null) {
        object.shield.dirtyPaintBox();
        object.shield.painter.sprite = null;
        object.shield.setNeedsPaint();
      }
    });

    this.tanks.forEach((object, id) => {
      if (!seen.has(id)) {
        object.shield.dirtyPaintBox();
        object.shield.removeSelf();
        object.dirtyPaintBox();
        object.removeSelf();
        this.tanks.delete(id);
      }
    });
  }

  private syncEnemies(to: CoopEnemyState[], deltaTime: number): void {
    const seen = new Set<number>();
    const dropBlink = Math.floor(this.clock / DROP_BLINK_SECONDS) % 2 === 0;

    to.forEach((state) => {
      seen.add(state.id);
      let object = this.enemies.get(state.id);
      if (object === undefined) {
        object = new ReplicaTank(TANK_SIZE, config.ENEMY_TANK_Z_INDEX);
        this.enemies.set(state.id, object);
        this.field.add(object);
      }
      object.glide(state.x, state.y, deltaTime);
      const x = object.px;
      const y = object.py;

      let color = TankColor.Default;
      if (state.variant === 'gold') {
        color = TankColor.Gold;
      } else if (state.variant === 'boss') {
        color = TankColor.Boss;
      } else if (state.drop && dropBlink) {
        color = TankColor.Danger;
      }
      this.animate(object, state.moving, deltaTime);
      const type = new TankType(TankParty.Enemy, state.tier as TankTier);
      object.place(x, y, this.sprite(TankSpriteId.create(type, color, state.r as Rotation, object.frame)));
    });

    this.enemies.forEach((object, id) => {
      if (!seen.has(id)) {
        object.dirtyPaintBox();
        object.removeSelf();
        this.enemies.delete(id);
      }
    });
  }

  private syncBullets(to: CoopBulletState[], deltaTime: number): void {
    const seen = new Set<number>();

    to.forEach((state) => {
      seen.add(state.id);
      let object = this.bullets.get(state.id);
      if (object === undefined) {
        object = new SpriteObject(BULLET_SIZE, config.BULLET_Z_INDEX);
        this.bullets.set(state.id, object);
        this.field.add(object);
      }
      object.glide(state.x, state.y, deltaTime);
      object.place(object.px, object.py, this.sprite(`bullet.${rotationName(state.r)}`));
    });

    // A shell that vanished hit something: small puff where it was
    this.bullets.forEach((object, id) => {
      if (!seen.has(id)) {
        const center = object.getCenter();
        object.dirtyPaintBox();
        object.removeSelf();
        this.bullets.delete(id);
        const puff = new SmallExplosion();
        puff.updateMatrix();
        puff.setCenter(center);
        this.field.add(puff);
      }
    });
  }

  private syncTurret(state: CoopWorld['turret']): void {
    if (state === null) {
      if (this.turret !== null) {
        this.turret.dirtyPaintBox();
        this.turret.removeSelf();
        this.turret = null;
      }
      return;
    }
    if (this.turret === null) {
      this.turret = new GameObject(TURRET_SIZE, TURRET_SIZE);
      this.turret.painter = new AutoTurretPainter();
      this.turret.setZIndex(config.TURRET_Z_INDEX);
      this.field.add(this.turret);
    }
    const painter = this.turret.painter as AutoTurretPainter;
    const left = state.x - TURRET_SIZE / 2;
    const top = state.y - TURRET_SIZE / 2;
    if (painter.aim !== state.aim || this.turret.position.x !== left || this.turret.position.y !== top) {
      painter.aim = state.aim;
      this.turret.position.set(left, top);
      this.turret.updateMatrix();
      this.turret.setNeedsPaint();
    }
  }

  private animate(object: ReplicaTank, moving: boolean, deltaTime: number): void {
    if (!moving) {
      return;
    }
    object.frameTime += deltaTime;
    if (object.frameTime >= TRACK_FRAME_SECONDS) {
      object.frameTime = 0;
      object.frame = object.frame === 1 ? 2 : 1;
    }
  }

  private sprite(id: string): Sprite {
    let sprite = this.sprites.get(id);
    if (sprite === undefined) {
      sprite = this.spriteLoader.load(id);
      this.sprites.set(id, sprite);
    }
    return sprite;
  }
}

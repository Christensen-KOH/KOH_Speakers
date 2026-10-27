import { BoxCollider, GameObject, Timer, Vector } from '../core';
import { Painter } from '../core/Painter';
import { RenderContext } from '../core/render';
import { RenderObject } from '../core/RenderObject';
import { GameUpdateArgs, Rotation, Tag } from '../game';
import { Bullet, EnemyTank } from '../gameObjects';
import { TankBulletWallDamage } from '../tank';
import * as config from '../config';

const SIZE = config.TILE_SIZE_MEDIUM;
const RANGE = 384;
const FIRE_DELAY = 0.9;
const BULLET_SPEED = 900;
// How far off-axis an enemy may be and still count as "in the lane".
const LANE_TOLERANCE = 28;
// Never fire down: the base sits right below the turret.
const FIRE_DIRECTIONS = [Rotation.Up, Rotation.Left, Rotation.Right];

export class AutoTurretPainter extends Painter {
  public aim = Rotation.Up;
  public flash = false;

  public paint(context: RenderContext, renderObject: RenderObject): void {
    const { x, y, width, height } = renderObject
      .getWorldBoundingBox()
      .toRect();
    const cx = x + width / 2;
    const cy = y + height / 2;

    context.fillRect(x + 2, y + 2, width - 4, height - 4, '#1f3b4d');
    context.strokeRect(x + 2, y + 2, width - 4, height - 4, '#4dd4ff', 2);
    context.fillRect(cx - 7, cy - 7, 14, 14, this.flash ? '#ffffff' : '#4dd4ff');

    const barrel = this.flash ? '#ffffff' : '#9fe8ff';
    if (this.aim === Rotation.Up) {
      context.fillRect(cx - 3, y, 6, height / 2, barrel);
    } else if (this.aim === Rotation.Left) {
      context.fillRect(x, cy - 3, width / 2, 6, barrel);
    } else if (this.aim === Rotation.Right) {
      context.fillRect(cx, cy - 3, width / 2, 6, barrel);
    }
  }
}

/**
 * Base-defence gadget: a fixed mini-turret that shoots enemy tanks lined up
 * with it horizontally or above it. Kills are credited to `ownerIndex`.
 */
export class AutoTurret extends GameObject {
  public collider = new BoxCollider(this);
  public tags = [Tag.BlockMove, Tag.Turret];
  public zIndex = config.TURRET_Z_INDEX;
  public painter = new AutoTurretPainter();
  private readonly ownerIndex: number;
  private fireTimer = new Timer();
  private flashTimer = new Timer();
  private bullet: Bullet = null;

  constructor(ownerIndex: number) {
    super(SIZE, SIZE);
    this.ownerIndex = ownerIndex;
  }

  public destroy(): void {
    this.collider.unregister();
    this.removeSelf();
  }

  protected setup({ collisionSystem }: GameUpdateArgs): void {
    collisionSystem.register(this.collider);
    this.flashTimer.done.addListener(() => {
      this.painter.flash = false;
      this.setNeedsPaint();
    });
  }

  protected update({ deltaTime }: GameUpdateArgs): void {
    this.collider.update();
    this.fireTimer.update(deltaTime);
    this.flashTimer.update(deltaTime);

    // One shell in flight at a time, like a tier A tank.
    if (this.fireTimer.isActive() || this.bullet !== null) {
      return;
    }

    const aim = this.findTarget();
    if (aim === null) {
      return;
    }

    if (aim !== this.painter.aim) {
      this.painter.aim = aim;
      this.setNeedsPaint();
    }
    this.shoot(aim);
  }

  private findTarget(): Rotation | null {
    const center = this.getCenter();
    let best: Rotation | null = null;
    let bestDistance = RANGE;

    this.parent.children.forEach((child) => {
      if (!(child instanceof EnemyTank) || !child.isAlive()) {
        return;
      }

      const delta = child.getCenter().sub(center);

      FIRE_DIRECTIONS.forEach((rotation) => {
        const distance = this.laneDistance(rotation, delta);
        if (distance !== null && distance < bestDistance) {
          bestDistance = distance;
          best = rotation;
        }
      });
    });

    return best;
  }

  private laneDistance(rotation: Rotation, delta: Vector): number | null {
    if (rotation === Rotation.Up) {
      return delta.y < 0 && Math.abs(delta.x) <= LANE_TOLERANCE
        ? -delta.y
        : null;
    }
    if (rotation === Rotation.Left) {
      return delta.x < 0 && Math.abs(delta.y) <= LANE_TOLERANCE
        ? -delta.x
        : null;
    }
    if (rotation === Rotation.Right) {
      return delta.x > 0 && Math.abs(delta.y) <= LANE_TOLERANCE
        ? delta.x
        : null;
    }
    return null;
  }

  private shoot(rotation: Rotation): void {
    const bullet = new Bullet(
      this.ownerIndex,
      BULLET_SPEED,
      1,
      TankBulletWallDamage.Low,
    );
    bullet.tags.push(Tag.Player, Tag.Turret);
    bullet.destroysWalls = false;
    bullet.rotate(rotation);
    bullet.updateMatrix();
    bullet.setCenter(this.getCenter());
    // Start at the muzzle so the shell clears the turret body
    bullet.translateY(this.size.height / 2);
    bullet.updateMatrix();

    bullet.died.addListener(() => {
      this.bullet = null;
    });
    this.bullet = bullet;
    this.parent.add(bullet);

    this.painter.flash = true;
    this.setNeedsPaint();
    this.flashTimer.reset(0.08);
    this.fireTimer.reset(FIRE_DELAY);
  }
}

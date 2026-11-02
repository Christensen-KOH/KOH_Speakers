import { Subject } from '../core';
import { GameUpdateArgs, Tag } from '../game';
import { applyLoadout, Loadout, PlayerEconomy } from '../gimkit-economy';
import {
  applyDamage,
  PLAYER_MAX_HP,
  PLAYER_MAX_SHIELD,
  HP_PER_SHELL_DAMAGE,
  TankAttributesFactory,
  TankColor,
  TankDeathReason,
  TankColorFactory,
  TankSkinAnimation,
  TankTier,
  TankType,
} from '../tank';
import * as config from '../config';

import { Bullet } from './Bullet';
import { Tank, TankState } from './Tank';

export class PlayerTank extends Tank {
  public upgraded = new Subject<{ tier: TankTier }>();
  public tags = [Tag.Tank, Tag.Player];
  public zIndex = config.PLAYER_TANK_Z_INDEX;
  private tierSkinAnimations = new Map<TankTier, TankSkinAnimation>();
  private colors: TankColor[] = [];
  private economy: PlayerEconomy = null;
  private isBrawl = false;
  // Co-op host: a networked student's tank. Their shells, fuel and shop
  // live on their own device; the host only applies their loadout.
  private remoteLoadout: Loadout | null = null;
  // Set while a rival player's shell is being applied, so a resulting death
  // can be credited as a knockout.
  public lastHitByPlayer: number | null = null;
  // Snowbrawl health: Shield (blue) soaks hits before HP (green). Not to be
  // confused with `shield`, the spawn/power-up bubble that blocks shells.
  public hp = PLAYER_MAX_HP;
  public armor = 0;

  /** Makes this a co-op student's tank (call before it is added). */
  public setRemoteLoadout(loadout: Loadout): void {
    const armorBought =
      this.remoteLoadout !== null && loadout.heavyArmor && !this.remoteLoadout.heavyArmor;
    this.remoteLoadout = { ...loadout };
    if (this.state !== TankState.Uninitialized) {
      this.refreshLoadout(armorBought);
    }
  }

  public isRemote(): boolean {
    return this.remoteLoadout !== null;
  }

  protected setup(updateArgs: GameUpdateArgs): void {
    const { economy, spriteLoader } = updateArgs;

    this.economy = this.isRemote()
      ? null
      : (economy.getPlayer(this.partyIndex) ?? null);
    this.isBrawl = updateArgs.match.isBrawl();
    this.refreshLoadout();
    // Heavy Armor: every life starts with a full Shield
    if (this.getLoadout()?.heavyArmor) {
      this.armor = PLAYER_MAX_SHIELD;
    }

    // Player only has one color
    this.colors.push(TankColorFactory.createPlayerColor(this.partyIndex));

    this.tierSkinAnimations.set(
      TankTier.A,
      new TankSkinAnimation(spriteLoader, TankType.PlayerA(), this.colors),
    );
    this.tierSkinAnimations.set(
      TankTier.B,
      new TankSkinAnimation(spriteLoader, TankType.PlayerB(), this.colors),
    );
    this.tierSkinAnimations.set(
      TankTier.C,
      new TankSkinAnimation(spriteLoader, TankType.PlayerC(), this.colors),
    );
    this.tierSkinAnimations.set(
      TankTier.D,
      new TankSkinAnimation(spriteLoader, TankType.PlayerD(), this.colors),
    );

    this.skinAnimation = this.tierSkinAnimations.get(this.type.tier);

    super.setup(updateArgs);
  }

  // If tier is provided - it means that specific tier needs to be activated
  // when transitioning to the next level.next
  // If not - then most likely powerup has been picked up and we simply need
  // to upgrade the tank one tier up.
  public upgrade(targetTier: TankTier = null, notify = true): void {
    if (this.type.isMaxTier()) {
      return;
    }

    this.type.increaseTier(targetTier);

    this.refreshLoadout();
    this.skinAnimation = this.tierSkinAnimations.get(this.type.tier);

    if (notify === true) {
      this.upgraded.notify({ tier: this.type.tier });
    }
  }

  /**
   * Re-applies shop upgrades on top of the tier attributes. Pass
   * `armorBought` when Heavy Armor was just purchased mid-life so the
   * Shield fills up right away.
   */
  public refreshLoadout(armorBought = false): void {
    const base = TankAttributesFactory.create(this.type);
    const loadout = this.getLoadout();
    this.attributes = loadout ? applyLoadout(base, loadout) : base;

    if (armorBought) {
      this.armor = PLAYER_MAX_SHIELD;
    }
  }

  public isAlive(): boolean {
    return this.hp > 0;
  }

  public die(reason: TankDeathReason = TankDeathReason.Bullet, hitterPartyIndex = null): void {
    this.hp = 0;
    super.die(reason, hitterPartyIndex);
  }

  /** Shield Can: returns the Shield actually added. */
  public addArmor(amount: number): number {
    const gained = Math.min(amount, PLAYER_MAX_SHIELD - this.armor);
    this.armor += gained;
    return gained;
  }

  /** Repair Bay / med pack: returns the HP actually restored. */
  public repair(amount: number): number {
    const gained = Math.min(amount, PLAYER_MAX_HP - this.hp);
    this.hp += gained;
    return gained;
  }

  protected receiveHit(damage: number, hitterPartyIndex: number): void {
    const health = applyDamage({ hp: this.hp, shield: this.armor }, damage * HP_PER_SHELL_DAMAGE);
    this.hp = health.hp;
    this.armor = health.shield;

    this.hit.notify(null);

    if (!this.isAlive()) {
      this.attributes.health = 0;
      this.die(TankDeathReason.Bullet, hitterPartyIndex);
    }
  }

  private getLoadout(): Loadout | null {
    return this.remoteLoadout ?? this.economy?.loadout ?? null;
  }

  // Tank Brawl: rival shells do real damage instead of stunning.
  protected receiveFriendlyFire(bullet: Bullet): void {
    // Co-op battlefield: teammates' shells just stop on the tank
    if (this.isRemote()) {
      return;
    }
    if (!this.isBrawl) {
      super.receiveFriendlyFire(bullet);
      return;
    }
    this.lastHitByPlayer = bullet.ownerPartyIndex;
    this.receiveHit(bullet.tankDamage, bullet.ownerPartyIndex);
    this.lastHitByPlayer = null;
  }

  // Every shot costs a shell; nothing is spent on shots the tank can't take.
  public fire(): boolean {
    if (!this.canFire()) {
      return false;
    }
    if (this.economy !== null && !this.economy.tryFire()) {
      return false;
    }
    return super.fire();
  }

  // Driving burns fuel; an empty tank crawls.
  public move(deltaTime: number): void {
    const speedFactor =
      this.economy !== null ? this.economy.consumeMovement(deltaTime) : 1;
    super.move(deltaTime * speedFactor);
  }

  public moveVector(dx: number, dy: number, deltaTime: number): void {
    const speedFactor =
      this.economy !== null ? this.economy.consumeMovement(deltaTime) : 1;
    super.moveVector(dx, dy, deltaTime * speedFactor);
  }
}

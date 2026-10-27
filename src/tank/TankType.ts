import { TankParty } from './TankParty';
import { TankTier } from './TankTier';
import { TankVariant } from './TankVariant';

export class TankType {
  public party: TankParty;
  public tier: TankTier;
  public hasDrop: boolean;
  public variant: TankVariant;

  constructor(
    party: TankParty,
    tier: TankTier,
    hasDrop = false,
    variant = TankVariant.Normal,
  ) {
    this.party = party;
    this.tier = tier;
    this.hasDrop = hasDrop;
    this.variant = variant;
  }

  public setHasDrop(hasDrop): this {
    this.hasDrop = hasDrop;

    return this;
  }

  public clone(): TankType {
    return new TankType(this.party, this.tier, false, this.variant);
  }

  public isSpecial(): boolean {
    return this.variant !== TankVariant.Normal;
  }

  public increaseTier(targetTier: TankTier = null): this {
    if (targetTier !== null) {
      this.tier = targetTier;

      return this;
    }

    switch (this.tier) {
      case TankTier.A:
        this.tier = TankTier.B;
        break;
      case TankTier.B:
        this.tier = TankTier.C;
        break;
      case TankTier.C:
        this.tier = TankTier.D;
      default:
        break;
    }

    return this;
  }

  public isMaxTier(): boolean {
    return this.tier === TankTier.D;
  }

  public equals(other: TankType): boolean {
    return (
      this.party === other.party &&
      this.tier === other.tier &&
      this.hasDrop === other.hasDrop &&
      this.variant === other.variant
    );
  }

  public serialize(): string {
    const base = `${this.party}-${this.tier}-${this.hasDrop}`;
    return this.isSpecial() ? `${base}-${this.variant}` : base;
  }

  public toString(): string {
    return this.serialize();
  }

  public static PlayerA(): TankType {
    return new TankType(TankParty.Player, TankTier.A);
  }
  public static PlayerB(): TankType {
    return new TankType(TankParty.Player, TankTier.B);
  }
  public static PlayerC(): TankType {
    return new TankType(TankParty.Player, TankTier.C);
  }
  public static PlayerD(): TankType {
    return new TankType(TankParty.Player, TankTier.D);
  }
  public static EnemyA(): TankType {
    return new TankType(TankParty.Enemy, TankTier.A);
  }
  public static EnemyB(): TankType {
    return new TankType(TankParty.Enemy, TankTier.B);
  }
  public static EnemyC(): TankType {
    return new TankType(TankParty.Enemy, TankTier.C);
  }
  public static EnemyD(): TankType {
    return new TankType(TankParty.Enemy, TankTier.D);
  }
  public static EnemyGold(): TankType {
    return new TankType(TankParty.Enemy, TankTier.B, false, TankVariant.Gold);
  }
  public static EnemyBoss(): TankType {
    return new TankType(TankParty.Enemy, TankTier.D, false, TankVariant.Boss);
  }
}

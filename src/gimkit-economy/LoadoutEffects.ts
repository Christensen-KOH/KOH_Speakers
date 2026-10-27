import type { TankAttributes } from '../tank/TankAttributesFactory';
import { TankBulletWallDamage } from '../tank/TankBulletWallDamage';
import { TankVariant } from '../tank/TankVariant';
import * as config from '../config';

import {
  HEAVY_ARMOR_HEALTH,
  Loadout,
  SPEED_BOOST_FACTOR,
} from './Shop';

const TWIN_BLASTER_BULLET_SPEED = 1100;
const SCATTER_VOLLEY = 3;

/**
 * Layers shop upgrades on top of a player tank's tier attributes, so they
 * survive star power-ups and respawns. Returns a new object.
 */
export function applyLoadout(
  base: TankAttributes,
  loadout: Loadout,
): TankAttributes {
  const attributes = { ...base };

  if (loadout.weaponTier >= 1) {
    attributes.bulletSpeed = Math.max(
      attributes.bulletSpeed,
      TWIN_BLASTER_BULLET_SPEED,
    );
    attributes.bulletMaxCount = Math.max(attributes.bulletMaxCount, 2);
  }
  if (loadout.weaponTier >= 2) {
    attributes.bulletWallDamage = TankBulletWallDamage.High;
    attributes.bulletTankDamage = Math.max(attributes.bulletTankDamage, 2);
  }
  if (loadout.weaponTier >= 3) {
    attributes.bulletVolley = SCATTER_VOLLEY;
    attributes.bulletMaxCount = attributes.bulletMaxCount * SCATTER_VOLLEY;
  }
  if (loadout.speedBoost) {
    attributes.moveSpeed = Math.round(attributes.moveSpeed * SPEED_BOOST_FACTOR);
  }
  if (loadout.heavyArmor) {
    attributes.health += HEAVY_ARMOR_HEALTH;
  }

  return attributes;
}

/** Cash paid to the player who destroys a special enemy. */
export function getKillBounty(variant: TankVariant): number {
  switch (variant) {
    case TankVariant.Gold:
      return config.GOLD_TANK_BOUNTY;
    case TankVariant.Boss:
      return config.BOSS_TANK_BOUNTY;
    default:
      return 0;
  }
}

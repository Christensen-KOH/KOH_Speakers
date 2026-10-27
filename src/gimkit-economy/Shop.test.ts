import { describe, expect, it } from 'vitest';

import { TankBulletWallDamage } from '../tank/TankBulletWallDamage';
import { TankVariant } from '../tank/TankVariant';

import { EconomySession } from './EconomySession';
import { DEFAULT_ECONOMY_SETTINGS } from './EconomySettings';
import { applyLoadout, getKillBounty } from './LoadoutEffects';
import {
  getShopOffers,
  OfferStatus,
  purchaseItem,
  ShopItemId,
} from './Shop';

const NO_TURRET = { hasTurret: false };

function playerWithCash(cash: number) {
  const session = new EconomySession(1);
  session.start({ ...DEFAULT_ECONOMY_SETTINGS, startCash: cash }, 1);
  return session.getPlayer(0);
}

function statusOf(player, id: ShopItemId, context = NO_TURRET) {
  return getShopOffers(player, context).find((offer) => offer.item.id === id);
}

const BASE_ATTRIBUTES = {
  bulletMaxCount: 1,
  bulletRapidFireDelay: 0.16,
  bulletSpeed: 600,
  bulletTankDamage: 1,
  bulletWallDamage: TankBulletWallDamage.Low,
  health: 1,
  moveSpeed: 180,
};

describe('Shop', () => {
  it('sells weapon tiers in order', () => {
    const player = playerWithCash(1000);
    expect(statusOf(player, ShopItemId.PlasmaCannon).status).toBe(OfferStatus.Locked);
    expect(purchaseItem(player, ShopItemId.PlasmaCannon, NO_TURRET).ok).toBe(false);

    expect(purchaseItem(player, ShopItemId.TwinBlaster, NO_TURRET).ok).toBe(true);
    expect(statusOf(player, ShopItemId.TwinBlaster).status).toBe(OfferStatus.Owned);
    expect(purchaseItem(player, ShopItemId.PlasmaCannon, NO_TURRET).ok).toBe(true);
    expect(player.loadout.weaponTier).toBe(2);
    expect(player.cash.getBalance()).toBe(1000 - 50 - 150);
  });

  it('refuses purchases the player cannot afford, without charging', () => {
    const player = playerWithCash(40);
    const result = purchaseItem(player, ShopItemId.TwinBlaster, NO_TURRET);
    expect(result).toEqual({ ok: false, reason: 'Need $10 more' });
    expect(player.cash.getBalance()).toBe(40);
  });

  it('steps the question multiplier through its three tiers', () => {
    const player = playerWithCash(1200);
    expect(statusOf(player, ShopItemId.QuestionMultiplier).price).toBe(100);
    purchaseItem(player, ShopItemId.QuestionMultiplier, NO_TURRET);
    expect(statusOf(player, ShopItemId.QuestionMultiplier).price).toBe(300);
    purchaseItem(player, ShopItemId.QuestionMultiplier, NO_TURRET);
    purchaseItem(player, ShopItemId.QuestionMultiplier, NO_TURRET);
    expect(player.getIncomeTier()).toBe(3);
    expect(statusOf(player, ShopItemId.QuestionMultiplier).status).toBe(OfferStatus.Owned);
    expect(player.cash.getBalance()).toBe(0);
  });

  it('allows only one turret at a time but repeats other gadgets', () => {
    const player = playerWithCash(1000);
    expect(
      statusOf(player, ShopItemId.AutoTurret, { hasTurret: true }).status,
    ).toBe(OfferStatus.Unavailable);
    expect(purchaseItem(player, ShopItemId.EmpBlast, NO_TURRET).ok).toBe(true);
    expect(purchaseItem(player, ShopItemId.EmpBlast, NO_TURRET).ok).toBe(true);
  });

  it('makes Speed Boost burn fuel 40% slower', () => {
    const player = playerWithCash(100);
    purchaseItem(player, ShopItemId.SpeedBoost, NO_TURRET);
    player.consumeMovement(10);
    expect(player.getFuel()).toBeCloseTo(100 - 2.5 * 0.6 * 10);
  });

  it('reports pressing fire with no shells', () => {
    const session = new EconomySession(1);
    session.start({ ...DEFAULT_ECONOMY_SETTINGS, startShells: 0 }, 1);
    const player = session.getPlayer(0);
    let refused = 0;
    player.fireRefused.addListener(() => (refused += 1));
    player.tryFire();
    expect(refused).toBe(1);
  });
});

describe('applyLoadout', () => {
  it('stacks every upgrade on top of the base attributes', () => {
    const attributes = applyLoadout(BASE_ATTRIBUTES, {
      weaponTier: 3,
      speedBoost: true,
      heavyArmor: true,
    });
    expect(attributes).toMatchObject({
      bulletSpeed: 1100,
      bulletMaxCount: 6,
      bulletVolley: 3,
      bulletWallDamage: TankBulletWallDamage.High,
      bulletTankDamage: 2,
      moveSpeed: 234,
      health: 3,
    });
    expect(BASE_ATTRIBUTES.health).toBe(1);
  });

  it('pays bounties only for gold and boss tanks', () => {
    expect(getKillBounty(TankVariant.Normal)).toBe(0);
    expect(getKillBounty(TankVariant.Gold)).toBe(75);
    expect(getKillBounty(TankVariant.Boss)).toBe(200);
  });
});

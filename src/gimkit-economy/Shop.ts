import { INCOME_MULTIPLIER_TIERS } from './PayoutTable';
import type { PlayerEconomy } from './PlayerEconomy';

/** Permanent per-player upgrades bought in the shop (reset each match). */
export interface Loadout {
  // 0 none, 1 Twin-Blaster, 2 Plasma Cannon, 3 Scatter Shot
  weaponTier: number;
  speedBoost: boolean;
  heavyArmor: boolean;
}

export function createLoadout(): Loadout {
  return { weaponTier: 0, speedBoost: false, heavyArmor: false };
}

export enum ShopItemId {
  TwinBlaster = 'twin-blaster',
  PlasmaCannon = 'plasma-cannon',
  ScatterShot = 'scatter-shot',
  SpeedBoost = 'speed-boost',
  HeavyArmor = 'heavy-armor',
  BrickBuilder = 'brick-builder',
  SteelFortress = 'steel-fortress',
  AutoTurret = 'auto-turret',
  EmpBlast = 'emp-blast',
  QuestionMultiplier = 'question-multiplier',
}

export enum ShopCategory {
  Weapon = 'Weapons',
  Chassis = 'Chassis',
  Base = 'Base Defense',
  Gadget = 'Gadgets',
  Income = 'Income',
}

export interface ShopItem {
  id: ShopItemId;
  category: ShopCategory;
  name: string;
  description: string;
  icon: string;
}

export enum OfferStatus {
  Available = 'available',
  Owned = 'owned',
  // Needs an earlier tier first.
  Locked = 'locked',
  // Can't be used right now (e.g. a turret is already up).
  Unavailable = 'unavailable',
}

export interface ShopOffer {
  item: ShopItem;
  price: number | null;
  status: OfferStatus;
  // Why it can't be bought, or what the next tier gives.
  note: string | null;
}

export interface ShopContext {
  hasTurret: boolean;
}

export const STEEL_FORTRESS_DURATION = 60;
export const EMP_DURATION = 8;
export const SPEED_BOOST_FACTOR = 1.3;
// Fuel drain multiplier with Speed Boost (it also improves efficiency).
export const SPEED_BOOST_FUEL_FACTOR = 0.6;
export const HEAVY_ARMOR_HEALTH = 2;

const WEAPON_TIERS: [ShopItemId, number][] = [
  [ShopItemId.TwinBlaster, 50],
  [ShopItemId.PlasmaCannon, 150],
  [ShopItemId.ScatterShot, 400],
];

const MULTIPLIER_PRICES = [100, 300, 800];

const FIXED_PRICES: Partial<Record<ShopItemId, number>> = {
  [ShopItemId.SpeedBoost]: 75,
  [ShopItemId.HeavyArmor]: 120,
  [ShopItemId.BrickBuilder]: 60,
  [ShopItemId.SteelFortress]: 200,
  [ShopItemId.AutoTurret]: 250,
  [ShopItemId.EmpBlast]: 100,
};

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: ShopItemId.TwinBlaster,
    category: ShopCategory.Weapon,
    name: 'Twin-Blaster',
    description: 'Faster shells, 2 on screen at once.',
    icon: '🔫',
  },
  {
    id: ShopItemId.PlasmaCannon,
    category: ShopCategory.Weapon,
    name: 'Plasma Cannon',
    description: 'Breaks steel walls and hits for double damage.',
    icon: '⚡',
  },
  {
    id: ShopItemId.ScatterShot,
    category: ShopCategory.Weapon,
    name: 'Scatter Shot',
    description: 'Fires a 3-shell volley for 1 shell.',
    icon: '💥',
  },
  {
    id: ShopItemId.SpeedBoost,
    category: ShopCategory.Chassis,
    name: 'Speed Boost',
    description: '30% faster and uses 40% less fuel.',
    icon: '🏎️',
  },
  {
    id: ShopItemId.HeavyArmor,
    category: ShopCategory.Chassis,
    name: 'Heavy Armor',
    description: '+2 hearts: survive two extra hits per life.',
    icon: '🛡️',
  },
  {
    id: ShopItemId.BrickBuilder,
    category: ShopCategory.Base,
    name: 'Brick Builder',
    description: 'Rebuilds every wall around your base.',
    icon: '🧱',
  },
  {
    id: ShopItemId.SteelFortress,
    category: ShopCategory.Base,
    name: 'Steel Fortress',
    description: `Base walls turn to steel for ${STEEL_FORTRESS_DURATION} s.`,
    icon: '🏰',
  },
  {
    id: ShopItemId.AutoTurret,
    category: ShopCategory.Base,
    name: 'Auto-Turret',
    description: 'A mini-turret above the base shoots enemies.',
    icon: '🗼',
  },
  {
    id: ShopItemId.EmpBlast,
    category: ShopCategory.Gadget,
    name: 'EMP Blast',
    description: `Freezes every enemy tank for ${EMP_DURATION} s.`,
    icon: '🌀',
  },
  {
    id: ShopItemId.QuestionMultiplier,
    category: ShopCategory.Income,
    name: 'Question Multiplier',
    description: 'Earn more cash for every correct answer.',
    icon: '💰',
  },
];

function offer(
  item: ShopItem,
  price: number | null,
  status: OfferStatus,
  note: string | null = null,
): ShopOffer {
  return { item, price, status, note };
}

function getOffer(
  item: ShopItem,
  player: PlayerEconomy,
  context: ShopContext,
): ShopOffer {
  const { loadout } = player;

  const weaponIndex = WEAPON_TIERS.findIndex(([id]) => id === item.id);
  if (weaponIndex !== -1) {
    const price = WEAPON_TIERS[weaponIndex][1];
    if (loadout.weaponTier > weaponIndex) {
      return offer(item, price, OfferStatus.Owned);
    }
    if (loadout.weaponTier < weaponIndex) {
      const previous = SHOP_ITEMS.find(
        (other) => other.id === WEAPON_TIERS[weaponIndex - 1][0],
      );
      return offer(item, price, OfferStatus.Locked, `Needs ${previous.name}`);
    }
    return offer(item, price, OfferStatus.Available);
  }

  switch (item.id) {
    case ShopItemId.SpeedBoost:
      return offer(
        item,
        FIXED_PRICES[item.id],
        loadout.speedBoost ? OfferStatus.Owned : OfferStatus.Available,
      );
    case ShopItemId.HeavyArmor:
      return offer(
        item,
        FIXED_PRICES[item.id],
        loadout.heavyArmor ? OfferStatus.Owned : OfferStatus.Available,
      );
    case ShopItemId.AutoTurret:
      return context.hasTurret
        ? offer(item, FIXED_PRICES[item.id], OfferStatus.Unavailable, 'Already built')
        : offer(item, FIXED_PRICES[item.id], OfferStatus.Available);
    case ShopItemId.QuestionMultiplier: {
      const tier = player.getIncomeTier();
      if (tier >= MULTIPLIER_PRICES.length) {
        return offer(item, null, OfferStatus.Owned, `×${INCOME_MULTIPLIER_TIERS[tier]} cash`);
      }
      return offer(
        item,
        MULTIPLIER_PRICES[tier],
        OfferStatus.Available,
        `×${INCOME_MULTIPLIER_TIERS[tier]} → ×${INCOME_MULTIPLIER_TIERS[tier + 1]} cash`,
      );
    }
    default:
      return offer(item, FIXED_PRICES[item.id] ?? null, OfferStatus.Available);
  }
}

export function getShopOffers(
  player: PlayerEconomy,
  context: ShopContext,
): ShopOffer[] {
  return SHOP_ITEMS.map((item) => getOffer(item, player, context));
}

export type PurchaseResult =
  | { ok: true; item: ShopItem; price: number }
  | { ok: false; reason: string };

/**
 * Charges the player and records permanent upgrades. Level-side effects
 * (walls, turret, EMP, re-arming the live tank) are applied by the caller.
 */
export function purchaseItem(
  player: PlayerEconomy,
  id: ShopItemId,
  context: ShopContext,
): PurchaseResult {
  const item = SHOP_ITEMS.find((candidate) => candidate.id === id);
  if (item === undefined) {
    return { ok: false, reason: 'Unknown item' };
  }

  const current = getOffer(item, player, context);
  if (current.status === OfferStatus.Owned) {
    return { ok: false, reason: 'Already owned' };
  }
  if (current.status !== OfferStatus.Available || current.price === null) {
    return { ok: false, reason: current.note ?? 'Not available' };
  }
  if (!player.cash.spend(current.price)) {
    const missing = current.price - player.cash.getBalance();
    return { ok: false, reason: `Need $${missing} more` };
  }

  const { loadout } = player;
  switch (id) {
    case ShopItemId.TwinBlaster:
    case ShopItemId.PlasmaCannon:
    case ShopItemId.ScatterShot:
      loadout.weaponTier += 1;
      break;
    case ShopItemId.SpeedBoost:
      loadout.speedBoost = true;
      break;
    case ShopItemId.HeavyArmor:
      loadout.heavyArmor = true;
      break;
    case ShopItemId.QuestionMultiplier:
      player.setIncomeTier(player.getIncomeTier() + 1);
      break;
    default:
      break;
  }
  player.changed.notify(player);

  return { ok: true, item, price: current.price };
}

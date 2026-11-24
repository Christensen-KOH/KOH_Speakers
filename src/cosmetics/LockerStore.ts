import { Subject } from '../core/Subject';

import {
  DEFAULT_SKIN,
  DEFAULT_TRAIL,
  getSkin,
  getTrail,
  isSkinId,
  isTrailId,
  SkinId,
  TrailId,
} from './Cosmetics';

const STORAGE_KEY = 'tankkit.locker.v1';
// Guards against a hand-edited or corrupted balance.
const MAX_COINS = 10_000_000;

export interface LockerState {
  coins: number;
  skins: SkinId[];
  trails: TrailId[];
  equippedSkin: SkinId;
  equippedTrail: TrailId;
}

export type BuyResult = 'bought' | 'owned' | 'poor';

function defaults(): LockerState {
  return {
    coins: 0,
    skins: [DEFAULT_SKIN],
    trails: [DEFAULT_TRAIL],
    equippedSkin: DEFAULT_SKIN,
    equippedTrail: DEFAULT_TRAIL,
  };
}

// Never trusts what is in storage: unknown ids are dropped, numbers clamped.
export function sanitizeLocker(raw: unknown): LockerState {
  const base = defaults();
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const data = raw as Record<string, unknown>;
  const coins =
    typeof data.coins === 'number' && Number.isFinite(data.coins)
      ? Math.max(0, Math.min(MAX_COINS, Math.floor(data.coins)))
      : 0;
  const skins = Array.isArray(data.skins) ? data.skins.filter(isSkinId) : [];
  const trails = Array.isArray(data.trails) ? data.trails.filter(isTrailId) : [];
  const ownedSkins = Array.from(new Set<SkinId>([DEFAULT_SKIN, ...skins]));
  const ownedTrails = Array.from(new Set<TrailId>([DEFAULT_TRAIL, ...trails]));
  const equippedSkin =
    isSkinId(data.equippedSkin) && ownedSkins.includes(data.equippedSkin)
      ? data.equippedSkin
      : DEFAULT_SKIN;
  const equippedTrail =
    isTrailId(data.equippedTrail) && ownedTrails.includes(data.equippedTrail)
      ? data.equippedTrail
      : DEFAULT_TRAIL;
  return { ...base, coins, skins: ownedSkins, trails: ownedTrails, equippedSkin, equippedTrail };
}

/**
 * The student's persistent Tank Locker (this device): Locker Coins, owned
 * skins and trails, and the equipped loadout. Coins mirror every dollar of
 * in-match cash earned; spending them never touches match cash.
 */
export class LockerStore {
  public readonly changed = new Subject<LockerState>();
  private state: LockerState;
  private saveTimer: number = null;

  constructor() {
    this.state = sanitizeLocker(this.read());
  }

  public getState(): LockerState {
    return this.state;
  }

  public getCoins(): number {
    return this.state.coins;
  }

  public getEquippedSkin(): SkinId {
    return this.state.equippedSkin;
  }

  public getEquippedTrail(): TrailId {
    return this.state.equippedTrail;
  }

  public ownsSkin(id: SkinId): boolean {
    return this.state.skins.includes(id);
  }

  public ownsTrail(id: TrailId): boolean {
    return this.state.trails.includes(id);
  }

  /** Credits Locker Coins (called for every dollar earned in a match). */
  public addCoins(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }
    this.state = {
      ...this.state,
      coins: Math.min(MAX_COINS, this.state.coins + Math.floor(amount)),
    };
    // Cash pours in during battle: batch the writes
    this.commit(true);
  }

  public buySkin(id: SkinId): BuyResult {
    if (this.ownsSkin(id)) {
      return 'owned';
    }
    const { price } = getSkin(id);
    if (this.state.coins < price) {
      return 'poor';
    }
    this.state = {
      ...this.state,
      coins: this.state.coins - price,
      skins: [...this.state.skins, id],
      equippedSkin: id,
    };
    this.commit();
    return 'bought';
  }

  public buyTrail(id: TrailId): BuyResult {
    if (this.ownsTrail(id)) {
      return 'owned';
    }
    const { price } = getTrail(id);
    if (this.state.coins < price) {
      return 'poor';
    }
    this.state = {
      ...this.state,
      coins: this.state.coins - price,
      trails: [...this.state.trails, id],
      equippedTrail: id,
    };
    this.commit();
    return 'bought';
  }

  public equipSkin(id: SkinId): boolean {
    if (!this.ownsSkin(id)) {
      return false;
    }
    this.state = { ...this.state, equippedSkin: id };
    this.commit();
    return true;
  }

  public equipTrail(id: TrailId): boolean {
    if (!this.ownsTrail(id)) {
      return false;
    }
    this.state = { ...this.state, equippedTrail: id };
    this.commit();
    return true;
  }

  private commit(deferred = false): void {
    this.changed.notify(this.state);
    if (!deferred) {
      this.flush();
      return;
    }
    if (this.saveTimer === null) {
      this.saveTimer = window.setTimeout(() => this.flush(), 1000);
    }
  }

  /** Writes only if a batched save is waiting (never clobbers other tabs). */
  public flushPending(): void {
    if (this.saveTimer !== null) {
      this.flush();
    }
  }

  public reload(): void {
    if (this.saveTimer !== null) {
      return;
    }
    this.state = sanitizeLocker(this.read());
    this.changed.notify(this.state);
  }

  private flush(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Private mode / blocked storage: the locker lasts for this visit only
    }
  }

  private read(): unknown {
    try {
      const json = window.localStorage.getItem(STORAGE_KEY);
      return json ? JSON.parse(json) : null;
    } catch {
      return null;
    }
  }
}

// One locker per device, shared by every screen.
export const lockerStore = new LockerStore();

if (typeof window !== 'undefined') {
  // Don't lose the last batch of coins when the tab closes
  window.addEventListener('pagehide', () => lockerStore.flushPending());
  // Another tab bought or equipped something: pick it up
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      lockerStore.reload();
    }
  });
}

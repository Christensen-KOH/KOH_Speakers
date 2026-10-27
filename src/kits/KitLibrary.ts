import { Subject } from '../core/Subject';

import { BUILT_IN_KITS } from './builtInKits';
import { Kit } from './Kit';

const CUSTOM_KITS_KEY = 'tankkit.customKits';
const ACTIVE_KIT_KEY = 'tankkit.activeKitId';

export interface KitStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// localStorage can be missing or throw (private mode, blocked storage);
// fall back to memory so the game still works for the session.
function createDefaultStore(): KitStore {
  const memory = new Map<string, string>();
  return {
    getItem(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem(key, value) {
      memory.set(key, value);
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Kept in memory only
      }
    },
  };
}

/** Built-in kits plus teacher-made kits saved in localStorage. */
export class KitLibrary {
  public readonly changed = new Subject<void>();
  private readonly store: KitStore;
  private customKits: Kit[] = [];
  private activeKitId: string;

  constructor(store: KitStore = createDefaultStore()) {
    this.store = store;
    this.customKits = this.loadCustomKits();
    this.activeKitId = this.store.getItem(ACTIVE_KIT_KEY) ?? BUILT_IN_KITS[0].id;
  }

  public getAll(): Kit[] {
    return [...BUILT_IN_KITS, ...this.customKits];
  }

  public get(id: string): Kit | null {
    return this.getAll().find((kit) => kit.id === id) ?? null;
  }

  public getActive(): Kit {
    return this.get(this.activeKitId) ?? BUILT_IN_KITS[0];
  }

  public setActive(id: string): void {
    if (this.get(id) === null) {
      return;
    }
    this.activeKitId = id;
    this.store.setItem(ACTIVE_KIT_KEY, id);
    this.changed.notify(null);
  }

  public saveCustom(kit: Kit): void {
    const custom = { ...kit, builtIn: false };
    const index = this.customKits.findIndex((other) => other.id === kit.id);
    if (index === -1) {
      this.customKits.push(custom);
    } else {
      this.customKits[index] = custom;
    }
    this.persist();
  }

  public deleteCustom(id: string): void {
    this.customKits = this.customKits.filter((kit) => kit.id !== id);
    if (this.activeKitId === id) {
      this.activeKitId = BUILT_IN_KITS[0].id;
      this.store.setItem(ACTIVE_KIT_KEY, this.activeKitId);
    }
    this.persist();
  }

  private persist(): void {
    this.store.setItem(CUSTOM_KITS_KEY, JSON.stringify(this.customKits));
    this.changed.notify(null);
  }

  private loadCustomKits(): Kit[] {
    const json = this.store.getItem(CUSTOM_KITS_KEY);
    if (json === null) {
      return [];
    }
    try {
      const kits = JSON.parse(json);
      return Array.isArray(kits)
        ? kits.filter(
            (kit) => kit && typeof kit.id === 'string' && Array.isArray(kit.questions),
          )
        : [];
    } catch {
      return [];
    }
  }
}

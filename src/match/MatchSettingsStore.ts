import {
  DEFAULT_MATCH_SETTINGS,
  MatchSettings,
  sanitizeSettings,
} from './Match';

const STORAGE_KEY = 'tankkit.matchSettings';

export interface SettingsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Remembers the host's last choices; never throws if storage is blocked. */
export class MatchSettingsStore {
  private readonly store: SettingsStore | null;

  constructor(store?: SettingsStore) {
    if (store !== undefined) {
      this.store = store;
      return;
    }
    try {
      this.store = window.localStorage;
    } catch {
      this.store = null;
    }
  }

  public load(): MatchSettings {
    try {
      const json = this.store?.getItem(STORAGE_KEY);
      return json ? sanitizeSettings(JSON.parse(json)) : { ...DEFAULT_MATCH_SETTINGS };
    } catch {
      return { ...DEFAULT_MATCH_SETTINGS };
    }
  }

  public save(settings: MatchSettings): void {
    try {
      this.store?.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Not persisted; the in-memory settings still apply
    }
  }
}

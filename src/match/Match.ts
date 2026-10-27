import {
  DEFAULT_ECONOMY_SETTINGS,
  EconomySettings,
  RewardLevel,
} from '../gimkit-economy/EconomySettings';

export enum MatchMode {
  BaseDefense = 'base-defense',
  TycoonBlitz = 'tycoon-blitz',
  Coop = 'coop',
  Brawl = 'brawl',
  // Student device in a teacher-hosted live class (not a Game Options mode).
  Live = 'live',
}

export interface MatchModeInfo {
  mode: MatchMode;
  name: string;
  players: 1 | 2;
  icon: string;
  description: string;
}

export const MATCH_MODES: MatchModeInfo[] = [
  {
    mode: MatchMode.BaseDefense,
    name: 'Base Defense',
    players: 1,
    icon: '🏰',
    description: 'Survive waves of tanks and bosses. Protect the eagle!',
  },
  {
    mode: MatchMode.TycoonBlitz,
    name: 'Tycoon Blitz',
    players: 1,
    icon: '⏱️',
    description: 'Earn as much cash as you can before the clock runs out. Gold tanks pay big.',
  },
  {
    mode: MatchMode.Coop,
    name: 'Co-op Defense',
    players: 2,
    icon: '🤝',
    description: 'Two players defend one base together, and can share their cash.',
  },
  {
    mode: MatchMode.Brawl,
    name: 'Tank Brawl',
    players: 2,
    icon: '⚔️',
    description: 'Two players compete. Shots hurt each other; a knockout pays $50.',
  },
];

const LIVE_MODE_INFO: MatchModeInfo = {
  mode: MatchMode.Live,
  name: 'Live class',
  players: 1,
  icon: '📡',
  description: "A teacher-hosted game played on every student's device.",
};

export function getModeInfo(mode: MatchMode): MatchModeInfo {
  if (mode === MatchMode.Live) {
    return LIVE_MODE_INFO;
  }
  return MATCH_MODES.find((info) => info.mode === mode) ?? MATCH_MODES[0];
}

/** Choices made on the Host Options screen. */
export interface MatchSettings {
  mode: MatchMode;
  rewardLevel: RewardLevel;
  movementCostsFuel: boolean;
  // Co-op only; Tank Brawl always keeps separate wallets.
  sharedCash: boolean;
  blitzMinutes: number;
  // Teacher Studio balance (see studio/StudioSettings)
  startShells: number;
  startCash: number;
  rewardMultiplier: number;
}

export const BLITZ_MINUTE_OPTIONS = [3, 5, 8];

export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  mode: MatchMode.BaseDefense,
  rewardLevel: RewardLevel.Balanced,
  movementCostsFuel: true,
  sharedCash: true,
  blitzMinutes: 5,
  startShells: DEFAULT_ECONOMY_SETTINGS.startShells,
  startCash: DEFAULT_ECONOMY_SETTINGS.startCash,
  rewardMultiplier: 1,
};

export const KNOCKOUT_BOUNTY = 50;

export enum MatchOutcome {
  Victory = 'victory',
  GameOver = 'game-over',
  TimeUp = 'time-up',
}

export function toEconomySettings(settings: MatchSettings): EconomySettings {
  return {
    ...DEFAULT_ECONOMY_SETTINGS,
    rewardLevel: settings.rewardLevel,
    movementCostsFuel: settings.movementCostsFuel,
    sharedCash: settings.mode === MatchMode.Coop && settings.sharedCash,
    startShells: settings.startShells,
    startCash: settings.startCash,
    rewardMultiplier: settings.rewardMultiplier,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/** Coerces stored or user-provided data into valid settings. */
export function sanitizeSettings(raw: unknown): MatchSettings {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const modes = Object.values(MatchMode) as string[];
  const rewards = Object.values(RewardLevel) as string[];

  return {
    mode: modes.includes(data.mode as string)
      ? (data.mode as MatchMode)
      : DEFAULT_MATCH_SETTINGS.mode,
    rewardLevel: rewards.includes(data.rewardLevel as string)
      ? (data.rewardLevel as RewardLevel)
      : DEFAULT_MATCH_SETTINGS.rewardLevel,
    movementCostsFuel:
      typeof data.movementCostsFuel === 'boolean'
        ? data.movementCostsFuel
        : DEFAULT_MATCH_SETTINGS.movementCostsFuel,
    sharedCash:
      typeof data.sharedCash === 'boolean'
        ? data.sharedCash
        : DEFAULT_MATCH_SETTINGS.sharedCash,
    blitzMinutes: BLITZ_MINUTE_OPTIONS.includes(data.blitzMinutes as number)
      ? (data.blitzMinutes as number)
      : DEFAULT_MATCH_SETTINGS.blitzMinutes,
    startShells: clampNumber(data.startShells, 0, 99, DEFAULT_MATCH_SETTINGS.startShells),
    startCash: clampNumber(data.startCash, 0, 9999, DEFAULT_MATCH_SETTINGS.startCash),
    rewardMultiplier: clampNumber(data.rewardMultiplier, 0.5, 5, 1),
  };
}

/**
 * Settings plus per-match runtime state (Blitz clock, knockouts, outcome).
 * Settings persist between matches; runtime state resets on `begin()`.
 */
export class Match {
  private settings: MatchSettings = { ...DEFAULT_MATCH_SETTINGS };
  private blitzRemaining = 0;
  private knockouts = [0, 0];
  private outcome: MatchOutcome | null = null;
  private liveDurationSeconds = 0;
  // Live: the host ended the game; fire time-up on the next tick.
  private pendingEnd = false;

  public getSettings(): Readonly<MatchSettings> {
    return this.settings;
  }

  public setSettings(settings: MatchSettings): void {
    this.settings = sanitizeSettings(settings);
  }

  public getMode(): MatchMode {
    return this.settings.mode;
  }

  public getPlayerCount(): number {
    return getModeInfo(this.settings.mode).players;
  }

  public isBlitz(): boolean {
    return this.settings.mode === MatchMode.TycoonBlitz;
  }

  public isBrawl(): boolean {
    return this.settings.mode === MatchMode.Brawl;
  }

  public isLive(): boolean {
    return this.settings.mode === MatchMode.Live;
  }

  /** Matches that run against a clock (Blitz, live class). */
  public isTimed(): boolean {
    return this.isBlitz() || this.isLive();
  }

  /** Configures a live-class run; `begin()` follows when the game starts. */
  public startLive(
    balance: Pick<MatchSettings, 'rewardLevel' | 'movementCostsFuel'> &
      Partial<Pick<MatchSettings, 'startShells' | 'startCash' | 'rewardMultiplier'>>,
    durationSeconds: number,
  ): void {
    this.settings = {
      ...DEFAULT_MATCH_SETTINGS,
      ...balance,
      mode: MatchMode.Live,
    };
    this.liveDurationSeconds = Math.max(0, durationSeconds);
  }

  /** Live: align the clock with the server's. */
  public syncRemaining(seconds: number): void {
    if (this.isLive() && this.blitzRemaining > 0) {
      this.blitzRemaining = Math.max(0, seconds);
    }
  }

  /** Live: the host ended the game (or removed this student). */
  public forceEnd(): void {
    if (this.isLive() && this.outcome === null) {
      this.pendingEnd = true;
    }
  }

  /** Called when a new game starts. */
  public begin(): void {
    this.blitzRemaining = this.isLive()
      ? this.liveDurationSeconds
      : this.settings.blitzMinutes * 60;
    this.pendingEnd = false;
    this.knockouts = [0, 0];
    this.outcome = null;
  }

  public getBlitzRemaining(): number {
    return this.blitzRemaining;
  }

  /** Runs the Blitz clock; returns true on the tick it reaches zero. */
  public tickBlitz(seconds: number): boolean {
    if (!this.isTimed()) {
      return false;
    }
    if (this.pendingEnd) {
      this.pendingEnd = false;
      const wasRunning = this.blitzRemaining > 0;
      this.blitzRemaining = 0;
      return wasRunning;
    }
    if (this.blitzRemaining <= 0) {
      return false;
    }
    this.blitzRemaining = Math.max(0, this.blitzRemaining - seconds);
    return this.blitzRemaining === 0;
  }

  public addKnockout(playerIndex: number): void {
    this.knockouts[playerIndex] = (this.knockouts[playerIndex] ?? 0) + 1;
  }

  public getKnockouts(playerIndex: number): number {
    return this.knockouts[playerIndex] ?? 0;
  }

  public setOutcome(outcome: MatchOutcome): void {
    // The first ending wins (e.g. time up before the game-over screens)
    if (this.outcome === null) {
      this.outcome = outcome;
    }
  }

  public isOver(): boolean {
    return this.outcome !== null;
  }

  public getOutcome(): MatchOutcome {
    return this.outcome ?? MatchOutcome.GameOver;
  }
}

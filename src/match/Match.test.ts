import { describe, expect, it } from 'vitest';

import { RewardLevel } from '../gimkit-economy/EconomySettings';

import {
  DEFAULT_MATCH_SETTINGS,
  Match,
  MatchMode,
  MatchOutcome,
  sanitizeSettings,
  toEconomySettings,
} from './Match';
import { MatchSettingsStore } from './MatchSettingsStore';

describe('toEconomySettings', () => {
  it('passes the host balance choices through', () => {
    const economy = toEconomySettings({
      ...DEFAULT_MATCH_SETTINGS,
      rewardLevel: RewardLevel.High,
      movementCostsFuel: false,
    });
    expect(economy.rewardLevel).toBe(RewardLevel.High);
    expect(economy.movementCostsFuel).toBe(false);
  });

  it('shares cash only in co-op', () => {
    const shared = { ...DEFAULT_MATCH_SETTINGS, sharedCash: true };
    expect(toEconomySettings({ ...shared, mode: MatchMode.Coop }).sharedCash).toBe(true);
    expect(toEconomySettings({ ...shared, mode: MatchMode.Brawl }).sharedCash).toBe(false);
    expect(toEconomySettings({ ...shared, mode: MatchMode.BaseDefense }).sharedCash).toBe(false);
  });
});

describe('sanitizeSettings', () => {
  it('replaces unknown values with defaults', () => {
    expect(
      sanitizeSettings({ mode: 'chess', rewardLevel: 'huge', blitzMinutes: 99, sharedCash: 'yes' }),
    ).toEqual(DEFAULT_MATCH_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_MATCH_SETTINGS);
  });
});

describe('Match', () => {
  it('runs the Blitz clock and reports time up once', () => {
    const match = new Match();
    match.setSettings({ ...DEFAULT_MATCH_SETTINGS, mode: MatchMode.TycoonBlitz, blitzMinutes: 3 });
    match.begin();
    expect(match.getBlitzRemaining()).toBe(180);
    expect(match.tickBlitz(179)).toBe(false);
    expect(match.tickBlitz(5)).toBe(true);
    expect(match.tickBlitz(1)).toBe(false);
  });

  it('does not run a clock outside Blitz', () => {
    const match = new Match();
    match.begin();
    expect(match.tickBlitz(10_000)).toBe(false);
  });

  it('counts knockouts and resets them per match', () => {
    const match = new Match();
    match.addKnockout(1);
    match.addKnockout(1);
    expect(match.getKnockouts(1)).toBe(2);
    match.begin();
    expect(match.getKnockouts(1)).toBe(0);
  });

  it('keeps the first outcome of a match', () => {
    const match = new Match();
    match.begin();
    match.setOutcome(MatchOutcome.TimeUp);
    match.setOutcome(MatchOutcome.GameOver);
    expect(match.getOutcome()).toBe(MatchOutcome.TimeUp);
  });

  it('knows the player count of each mode', () => {
    const match = new Match();
    match.setSettings({ ...DEFAULT_MATCH_SETTINGS, mode: MatchMode.Brawl });
    expect(match.getPlayerCount()).toBe(2);
    expect(match.isBrawl()).toBe(true);
  });
});

describe('MatchSettingsStore', () => {
  it('round-trips settings and survives corrupt data', () => {
    const map = new Map<string, string>();
    const backing = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    };
    const store = new MatchSettingsStore(backing);
    const settings = { ...DEFAULT_MATCH_SETTINGS, mode: MatchMode.Coop, blitzMinutes: 8 };
    store.save(settings);
    expect(new MatchSettingsStore(backing).load()).toEqual(settings);

    map.set('tankkit.matchSettings', '{oops');
    expect(new MatchSettingsStore(backing).load()).toEqual(DEFAULT_MATCH_SETTINGS);
  });
});

describe('Match (live)', () => {
  it('runs a server-synced clock and ends early when the host ends', () => {
    const match = new Match();
    match.startLive({ rewardLevel: RewardLevel.Low, movementCostsFuel: false }, 300);
    match.begin();
    expect(match.isLive()).toBe(true);
    expect(match.isTimed()).toBe(true);
    expect(match.getBlitzRemaining()).toBe(300);
    expect(toEconomySettings(match.getSettings()).movementCostsFuel).toBe(false);

    match.syncRemaining(120);
    expect(match.getBlitzRemaining()).toBe(120);

    match.forceEnd();
    expect(match.tickBlitz(0.016)).toBe(true);
    expect(match.tickBlitz(0.016)).toBe(false);
  });
});

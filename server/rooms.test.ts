import { describe, expect, it } from 'vitest';

import type { ServerMessage } from '../src/live/protocol.ts';

import { RoomRegistry } from './rooms.ts';
import type { Peer } from './rooms.ts';

class FakePeer implements Peer {
  public messages: ServerMessage[] = [];

  public send(message: ServerMessage): void {
    this.messages.push(message);
  }

  public last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> {
    const found = [...this.messages].reverse().find((message) => message.type === type);
    return found as Extract<ServerMessage, { type: T }>;
  }
}

const KIT = { id: 'k', name: 'B1 Phrasal Verbs', level: 'B1', questions: [{}, {}] };
const SETTINGS = { durationMinutes: 5, classGoal: 1000, rewardLevel: 'high', movementCostsFuel: true };

function setup() {
  let now = 1_000_000;
  let counter = 0;
  const registry = new RoomRegistry({
    now: () => now,
    random: () => 0,
    makeToken: () => `t${(counter += 1)}`,
  });
  const host = new FakePeer();
  registry.handle(host, { type: 'host:create', kit: KIT, settings: SETTINGS });
  const code = host.last('host:created').code;
  return {
    registry,
    host,
    code,
    advance: (ms: number) => (now += ms),
    join: (nickname: string, playerToken?: string) => {
      const peer = new FakePeer();
      registry.handle(peer, { type: 'join', code: code.toLowerCase(), nickname, playerToken });
      return peer;
    },
  };
}

describe('RoomRegistry', () => {
  it('creates a lobby with a code and sends the kit to joining students', () => {
    const { host, code, join } = setup();
    expect(code).toMatch(/^[0-9]{6}$/);

    const mia = join('  Mia  ');
    const joined = mia.last('joined');
    expect(joined.nickname).toBe('Mia');
    expect(joined.kit.questions).toHaveLength(2);
    expect(host.last('room').room.players.map((player) => player.nickname)).toEqual(['Mia']);
  });

  it('rejects unknown codes, empty names and blocked names', () => {
    const { registry, join } = setup();
    const lost = new FakePeer();
    registry.handle(lost, { type: 'join', code: '999999', nickname: 'Leo' });
    expect(lost.last('error').code).toBe('room-not-found');
    expect(join('   ').last('error').message).toMatch(/nickname/);
    expect(join('B.i.T.c.H').last('error').message).toMatch(/different nickname/);
  });

  it('de-duplicates nicknames', () => {
    const { join } = setup();
    join('Leo');
    expect(join('leo').last('joined').nickname).toBe('leo 2');
  });

  it('runs a timed game and ranks players by cash earned', () => {
    const { registry, host, join, advance } = setup();
    const mia = join('Mia');
    const leo = join('Leo');

    registry.handle(host, { type: 'host:start' });
    expect(mia.last('room').room.status).toBe('playing');
    expect(host.last('room').room.remainingMs).toBe(5 * 60 * 1000);

    registry.handle(mia, { type: 'player:stats', stats: { cashEarned: 120, answered: 5, correct: 4, streak: 2, bestStreak: 3, stage: 1 } });
    registry.handle(leo, { type: 'player:stats', stats: { cashEarned: 300, answered: 9, correct: 9, streak: 9, bestStreak: 9, stage: 2 } });
    registry.tick();
    const room = host.last('room').room;
    expect(room.players.map((player) => player.nickname)).toEqual(['Leo', 'Mia']);
    expect(room.classCash).toBe(420);

    advance(5 * 60 * 1000);
    registry.tick();
    expect(mia.last('room').room.status).toBe('ended');
  });

  it('clamps nonsense stats from a tampered client', () => {
    const { registry, host, join } = setup();
    const cheat = join('Cheat');
    registry.handle(host, { type: 'host:start' });
    registry.handle(cheat, { type: 'player:stats', stats: { cashEarned: -5, answered: 3, correct: 99, stage: 'x' } });
    registry.tick();
    expect(host.last('room').room.players[0].stats).toMatchObject({ cashEarned: 0, answered: 3, correct: 3, stage: 1 });
  });

  it('aggregates mistakes for the host', () => {
    const { registry, host, join } = setup();
    const mia = join('Mia');
    const leo = join('Leo');
    registry.handle(host, { type: 'host:start' });
    const miss = { type: 'player:answer', questionId: 'q1', prompt: 'Look ___ the word', correctText: 'up', correct: false };
    registry.handle(mia, { ...miss, given: 'for' });
    registry.handle(leo, { ...miss, given: 'for' });
    registry.handle(leo, { ...miss, given: 'at' });
    registry.handle(mia, { ...miss, correct: true, given: 'up' });
    registry.tick();
    expect(host.last('host:mistakes').mistakes).toEqual([
      {
        questionId: 'q1',
        prompt: 'Look ___ the word',
        correctText: 'up',
        misses: 3,
        wrongAnswers: [{ text: 'for', count: 2 }, { text: 'at', count: 1 }],
      },
    ]);
  });

  it('lets a student rejoin with their token after a dropped connection', () => {
    const { registry, host, join } = setup();
    const first = join('Mia');
    const { playerToken, playerId } = first.last('joined');
    registry.disconnect(first);
    registry.tick();
    expect(host.last('room').room.players[0].connected).toBe(false);

    const again = join('ignored', playerToken);
    expect(again.last('joined').playerId).toBe(playerId);
    expect(again.last('joined').nickname).toBe('Mia');
  });

  it('adds a reloaded run on top of the earlier totals, but not a reconnect', () => {
    const { registry, host, join } = setup();
    const first = join('Mia');
    const { playerToken } = first.last('joined');
    registry.handle(host, { type: 'host:start' });
    const stats = (cash: number) => ({ cashEarned: cash, answered: 2, correct: 1, streak: 1, bestStreak: 4, stage: 1 });
    registry.handle(first, { type: 'player:stats', stats: stats(100) });

    // Wi-Fi blip: same run continues, totals are not doubled
    const resumed = new FakePeer();
    registry.handle(resumed, { type: 'join', code: 'X', nickname: '', playerToken, resume: true });
    expect(resumed.last('error').code).toBe('room-not-found');
    const code = host.last('room').room.code;
    registry.handle(resumed, { type: 'join', code, nickname: '', playerToken, resume: true });
    registry.handle(resumed, { type: 'player:stats', stats: stats(150) });
    registry.tick();
    expect(host.last('room').room.players[0].stats.cashEarned).toBe(150);

    // Page reload: a new run starts at $0 locally, server keeps the $150
    const reloaded = new FakePeer();
    registry.handle(reloaded, { type: 'join', code, nickname: '', playerToken });
    registry.handle(reloaded, { type: 'player:stats', stats: { ...stats(30), bestStreak: 2 } });
    registry.tick();
    expect(host.last('room').room.players[0].stats).toMatchObject({ cashEarned: 180, answered: 4, bestStreak: 4 });
  });

  it('relays co-op inputs and actions to the host, and the world to students', () => {
    const { registry, host, join } = setup();
    const mia = join('Mia');
    const leo = join('Leo');
    const miaId = mia.last('joined').playerId;

    // Nothing is relayed before the game starts
    registry.handle(mia, { type: 'coop:input', input: { dir: 90 } });
    expect(host.last('coop:input')).toBeUndefined();

    registry.handle(host, { type: 'host:start' });
    registry.handle(mia, { type: 'coop:input', input: { dir: 45, firing: true, fireSeq: 3, loadout: { weaponTier: 9 } } });
    expect(host.last('coop:input')).toEqual({
      type: 'coop:input',
      playerId: miaId,
      input: {
        dir: -1,
        firing: true,
        fireSeq: 3,
        aim: -1,
        crawl: false,
        thinking: false,
        loadout: { weaponTier: 3, speedBoost: false, heavyArmor: false },
      },
    });

    registry.handle(mia, { type: 'coop:action', action: 'emp-blast' });
    expect(host.last('coop:action')).toMatchObject({ nickname: 'Mia', action: 'emp-blast' });
    registry.handle(mia, { type: 'coop:action', action: 'nuke' });
    expect(host.messages.filter((m) => m.type === 'coop:action')).toHaveLength(1);

    const world = { seq: 1, tanks: [], enemies: [] };
    registry.handle(host, { type: 'coop:world', world });
    expect(leo.last('coop:world').world).toEqual(world);

    // Students can't impersonate the host
    registry.handle(mia, { type: 'coop:world', world: { seq: 99 } });
    expect(leo.last('coop:world').world).toEqual(world);
  });

  it('only lets the host start, end or kick', () => {
    const { registry, host, join } = setup();
    const mia = join('Mia');
    registry.handle(mia, { type: 'host:start' });
    expect(mia.last('error').code).toBe('not-host');

    const miaId = mia.last('joined').playerId;
    registry.handle(host, { type: 'host:kick', playerId: miaId });
    expect(mia.last('kicked')).toBeDefined();
    expect(host.last('room').room.players).toEqual([]);
  });

  it('refuses new students after the game ended', () => {
    const { registry, host, join } = setup();
    registry.handle(host, { type: 'host:end' });
    expect(join('Late').last('error').code).toBe('game-ended');
  });

  it('lets the host reconnect with the host token', () => {
    const { registry, host, code } = setup();
    const { hostToken } = host.last('host:created');
    registry.disconnect(host);
    const back = new FakePeer();
    registry.handle(back, { type: 'host:resume', code, hostToken: 'wrong' });
    expect(back.last('error').code).toBe('room-not-found');
    registry.handle(back, { type: 'host:resume', code, hostToken });
    expect(back.last('room').room.code).toBe(code);
  });

  it('closes rooms nobody is connected to after 30 minutes', () => {
    const { registry, host, advance } = setup();
    registry.disconnect(host);
    advance(31 * 60 * 1000);
    registry.tick();
    expect(registry.getRoomCount()).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';

import { emptyStats } from '../live/protocol';

import { CoopRoster, SEAT_GRACE_MS } from './CoopRoster';

function player(id: string, connected = true) {
  return { id, nickname: id.toUpperCase(), connected, stats: emptyStats() };
}

describe('CoopRoster', () => {
  it('seats the first 8 connected students and keeps the rest waiting', () => {
    const roster = new CoopRoster();
    const players = Array.from({ length: 10 }, (_, i) => player(`p${i}`));
    roster.sync(players, 0);
    expect(roster.getSeats().map((seat) => seat.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(roster.getWaiting()).toEqual(['p8', 'p9']);
  });

  it('holds a dropped student’s seat through the grace period', () => {
    const roster = new CoopRoster();
    roster.sync([player('a'), player('b')], 0);
    roster.sync([player('a', false), player('b')], 1000);
    expect(roster.seatOf('a')?.slot).toBe(0);

    roster.sync([player('a', false), player('b'), player('c')], 1000 + SEAT_GRACE_MS + 1);
    expect(roster.seatOf('a')).toBeNull();
    // The freed seat goes to the next student
    expect(roster.seatOf('c')?.slot).toBe(0);
  });

  it('frees the seat of a kicked student at once and moves the queue up', () => {
    const roster = new CoopRoster();
    const players = Array.from({ length: 9 }, (_, i) => player(`p${i}`));
    roster.sync(players, 0);
    roster.sync(players.filter((p) => p.id !== 'p3'), 10);
    expect(roster.seatOf('p8')?.slot).toBe(3);
    expect(roster.getWaiting()).toEqual([]);
  });

  it('keeps inputs and counters on the seat', () => {
    const roster = new CoopRoster();
    roster.sync([player('a')], 0);
    roster.setInput('a', { ...roster.seatOf('a').input, dir: 90 });
    roster.setInput('nobody', roster.seatOf('a').input);
    expect(roster.bySlot(0).input.dir).toBe(90);
  });
});

import { describe, expect, it } from 'vitest';

import { FillBlankQuestion, QuestionKind } from '../kits/Question';

import { MatchMode, MatchOutcome } from './Match';
import { buildMatchReport, collectMistakes, mistakesToKit } from './MatchReport';

function q(id: string): FillBlankQuestion {
  return { id, kind: QuestionKind.FillBlank, prompt: `${id}?`, answers: ['x'] };
}

const PLAYER = {
  score: 1200,
  answered: 8,
  correct: 6,
  bestStreak: 4,
  cashEarned: 210,
  knockouts: 0,
};

describe('collectMistakes', () => {
  it('groups misses by question, most-missed first, and notices later fixes', () => {
    const history = [
      { question: q('a'), correct: false, given: 'one', playerIndex: 0 },
      { question: q('b'), correct: false, given: 'two', playerIndex: 0 },
      { question: q('b'), correct: false, given: 'three', playerIndex: 1 },
      { question: q('a'), correct: true, given: 'x', playerIndex: 0 },
      { question: q('c'), correct: true, given: 'x', playerIndex: 0 },
    ];
    expect(collectMistakes(history)).toEqual([
      { question: q('b'), misses: 2, lastGiven: 'three', players: [0, 1], fixedLater: false },
      { question: q('a'), misses: 1, lastGiven: 'one', players: [0], fixedLater: true },
    ]);
  });
});

describe('buildMatchReport', () => {
  it('computes accuracy and outcome titles', () => {
    const report = buildMatchReport(MatchMode.TycoonBlitz, MatchOutcome.TimeUp, [PLAYER], []);
    expect(report.title).toBe("Time's up!");
    expect(report.subtitle).toBe('Tycoon Blitz');
    expect(report.players[0].accuracy).toBe(75);
  });

  it('crowns the Brawl winner by knockouts, then cash', () => {
    const byKo = buildMatchReport(MatchMode.Brawl, MatchOutcome.GameOver, [
      { ...PLAYER, knockouts: 1 },
      { ...PLAYER, knockouts: 3 },
    ], []);
    expect(byKo.winnerIndex).toBe(1);
    expect(byKo.title).toBe('Player 2 wins the Brawl!');

    const byCash = buildMatchReport(MatchMode.Brawl, MatchOutcome.GameOver, [
      { ...PLAYER, cashEarned: 500 },
      PLAYER,
    ], []);
    expect(byCash.winnerIndex).toBe(0);

    const draw = buildMatchReport(MatchMode.Brawl, MatchOutcome.GameOver, [PLAYER, PLAYER], []);
    expect(draw.winnerIndex).toBeNull();
    expect(draw.title).toBe("It's a draw!");
  });

  it('reports zero accuracy when nothing was answered', () => {
    const report = buildMatchReport(MatchMode.BaseDefense, MatchOutcome.GameOver, [
      { ...PLAYER, answered: 0, correct: 0 },
    ], []);
    expect(report.players[0].accuracy).toBe(0);
    expect(report.title).toBe('Game over');
  });
});

describe('mistakesToKit', () => {
  it('builds a practice kit with fresh ids', () => {
    const mistakes = collectMistakes([
      { question: q('a'), correct: false, given: '', playerIndex: 0 },
    ]);
    const kit = mistakesToKit(mistakes, 'B1 Phrasal Verbs', Date.UTC(2026, 9, 25));
    expect(kit.name).toBe('Review: B1 Phrasal Verbs (2026-10-25)');
    expect(kit.questions).toHaveLength(1);
    expect(kit.questions[0].id).not.toBe('a');
    expect(kit.questions[0].prompt).toBe('a?');
    expect(mistakesToKit([], 'x')).toBeNull();
  });
});

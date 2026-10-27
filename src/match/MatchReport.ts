import type { Kit } from '../kits/Kit';
import type { Question } from '../kits/Question';

import { getModeInfo, MatchMode, MatchOutcome } from './Match';

export interface ReportAnswer {
  question: Question;
  correct: boolean;
  given: string;
  playerIndex: number;
}

export interface ReportPlayerInput {
  score: number;
  answered: number;
  correct: number;
  bestStreak: number;
  cashEarned: number;
  knockouts: number;
}

export interface PlayerReport extends ReportPlayerInput {
  index: number;
  // 0..100, rounded
  accuracy: number;
}

export interface MistakeEntry {
  question: Question;
  misses: number;
  // Most recent wrong answer given.
  lastGiven: string;
  players: number[];
  // Answered correctly after the last miss (spaced repetition worked).
  fixedLater: boolean;
}

export interface MatchReport {
  title: string;
  subtitle: string;
  outcome: MatchOutcome;
  mode: MatchMode;
  players: PlayerReport[];
  // Tank Brawl only; null for a draw or other modes.
  winnerIndex: number | null;
  mistakes: MistakeEntry[];
}

function accuracy(correct: number, answered: number): number {
  return answered === 0 ? 0 : Math.round((correct / answered) * 100);
}

/** Groups wrong answers by question, most-missed first. */
export function collectMistakes(history: ReportAnswer[]): MistakeEntry[] {
  const entries = new Map<string, MistakeEntry>();

  history.forEach((answer) => {
    const { question } = answer;
    const entry = entries.get(question.id);

    if (!answer.correct) {
      if (entry === undefined) {
        entries.set(question.id, {
          question,
          misses: 1,
          lastGiven: answer.given,
          players: [answer.playerIndex],
          fixedLater: false,
        });
      } else {
        entry.misses += 1;
        entry.lastGiven = answer.given;
        entry.fixedLater = false;
        if (!entry.players.includes(answer.playerIndex)) {
          entry.players.push(answer.playerIndex);
        }
      }
    } else if (entry !== undefined) {
      entry.fixedLater = true;
    }
  });

  return Array.from(entries.values()).sort((a, b) => b.misses - a.misses);
}

function brawlWinner(players: PlayerReport[]): number | null {
  if (players.length < 2) {
    return null;
  }
  const [a, b] = players;
  if (a.knockouts !== b.knockouts) {
    return a.knockouts > b.knockouts ? 0 : 1;
  }
  if (a.cashEarned !== b.cashEarned) {
    return a.cashEarned > b.cashEarned ? 0 : 1;
  }
  return null;
}

export function buildMatchReport(
  mode: MatchMode,
  outcome: MatchOutcome,
  players: ReportPlayerInput[],
  history: ReportAnswer[],
): MatchReport {
  const playerReports = players.map((player, index) => ({
    ...player,
    index,
    accuracy: accuracy(player.correct, player.answered),
  }));

  const winnerIndex = mode === MatchMode.Brawl ? brawlWinner(playerReports) : null;

  let title: string;
  if (mode === MatchMode.Brawl) {
    title = winnerIndex === null ? "It's a draw!" : `Player ${winnerIndex + 1} wins the Brawl!`;
  } else if (outcome === MatchOutcome.Victory) {
    title = 'Victory!';
  } else if (outcome === MatchOutcome.TimeUp) {
    title = "Time's up!";
  } else {
    title = 'Game over';
  }

  return {
    title,
    subtitle: getModeInfo(mode).name,
    outcome,
    mode,
    players: playerReports,
    winnerIndex,
    mistakes: collectMistakes(history),
  };
}

/** Turns the missed questions into a custom kit for follow-up practice. */
export function mistakesToKit(
  mistakes: MistakeEntry[],
  sourceKitName: string,
  now = Date.now(),
): Kit | null {
  if (mistakes.length === 0) {
    return null;
  }
  const id = `custom-review-${now.toString(36)}`;
  const date = new Date(now).toISOString().slice(0, 10);
  return {
    id,
    name: `Review: ${sourceKitName} (${date})`,
    level: 'A1',
    description: 'Questions missed in a match',
    builtIn: false,
    questions: mistakes.map((entry, index) => ({
      ...entry.question,
      id: `${id}-q${index + 1}`,
    })),
  };
}

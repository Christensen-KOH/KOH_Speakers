import type { Session } from '../game/Session';
import type { EconomySession } from '../gimkit-economy';
import { getCorrectAnswerText, importKit, Kit, QuestionKind } from '../kits';
import type { Match } from '../match';
import type { AnswerRecord, QuestionController } from '../ui/QuestionController';

import type { LiveSession } from './LiveSession';
import type { LiveKit } from './protocol';

const STATS_INTERVAL_MS = 1000;

/**
 * Turns the host's kit into a playable kit. Validated like an import; ids
 * are deterministic so every student reports the same question ids.
 */
export function kitFromLive(liveKit: LiveKit): Kit | null {
  const { kit } = importKit(
    JSON.stringify({ name: liveKit.name, level: liveKit.level, questions: liveKit.questions }),
    liveKit.name,
    0,
  );
  return kit;
}

/**
 * Connects a student's running game to the live class: streams stats and
 * answers to the teacher, keeps the clock in sync and ends the run when the
 * teacher ends the game.
 */
export class LiveStudentBridge {
  private readonly live: LiveSession;
  private readonly economy: EconomySession;
  private readonly match: Match;
  private readonly session: Session;

  constructor(
    live: LiveSession,
    economy: EconomySession,
    questions: QuestionController,
    match: Match,
    session: Session,
  ) {
    this.live = live;
    this.economy = economy;
    this.match = match;
    this.session = session;

    window.setInterval(this.reportStats, STATS_INTERVAL_MS);
    questions.answered.addListener(this.reportAnswer);

    live.roomChanged.addListener((room) => {
      if (room.status === 'ended' && this.isRunning()) {
        this.match.forceEnd();
      }
    });
    live.removed.addListener(() => {
      if (this.isRunning()) {
        this.match.forceEnd();
      }
    });
  }

  private isRunning(): boolean {
    return this.live.getRole() === 'student' && this.match.isLive() && !this.match.isOver();
  }

  private reportStats = (): void => {
    if (!this.isRunning() || this.live.getRoom()?.status !== 'playing') {
      return;
    }

    const remainingMs = this.live.getRemainingMs();
    if (remainingMs !== null) {
      this.match.syncRemaining(remainingMs / 1000);
    }

    const player = this.economy.getPlayer(0);
    this.live.sendStats({
      cashEarned: player.getCashEarned(),
      answered: player.getAnsweredCount(),
      correct: player.getCorrectCount(),
      streak: player.getStreak(),
      bestStreak: player.getBestStreak(),
      stage: this.session.getLevelNumber(),
    });
  };

  private reportAnswer = (record: AnswerRecord): void => {
    if (!this.isRunning()) {
      return;
    }
    const { question } = record;
    const prompt =
      question.kind === QuestionKind.Listening
        ? `${question.prompt} (heard: “${question.speak}”)`
        : question.prompt;
    this.live.sendAnswer({
      questionId: question.id,
      prompt,
      correctText: getCorrectAnswerText(question),
      given: record.given,
      correct: record.correct,
    });
  };
}

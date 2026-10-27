import { Question } from './Question';

// A missed question comes back after this many turns (3 or 4, picked at
// random so the timing isn't predictable).
const REVIEW_DELAY_MIN = 3;
const REVIEW_DELAY_MAX = 4;
// Don't repeat any of the last N questions when drawing fresh ones.
const RECENT_WINDOW = 2;

/**
 * Serves questions from a kit. Fresh questions come from a shuffled deck;
 * missed questions are scheduled to come back a few turns later and take
 * priority once due (spaced repetition within the match). A reviewed
 * question leaves the review list once it is answered correctly.
 */
export class QuestionQueue {
  private readonly questions: Question[];
  private readonly random: () => number;
  private deck: Question[] = [];
  private readonly reviewDue = new Map<string, number>();
  private readonly recent: string[] = [];
  private turn = 0;

  constructor(questions: Question[], random: () => number = Math.random) {
    if (questions.length === 0) {
      throw new Error('QuestionQueue needs at least one question');
    }
    this.questions = questions;
    this.random = random;
  }

  public getTurn(): number {
    return this.turn;
  }

  public getPendingReviewIds(): string[] {
    return Array.from(this.reviewDue.keys());
  }

  public next(): Question {
    this.turn += 1;

    const question = this.takeDueReview() ?? this.drawFresh();

    this.recent.push(question.id);
    if (this.recent.length > RECENT_WINDOW) {
      this.recent.shift();
    }

    return question;
  }

  public record(questionId: string, correct: boolean): void {
    if (correct) {
      this.reviewDue.delete(questionId);
      return;
    }

    const span = REVIEW_DELAY_MAX - REVIEW_DELAY_MIN + 1;
    const delay = REVIEW_DELAY_MIN + Math.floor(this.random() * span);
    this.reviewDue.set(questionId, this.turn + delay);
  }

  private takeDueReview(): Question | null {
    let dueId: string | null = null;
    let dueTurn = Infinity;

    this.reviewDue.forEach((turn, id) => {
      if (turn <= this.turn && turn < dueTurn) {
        dueId = id;
        dueTurn = turn;
      }
    });

    if (dueId === null) {
      return null;
    }

    // Stays in the review list until answered correctly (see record()).
    // Push it out so it isn't served again before it gets an answer.
    this.reviewDue.set(dueId, Infinity);
    return this.questions.find((question) => question.id === dueId) ?? null;
  }

  private drawFresh(): Question {
    // Questions waiting for review are held back until they are due.
    const isAvailable = (question: Question): boolean =>
      !this.reviewDue.has(question.id) && !this.recent.includes(question.id);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const index = this.deck.findIndex(isAvailable);
      if (index !== -1) {
        return this.deck.splice(index, 1)[0];
      }
      this.reshuffle();
    }

    // Tiny kits: everything is recent or under review, so allow repeats.
    return this.questions[Math.floor(this.random() * this.questions.length)];
  }

  private reshuffle(): void {
    this.deck = [...this.questions];
    for (let i = this.deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }
}

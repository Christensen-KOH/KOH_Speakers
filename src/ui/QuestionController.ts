import { Subject } from '../core/Subject';
import type { EconomySession } from '../gimkit-economy';
import {
  getCorrectAnswerText,
  isChoiceQuestion,
  isTypedAnswerCorrect,
  Kit,
  KitLibrary,
  Question,
  QuestionKind,
  QuestionQueue,
} from '../kits';

import { OverlayGate } from './OverlayGate';
import { questionKeyPlayer, shopKeyPlayer } from './overlayKeys';
import { QuestionModal } from './QuestionModal';
import { Speech } from './Speech';

const OWNER = 'questions';
// Pause after a correct answer so the reward pop can be seen.
const CORRECT_PAUSE_MS = 700;

export interface AnswerRecord {
  question: Question;
  correct: boolean;
  // What the player picked or typed.
  given: string;
  playerIndex: number;
}

interface CurrentQuestion {
  question: Question;
  // order[displayIndex] = index in question.choices
  order: number[];
}

function shuffledIndexes(count: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * The "answer to fuel action" loop: opens the question sheet on Q/Tab,
 * serves questions from the active kit, pays out through the economy,
 * enforces the review cooldown after mistakes and slows the level while
 * the player is answering.
 */
export class QuestionController {
  public readonly answered = new Subject<AnswerRecord>();
  // Player (index) asked to switch to the shop from the sheet.
  public readonly shopRequested = new Subject<number>();
  private readonly modal: QuestionModal;
  private readonly speech = new Speech();
  private readonly economy: EconomySession;
  private readonly gate: OverlayGate;
  private readonly kitLibrary: KitLibrary;
  private kit: Kit = null;
  // Live class: play the host's kit instead of the library's active one.
  private kitOverride: Kit = null;
  private queue: QuestionQueue = null;
  private current: CurrentQuestion = null;
  private history: AnswerRecord[] = [];
  private lockTimer: number = null;
  private isReviewing = false;
  private playerIndex = 0;

  constructor(
    container: HTMLElement,
    economy: EconomySession,
    gate: OverlayGate,
    kitLibrary: KitLibrary,
  ) {
    this.economy = economy;
    this.gate = gate;
    this.kitLibrary = kitLibrary;

    this.modal = new QuestionModal(container);
    this.modal.choicePicked.addListener(this.handleChoice);
    this.modal.textSubmitted.addListener(this.handleTyped);
    this.modal.closeRequested.addListener(() => this.close());
    this.modal.replayRequested.addListener(this.handleReplay);

    document.addEventListener('keydown', this.handleKeyDown, true);

    gate.attached.addListener(() => {
      const kit = this.kitOverride ?? this.kitLibrary.getActive();
      if (this.queue === null || this.kit.id !== kit.id) {
        this.startMatch(kit);
      }
    });
    gate.detached.addListener(() => this.close(true));
  }

  public getHistory(): AnswerRecord[] {
    return this.history;
  }

  public getMistakes(): AnswerRecord[] {
    return this.history.filter((record) => !record.correct);
  }

  /** Starts a fresh match: new queue from the active kit, empty history. */
  public setKitOverride(kit: Kit | null): void {
    this.kitOverride = kit;
  }

  public startMatch(kit: Kit = this.kitOverride ?? this.kitLibrary.getActive()): void {
    this.kit = kit;
    this.queue = new QuestionQueue(kit.questions);
    this.current = null;
    this.history = [];
  }

  public isOpen(): boolean {
    return this.modal.isVisible();
  }

  /** True while a wrong answer is being reviewed (sheet can't close). */
  public isLocked(): boolean {
    return this.isReviewing;
  }

  public open(playerIndex = 0): void {
    // The sheet owns the keyboard: digits, letters and Enter must not
    // drive or fire the tank while answering.
    if (this.isOpen() || !this.gate.acquire(OWNER, playerIndex)) {
      return;
    }
    this.playerIndex = playerIndex;

    this.updateStatus();
    this.modal.open();

    if (this.current === null) {
      this.showNext();
    } else {
      this.modal.focus();
    }
  }

  /** `force` skips the review lock (level ending). */
  public close(force = false): void {
    if (!this.isOpen()) {
      return;
    }
    // Wrong answers must be reviewed before returning to the battle.
    if (this.isReviewing && !force) {
      return;
    }

    if (force) {
      this.clearLock();
    }

    this.speech.cancel();
    this.modal.close();
    this.gate.release(OWNER);
  }

  private showNext(): void {
    this.clearLock();

    const question = this.queue.next();
    const order = isChoiceQuestion(question)
      ? shuffledIndexes(question.choices.length)
      : [];
    this.current = { question, order };

    this.modal.showQuestion({
      question,
      choices: isChoiceQuestion(question)
        ? order.map((index) => question.choices[index])
        : [],
    });
    this.modal.focus();

    if (question.kind === QuestionKind.Listening) {
      this.speech.speak(question.speak);
    }
  }

  private handleChoice = (displayIndex: number): void => {
    const { current } = this;
    if (current === null || this.lockTimer !== null) {
      return;
    }
    const { question, order } = current;
    if (!isChoiceQuestion(question) || displayIndex >= order.length) {
      return;
    }

    const correct = order[displayIndex] === question.correctIndex;
    this.resolve(
      correct,
      question.choices[order[displayIndex]],
      displayIndex,
      order.indexOf(question.correctIndex),
    );
  };

  private handleTyped = (typed: string): void => {
    const { current } = this;
    if (current === null || this.lockTimer !== null) {
      return;
    }
    const { question } = current;
    if (question.kind !== QuestionKind.FillBlank || typed.trim() === '') {
      return;
    }

    this.resolve(isTypedAnswerCorrect(question, typed), typed.trim(), null, null);
  };

  private resolve(
    correct: boolean,
    given: string,
    pickedChoice: number | null,
    correctChoice: number | null,
  ): void {
    const { question } = this.current;
    const player = this.economy.getPlayer(this.playerIndex);
    const result = player.recordAnswer(correct);
    this.queue.record(question.id, correct);

    const record: AnswerRecord = {
      question,
      correct,
      given,
      playerIndex: this.playerIndex,
    };
    this.history.push(record);
    this.answered.notify(record);

    const correctText = getCorrectAnswerText(question);
    const cooldownMs = correct
      ? 0
      : this.economy.getSettings().wrongAnswerCooldown * 1000;

    this.updateStatus();
    this.modal.showResult({
      correct,
      correctChoice,
      pickedChoice,
      correctText,
      explanation: question.explanation,
      payout: result.payout,
      streak: result.streak,
      cooldownMs,
    });

    if (!correct) {
      this.isReviewing = true;
      this.speech.speak(correctText, 0.85);
    }

    // The question is answered either way; a closed sheet gets a new one.
    this.current = null;
    this.lockTimer = window.setTimeout(
      () => {
        this.lockTimer = null;
        this.isReviewing = false;
        if (this.isOpen()) {
          this.showNext();
        }
      },
      correct ? CORRECT_PAUSE_MS : cooldownMs,
    );
  }

  private handleReplay = (): void => {
    if (this.current !== null) {
      const { question } = this.current;
      if (question.kind === QuestionKind.Listening) {
        this.speech.speak(question.speak);
        return;
      }
    }
    // During review: pronounce the answer that was just shown.
    const last = this.history[this.history.length - 1];
    if (last !== undefined) {
      this.speech.speak(getCorrectAnswerText(last.question), 0.85);
    }
  };

  private clearLock(): void {
    if (this.lockTimer !== null) {
      window.clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
    this.isReviewing = false;
  }

  private updateStatus(): void {
    const player = this.economy.getPlayer(this.playerIndex);
    this.modal.setStatus({
      kitName:
        (this.gate.getPlayerCount() > 1
          ? `Player ${this.playerIndex + 1} · `
          : '') + (this.kit ? this.kit.name : ''),
      cash: player.cash.getBalance(),
      shells: player.getShells(),
      fuel: (player.getFuel() / player.getMaxFuel()) * 100,
      streak: player.getStreak(),
    });
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.gate.getLevel() === null || event.repeat) {
      return;
    }

    const key = event.key;

    if (!this.isOpen()) {
      if (!this.gate.isFree()) {
        return;
      }
      const player = questionKeyPlayer(key, this.gate.getPlayerCount());
      if (player !== null) {
        event.preventDefault();
        this.open(player);
      }
      return;
    }

    // Keep the sheet's keys away from the page and the game.
    event.stopImmediatePropagation();

    if (key === 'Escape' || key === 'Tab') {
      event.preventDefault();
      this.close();
      return;
    }

    if (this.modal.isTyping()) {
      // Enter submits through the form; everything else is typing.
      return;
    }

    if (questionKeyPlayer(key, this.gate.getPlayerCount()) !== null) {
      event.preventDefault();
      this.close();
    } else if (key >= '1' && key <= '4') {
      event.preventDefault();
      this.handleChoice(Number(key) - 1);
    } else if (key === 'r' || key === 'R') {
      event.preventDefault();
      this.handleReplay();
    } else if (
      shopKeyPlayer(key, this.gate.getPlayerCount()) !== null &&
      !this.isReviewing
    ) {
      event.preventDefault();
      this.close();
      this.shopRequested.notify(this.playerIndex);
    }
  };
}

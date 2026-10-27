import { Subject } from '../core/Subject';
import type { Payout } from '../gimkit-economy';
import { Question, QuestionKind, isChoiceQuestion } from '../kits';

import { isTouchUi } from './touchUi';

import './styles/modal.css';

export interface QuestionView {
  question: Question;
  // Choice text in display order (choice questions only).
  choices: string[];
}

export interface ModalStatus {
  kitName: string;
  cash: number;
  shells: number;
  fuel: number;
  streak: number;
}

export interface ModalResult {
  correct: boolean;
  // Display index of the correct tile (choice questions).
  correctChoice: number | null;
  // Display index the player picked (choice questions).
  pickedChoice: number | null;
  correctText: string;
  explanation?: string;
  payout: Payout | null;
  streak: number;
  cooldownMs: number;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/**
 * Gimkit-style question sheet. Pure view: it renders questions and results
 * and reports what the player chose; QuestionController owns the rules.
 */
export class QuestionModal {
  public readonly choicePicked = new Subject<number>();
  public readonly textSubmitted = new Subject<string>();
  public readonly closeRequested = new Subject<void>();
  public readonly replayRequested = new Subject<void>();

  private readonly root = el('div', 'tk-qm');
  private readonly panel = el('div', 'tk-qm-panel tk-glass');
  private readonly kitLabel = el('span', 'tk-qm-kit');
  private readonly streakChip = el('span', 'tk-chip tk-chip--streak');
  private readonly cashChip = el('span', 'tk-chip tk-chip--cash');
  private readonly shellsChip = el('span', 'tk-chip tk-chip--shells');
  private readonly fuelChip = el('span', 'tk-chip tk-chip--fuel');
  private readonly prompt = el('div', 'tk-qm-prompt');
  private readonly body = el('div');
  private readonly feedback = el('div', 'tk-qm-feedback');
  private readonly hint = el('div', 'tk-qm-hint');
  private tiles: HTMLButtonElement[] = [];
  private input: HTMLInputElement = null;
  private submitButton: HTMLButtonElement = null;

  constructor(container: HTMLElement) {
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Answer questions');
    this.feedback.setAttribute('aria-live', 'polite');

    const header = el('div', 'tk-qm-header');
    const close = el('button', 'tk-qm-close');
    close.type = 'button';
    close.append('✕ Resume Battle ');
    close.append(el('kbd', undefined, 'Esc'));
    close.addEventListener('click', () => this.closeRequested.notify(null));
    header.append(
      this.kitLabel,
      this.streakChip,
      this.cashChip,
      this.shellsChip,
      this.fuelChip,
      close,
    );

    this.panel.append(header, this.prompt, this.body, this.feedback, this.hint);
    this.root.append(this.panel);

    // Clicking the dimmed backdrop (not the panel) closes the sheet.
    this.root.addEventListener('mousedown', (event) => {
      if (event.target === this.root) {
        this.closeRequested.notify(null);
      }
    });

    container.append(this.root);
  }

  public isVisible(): boolean {
    return this.root.classList.contains('is-open');
  }

  public isTyping(): boolean {
    return this.input !== null && document.activeElement === this.input;
  }

  public open(): void {
    this.root.classList.add('is-open');
  }

  public close(): void {
    this.root.classList.remove('is-open');
    if (this.input !== null) {
      this.input.blur();
    }
  }

  public setStatus(status: ModalStatus): void {
    this.kitLabel.textContent = status.kitName;
    this.streakChip.textContent = `🔥 ${status.streak}`;
    this.streakChip.title = 'Streak';
    this.cashChip.textContent = `$${status.cash}`;
    this.shellsChip.textContent = `● ${status.shells}`;
    this.shellsChip.title = 'Shells';
    this.fuelChip.textContent = `⛽ ${Math.round(status.fuel)}%`;
    this.fuelChip.title = 'Fuel';
  }

  public showQuestion(view: QuestionView): void {
    const { question } = view;

    this.root.classList.remove('is-answered');
    this.feedback.replaceChildren();
    this.prompt.replaceChildren();
    this.body.replaceChildren();
    this.tiles = [];
    this.input = null;
    this.submitButton = null;

    if (question.kind === QuestionKind.Listening) {
      const audio = el('button', 'tk-qm-audio', '🔊');
      audio.type = 'button';
      audio.title = 'Play again (R)';
      audio.setAttribute('aria-label', 'Play the audio again');
      audio.addEventListener('click', () => this.replayRequested.notify(null));
      this.prompt.append(audio);
    }
    this.prompt.append(el('span', undefined, question.prompt));

    if (isChoiceQuestion(question)) {
      const grid = el('div', 'tk-qm-tiles');
      view.choices.forEach((choice, index) => {
        const tile = el('button', 'tk-qm-tile');
        tile.type = 'button';
        tile.append(el('span', 'tk-qm-tile-key', String(index + 1)), choice);
        tile.addEventListener('click', () => this.choicePicked.notify(index));
        grid.append(tile);
        this.tiles.push(tile);
      });
      this.body.append(grid);
      if (isTouchUi()) {
        this.hint.textContent =
          question.kind === QuestionKind.Listening
            ? 'Tap 🔊 to listen again, then tap an answer'
            : 'Tap an answer';
      } else {
        this.hint.textContent =
          question.kind === QuestionKind.Listening
            ? 'Press 1–4 to answer · R to listen again · Q to go back'
            : 'Press 1–4 to answer · Q to go back';
      }
    } else {
      const form = el('form', 'tk-qm-form');
      this.input = el('input', 'tk-qm-input');
      this.input.type = 'text';
      this.input.autocomplete = 'off';
      this.input.spellcheck = false;
      this.input.setAttribute('aria-label', 'Your answer');
      this.input.placeholder = 'Type your answer…';
      this.submitButton = el('button', 'tk-btn', 'Submit');
      this.submitButton.type = 'submit';
      form.append(this.input, this.submitButton);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        this.textSubmitted.notify(this.input.value);
      });
      this.body.append(form);
      this.hint.textContent = isTouchUi()
        ? 'Type your answer, then tap Submit'
        : 'Enter to submit · Esc to go back';
    }
  }

  /** Moves keyboard focus into the sheet once it is visible. */
  public focus(): void {
    if (this.input !== null && !this.input.disabled) {
      this.input.focus();
    }
  }

  public showResult(result: ModalResult): void {
    this.root.classList.add('is-answered');
    this.tiles.forEach((tile, index) => {
      tile.disabled = true;
      tile.classList.toggle('is-correct', index === result.correctChoice);
      tile.classList.toggle('is-picked', index === result.pickedChoice);
    });
    if (this.input !== null) {
      this.input.disabled = true;
      this.submitButton.disabled = true;
      this.input.classList.add(result.correct ? 'is-correct' : 'is-wrong');
    }

    this.feedback.replaceChildren();

    if (result.correct && result.payout !== null) {
      const rewards = el('div', 'tk-qm-rewards');
      rewards.append(
        el('span', 'tk-chip tk-chip--cash', `+$${result.payout.cash}`),
        el('span', 'tk-chip tk-chip--shells', `+${result.payout.shells} shells`),
        el('span', 'tk-chip tk-chip--fuel', `+${result.payout.fuel} fuel`),
      );
      if (result.streak > 1) {
        rewards.append(
          el('span', 'tk-chip tk-chip--streak', `🔥 ${result.streak} streak`),
        );
      }
      this.feedback.append(rewards);
      return;
    }

    const title = el('div', 'tk-qm-review-title', 'Not quite. Review the answer:');
    const answer = el('div', 'tk-qm-review-answer');
    const say = el('button', 'tk-qm-audio', '🔊');
    say.type = 'button';
    say.style.width = '36px';
    say.style.height = '36px';
    say.style.fontSize = '16px';
    say.setAttribute('aria-label', 'Hear the answer');
    say.addEventListener('click', () => this.replayRequested.notify(null));
    answer.append(say, result.correctText);
    this.feedback.append(title, answer);

    if (result.explanation) {
      this.feedback.append(el('div', 'tk-qm-explain', result.explanation));
    }

    if (result.cooldownMs > 0) {
      const bar = el('div', 'tk-qm-cooldown');
      const fill = el('div');
      fill.style.animationDuration = `${result.cooldownMs}ms`;
      bar.append(fill);
      this.feedback.append(bar);
    }
    this.hint.textContent = 'Next question in a moment…';
  }

  public destroy(): void {
    this.root.remove();
  }
}

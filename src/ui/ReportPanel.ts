import { Subject } from '../core/Subject';
import { getCorrectAnswerText, Kit, QuestionKind } from '../kits';
import { MatchMode, MatchReport, MistakeEntry, PlayerReport } from '../match';

import { Speech } from './Speech';

import './styles/kit-manager.css';
import './styles/report.css';

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

function stat(kind: string, value: string, label: string): HTMLElement {
  const tile = el('div', `tk-report-stat tk-report-stat--${kind}`);
  tile.append(
    el('span', 'tk-report-stat-value', value),
    el('span', 'tk-report-stat-label', label),
  );
  return tile;
}

/**
 * End-of-game "Gimkit Report": per-player accuracy, questions, streak,
 * cash and score, plus the Mistake Review Vault with pronunciation buttons.
 */
export class ReportPanel {
  public readonly continueRequested = new Subject<void>();
  // Asks the scene to save missed questions as a practice kit.
  public readonly saveKitRequested = new Subject<void>();
  private readonly root = el('div', 'tk-report');
  private readonly message = el('span', 'tk-km-message');
  private readonly speech = new Speech();

  constructor(container: HTMLElement, report: MatchReport) {
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Match report');

    const panel = el('div', 'tk-report-panel tk-glass');

    const header = el('div', 'tk-report-header');
    header.append(
      el('h1', 'tk-report-title', report.title),
      el('span', 'tk-report-subtitle', report.subtitle),
    );

    const body = el('div', 'tk-report-body');
    body.append(this.buildPlayers(report), this.buildVault(report.mistakes));

    const footer = el('div', 'tk-report-footer');
    this.message.setAttribute('aria-live', 'polite');
    footer.append(this.message);
    if (report.mistakes.length > 0) {
      const save = el('button', 'tk-btn tk-btn--ghost', 'Save mistakes as a practice kit');
      save.type = 'button';
      save.addEventListener('click', () => {
        save.disabled = true;
        this.saveKitRequested.notify(null);
      });
      footer.append(save);
    }
    const next = el('button', 'tk-btn tk-btn--start', 'Continue ▶');
    next.type = 'button';
    next.addEventListener('click', () => this.continueRequested.notify(null));
    footer.append(next);

    panel.append(header, body, footer);
    this.root.append(panel);

    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.continueRequested.notify(null);
      }
    });

    container.append(this.root);
    next.focus();
  }

  public showSavedKit(kit: Kit): void {
    this.message.className = 'tk-km-message is-success';
    const count = kit.questions.length;
    this.message.textContent = `Saved "${kit.name}" (${count} ${count === 1 ? 'question' : 'questions'}). Pick it in Game Options to practise.`;
  }

  public destroy(): void {
    this.speech.cancel();
    this.root.remove();
  }

  private buildPlayers(report: MatchReport): HTMLElement {
    const grid = el('div', 'tk-report-players');
    const multi = report.players.length > 1;

    report.players.forEach((player: PlayerReport) => {
      const card = el('section', 'tk-report-player');
      const isWinner = report.winnerIndex === player.index;
      card.classList.toggle('is-winner', isWinner);

      const heading = el('h2', undefined, multi ? `Player ${player.index + 1}` : 'Your results');
      if (isWinner) {
        heading.append(' 🏆');
      }

      const stats = el('div', 'tk-report-stats');
      stats.append(
        stat('accuracy', `${player.accuracy}%`, 'Accuracy'),
        stat('answered', `${player.correct}/${player.answered}`, 'Correct answers'),
        stat('streak', `🔥 ${player.bestStreak}`, 'Longest streak'),
        stat('cash', `$${player.cashEarned}`, 'Cash earned'),
        stat('score', String(player.score), 'Score'),
      );
      if (report.mode === MatchMode.Brawl) {
        stats.append(stat('ko', String(player.knockouts), 'Knockouts'));
      }

      card.append(heading, stats);
      grid.append(card);
    });

    return grid;
  }

  private buildVault(mistakes: MistakeEntry[]): HTMLElement {
    const section = el('section', 'tk-report-section');
    section.append(el('h2', undefined, `🔐 Mistake Review Vault (${mistakes.length})`));

    if (mistakes.length === 0) {
      section.append(el('div', 'tk-report-empty', 'No mistakes, perfect game! 🎉'));
      return section;
    }

    const list = el('ul', 'tk-vault');
    mistakes.forEach((entry) => list.append(this.buildMistake(entry)));
    section.append(list);
    return section;
  }

  private buildMistake(entry: MistakeEntry): HTMLElement {
    const { question } = entry;
    const correct = getCorrectAnswerText(question);
    const item = el('li', 'tk-vault-item');

    const say = el('button', 'tk-qm-audio', '🔊');
    say.type = 'button';
    say.setAttribute('aria-label', `Hear "${correct}"`);
    say.title = 'Hear the correct answer';
    say.addEventListener('click', () => {
      // Listening items replay the original audio, then the answer
      if (question.kind === QuestionKind.Listening) {
        this.speech.speak(question.speak, 0.85);
      } else {
        this.speech.speak(correct, 0.85);
      }
    });

    const prompt = el('div', 'tk-vault-prompt', question.prompt);
    if (question.kind === QuestionKind.Listening) {
      prompt.append(' ', el('span', 'tk-vault-heard', `(heard: “${question.speak}”)`));
    }

    const answers = el('div', 'tk-vault-answers');
    if (entry.lastGiven) {
      const given = el('span');
      given.append('You said: ', el('span', 'tk-vault-given', entry.lastGiven));
      answers.append(given);
    }
    const right = el('span');
    right.append('Answer: ', el('span', 'tk-vault-correct', correct));
    answers.append(right);

    const badges = el('div', 'tk-vault-badges');
    badges.append(el('span', 'tk-vault-badge', `missed ×${entry.misses}`));
    if (entry.fixedLater) {
      badges.append(el('span', 'tk-vault-badge tk-vault-badge--fixed', '✓ fixed later'));
    }

    item.append(say, prompt, badges, answers);
    if (question.explanation) {
      item.append(el('div', 'tk-vault-explain', question.explanation));
    }
    return item;
  }
}

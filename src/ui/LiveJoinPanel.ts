import { Subject } from '../core/Subject';
import {
  CODE_LENGTH,
  LiveSession,
  NICKNAME_MAX_LENGTH,
  normalizeCode,
} from '../live';

import { isTouchUi } from './touchUi';

import './styles/kit-manager.css';
import './styles/live.css';

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
 * Student side of a live class: enter the code and a nickname, wait in the
 * lobby, then `startRequested` fires when the teacher starts the game.
 */
export class LiveJoinPanel {
  public readonly startRequested = new Subject<void>();
  public readonly exitRequested = new Subject<void>();
  private readonly live: LiveSession;
  private readonly root = el('div', 'tk-live');
  private readonly card = el('div', 'tk-join tk-glass');
  private readonly unsubscribers: (() => void)[] = [];
  private code: string;
  private nickname = '';
  private joining = false;
  private error = '';

  constructor(container: HTMLElement, live: LiveSession, initialCode = '') {
    this.live = live;
    this.code = normalizeCode(initialCode);

    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Join a live class');
    this.root.append(this.card);
    container.append(this.root);

    this.unsubscribers.push(
      live.roomChanged.addListener((room) => {
        this.joining = false;
        if (room.status === 'playing' && live.getKit() !== null) {
          this.startRequested.notify(null);
          return;
        }
        this.render();
      }),
      live.errored.addListener((error) => {
        this.joining = false;
        this.error = error.message;
        if (error.code === 'room-not-found' || error.code === 'game-ended') {
          this.live.leave();
        }
        this.render();
      }),
      live.removed.addListener((reason) => {
        this.error =
          reason === 'kicked' ? 'Your teacher removed you from the game.' : 'The game has closed.';
        this.live.leave();
        this.render();
      }),
    );

    this.render();
  }

  public destroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.root.remove();
  }

  private render(): void {
    const room = this.live.getRoom();
    const nickname = this.live.getNickname();
    this.card.replaceChildren();

    if (room !== null && nickname !== null && this.live.getRole() === 'student') {
      this.renderLobby(room.kitName, nickname, room.players.length, room.status);
    } else {
      this.renderForm();
    }
  }

  private renderForm(): void {
    const form = el('form');
    form.className = 'tk-join';
    form.style.padding = '0';
    form.style.width = '100%';

    form.append(el('h1', undefined, 'Join a live game'));

    const codeLabel = el('label', 'tk-host-field');
    const codeInput = el('input', 'tk-km-field tk-join-code');
    codeInput.value = this.code;
    codeInput.maxLength = CODE_LENGTH;
    codeInput.autocomplete = 'off';
    codeInput.spellcheck = false;
    codeInput.setAttribute('autocapitalize', 'characters');
    codeInput.setAttribute('aria-label', 'Game code');
    codeInput.placeholder = 'CODE';
    codeInput.addEventListener('input', () => {
      this.code = normalizeCode(codeInput.value);
      codeInput.value = this.code;
    });
    codeLabel.append(el('span', undefined, 'Game code'), codeInput);

    const nameLabel = el('label', 'tk-host-field');
    const nameInput = el('input', 'tk-km-field tk-join-big');
    nameInput.value = this.nickname;
    nameInput.maxLength = NICKNAME_MAX_LENGTH;
    nameInput.autocomplete = 'off';
    nameInput.placeholder = 'Nickname';
    nameInput.addEventListener('input', () => (this.nickname = nameInput.value));
    nameLabel.append(
      el('span', undefined, 'Nickname'),
      nameInput,
      el('small', 'tk-km-help', 'Use a first name or nickname; no full names needed.'),
    );

    const message = el('div', 'tk-km-message is-error', this.error);
    message.setAttribute('role', 'alert');

    const submit = el('button', 'tk-btn tk-btn--start tk-join-big', this.joining ? 'Joining…' : 'Join ▶');
    submit.type = 'submit';
    submit.disabled = this.joining;

    const back = el('button', 'tk-btn tk-btn--ghost', 'Back to menu');
    back.type = 'button';
    back.addEventListener('click', () => this.exitRequested.notify(null));

    form.append(codeLabel, nameLabel, message, submit, back);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.code.length !== CODE_LENGTH) {
        this.error = `The code has ${CODE_LENGTH} characters.`;
        this.render();
        return;
      }
      if (this.nickname.trim() === '') {
        this.error = 'Please type a nickname.';
        this.render();
        return;
      }
      this.error = '';
      this.joining = true;
      this.live.join(this.code, this.nickname);
      this.render();
    });

    this.card.append(form);
    (this.code.length === CODE_LENGTH ? nameInput : codeInput).focus();
  }

  private renderLobby(kitName: string, nickname: string, playerCount: number, status: string): void {
    const wait = el('div', 'tk-join-wait');
    wait.append(el('div', 'tk-join-pulse', '📡'), el('h1', undefined, `You're in, ${nickname}!`));

    if (status === 'ended') {
      wait.append(el('p', undefined, 'This game has finished.'));
    } else {
      const line = el('p');
      line.append('Waiting for your teacher to start… ', el('strong', undefined, `${playerCount} playing`));
      wait.append(line, el('p', 'tk-km-help', `Kit: ${kitName}`));
    }

    const tips = el('p', 'tk-km-help');
    tips.append(
      isTouchUi()
        ? 'Pad moves · 🔥 fires · ❓ answers questions · 🛒 opens the shop. Turn your device sideways for a bigger view.'
        : 'Arrows move · Z fires · Q answers questions · B opens the shop',
    );

    const leave = el('button', 'tk-btn tk-btn--ghost', 'Leave');
    leave.type = 'button';
    leave.addEventListener('click', () => {
      this.live.leave();
      this.exitRequested.notify(null);
    });

    this.card.append(wait, tips, leave);
  }
}

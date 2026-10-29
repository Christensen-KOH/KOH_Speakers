import { showQrModal } from './qr';

import './styles/topbar.css';

export interface HostPillActions {
  freeze(): void;
  bonus(): void;
  end(): void;
  details(): void;
  flashcard(): void;
}

// Buttons rest this long after use so a stray double-click can't spam them.
const COOLDOWN_MS = 8000;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/**
 * The teacher's [ 👑 Host ] pill in the top bar. Collapsed it is one small
 * button; opened it shows the room code and the host actions (freeze the
 * class, drop a bonus, end the match), so nothing sits on the battlefield.
 */
export class HostPill {
  private readonly wrapper = el('div', 'tk-hostpill');
  private readonly toggle = el('button', 'tk-topbar-btn tk-hostpill-toggle', '👑 Host');
  private readonly menu = el('div', 'tk-hostpill-menu tk-glass');
  private readonly code = el('span', 'tk-hostpill-code');
  private readonly timer = el('span', 'tk-hostpill-timer');
  private open = false;

  constructor(slot: HTMLElement, actions: HostPillActions) {
    this.toggle.type = 'button';
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.addEventListener('click', () => {
      this.toggle.blur();
      this.setOpen(!this.open);
    });

    const qr = el('button', 'tk-topbar-btn tk-hostpill-qr', '📱 QR');
    qr.type = 'button';
    qr.title = 'Show the join QR code';
    qr.addEventListener('click', () => {
      qr.blur();
      showQrModal(this.code.textContent ?? '');
    });

    const codeRow = el('div', 'tk-hostpill-row');
    codeRow.append(el('span', 'tk-hostpill-label', 'Room Code'), this.code, this.timer);

    this.menu.hidden = true;
    this.menu.append(
      codeRow,
      this.action('❄️ Freeze Class', actions.freeze, true),
      this.action('🎁 Bonus Drop', actions.bonus, true),
      this.action('🃏 Show Flashcard', actions.flashcard, false),
      this.action('📊 Details', actions.details, false),
      this.action('⏹️ End Match', actions.end, false, 'tk-hostpill-danger'),
    );

    this.wrapper.append(qr, this.toggle, this.menu);
    this.wrapper.hidden = true;
    slot.append(this.wrapper);
  }

  public setVisible(visible: boolean): void {
    this.wrapper.hidden = !visible;
    if (!visible) {
      this.setOpen(false);
    }
  }

  public setCode(code: string): void {
    this.code.textContent = code;
  }

  public setTimer(text: string): void {
    if (this.timer.textContent !== text) {
      this.timer.textContent = text;
    }
  }

  public destroy(): void {
    this.wrapper.remove();
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.menu.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
  }

  private action(
    text: string,
    onClick: () => void,
    cooldown: boolean,
    extraClass = '',
  ): HTMLButtonElement {
    const node = el('button', `tk-hostpill-action ${extraClass}`.trim(), text);
    node.type = 'button';
    node.addEventListener('click', () => {
      node.blur();
      onClick();
      if (cooldown) {
        node.disabled = true;
        window.setTimeout(() => {
          node.disabled = false;
        }, COOLDOWN_MS);
      }
    });
    return node;
  }
}

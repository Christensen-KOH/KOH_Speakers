import * as config from '../config';
import { Subject } from '../core/Subject';

import './styles/hud.css';

export interface HudPlayerState {
  cash: number;
  // 0..1
  fuel: number;
  shells: number;
  streak: number;
  // Hearts left on the tank (shown with Heavy Armor); 0 hides them.
  hearts: number;
}

export type PopupKind = 'cash' | 'shells' | 'fuel' | 'spend';

const LOW_FUEL = 0.2;
const POPUP_LIFETIME_MS = 1100;

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

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

interface PlayerWidgets {
  group: HTMLDivElement;
  cash: HTMLSpanElement;
  fuel: HTMLSpanElement;
  fuelFill: HTMLDivElement;
  shells: HTMLSpanElement;
  streak: HTMLSpanElement;
  hearts: HTMLSpanElement;
}

/**
 * Top HUD (cash, fuel, shells, streak, hearts, wave), resource alerts,
 * pad toasts and floating "+$10" popups. Rendered every frame by the level;
 * DOM writes only happen when a value changes.
 */
export class Hud {
  // The player clicked the "⚡ Hub" button.
  public readonly hubRequested = new Subject<number>();
  private readonly container: HTMLElement;
  private readonly bar = el('div', 'tk-hud');
  private readonly wave = el('div', 'tk-hud-wave tk-glass');
  private readonly timer = el('div', 'tk-hud-wave tk-hud-timer tk-glass');
  private readonly alert = el('div', 'tk-hud-alert');
  private readonly toastEl = el('div', 'tk-hud-toast tk-glass');
  private players: PlayerWidgets[] = [];
  private toastTimer: number = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.bar.hidden = true;
    this.alert.hidden = true;
    this.toastEl.hidden = true;
    this.alert.setAttribute('role', 'status');
    container.append(this.bar, this.alert, this.toastEl);
  }

  public show(playerCount: number): void {
    this.players = [];
    this.bar.replaceChildren();
    this.bar.classList.toggle('is-multi', playerCount > 1);

    for (let index = 0; index < playerCount; index += 1) {
      const widgets = this.createPlayer(index, playerCount > 1);
      this.players.push(widgets);
      this.bar.append(widgets.group);
      if (index === 0) {
        this.bar.append(this.wave, this.timer);
      }
    }
    setText(this.wave, '');
    this.wave.hidden = true;
    this.timer.hidden = true;
    this.bar.hidden = false;
  }

  public hide(): void {
    this.bar.hidden = true;
    this.alert.hidden = true;
    this.toastEl.hidden = true;
  }

  public setWave(waveNumber: number, totalWaves: number, hasBoss: boolean): void {
    this.wave.hidden = false;
    this.wave.classList.toggle('is-boss', hasBoss);
    setText(
      this.wave,
      hasBoss ? `Boss wave ${waveNumber}/${totalWaves}` : `Wave ${waveNumber}/${totalWaves}`,
    );
  }

  /** Tycoon Blitz countdown, in seconds. */
  public setTimer(seconds: number, suffix = ''): void {
    const whole = Math.ceil(seconds);
    const text = `⏱ ${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}${suffix}`;
    this.timer.hidden = false;
    this.timer.classList.toggle('is-ending', whole <= 30);
    setText(this.timer, text);
  }

  public render(playerIndex: number, state: HudPlayerState): void {
    const widgets = this.players[playerIndex];
    if (widgets === undefined) {
      return;
    }

    setText(widgets.cash, `$${state.cash}`);
    setText(widgets.shells, `● ${state.shells}`);
    widgets.shells.classList.toggle('is-empty', state.shells === 0);
    setText(widgets.streak, state.streak > 0 ? `🔥 ${state.streak}` : '');

    const fuel = Math.max(0, Math.min(1, state.fuel));
    const transform = `scaleX(${fuel.toFixed(3)})`;
    if (widgets.fuelFill.style.transform !== transform) {
      widgets.fuelFill.style.transform = transform;
    }
    widgets.fuel.classList.toggle('is-low', fuel < LOW_FUEL);
    widgets.fuel.title = `Fuel ${Math.round(fuel * 100)}%`;

    setText(
      widgets.hearts,
      state.hearts > 5 ? `❤ ${state.hearts}` : state.hearts > 1 ? '❤'.repeat(state.hearts) : '',
    );
  }

  /** Persistent warning under the HUD; null clears it. */
  public setAlert(text: string | null): void {
    if (text === null) {
      this.alert.hidden = true;
      return;
    }
    setText(this.alert, text);
    this.alert.hidden = false;
  }

  public toast(text: string, durationMs = 2500): void {
    setText(this.toastEl, text);
    this.toastEl.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.hidden = true;
    }, durationMs);
  }

  /** Floating text over a point on the playfield (field coordinates). */
  public popupAtField(x: number, y: number, text: string, kind: PopupKind): void {
    const left = ((config.BORDER_LEFT_WIDTH + x) / config.CANVAS_WIDTH) * 100;
    const top = ((config.BORDER_TOP_BOTTOM_HEIGHT + y) / config.CANVAS_HEIGHT) * 100;
    this.spawnPopup(`${left}%`, `${top}%`, text, kind);
  }

  /** Floating text rising from one of a player's HUD stats. */
  public popupAtStat(
    playerIndex: number,
    stat: 'cash' | 'shells' | 'fuel',
    text: string,
    kind: PopupKind,
  ): void {
    const widgets = this.players[playerIndex];
    if (widgets === undefined || this.bar.hidden) {
      return;
    }
    const target = widgets[stat].getBoundingClientRect();
    const layer = this.container.getBoundingClientRect();
    if (layer.width === 0) {
      return;
    }
    const left = target.left + target.width / 2 - layer.left;
    const top = target.bottom - layer.top + target.height;
    this.spawnPopup(`${left}px`, `${top}px`, text, kind);
  }

  private spawnPopup(left: string, top: string, text: string, kind: PopupKind): void {
    const popup = el('div', `tk-popup tk-popup--${kind}`, text);
    popup.style.left = left;
    popup.style.top = top;
    popup.setAttribute('aria-hidden', 'true');
    this.container.append(popup);
    window.setTimeout(() => popup.remove(), POPUP_LIFETIME_MS);
  }

  private createPlayer(index: number, showLabel: boolean): PlayerWidgets {
    const group = el('div', 'tk-hud-group tk-glass');
    if (showLabel) {
      group.append(el('span', 'tk-hud-label', `P${index + 1}`));
    }

    const cash = el('span', 'tk-hud-stat tk-hud-cash');
    cash.title = 'Cash';

    const fuel = el('span', 'tk-hud-stat tk-hud-fuel', '⛽');
    const fuelBar = el('div', 'tk-hud-fuel-bar');
    const fuelFill = el('div');
    fuelBar.append(fuelFill);
    fuel.append(fuelBar);

    const shells = el('span', 'tk-hud-stat tk-hud-shells');
    shells.title = 'Shells';
    const streak = el('span', 'tk-hud-stat tk-hud-streak');
    streak.title = 'Streak';
    const hearts = el('span', 'tk-hud-stat tk-hud-hearts');
    hearts.title = 'Armor hearts';

    group.append(cash, fuel, shells, streak, hearts);

    const hub = el('button', 'tk-hud-hub', '⚡ Hub (Tab / Q)');
    hub.type = 'button';
    hub.title = 'Answer questions and shop for upgrades';
    hub.addEventListener('click', () => {
      hub.blur();
      this.hubRequested.notify(index);
    });
    group.append(hub);
    return { group, cash, fuel, fuelFill, shells, streak, hearts };
  }
}

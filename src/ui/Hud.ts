import * as config from '../config';
import { Subject } from '../core/Subject';
import { PLAYER_MAX_HP, PLAYER_MAX_SHIELD } from '../tank/tankHealth';

import { battleCamera } from './Camera';

import './styles/hud.css';

export interface HudPlayerState {
  cash: number;
  // 0..1
  fuel: number;
  shells: number;
  streak: number;
  // Tank HP (0..100) and Shield (0..50); both 0 while respawning.
  hp: number;
  armor: number;
}

export type ResourceKind = 'shells' | 'fuel';

export type PopupKind = 'cash' | 'shells' | 'fuel' | 'spend';

const LOW_FUEL = 0.2;
const POPUP_LIFETIME_MS = 1100;
const KILL_FEED_LIFETIME_MS = 4000;
const KILL_FEED_MAX = 4;

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
  hpFill: HTMLDivElement;
  hpText: HTMLSpanElement;
  armorFill: HTMLDivElement;
  armorText: HTMLSpanElement;
}

function setScale(node: HTMLElement, ratio: number): void {
  const transform = `scaleX(${Math.max(0, Math.min(1, ratio)).toFixed(3)})`;
  if (node.style.transform !== transform) {
    node.style.transform = transform;
  }
}

/**
 * Top HUD (HP + Shield bars, cash, fuel, shells, streak, wave), resource
 * alerts, toasts, the kill feed, the station prompt and floating "+$10"
 * popups. Rendered every frame by the level;
 * DOM writes only happen when a value changes.
 */
export class Hud {
  // The player clicked the "⚡ Hub" button.
  public readonly hubRequested = new Subject<number>();
  // Player 1 just ran out of shells or fuel.
  public readonly resourcesEmptied = new Subject<ResourceKind>();
  // The station prompt was tapped / clicked.
  public readonly promptActivated = new Subject<void>();
  private readonly container: HTMLElement;
  private readonly bar = el('div', 'tk-hud');
  private readonly wave = el('div', 'tk-hud-wave tk-glass');
  private readonly timer = el('div', 'tk-hud-wave tk-hud-timer tk-glass');
  private readonly alert = el('div', 'tk-hud-alert');
  private readonly toastEl = el('div', 'tk-hud-toast tk-glass');
  private readonly feed = el('div', 'tk-hud-feed');
  private readonly prompt = el('button', 'tk-hud-prompt tk-glass');
  private players: PlayerWidgets[] = [];
  // Player 1's last shells / fuel, to notice them running out.
  private lastShells = -1;
  private lastFuel = -1;
  private toastTimer: number = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.bar.hidden = true;
    this.alert.hidden = true;
    this.toastEl.hidden = true;
    this.alert.setAttribute('role', 'status');
    this.feed.setAttribute('aria-live', 'polite');
    this.prompt.type = 'button';
    this.prompt.hidden = true;
    this.prompt.addEventListener('click', () => {
      this.prompt.blur();
      this.promptActivated.notify(null);
    });
    container.append(this.bar, this.alert, this.toastEl, this.feed, this.prompt);
  }

  public show(playerCount: number): void {
    battleCamera.startBattle();
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
    this.lastShells = -1;
    this.lastFuel = -1;
  }

  public hide(): void {
    battleCamera.reset();
    this.bar.hidden = true;
    this.alert.hidden = true;
    this.toastEl.hidden = true;
    this.prompt.hidden = true;
    this.feed.replaceChildren();
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

    if (playerIndex === 0) {
      const emptied: ResourceKind | null =
        state.shells === 0 && this.lastShells > 0
          ? 'shells'
          : state.fuel <= 0 && this.lastFuel > 0
            ? 'fuel'
            : null;
      this.lastShells = state.shells;
      this.lastFuel = state.fuel;
      if (emptied !== null) {
        this.resourcesEmptied.notify(emptied);
      }
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

    setScale(widgets.hpFill, state.hp / PLAYER_MAX_HP);
    setText(widgets.hpText, String(Math.ceil(state.hp)));
    setScale(widgets.armorFill, state.armor / PLAYER_MAX_SHIELD);
    setText(widgets.armorText, String(Math.ceil(state.armor)));
  }

  /** Live kill feed in the top-right corner; old lines fade out. */
  public killFeed(text: string): void {
    const line = el('div', 'tk-hud-feed-line tk-glass', text);
    this.feed.append(line);
    while (this.feed.childElementCount > KILL_FEED_MAX) {
      this.feed.firstElementChild.remove();
    }
    window.setTimeout(() => line.remove(), KILL_FEED_LIFETIME_MS);
  }

  /** Station prompt ("[Tap / Press E] Buy Shield Can"); null hides it. */
  public setPrompt(text: string | null, busy = false): void {
    if (text === null) {
      this.prompt.hidden = true;
      return;
    }
    setText(this.prompt, text);
    this.prompt.classList.toggle('is-busy', busy);
    this.prompt.hidden = false;
  }

  /** True when player 1 has no shells left. */
  public isOutOfShells(): boolean {
    return this.lastShells === 0;
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
    const canvasX = config.BORDER_LEFT_WIDTH + x;
    const canvasY = config.BORDER_TOP_BOTTOM_HEIGHT + y;
    // Through the follow camera, so the popup sits on the tank
    const point = battleCamera.canvasToLayer(canvasX, canvasY);
    if (point !== null) {
      this.spawnPopup(`${point.left}px`, `${point.top}px`, text, kind);
      return;
    }
    const left = (canvasX / config.CANVAS_WIDTH) * 100;
    const top = (canvasY / config.CANVAS_HEIGHT) * 100;
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
    // Snowbrawl health: green HP over blue Shield
    const health = el('span', 'tk-hud-stat tk-hud-health');
    const hpRow = el('span', 'tk-hud-meter tk-hud-meter--hp');
    hpRow.title = 'Health';
    const hpBar = el('div', 'tk-hud-meter-bar');
    const hpFill = el('div');
    hpBar.append(hpFill);
    const hpText = el('span', 'tk-hud-meter-text');
    hpRow.append(hpBar, hpText);
    const armorRow = el('span', 'tk-hud-meter tk-hud-meter--shield');
    armorRow.title = 'Shield';
    const armorBar = el('div', 'tk-hud-meter-bar');
    const armorFill = el('div');
    armorBar.append(armorFill);
    const armorText = el('span', 'tk-hud-meter-text');
    armorRow.append(armorBar, armorText);
    health.append(hpRow, armorRow);

    group.append(health, cash, fuel, shells, streak);

    const hub = el('button', 'tk-hud-hub', '⚡ Hub');
    // Keyboard hint, hidden on touch screens (hud.css)
    hub.append(el('span', 'tk-hud-hub-keys', ' (Tab / Q)'));
    hub.type = 'button';
    hub.title = 'Answer questions and shop for upgrades';
    hub.addEventListener('click', () => {
      hub.blur();
      this.hubRequested.notify(index);
    });
    group.append(hub);
    return { group, cash, fuel, fuelFill, shells, streak, hpFill, hpText, armorFill, armorText };
  }
}

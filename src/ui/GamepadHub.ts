import { GamepadButtonCode, readStickCodes } from '../core';

import type { CommandHub } from './CommandHub';
import type { OverlayGate } from './OverlayGate';
import type { QuestionController } from './QuestionController';
import type { ShopController } from './ShopController';

const TOGGLE_CODES = [GamepadButtonCode.Start, GamepadButtonCode.Y];
const DIRECTION_CODES = [
  GamepadButtonCode.Up,
  GamepadButtonCode.Down,
  GamepadButtonCode.Left,
  GamepadButtonCode.Right,
];

// Held direction: first repeat after this delay, then at this rate (ms).
const REPEAT_DELAY = 400;
const REPEAT_RATE = 160;

const PANEL_SELECTOR = '.tk-hub-tabs:not([hidden]), .tk-qm, .tk-shop';
const FOCUSABLE_SELECTOR = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)';
// First stop on a fresh panel: the answers or the upgrades, not the tabs.
const PREFERRED_SELECTOR = '.tk-qm-tiles button:not(:disabled), .tk-shop-item:not(:disabled)';
const FOCUS_CLASS = 'tk-pad-focus';

function center(node: HTMLElement): { x: number; y: number } {
  const rect = node.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Physical controllers in battle: Start or Y toggles the Command Hub, and
 * while it is open the D-pad / left stick moves a highlight over the tabs,
 * answers and upgrades, A presses it and B closes the Hub. Driving and
 * firing go through the gamepad input binding instead.
 *
 * Polled from the main game loop. The Hub suspends the input manager, so
 * this reads `navigator.getGamepads()` itself.
 */
export class GamepadHub {
  private readonly container: HTMLElement;
  private readonly gate: OverlayGate;
  private readonly hub: CommandHub;
  private readonly questions: QuestionController;
  private readonly shop: ShopController;
  private pressed = new Set<number>();
  private repeatCode: number | null = null;
  private repeatAt = 0;
  private highlighted: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    gate: OverlayGate,
    hub: CommandHub,
    questions: QuestionController,
    shop: ShopController,
  ) {
    this.container = container;
    this.gate = gate;
    this.hub = hub;
    this.questions = questions;
    this.shop = shop;

    // Mouse or touch takes over: drop the controller highlight
    window.addEventListener('pointerdown', () => this.highlight(null), true);
  }

  public update(): void {
    const gamepad = this.getGamepad();
    const now = performance.now();
    const pressed = new Set<number>();
    if (gamepad !== null) {
      gamepad.buttons.forEach((button, code) => {
        if (button.pressed) {
          pressed.add(code);
        }
      });
      readStickCodes(gamepad).forEach((code) => pressed.add(code));
    }
    const justPressed = (code: number): boolean =>
      pressed.has(code) && !this.pressed.has(code);
    const previous = this.pressed;
    this.pressed = pressed;

    const hubOpen = this.questions.isOpen() || this.shop.isOpen();
    if (!hubOpen) {
      this.highlight(null);
      this.repeatCode = null;
    }
    if (this.gate.getLevel() === null || gamepad === null) {
      return;
    }

    if (TOGGLE_CODES.some(justPressed) || (hubOpen && justPressed(GamepadButtonCode.B))) {
      // Closing is the Hub's call (a wrong answer may need reviewing first)
      if (hubOpen || this.gate.isFree()) {
        this.hub.toggle(0);
      }
      return;
    }
    if (!hubOpen) {
      return;
    }

    if (justPressed(GamepadButtonCode.A)) {
      this.activate();
      return;
    }

    const direction = DIRECTION_CODES.find(justPressed);
    if (direction !== undefined) {
      this.repeatCode = direction;
      this.repeatAt = now + REPEAT_DELAY;
      this.move(direction);
    } else if (
      this.repeatCode !== null &&
      pressed.has(this.repeatCode) &&
      previous.has(this.repeatCode)
    ) {
      if (now >= this.repeatAt) {
        this.repeatAt = now + REPEAT_RATE;
        this.move(this.repeatCode);
      }
    } else {
      this.repeatCode = null;
    }
  }

  // First connected controller, wherever the browser put it.
  private getGamepad(): Gamepad | null {
    const gamepads = navigator.getGamepads?.() ?? [];
    for (const gamepad of gamepads) {
      if (gamepad && gamepad.connected) {
        return gamepad;
      }
    }
    return null;
  }

  private getFocusables(): HTMLElement[] {
    const nodes: HTMLElement[] = [];
    this.container.querySelectorAll<HTMLElement>(PANEL_SELECTOR).forEach((panel) => {
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR).forEach((node) => {
        if (node.getClientRects().length > 0) {
          nodes.push(node);
        }
      });
    });
    return nodes;
  }

  private getCurrent(focusables: HTMLElement[]): HTMLElement | null {
    const active = document.activeElement as HTMLElement | null;
    if (active && focusables.includes(active)) {
      return active;
    }
    return this.highlighted && focusables.includes(this.highlighted) ? this.highlighted : null;
  }

  /** Spatial move to the nearest control on that side; wraps in list order. */
  private move(code: number): void {
    const focusables = this.getFocusables();
    if (focusables.length === 0) {
      return;
    }
    const current = this.getCurrent(focusables);
    if (current === null) {
      const preferred = focusables.find((node) => node.matches(PREFERRED_SELECTOR));
      this.highlight(preferred ?? focusables[0]);
      return;
    }

    const from = center(current);
    const horizontal = code === GamepadButtonCode.Left || code === GamepadButtonCode.Right;
    const sign = code === GamepadButtonCode.Left || code === GamepadButtonCode.Up ? -1 : 1;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const node of focusables) {
      if (node === current) {
        continue;
      }
      const to = center(node);
      const primary = (horizontal ? to.x - from.x : to.y - from.y) * sign;
      const secondary = Math.abs(horizontal ? to.y - from.y : to.x - from.x);
      if (primary <= 1) {
        continue;
      }
      const score = primary + secondary * 2;
      if (score < bestScore) {
        bestScore = score;
        best = node;
      }
    }
    if (best === null) {
      const index = focusables.indexOf(current);
      best = focusables[(index + sign + focusables.length) % focusables.length];
    }
    this.highlight(best);
  }

  private activate(): void {
    const focusables = this.getFocusables();
    const current = this.getCurrent(focusables);
    if (current === null) {
      this.move(GamepadButtonCode.Down);
      return;
    }
    if (current instanceof HTMLInputElement || current instanceof HTMLTextAreaElement) {
      // Typed answers: A submits what's in the box
      const form = current.form;
      if (form) {
        form.requestSubmit();
      }
      return;
    }
    current.click();
  }

  private highlight(node: HTMLElement | null): void {
    if (this.highlighted === node) {
      return;
    }
    this.highlighted?.classList.remove(FOCUS_CLASS);
    this.highlighted = node;
    if (node !== null) {
      node.classList.add(FOCUS_CLASS);
      node.focus({ preventScroll: false });
      node.scrollIntoView({ block: 'nearest' });
    }
  }
}

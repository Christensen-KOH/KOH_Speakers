import type { Hud } from './Hud';
import type { OverlayGate } from './OverlayGate';
import type { QuestionController } from './QuestionController';
import type { ShopController } from './ShopController';

import './styles/hub.css';

type HubTab = 'questions' | 'shop';

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
 * The single in-battle menu: a tab strip over the question sheet and the
 * power-up shop. The HUD's "⚡ Hub" button opens it on the tab used last;
 * Tab / Q (questions) and B (shop) open it directly. Switching tabs hands
 * the screen from one panel to the other.
 */
export class CommandHub {
  private readonly questions: QuestionController;
  private readonly shop: ShopController;
  private readonly gate: OverlayGate;
  private readonly strip = el('div', 'tk-hub-tabs tk-glass');
  private readonly questionsTab = el('button', 'tk-hub-tab', '📝 Answer English Questions');
  private readonly shopTab = el('button', 'tk-hub-tab', '🛒 Power-Ups & Upgrades');
  private lastTab: HubTab = 'questions';
  private playerIndex = 0;

  constructor(
    container: HTMLElement,
    hud: Hud,
    gate: OverlayGate,
    questions: QuestionController,
    shop: ShopController,
  ) {
    this.gate = gate;
    this.questions = questions;
    this.shop = shop;

    this.strip.hidden = true;
    this.questionsTab.type = 'button';
    this.shopTab.type = 'button';
    this.questionsTab.addEventListener('click', () => this.switchTo('questions'));
    this.shopTab.addEventListener('click', () => this.switchTo('shop'));
    this.strip.append(this.questionsTab, this.shopTab);
    container.append(this.strip);

    this.trackKeyboard();

    hud.hubRequested.addListener((playerIndex) => this.toggle(playerIndex));
    hud.hubTabRequested.addListener(({ tab, player }) => this.openTab(tab, player));
    // Controllers acquire the gate just before their panel opens.
    gate.changed.addListener(() => window.setTimeout(() => this.refresh(), 0));
  }

  /**
   * Mobile soft keyboard: freeze the stage at its full height and pin the
   * question sheet to the visible top (hub.css), so the prompt, input and
   * Submit button are never covered.
   */
  private trackKeyboard(): void {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const root = document.documentElement;
    let fullHeight = window.innerHeight;
    const sync = (): void => {
      const keyboard = viewport.height < fullHeight * 0.75;
      if (!keyboard) {
        fullHeight = Math.max(window.innerHeight, viewport.height);
      }
      root.classList.toggle('tk-kb-open', keyboard);
      root.style.setProperty('--tk-full-h', `${fullHeight}px`);
      root.style.setProperty('--tk-vv-top', `${viewport.offsetTop}px`);
      root.style.setProperty('--tk-vv-h', `${viewport.height}px`);
    };
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    sync();
  }

  /** Dock buttons: open on a given tab, or jump to it when the Hub is open. */
  private openTab(tab: HubTab, playerIndex: number): void {
    if (this.questions.isOpen() || this.shop.isOpen()) {
      this.switchTo(tab);
    } else if (this.gate.isFree()) {
      this.playerIndex = playerIndex;
      this.open(tab);
    }
  }

  public toggle(playerIndex = 0): void {
    if (this.questions.isOpen()) {
      this.questions.close();
    } else if (this.shop.isOpen()) {
      this.shop.close();
    } else if (this.gate.isFree()) {
      this.playerIndex = playerIndex;
      this.open(this.lastTab);
    }
  }

  private open(tab: HubTab): void {
    if (tab === 'questions') {
      this.questions.open(this.playerIndex);
    } else {
      this.shop.open(this.playerIndex);
    }
  }

  private switchTo(tab: HubTab): void {
    const current: HubTab = this.shop.isOpen() ? 'shop' : 'questions';
    if (tab === current) {
      return;
    }
    // A wrong answer must be reviewed before leaving the question tab.
    if (current === 'questions' && this.questions.isLocked()) {
      return;
    }
    if (current === 'questions') {
      this.questions.close();
    } else {
      this.shop.close();
    }
    this.open(tab);
  }

  private refresh(): void {
    const questionsOpen = this.questions.isOpen();
    const shopOpen = this.shop.isOpen();
    if (questionsOpen) {
      this.lastTab = 'questions';
    } else if (shopOpen) {
      this.lastTab = 'shop';
    }
    this.strip.hidden = !(questionsOpen || shopOpen);
    // Hides name tags and alerts that would bleed over the Hub (hub.css)
    document.documentElement.classList.toggle('tk-hub-open', questionsOpen || shopOpen);
    this.questionsTab.classList.toggle('is-active', questionsOpen);
    this.shopTab.classList.toggle('is-active', shopOpen);
  }
}

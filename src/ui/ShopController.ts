import { Subject } from '../core/Subject';
import {
  EconomySession,
  getShopOffers,
  OfferStatus,
  purchaseItem,
  ShopItem,
  ShopItemId,
  ShopOffer,
} from '../gimkit-economy';

import { OverlayGate } from './OverlayGate';
import {
  questionKeyPlayer,
  shopKeyPlayer,
  SHOP_KEY_LABELS,
} from './overlayKeys';

import './styles/shop.css';

const OWNER = 'shop';
// Keys 1-9 then 0 buy items in list order.
const ITEM_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export interface ShopPurchase {
  playerIndex: number;
  item: ShopItem;
  price: number;
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
 * Upgrade Shop: B (or driving onto an Upgrade Pad) opens it. Charges cash
 * through the economy and reports purchases; the level applies effects.
 */
export class ShopController {
  public readonly purchased = new Subject<ShopPurchase>();
  // Player (index) asked to answer questions to earn more cash.
  public readonly questionsRequested = new Subject<number>();
  private readonly economy: EconomySession;
  private readonly gate: OverlayGate;
  private readonly root = el('div', 'tk-shop');
  private readonly cashChip = el('span', 'tk-chip tk-chip--cash tk-shop-cash');
  private readonly grid = el('div', 'tk-shop-grid');
  private readonly message = el('span', 'tk-shop-message');
  private playerIndex = 0;
  private readonly title = el('h2', 'tk-shop-title', 'Upgrade Shop');
  private readonly closeKey = el('kbd', undefined, 'B');
  private offers: ShopOffer[] = [];
  private lastBoughtId: ShopItemId = null;

  constructor(container: HTMLElement, economy: EconomySession, gate: OverlayGate) {
    this.economy = economy;
    this.gate = gate;

    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Upgrade shop');

    const panel = el('div', 'tk-shop-panel tk-glass');

    const header = el('div', 'tk-shop-header');
    const close = el('button', 'tk-qm-close');
    close.type = 'button';
    close.append('✕ Resume Battle ');
    close.append(this.closeKey);
    close.addEventListener('click', () => this.close());
    header.append(this.title, this.cashChip, close);

    const footer = el('div', 'tk-shop-footer');
    this.message.setAttribute('aria-live', 'polite');
    footer.append(this.message, el('span', undefined, '1–0 to buy'));

    panel.append(header, this.grid, footer);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (event) => {
      if (event.target === this.root) {
        this.close();
      }
    });
    container.append(this.root);

    document.addEventListener('keydown', this.handleKeyDown, true);
    gate.detached.addListener(() => this.close(true));
  }

  public isOpen(): boolean {
    return this.root.classList.contains('is-open');
  }

  public open(playerIndex = 0): void {
    if (this.isOpen() || !this.gate.acquire(OWNER, playerIndex)) {
      return;
    }
    this.playerIndex = playerIndex;
    this.title.textContent =
      this.gate.getPlayerCount() > 1
        ? `Upgrade Shop · Player ${playerIndex + 1}`
        : 'Upgrade Shop';
    this.closeKey.textContent = SHOP_KEY_LABELS[playerIndex];
    this.message.textContent = '';
    this.message.className = 'tk-shop-message';
    this.lastBoughtId = null;
    this.render();
    this.root.classList.add('is-open');
    const first = this.grid.querySelector<HTMLButtonElement>('.tk-shop-item:not(:disabled)');
    first?.focus();
  }

  public close(force = false): void {
    if (!this.isOpen() && !force) {
      return;
    }
    this.root.classList.remove('is-open');
    (document.activeElement as HTMLElement)?.blur?.();
    this.gate.release(OWNER);
  }

  private buy(id: ShopItemId): void {
    const level = this.gate.getLevel();
    if (level === null) {
      return;
    }

    const player = this.economy.getPlayer(this.playerIndex);
    const result = purchaseItem(player, id, { hasTurret: level.hasTurret() });

    this.message.className = 'tk-shop-message';
    if (result.ok === false) {
      this.message.classList.add('is-error');
      this.message.textContent = result.reason;
      this.lastBoughtId = null;
    } else {
      this.message.classList.add('is-success');
      this.message.textContent = `Bought ${result.item.name}!`;
      this.lastBoughtId = id;
      this.purchased.notify({
        playerIndex: this.playerIndex,
        item: result.item,
        price: result.price,
      });
    }

    const focusedId = (document.activeElement as HTMLElement)?.dataset?.item;
    this.render();
    if (focusedId) {
      this.grid.querySelector<HTMLElement>(`[data-item="${focusedId}"]`)?.focus();
    }
  }

  private render(): void {
    const level = this.gate.getLevel();
    const player = this.economy.getPlayer(this.playerIndex);
    const cash = player.cash.getBalance();
    this.offers = getShopOffers(player, {
      hasTurret: level ? level.hasTurret() : false,
    });

    this.cashChip.textContent = `$${cash}`;
    this.grid.replaceChildren();

    let group = '';
    this.offers.forEach((offer, index) => {
      if (offer.item.category !== group) {
        group = offer.item.category;
        this.grid.append(el('h3', 'tk-shop-group', group));
      }
      this.grid.append(this.renderOffer(offer, ITEM_KEYS[index], cash));
    });
  }

  private renderOffer(offer: ShopOffer, key: string, cash: number): HTMLElement {
    const { item, price, status, note } = offer;
    const button = el('button', `tk-shop-item is-${status}`);
    button.type = 'button';
    button.dataset.item = item.id;
    button.disabled = status !== OfferStatus.Available;

    const isShort = status === OfferStatus.Available && price !== null && price > cash;
    button.classList.toggle('is-short', isShort);
    button.classList.toggle('is-bought', item.id === this.lastBoughtId);

    let priceText = price === null ? '' : `$${price}`;
    if (status === OfferStatus.Owned) {
      priceText = 'Owned';
    }

    const detail = note ?? (isShort ? `Need $${price - cash} more` : null);
    const description = detail ? `${item.description} ${detail}.` : item.description;

    const name = el('span', 'tk-shop-name');
    name.append(item.name, ' ', el('span', 'tk-shop-item-keyhint', `[${key}]`));

    button.append(
      el('span', 'tk-shop-icon', item.icon),
      name,
      el('span', 'tk-shop-price', priceText),
      el('span', 'tk-shop-desc', description),
    );
    button.setAttribute(
      'aria-label',
      `${item.name}, ${priceText || 'unavailable'}. ${description}`,
    );
    button.addEventListener('click', () => this.buy(item.id));
    return button;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.gate.getLevel() === null || event.repeat) {
      return;
    }
    const { key } = event;

    if (!this.isOpen()) {
      const player = shopKeyPlayer(key, this.gate.getPlayerCount());
      if (player !== null && this.gate.isFree()) {
        event.preventDefault();
        this.open(player);
      }
      return;
    }

    event.stopImmediatePropagation();

    const playerCount = this.gate.getPlayerCount();
    if (
      key === 'Escape' ||
      shopKeyPlayer(key, playerCount) !== null ||
      questionKeyPlayer(key, playerCount) !== null
    ) {
      event.preventDefault();
      this.close();
    } else if (ITEM_KEYS.includes(key)) {
      event.preventDefault();
      const offer = this.offers[ITEM_KEYS.indexOf(key)];
      if (offer) {
        this.buy(offer.item.id);
      }
    }
  };
}

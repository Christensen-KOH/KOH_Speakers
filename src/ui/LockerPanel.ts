import type { SpriteLoader } from '../core';
import { Subject } from '../core/Subject';
import {
  getSkin,
  getSkinColorFrames,
  getSkinPhase,
  getTrail,
  LockerStore,
  SkinId,
  SKINS,
  TrailId,
  TRAILS,
} from '../cosmetics';
import { Rotation } from '../game/Rotation';
import { TankColor } from '../tank/TankColor';
import { TankSpriteId } from '../tank/TankSpriteId';
import { TankType } from '../tank/TankType';

import type { OverlayGate } from './OverlayGate';

import './styles/locker.css';

const OWNER = 'locker';
const PREVIEW_SIZE = 168;
const TANK_DRAW_SIZE = 96;

type Selection = { kind: 'skin'; id: SkinId } | { kind: 'trail'; id: TrailId };

interface PreviewParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
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
 * Tank Locker: preview, buy and equip tank skins and movement trails with
 * persistent Locker Coins. Opens from the title screen (standalone) or as
 * the Hub's "🎨 Skins & Cosmetics" tab mid-battle, where the player's tank
 * changes the moment something is equipped.
 */
export class LockerPanel {
  public readonly openChanged = new Subject<boolean>();
  private readonly store: LockerStore;
  private readonly gate: OverlayGate;
  private readonly spriteLoader: SpriteLoader;
  private readonly root = el('div', 'tk-locker');
  private readonly coins = el('span', 'tk-chip tk-locker-coins');
  private readonly title = el('h2', 'tk-locker-title', '🎨 Tank Locker');
  private readonly closeButton = el('button', 'tk-qm-close');
  private readonly canvas = el('canvas', 'tk-locker-canvas');
  private readonly previewName = el('div', 'tk-locker-preview-name');
  private readonly previewTagline = el('div', 'tk-locker-preview-tagline');
  private readonly action = el('button', 'tk-locker-action');
  private readonly message = el('div', 'tk-locker-message');
  private readonly skinGrid = el('div', 'tk-locker-grid');
  private readonly trailGrid = el('div', 'tk-locker-grid');
  private selection: Selection;
  private inHub = false;
  private frame: number = null;
  private lastTime = 0;
  private clock = 0;
  private puffTimer = 0;
  private particles: PreviewParticle[] = [];

  constructor(
    container: HTMLElement,
    store: LockerStore,
    gate: OverlayGate,
    spriteLoader: SpriteLoader,
  ) {
    this.store = store;
    this.gate = gate;
    this.spriteLoader = spriteLoader;
    this.selection = { kind: 'skin', id: store.getEquippedSkin() };

    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Tank Locker');

    const panel = el('div', 'tk-locker-panel tk-glass');

    const header = el('div', 'tk-locker-header');
    this.closeButton.type = 'button';
    this.closeButton.addEventListener('click', () => this.close());
    header.append(this.title, this.coins, this.closeButton);

    const body = el('div', 'tk-locker-body');

    const preview = el('div', 'tk-locker-preview');
    this.canvas.width = PREVIEW_SIZE;
    this.canvas.height = PREVIEW_SIZE;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.action.type = 'button';
    this.action.addEventListener('click', () => this.activate());
    this.message.setAttribute('aria-live', 'polite');
    preview.append(
      this.canvas,
      this.previewName,
      this.previewTagline,
      this.action,
      this.message,
    );

    const lists = el('div', 'tk-locker-lists');
    lists.append(
      el('h3', 'tk-locker-section', 'Tank Skins'),
      this.skinGrid,
      el('h3', 'tk-locker-section', 'Movement Trails'),
      this.trailGrid,
      el(
        'p',
        'tk-locker-hint',
        'Earn Locker Coins by answering English questions and destroying enemy tanks. Your collection is saved on this device.',
      ),
    );

    body.append(preview, lists);
    panel.append(header, body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (event) => {
      if (event.target === this.root) {
        this.close();
      }
    });
    container.append(this.root);

    store.changed.addListener(() => {
      if (this.isOpen()) {
        this.render();
      }
    });
    gate.detached.addListener(() => {
      if (this.inHub) {
        this.close();
      }
    });
    document.addEventListener('keydown', this.handleKeyDown, true);
  }

  public isOpen(): boolean {
    return this.root.classList.contains('is-open');
  }

  /** Title / lobby screen, before a match. */
  public openStandalone(): void {
    if (this.isOpen() || this.gate.getLevel() !== null) {
      return;
    }
    this.inHub = false;
    this.show();
  }

  /** Hub tab, mid-battle. Returns false when the screen is busy. */
  public openInHub(playerIndex = 0): boolean {
    if (this.isOpen()) {
      return true;
    }
    if (!this.gate.acquire(OWNER, playerIndex)) {
      return false;
    }
    this.inHub = true;
    this.show();
    return true;
  }

  public close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.root.classList.remove('is-open');
    (document.activeElement as HTMLElement)?.blur?.();
    if (this.frame !== null) {
      window.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    if (this.inHub) {
      this.gate.release(OWNER);
    }
    this.inHub = false;
    this.openChanged.notify(false);
  }

  private show(): void {
    this.selection = { kind: 'skin', id: this.store.getEquippedSkin() };
    this.message.textContent = '';
    this.closeButton.textContent = this.inHub ? '✕ Resume Battle' : '✕ Close';
    this.root.classList.toggle('is-hub', this.inHub);
    this.render();
    this.root.classList.add('is-open');
    this.particles = [];
    this.lastTime = performance.now();
    this.frame = window.requestAnimationFrame(this.tick);
    this.openChanged.notify(true);
    this.action.focus();
  }

  private render(): void {
    const state = this.store.getState();
    this.coins.textContent = `🪙 ${state.coins.toLocaleString()}`;

    this.skinGrid.replaceChildren(
      ...SKINS.map((skin) =>
        this.card(
          skin.name,
          skin.swatch,
          skin.price,
          state.skins.includes(skin.id),
          state.equippedSkin === skin.id,
          this.selection.kind === 'skin' && this.selection.id === skin.id,
          () => this.select({ kind: 'skin', id: skin.id }),
          skin.palettes.length > 1,
        ),
      ),
    );
    this.trailGrid.replaceChildren(
      ...TRAILS.map((trail) =>
        this.card(
          trail.name,
          trail.swatch,
          trail.price,
          state.trails.includes(trail.id),
          state.equippedTrail === trail.id,
          this.selection.kind === 'trail' && this.selection.id === trail.id,
          () => this.select({ kind: 'trail', id: trail.id }),
          false,
        ),
      ),
    );

    const def =
      this.selection.kind === 'skin' ? getSkin(this.selection.id) : getTrail(this.selection.id);
    const owned =
      this.selection.kind === 'skin'
        ? state.skins.includes(this.selection.id)
        : state.trails.includes(this.selection.id);
    const equipped =
      this.selection.kind === 'skin'
        ? state.equippedSkin === this.selection.id
        : state.equippedTrail === this.selection.id;

    this.previewName.textContent = def.name;
    this.previewTagline.textContent = def.tagline;
    this.action.disabled = equipped || (!owned && state.coins < def.price);
    this.action.className = 'tk-locker-action';
    if (equipped) {
      this.action.textContent = '✓ Equipped';
      this.action.classList.add('is-equipped');
    } else if (owned) {
      this.action.textContent = 'Equip';
    } else {
      this.action.textContent = `Buy · 🪙 ${def.price.toLocaleString()}`;
      this.action.classList.add('is-buy');
    }
  }

  private card(
    name: string,
    swatch: string,
    price: number,
    owned: boolean,
    equipped: boolean,
    selected: boolean,
    onClick: () => void,
    elite: boolean,
  ): HTMLButtonElement {
    const button = el('button', 'tk-locker-card');
    button.type = 'button';
    button.classList.toggle('is-selected', selected);
    button.classList.toggle('is-owned', owned);
    button.classList.toggle('is-elite', elite);
    const chip = el('span', 'tk-locker-swatch');
    chip.style.background = swatch;
    const label = el('span', 'tk-locker-card-name', name);
    let status: string;
    if (equipped) {
      status = '✓ Equipped';
    } else if (owned) {
      status = 'Owned';
    } else {
      status = price === 0 ? 'Free' : `🪙 ${price.toLocaleString()}`;
    }
    const tag = el('span', 'tk-locker-card-status', status);
    button.append(chip, label, tag);
    button.addEventListener('click', onClick);
    button.addEventListener('dblclick', () => this.activate());
    return button;
  }

  private select(selection: Selection): void {
    this.selection = selection;
    this.message.textContent = '';
    this.particles = [];
    this.render();
  }

  // Buy (and wear) or equip the selected item.
  private activate(): void {
    const { selection, store } = this;
    if (selection.kind === 'skin') {
      if (store.ownsSkin(selection.id)) {
        store.equipSkin(selection.id);
        this.say(`${getSkin(selection.id).name} equipped!`, 'good');
        return;
      }
      const result = store.buySkin(selection.id);
      this.reportBuy(result, getSkin(selection.id).name, getSkin(selection.id).price);
    } else {
      if (store.ownsTrail(selection.id)) {
        store.equipTrail(selection.id);
        this.say(`${getTrail(selection.id).name} equipped!`, 'good');
        return;
      }
      const result = store.buyTrail(selection.id);
      this.reportBuy(result, getTrail(selection.id).name, getTrail(selection.id).price);
    }
  }

  private reportBuy(result: string, name: string, price: number): void {
    if (result === 'bought') {
      this.say(`Unlocked ${name}! 🎉`, 'good');
    } else if (result === 'poor') {
      const short = price - this.store.getCoins();
      this.say(`Need ${short.toLocaleString()} more coins — answer questions to earn them!`, 'bad');
    }
  }

  private say(text: string, tone: 'good' | 'bad'): void {
    this.message.textContent = text;
    this.message.className = `tk-locker-message is-${tone}`;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen()) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  };

  // --- Live preview -------------------------------------------------------

  private tick = (now: number): void => {
    const deltaTime = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.clock += deltaTime;
    this.drawPreview(deltaTime);
    this.frame = window.requestAnimationFrame(this.tick);
  };

  private previewSkin(): SkinId {
    return this.selection.kind === 'skin' ? this.selection.id : this.store.getEquippedSkin();
  }

  private previewTrail(): TrailId {
    return this.selection.kind === 'trail' ? this.selection.id : this.store.getEquippedTrail();
  }

  private drawPreview(deltaTime: number): void {
    const context = this.canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

    const center = PREVIEW_SIZE / 2;
    // The tank "drives" up on a scrolling floor, so the trail streams down
    const trail = getTrail(this.previewTrail());
    if (trail.count > 0) {
      this.puffTimer -= deltaTime;
      if (this.puffTimer <= 0) {
        this.puffTimer = 0.07;
        for (let i = 0; i < trail.count; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const speed = trail.speed * (0.35 + Math.random() * 0.65);
          const life = trail.life * (0.5 + Math.random() * 0.5);
          this.particles.push({
            x: center + (Math.random() - 0.5) * 30,
            y: center + TANK_DRAW_SIZE / 2 - 6,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed + 90,
            life,
            maxLife: life,
            size: Math.max(2, Math.round(trail.size * 1.4 * (0.5 + Math.random()))),
            color: trail.colors[i % trail.colors.length],
          });
        }
      }
    }
    this.particles = this.particles.filter((particle) => {
      particle.life -= deltaTime;
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
      if (particle.life <= 0) {
        return false;
      }
      context.globalAlpha = particle.life / particle.maxLife;
      context.fillStyle = particle.color;
      context.fillRect(
        Math.round(particle.x - particle.size / 2),
        Math.round(particle.y - particle.size / 2),
        particle.size,
        particle.size,
      );
      return true;
    });
    context.globalAlpha = 1;

    const skinId = this.previewSkin();
    const colors = getSkinColorFrames(skinId, TankColor.Primary);
    const color = colors[getSkinPhase(skinId, this.clock) % colors.length] as TankColor;
    const frameNumber = Math.floor(this.clock / 0.08) % 2 === 0 ? 1 : 2;
    try {
      const sprite = this.spriteLoader.load(
        TankSpriteId.create(TankType.PlayerA(), color, Rotation.Up, frameNumber),
      );
      const rect = sprite.sourceRect;
      context.drawImage(
        sprite.image.getElement() as CanvasImageSource,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        center - TANK_DRAW_SIZE / 2,
        center - TANK_DRAW_SIZE / 2,
        TANK_DRAW_SIZE,
        TANK_DRAW_SIZE,
      );
    } catch {
      // Sprites still loading: just show the trail
    }
  }
}

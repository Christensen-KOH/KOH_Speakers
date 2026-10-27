import { PLAYER_CSS_COLORS } from '../tank/TankColorFactory';
import * as config from '../config';

import './styles/coop.css';

export interface TankLabel {
  id: string;
  slot: number;
  name: string;
  // Tank centre in field coordinates.
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  thinking: boolean;
  isMe?: boolean;
}

interface LabelElements {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  bar: HTMLDivElement;
  fill: HTMLDivElement;
  bubble: HTMLSpanElement;
  key: string;
}

// Tag sits this far above the tank centre (field px).
const LABEL_OFFSET_Y = 44;

/**
 * Nickname, HP bar and 💭 (question sheet open) floating over each student
 * tank, drawn in the DOM so any name renders crisply. Positions are given in
 * field coordinates and placed in stage percentages.
 */
export class TankLabels {
  private readonly layer = document.createElement('div');
  private readonly labels = new Map<string, LabelElements>();

  constructor(container: HTMLElement) {
    this.layer.className = 'tk-tags';
    this.layer.setAttribute('aria-hidden', 'true');
    container.append(this.layer);
  }

  public update(labels: TankLabel[]): void {
    const seen = new Set<string>();

    labels.forEach((label) => {
      seen.add(label.id);
      let elements = this.labels.get(label.id);
      if (elements === undefined) {
        elements = this.create();
        this.labels.set(label.id, elements);
      }

      const left = ((config.BORDER_LEFT_WIDTH + label.x) / config.CANVAS_WIDTH) * 100;
      const top =
        ((config.BORDER_TOP_BOTTOM_HEIGHT + label.y - LABEL_OFFSET_Y) / config.CANVAS_HEIGHT) * 100;
      elements.root.style.left = `${left.toFixed(2)}%`;
      elements.root.style.top = `${top.toFixed(2)}%`;

      // Only touch text and colours when something changed
      const key = `${label.name}|${label.slot}|${label.hp}|${label.maxHp}|${label.thinking}|${label.isMe}`;
      if (key !== elements.key) {
        elements.key = key;
        elements.name.textContent = label.isMe ? `${label.name} (you)` : label.name;
        elements.root.style.setProperty(
          '--tk-tag-color',
          PLAYER_CSS_COLORS[label.slot % PLAYER_CSS_COLORS.length],
        );
        elements.fill.style.transform = `scaleX(${label.maxHp > 0 ? label.hp / label.maxHp : 0})`;
        elements.bar.hidden = label.maxHp <= 1;
        elements.bubble.hidden = !label.thinking;
        elements.root.classList.toggle('is-me', label.isMe === true);
      }
    });

    this.labels.forEach((elements, id) => {
      if (!seen.has(id)) {
        elements.root.remove();
        this.labels.delete(id);
      }
    });
  }

  public clear(): void {
    this.update([]);
  }

  public destroy(): void {
    this.layer.remove();
    this.labels.clear();
  }

  private create(): LabelElements {
    const root = document.createElement('div');
    root.className = 'tk-tag';
    const bubble = document.createElement('span');
    bubble.className = 'tk-tag-bubble';
    bubble.textContent = '💭';
    const name = document.createElement('span');
    name.className = 'tk-tag-name';
    const bar = document.createElement('div');
    bar.className = 'tk-tag-bar';
    const fill = document.createElement('div');
    bar.append(fill);
    root.append(bubble, name, bar);
    this.layer.append(root);
    return { root, name, bar, fill, bubble, key: '' };
  }
}

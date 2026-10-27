import type { Flashcard } from '../studio/flashcards';

import { Speech } from './Speech';

import './styles/studio.css';

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
 * Flip-through flashcards for the whole class: front = word with an audio
 * button, back = meaning and example. Click the card (or Space) to flip,
 * ← → to move.
 */
export class FlashcardViewer {
  public readonly element = el('div', 'tk-fc');
  private readonly speech = new Speech();
  private readonly card = el('button', 'tk-fc-card');
  private readonly face = el('div', 'tk-fc-face');
  private readonly note = el('div', 'tk-fc-note');
  private readonly counter = el('span', 'tk-fc-counter');
  private cards: Flashcard[] = [];
  private index = 0;
  private flipped = false;

  constructor(cards: Flashcard[]) {
    this.card.type = 'button';
    this.card.append(this.face, this.note);
    this.card.addEventListener('click', () => this.flip());

    const button = (text: string, label: string, onClick: () => void): HTMLButtonElement => {
      const node = el('button', 'tk-fc-btn', text);
      node.type = 'button';
      node.title = label;
      node.setAttribute('aria-label', label);
      node.addEventListener('click', onClick);
      return node;
    };

    const controls = el('div', 'tk-fc-controls');
    controls.append(
      button('◀', 'Previous card', () => this.move(-1)),
      this.counter,
      button('▶', 'Next card', () => this.move(1)),
      button('🔊', 'Say it', () => this.say()),
      button('🔀', 'Shuffle', () => this.shuffle()),
    );

    this.element.tabIndex = 0;
    this.element.append(this.card, controls);
    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') {
        this.move(1);
      } else if (event.key === 'ArrowLeft') {
        this.move(-1);
      } else if (event.key === ' ' || event.key === 'Enter') {
        this.flip();
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    });

    this.setCards(cards);
  }

  public setCards(cards: Flashcard[]): void {
    this.cards = [...cards];
    this.index = 0;
    this.flipped = false;
    this.render();
  }

  public focus(): void {
    this.element.focus();
  }

  public destroy(): void {
    this.speech.cancel();
    this.element.remove();
  }

  private move(step: number): void {
    if (this.cards.length === 0) {
      return;
    }
    this.index = (this.index + step + this.cards.length) % this.cards.length;
    this.flipped = false;
    this.render();
    // The word is spoken as the card appears
    this.say();
  }

  private flip(): void {
    this.flipped = !this.flipped;
    this.render();
  }

  private shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    this.index = 0;
    this.flipped = false;
    this.render();
  }

  private say(): void {
    const card = this.cards[this.index];
    if (card !== undefined) {
      this.speech.speak(card.speak);
    }
  }

  private render(): void {
    const card = this.cards[this.index];
    this.card.classList.toggle('is-back', this.flipped);
    if (card === undefined) {
      this.face.textContent = 'This kit has no questions yet.';
      this.note.textContent = '';
      this.counter.textContent = '0 / 0';
      return;
    }
    this.face.textContent = this.flipped ? card.back : card.front;
    this.note.textContent = this.flipped ? (card.note ?? '') : 'Tap the card to flip';
    this.counter.textContent = `${this.index + 1} / ${this.cards.length}`;
  }
}

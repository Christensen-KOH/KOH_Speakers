import { Subject } from '../core/Subject';

import { toggleFullscreen } from './Fullscreen';

import './styles/topbar.css';

/**
 * Slim bar above the battlefield (48px): the [ 🎓 Teacher Studio ] button,
 * the teacher's [ 👑 Host ] pill and the [ ⛶ ] full-screen toggle. Keeps
 * everything off the action canvas.
 */
export class TopBar {
  public readonly studioRequested = new Subject<void>();
  private readonly element = document.createElement('div');
  private readonly slot = document.createElement('div');
  private readonly studio = document.createElement('button');

  constructor() {
    this.element.className = 'tk-topbar';
    this.slot.className = 'tk-topbar-slot';

    this.studio.type = 'button';
    this.studio.className = 'tk-topbar-btn tk-topbar-studio';
    this.studio.textContent = '🎓 Teacher Studio';
    this.studio.title = 'Build kits, flashcards and class rules';
    this.studio.addEventListener('click', () => {
      this.studio.blur();
      this.studioRequested.notify(null);
    });

    const fullscreen = document.createElement('button');
    fullscreen.type = 'button';
    fullscreen.className = 'tk-topbar-btn';
    fullscreen.textContent = '⛶';
    fullscreen.title = 'Full screen';
    fullscreen.setAttribute('aria-label', 'Toggle full screen');
    fullscreen.addEventListener('click', () => {
      fullscreen.blur();
      void toggleFullscreen();
    });

    this.element.append(this.slot, this.studio, fullscreen);
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  /** Where the teacher's host pill mounts. */
  public getSlot(): HTMLElement {
    return this.slot;
  }

  /** The studio button belongs to menus, not to a running battle. */
  public setStudioVisible(visible: boolean): void {
    this.studio.hidden = !visible;
  }
}

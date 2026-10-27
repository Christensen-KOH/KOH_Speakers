import { CanvasPointer } from './CanvasPointer';
import { enterFullscreenOnFirstTouch } from './Fullscreen';
import { TopBar } from './TopBar';

import './styles/base.css';
import './styles/tokens.css';
import './styles/overlay.css';

/**
 * DOM layer stacked on top of the game canvas. Gimkit-style UI (HUD, question
 * modal, shop, host options, report) mounts into `getLayer()` and scales with
 * the canvas because both live in the same stage box.
 */
export class UiRoot {
  private readonly stage: HTMLDivElement;
  private readonly layer: HTMLDivElement;
  private readonly topBar = new TopBar();
  private readonly pointer: CanvasPointer;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = document.createElement('div');
    this.stage.className = 'tk-stage';
    this.stage.style.aspectRatio = `${canvas.width} / ${canvas.height}`;

    this.layer = document.createElement('div');
    this.layer.className = 'tk-ui-layer';

    this.stage.append(canvas, this.layer);

    this.pointer = new CanvasPointer(canvas);
    enterFullscreenOnFirstTouch();
  }

  public getPointer(): CanvasPointer {
    return this.pointer;
  }

  public getTopBar(): TopBar {
    return this.topBar;
  }

  public getStage(): HTMLDivElement {
    return this.stage;
  }

  public getLayer(): HTMLDivElement {
    return this.layer;
  }

  public mount(container: HTMLElement): void {
    container.append(this.topBar.getElement(), this.stage);
  }
}

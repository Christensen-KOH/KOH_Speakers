import { Vector } from '../core/Vector';

/**
 * Mouse/touch position over the game canvas, in canvas pixels. Converts
 * client coordinates through the canvas' on-screen rectangle, so it stays
 * accurate at any browser size or full-screen scale.
 *
 * Canvas scenes (menus, stage select, results) poll it once per frame:
 * `wasMoved()` / `wasClicked()` hold for exactly one frame and `endFrame()`
 * (called by the game loop) clears them.
 */
export class CanvasPointer {
  private readonly canvas: HTMLCanvasElement;
  private readonly point = new Vector(0, 0);
  private inside = false;
  private moved = false;
  private clicked = false;
  private hovering = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('pointermove', this.handleMove);
    canvas.addEventListener('pointerdown', this.handleDown);
    canvas.addEventListener('pointerleave', () => {
      this.inside = false;
    });
  }

  /** Last known position, or null while the pointer is outside the canvas. */
  public position(): Vector | null {
    return this.inside ? this.point : null;
  }

  public wasMoved(): boolean {
    return this.moved;
  }

  /** Primary button (or a touch) went down this frame. */
  public wasClicked(): boolean {
    return this.clicked;
  }

  /** A scene calls this each frame the pointer is over something clickable. */
  public setHover(hovering: boolean): void {
    this.hovering = this.hovering || hovering;
  }

  public endFrame(): void {
    this.moved = false;
    this.clicked = false;
    const cursor = this.hovering ? 'pointer' : '';
    if (this.canvas.style.cursor !== cursor) {
      this.canvas.style.cursor = cursor;
    }
    this.hovering = false;
  }

  private track(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    this.point.set(
      ((event.clientX - rect.left) / rect.width) * this.canvas.width,
      ((event.clientY - rect.top) / rect.height) * this.canvas.height,
    );
    this.inside = true;
  }

  private handleMove = (event: PointerEvent): void => {
    this.track(event);
    this.moved = true;
  };

  private handleDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    this.track(event);
    this.moved = true;
    this.clicked = true;
  };
}

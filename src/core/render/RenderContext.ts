import { ImageSource } from '../graphics';

import { Rect } from '../Rect';
import { Vector } from '../Vector';

type Canvas = HTMLCanvasElement | OffscreenCanvas;

export abstract class RenderContext {
  protected canvas: Canvas;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  abstract init(): void;
  abstract clear(): void;
  abstract clearRect(x: number, y: number, width: number, height: number): void;
  abstract drawImage(
    imageSource: ImageSource,
    sourceRect: Rect,
    destinationRect: Rect,
  );
  abstract fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  );
  abstract getGlobalAlpha(): number;
  abstract setGlobalAlpha(alpha: number);
  abstract strokePath(positions: Vector[], color: string);

  // Soft shadows; contexts without ellipses fall back to a rectangle.
  public fillEllipse(
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    color: string,
  ): void {
    this.fillRect(
      centerX - radiusX,
      centerY - radiusY,
      radiusX * 2,
      radiusY * 2,
      color,
    );
  }
  abstract strokeRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color?: string,
    lineWidth?: number,
  );
}

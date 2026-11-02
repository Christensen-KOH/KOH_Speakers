import { Painter } from '../core/Painter';
import { RenderObject } from '../core/RenderObject';
import { RenderContext } from '../core/render';

const SHADOW = 'rgba(22,32,48,0.28)';

/** Soft oval shadow on the floor under a tank's tracks. */
export class TankShadowPainter extends Painter {
  public paint(context: RenderContext, renderObject: RenderObject): void {
    const { x, y, width, height } = renderObject.getWorldBoundingBox().toRect();
    context.fillEllipse(
      x + width / 2 + 3,
      y + height - 8,
      width * 0.42,
      10,
      SHADOW,
    );
  }
}

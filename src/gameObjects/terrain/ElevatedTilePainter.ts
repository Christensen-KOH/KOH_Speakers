import { Rect, SpritePainter } from '../../core';
import { RenderObject } from '../../core/RenderObject';
import { RenderContext } from '../../core/render';

export interface ElevatedTileStyle {
  // How far the roof is lifted above the footprint (3/4 view height)
  height: number;
  // Vertical front face, seen below the roof
  front: string;
  // Thin line along the front face's top edge
  frontEdge: string;
}

const ROOF_LIGHT = 'rgba(255,255,255,0.16)';
const SHADOW = 'rgba(22,32,48,0.22)';
const SHADOW_DEPTH = 6;

/**
 * Draws a wall tile as a little block in 3/4 top-down view: a soft shadow on
 * the floor, a darker front face on the footprint's lower edge and the tile
 * sprite as a lighter roof lifted by `height`. Tiles are y-sorted, so the
 * row below covers this row's front face and shadow, leaving them only on a
 * wall's bottom edge, and a tank just above a wall slips behind its roof.
 */
export class ElevatedTilePainter extends SpritePainter {
  private readonly style: ElevatedTileStyle;

  constructor(style: ElevatedTileStyle) {
    super();
    this.style = style;
  }

  public paint(context: RenderContext, renderObject: RenderObject): void {
    if (this.sprite === null || !this.sprite.isImageLoaded()) {
      return;
    }

    const { x, y, width, height } = renderObject.getWorldBoundingBox().toRect();
    const lift = this.style.height;

    context.fillRect(x + 3, y + height, width, SHADOW_DEPTH, SHADOW);

    context.fillRect(x, y + height - lift, width, lift, this.style.front);
    context.fillRect(x, y + height - lift, width, 2, this.style.frontEdge);

    context.drawImage(
      this.sprite.image,
      this.sprite.sourceRect,
      new Rect(x, y - lift, width, height),
    );
    context.fillRect(x, y - lift, width, height, ROOF_LIGHT);
  }
}

export const BRICK_ELEVATION: ElevatedTileStyle = {
  height: 10,
  front: '#7b3417',
  frontEdge: '#a8502a',
};

export const STEEL_ELEVATION: ElevatedTileStyle = {
  height: 12,
  front: '#58626f',
  frontEdge: '#8d99a8',
};

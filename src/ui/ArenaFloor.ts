import * as config from '../config';

const OUTSIDE = '#1d2532';
const FLOOR_LIGHT = '#eef2f7';
const FLOOR_DARK = '#e5ebf2';
const FLOOR_LINE = '#d5dde8';
const TILE = config.TILE_SIZE_LARGE;

let floorTile: HTMLCanvasElement | null = null;
const patterns = new WeakMap<NativeContext, CanvasPattern>();

// 2x2 tiles of soft checker with thin grout lines
function getFloorTile(): HTMLCanvasElement {
  if (floorTile !== null) {
    return floorTile;
  }
  floorTile = document.createElement('canvas');
  floorTile.width = TILE * 2;
  floorTile.height = TILE * 2;
  const context = floorTile.getContext('2d');
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      context.fillStyle = (row + col) % 2 === 0 ? FLOOR_LIGHT : FLOOR_DARK;
      context.fillRect(col * TILE, row * TILE, TILE, TILE);
    }
  }
  context.fillStyle = FLOOR_LINE;
  for (let i = 0; i < 2; i += 1) {
    context.fillRect(i * TILE, 0, 2, TILE * 2);
    context.fillRect(0, i * TILE, TILE * 2, 2);
  }
  return floorTile;
}

function getPattern(context: NativeContext): CanvasPattern | null {
  let pattern = patterns.get(context);
  if (pattern === undefined) {
    pattern = context.createPattern(getFloorTile(), 'repeat');
    patterns.set(context, pattern);
  }
  return pattern;
}

/**
 * Gimkit-style bright arena floor, drawn under every battle object: soft
 * tile checker inside the field and dark slate outside it. World (canvas)
 * coordinates.
 */
export function drawArenaFloor(
  context: NativeContext,
  visible: { x: number; y: number; width: number; height: number },
): void {
  context.fillStyle = OUTSIDE;
  context.fillRect(visible.x, visible.y, visible.width, visible.height);

  const left = config.BORDER_LEFT_WIDTH;
  const top = config.BORDER_TOP_BOTTOM_HEIGHT;
  const x0 = Math.max(visible.x, left);
  const y0 = Math.max(visible.y, top);
  const x1 = Math.min(visible.x + visible.width, left + config.FIELD_SIZE);
  const y1 = Math.min(visible.y + visible.height, top + config.FIELD_SIZE);
  if (x1 <= x0 || y1 <= y0) {
    return;
  }

  context.save();
  // Pattern origin on the field's corner, so the checker matches the tiles
  context.translate(left, top);
  const pattern = getPattern(context);
  context.fillStyle = pattern ?? FLOOR_LIGHT;
  context.fillRect(x0 - left, y0 - top, x1 - x0, y1 - y0);
  context.restore();
}

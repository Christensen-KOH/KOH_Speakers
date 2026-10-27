import { TerrainType } from '../terrain/TerrainType';
import * as config from '../config';

// The shared map travels as one string of 52×52 cells of 16px (the brick
// size), row-major. Bigger tiles (steel, water… 32px; pads 64px) cover
// several cells.
export const CELL_SIZE = config.BRICK_TILE_SIZE;
export const GRID_SIZE = config.FIELD_SIZE / CELL_SIZE;
// Students rebuild the map in blocks of this many cells (one 64px tile).
export const BLOCK_CELLS = 4;
export const EMPTY_CELL = '.';

const TYPE_TO_CHAR: Partial<Record<TerrainType, string>> = {
  [TerrainType.Brick]: 'b',
  [TerrainType.Steel]: 's',
  [TerrainType.Water]: 'w',
  [TerrainType.Jungle]: 'j',
  [TerrainType.Ice]: 'i',
  [TerrainType.RechargePad]: 'r',
  [TerrainType.UpgradePad]: 'u',
};

const CHAR_TO_TYPE = new Map<string, TerrainType>(
  Object.entries(TYPE_TO_CHAR).map(([type, char]) => [char, type as TerrainType]),
);

// Tile size per type; everything not listed is 32px.
function tileCells(type: TerrainType): number {
  if (type === TerrainType.Brick) {
    return 1;
  }
  if (type === TerrainType.RechargePad || type === TerrainType.UpgradePad) {
    return 4;
  }
  return 2;
}

export interface GridTile {
  type: TerrainType;
  // Top-left in field coordinates.
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridRegion {
  type: TerrainType;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Builds the grid string from the host's terrain tiles. */
export function encodeGrid(tiles: GridTile[]): string {
  const cells = new Array<string>(GRID_SIZE * GRID_SIZE).fill(EMPTY_CELL);

  tiles.forEach((tile) => {
    const char = TYPE_TO_CHAR[tile.type];
    if (char === undefined) {
      return;
    }
    const left = Math.max(0, Math.round(tile.x / CELL_SIZE));
    const top = Math.max(0, Math.round(tile.y / CELL_SIZE));
    const right = Math.min(GRID_SIZE, Math.round((tile.x + tile.width) / CELL_SIZE));
    const bottom = Math.min(GRID_SIZE, Math.round((tile.y + tile.height) / CELL_SIZE));
    for (let row = top; row < bottom; row += 1) {
      for (let col = left; col < right; col += 1) {
        // Floor-level pads never hide what's on top of them
        const current = cells[row * GRID_SIZE + col];
        if ((char === 'r' || char === 'u') && current !== EMPTY_CELL) {
          continue;
        }
        cells[row * GRID_SIZE + col] = char;
      }
    }
  });

  return cells.join('');
}

export function cellAt(grid: string, col: number, row: number): string {
  return grid[row * GRID_SIZE + col] ?? EMPTY_CELL;
}

/** Indexes of 64px blocks whose cells differ between two grids. */
export function changedBlocks(previous: string | null, next: string): number[] {
  const blocksPerSide = GRID_SIZE / BLOCK_CELLS;
  const changed = new Set<number>();
  for (let index = 0; index < next.length; index += 1) {
    if (previous === null || previous[index] !== next[index]) {
      const row = Math.floor(index / GRID_SIZE);
      const col = index % GRID_SIZE;
      changed.add(
        Math.floor(row / BLOCK_CELLS) * blocksPerSide + Math.floor(col / BLOCK_CELLS),
      );
    }
  }
  return Array.from(changed).sort((a, b) => a - b);
}

/**
 * Terrain regions (in field coordinates) for one 64px block, ready for
 * TerrainFactory. 32px/64px tiles are emitted only when all their cells
 * match, so a half-destroyed steel block can't appear.
 */
export function blockRegions(grid: string, block: number): GridRegion[] {
  const blocksPerSide = GRID_SIZE / BLOCK_CELLS;
  const baseRow = Math.floor(block / blocksPerSide) * BLOCK_CELLS;
  const baseCol = (block % blocksPerSide) * BLOCK_CELLS;
  const regions: GridRegion[] = [];
  const used = new Set<number>();

  for (let row = baseRow; row < baseRow + BLOCK_CELLS; row += 1) {
    for (let col = baseCol; col < baseCol + BLOCK_CELLS; col += 1) {
      const key = row * GRID_SIZE + col;
      const type = CHAR_TO_TYPE.get(cellAt(grid, col, row));
      if (used.has(key) || type === undefined) {
        continue;
      }

      const size = tileCells(type);
      // Big tiles start on their own alignment
      if (row % size !== 0 || col % size !== 0) {
        continue;
      }
      let complete = true;
      for (let r = row; r < row + size && complete; r += 1) {
        for (let c = col; c < col + size; c += 1) {
          if (CHAR_TO_TYPE.get(cellAt(grid, c, r)) !== type) {
            complete = false;
            break;
          }
        }
      }
      if (!complete) {
        continue;
      }
      for (let r = row; r < row + size; r += 1) {
        for (let c = col; c < col + size; c += 1) {
          used.add(r * GRID_SIZE + c);
        }
      }
      regions.push({
        type,
        x: col * CELL_SIZE,
        y: row * CELL_SIZE,
        width: size * CELL_SIZE,
        height: size * CELL_SIZE,
      });
    }
  }

  return regions;
}

export function blockRect(block: number): { x: number; y: number; size: number } {
  const blocksPerSide = GRID_SIZE / BLOCK_CELLS;
  const size = BLOCK_CELLS * CELL_SIZE;
  return {
    x: (block % blocksPerSide) * size,
    y: Math.floor(block / blocksPerSide) * size,
    size,
  };
}

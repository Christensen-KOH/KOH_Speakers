import { describe, expect, it } from 'vitest';

import { TerrainType } from '../terrain/TerrainType';

import { blockRegions, changedBlocks, encodeGrid, GRID_SIZE } from './grid';

describe('coop grid', () => {
  it('encodes tiles into 16px cells and back into regions', () => {
    const grid = encodeGrid([
      { type: TerrainType.Brick, x: 16, y: 0, width: 16, height: 16 },
      { type: TerrainType.Steel, x: 32, y: 32, width: 32, height: 32 },
      { type: TerrainType.RechargePad, x: 64, y: 0, width: 64, height: 64 },
    ]);
    expect(grid).toHaveLength(GRID_SIZE * GRID_SIZE);
    expect(grid[1]).toBe('b');
    expect(grid[2 * GRID_SIZE + 2]).toBe('s');

    expect(blockRegions(grid, 0)).toEqual([
      { type: TerrainType.Brick, x: 16, y: 0, width: 16, height: 16 },
      { type: TerrainType.Steel, x: 32, y: 32, width: 32, height: 32 },
    ]);
    expect(blockRegions(grid, 1)).toEqual([
      { type: TerrainType.RechargePad, x: 64, y: 0, width: 64, height: 64 },
    ]);
  });

  it('reports only the 64px blocks that changed', () => {
    const before = encodeGrid([
      { type: TerrainType.Brick, x: 0, y: 0, width: 32, height: 32 },
      { type: TerrainType.Brick, x: 128, y: 128, width: 16, height: 16 },
    ]);
    const after = encodeGrid([{ type: TerrainType.Brick, x: 0, y: 0, width: 32, height: 32 }]);
    expect(changedBlocks(before, after)).toEqual([2 * 13 + 2]);
    expect(changedBlocks(null, after)).toHaveLength(13 * 13);
  });

  it('never rebuilds a partly destroyed steel block', () => {
    const grid = encodeGrid([{ type: TerrainType.Steel, x: 0, y: 0, width: 32, height: 32 }]);
    const damaged = '.' + grid.slice(1);
    expect(blockRegions(damaged, 0)).toEqual([]);
  });
});

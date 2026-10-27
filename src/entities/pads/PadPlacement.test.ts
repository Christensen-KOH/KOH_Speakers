import { describe, expect, it } from 'vitest';

import { TerrainType } from '../../terrain/TerrainType';

import { withDefaultPads } from './PadPlacement';

const SPAWNS = [
  { x: 256, y: 768 },
  { x: 512, y: 768 },
];

describe('withDefaultPads', () => {
  it('adds recharge pads on spawns and an upgrade pad near the base', () => {
    const regions = withDefaultPads([], SPAWNS);
    const recharge = regions.filter((r) => r.type === TerrainType.RechargePad);
    const upgrade = regions.filter((r) => r.type === TerrainType.UpgradePad);
    expect(recharge.map(({ x, y }) => ({ x, y }))).toEqual(SPAWNS);
    expect(upgrade).toEqual([
      { type: TerrainType.UpgradePad, x: 128, y: 768, width: 64, height: 64 },
    ]);
  });

  it('skips cells that already have terrain', () => {
    const brick = { type: TerrainType.Brick, x: 128, y: 768, width: 64, height: 64 };
    const regions = withDefaultPads([brick], SPAWNS);
    const upgrade = regions.find((r) => r.type === TerrainType.UpgradePad);
    expect(upgrade).toMatchObject({ x: 640, y: 768 });
  });

  it('leaves maps that place their own pads alone', () => {
    const own = [
      { type: TerrainType.RechargePad, x: 0, y: 0, width: 64, height: 64 },
      { type: TerrainType.UpgradePad, x: 64, y: 0, width: 64, height: 64 },
    ];
    expect(withDefaultPads(own, SPAWNS)).toEqual(own);
  });
});

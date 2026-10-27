import { Rect } from '../../core/Rect';
import { TerrainRegionConfig } from '../../terrain/TerrainRegionConfig';
import { TerrainType } from '../../terrain/TerrainType';
import * as config from '../../config';

interface Point {
  x: number;
  y: number;
}

// Cells near the base tried in order for the default Upgrade Pad.
const UPGRADE_PAD_CANDIDATES: Point[] = [
  { x: 128, y: 768 },
  { x: 640, y: 768 },
  { x: 0, y: 768 },
  { x: 768, y: 768 },
  { x: 128, y: 704 },
  { x: 640, y: 704 },
  { x: 0, y: 704 },
  { x: 768, y: 704 },
];

function padRegion(type: TerrainType, { x, y }: Point): TerrainRegionConfig {
  const size = config.PAD_TILE_SIZE;
  return { type, x, y, width: size, height: size };
}

function toRect(region: TerrainRegionConfig): Rect {
  return new Rect(region.x, region.y, region.width, region.height);
}

/**
 * Adds TankKit pads to maps that don't define their own (all 35 classic maps):
 * a Recharge Pad on each player spawn and one Upgrade Pad on the first free
 * cell near the base. Maps that already place pads are returned unchanged.
 */
export function withDefaultPads(
  regions: TerrainRegionConfig[],
  playerSpawns: Point[],
): TerrainRegionConfig[] {
  const result = [...regions];

  const hasType = (type: TerrainType): boolean =>
    regions.some((region) => region.type === type);

  if (!hasType(TerrainType.RechargePad)) {
    playerSpawns.forEach((spawn) => {
      result.push(padRegion(TerrainType.RechargePad, spawn));
    });
  }

  if (!hasType(TerrainType.UpgradePad)) {
    const { x, y } = config.BASE_DEFAULT_POSITION;
    const { width, height } = config.BASE_DEFAULT_SIZE;
    const occupied = [
      ...result.map(toRect),
      new Rect(x, y, width, height),
      ...playerSpawns.map((spawn) =>
        toRect(padRegion(TerrainType.RechargePad, spawn)),
      ),
    ];

    const free = UPGRADE_PAD_CANDIDATES.find((candidate) => {
      const rect = toRect(padRegion(TerrainType.UpgradePad, candidate));
      return !occupied.some((other) => other.intersectsRect(rect));
    });

    if (free !== undefined) {
      result.push(padRegion(TerrainType.UpgradePad, free));
    }
  }

  return result;
}

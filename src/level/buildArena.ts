import { withDefaultPads } from '../entities/pads';
import { MapConfig, MapDto } from '../map';
import { TerrainRegionConfig, TerrainType } from '../terrain';
import * as config from '../config';

const TILE = config.TILE_SIZE_LARGE;
const COUNT = config.FIELD_TILE_COUNT;
// Brick clusters scattered over the open part of the arena
const CLUSTER_COUNT = 90;
// Share of clusters that get a steel cell for hard cover
const STEEL_CHANCE = 0.15;

// Cluster shapes as 64px cell offsets
const SHAPES: [number, number][][] = [
  [[0, 0], [1, 0]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[0, 0]],
];

// Enemy spawn cells (col, row) just inside the steel ring: along the top and
// down the left and right edges, ordered so consecutive enemies alternate
// sides. Cluster scattering keeps this outer lane free.
const ENEMY_EDGE_SPAWNS: [number, number][] = [
  [(COUNT - 1) / 2, 1],
  [1, 13],
  [COUNT - 2, 13],
  [12, 1],
  [COUNT - 13, 1],
  [1, 25],
  [COUNT - 2, 25],
  [1, 1],
  [COUNT - 2, 1],
];

// Small seeded PRNG so every level (and every co-op client) gets the same arena
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function offsetPoint({ x, y }: { x: number; y: number }): { x: number; y: number } {
  return { x: config.MAP_OFFSET.x + x, y: config.MAP_OFFSET.y + y };
}

function steelRing(): TerrainRegionConfig[] {
  const size = config.FIELD_SIZE;
  const steel = TerrainType.Steel;
  return [
    { type: steel, x: 0, y: 0, width: size, height: TILE },
    { type: steel, x: 0, y: size - TILE, width: size, height: TILE },
    { type: steel, x: 0, y: TILE, width: TILE, height: size - TILE * 2 },
    { type: steel, x: size - TILE, y: TILE, width: TILE, height: size - TILE * 2 },
  ];
}

function scatterClusters(seed: number): TerrainRegionConfig[] {
  const random = mulberry32(seed * 7919 + 17);
  const taken = new Set<number>();

  // Keep the authored map and a one-cell lane around it free
  const mapLeft = config.MAP_OFFSET.x / TILE - 1;
  const mapTop = config.MAP_OFFSET.y / TILE - 1;
  const mapRight = mapLeft + config.MAP_TILE_COUNT + 2;
  const isFree = (col: number, row: number): boolean => {
    if (col < 2 || row < 2 || col > COUNT - 3 || row > COUNT - 3) {
      return false;
    }
    if (col >= mapLeft && col < mapRight && row >= mapTop) {
      return false;
    }
    // One empty cell between clusters keeps the arena open for chasing
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (taken.has((row + dy) * COUNT + col + dx)) {
          return false;
        }
      }
    }
    return true;
  };

  const regions: TerrainRegionConfig[] = [];
  for (let i = 0; i < CLUSTER_COUNT; i += 1) {
    const col = Math.floor(random() * COUNT);
    const row = Math.floor(random() * COUNT);
    const shape = SHAPES[Math.floor(random() * SHAPES.length)];
    const cells = shape.map(([dx, dy]) => [col + dx, row + dy]);
    if (!cells.every(([x, y]) => isFree(x, y))) {
      continue;
    }
    const steelIndex = random() < STEEL_CHANCE ? Math.floor(random() * cells.length) : -1;
    cells.forEach(([x, y], index) => {
      regions.push({
        type: index === steelIndex ? TerrainType.Steel : TerrainType.Brick,
        x: x * TILE,
        y: y * TILE,
        width: TILE,
        height: TILE,
      });
    });
    // Mark only after placing, so cells of one cluster can touch each other
    cells.forEach(([x, y]) => taken.add(y * COUNT + x));
  }
  return regions;
}

/**
 * Turns an authored 13x13 map into the open battle arena: the map (with its
 * default pads) sits bottom-centre, a steel ring walls the arena in, brick
 * clusters seeded by `seed` fill the open ground around it, and enemies
 * spawn along the arena's outer edges.
 * Everything in the returned config is in arena coordinates.
 */
export function buildArena(mapConfig: MapConfig, seed: number): MapConfig {
  const mapRegions = withDefaultPads(
    mapConfig.getTerrainRegions(),
    mapConfig.getPlayerSpawnPositions(),
  ).map((region) => ({ ...region, ...offsetPoint(region) }));

  const source = mapConfig.getDto();
  const dto: MapDto = {
    version: source.version,
    spawn: {
      enemy: {
        list: source.spawn.enemy.list.map((item) => ({ ...item })),
        locations: ENEMY_EDGE_SPAWNS.map(([col, row]) => ({ x: col * TILE, y: row * TILE })),
      },
      player: {
        locations: mapConfig.getPlayerSpawnPositions().map(offsetPoint),
      },
    },
    terrain: {
      regions: [...steelRing(), ...scatterClusters(seed), ...mapRegions],
    },
  };

  const arena = new MapConfig();
  arena.fromDto(dto);
  return arena;
}

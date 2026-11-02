import { withDefaultPads } from '../entities/pads';
import { MapConfig, MapDto } from '../map';
import { TerrainRegionConfig, TerrainType } from '../terrain';
import * as config from '../config';

import { ARENA_STATIONS, ARENA_ZONES } from './arenaLayout';

const TILE = config.TILE_SIZE_LARGE;
// Obstacles are shaped on a 32px grid so they come out round
const CELL = config.TILE_SIZE_MEDIUM;
const COUNT = config.FIELD_TILE_COUNT;

// Obstacle blob centres (tile col, row) on a lattice 8 tiles apart, which
// leaves corridors 4+ tiles wide between blobs; blobs inside open zones are
// skipped. Each entry: cols, row, radius range in tiles.
const BLOB_ROWS: { cols: number[]; row: number; radius: [number, number] }[] = [
  // Light cover in the frontline
  { cols: [5, 13, 21, 29, 37, 45], row: 5, radius: [0.9, 1.1] },
  { cols: [5, 13, 21, 29, 37, 45], row: 12, radius: [1.3, 1.8] },
  // Flanking the Central Plaza
  { cols: [5, 13, 37, 45], row: 21, radius: [1.3, 1.8] },
  // Between the plaza, the stations and the base
  { cols: [17, 25, 33], row: 32, radius: [1.2, 1.5] },
  // Flank cover beside the base
  { cols: [5, 13, 37, 45], row: 41, radius: [1.2, 1.6] },
];
// Blob centres wander this far (tiles) so each stage looks different
const BLOB_JITTER = 0.6;
// Share of blobs with a steel core you can't shoot through
const STEEL_CORE_CHANCE = 0.35;
const STEEL_CORE_SHARE = 0.45;
// Steel pillars at the Central Plaza's inner corners to loop around
const PLAZA_PILLARS: [number, number][] = [
  [21, 18],
  [29, 18],
  [21, 24],
  [29, 24],
];

// Enemy spawn cells (col, row) just inside the steel ring: along the top and
// down the left and right edges, ordered so consecutive enemies alternate
// sides. Obstacles keep two tiles away from the ring, so this lane is free.
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

// Open zones (with a one-tile margin) and the two-tile lane inside the ring
function isReserved(x: number, y: number): boolean {
  const lane = TILE * 3;
  if (x < lane || y < lane || x >= config.FIELD_SIZE - lane || y >= config.FIELD_SIZE - lane) {
    return true;
  }
  return ARENA_ZONES.some(
    (zone) =>
      zone.keepClear &&
      x >= zone.x - TILE &&
      x < zone.x + zone.width + TILE &&
      y >= zone.y - TILE &&
      y < zone.y + zone.height + TILE,
  );
}

// Round brick blobs (some with a steel core) on the lattice
function obstacleBlobs(seed: number): TerrainRegionConfig[] {
  const random = mulberry32(seed * 7919 + 17);
  const regions: TerrainRegionConfig[] = [];

  BLOB_ROWS.forEach(({ cols, row, radius: [minRadius, maxRadius] }) => {
    cols.forEach((col) => {
      const centerX = (col + 0.5 + (random() * 2 - 1) * BLOB_JITTER) * TILE;
      const centerY = (row + 0.5 + (random() * 2 - 1) * BLOB_JITTER) * TILE;
      const radius = (minRadius + random() * (maxRadius - minRadius)) * TILE;
      const steelRadius = random() < STEEL_CORE_CHANCE ? radius * STEEL_CORE_SHARE : 0;

      const cells: TerrainRegionConfig[] = [];
      const reach = Math.ceil(radius / CELL) + 1;
      const baseCol = Math.floor(centerX / CELL);
      const baseRow = Math.floor(centerY / CELL);
      for (let r = baseRow - reach; r <= baseRow + reach; r += 1) {
        for (let c = baseCol - reach; c <= baseCol + reach; c += 1) {
          const x = c * CELL;
          const y = r * CELL;
          const distance = Math.hypot(x + CELL / 2 - centerX, y + CELL / 2 - centerY);
          if (distance > radius) {
            continue;
          }
          if (isReserved(x, y)) {
            // Never cut a blob in half: drop the whole thing
            return;
          }
          const type = distance <= steelRadius ? TerrainType.Steel : TerrainType.Brick;
          cells.push({ type, x, y, width: CELL, height: CELL });
        }
      }
      regions.push(...cells);
    });
  });

  PLAZA_PILLARS.forEach(([col, row]) => {
    regions.push({ type: TerrainType.Steel, x: col * TILE, y: row * TILE, width: TILE, height: TILE });
  });

  return regions;
}

function stationPads(): TerrainRegionConfig[] {
  const pad = (type: TerrainType, { col, row }: { col: number; row: number }): TerrainRegionConfig => ({
    type,
    x: col * TILE,
    y: row * TILE,
    width: config.PAD_TILE_SIZE,
    height: config.PAD_TILE_SIZE,
  });
  return ARENA_STATIONS.flatMap((station) => [
    pad(TerrainType.UpgradePad, station.upgrade),
    pad(TerrainType.RechargePad, station.recharge),
  ]);
}

/**
 * Turns an authored 13x13 map into the open battle arena (see arenaLayout):
 * the map (with its default pads) is the Base Plaza bottom-centre, a steel
 * ring walls the arena in, round obstacles seeded by `seed` stand on a
 * lattice with wide corridors between them, the Central Plaza and two
 * Upgrade Stations stay open, and enemies spawn along the outer edges.
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
      regions: [...steelRing(), ...obstacleBlobs(seed), ...stationPads(), ...mapRegions],
    },
  };

  const arena = new MapConfig();
  arena.fromDto(dto);
  return arena;
}

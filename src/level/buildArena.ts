import { Rect } from '../core/Rect';
import { withDefaultPads } from '../entities/pads';
import { MapConfig } from '../map';
import { MapDtoTerrainRegion } from '../map/MapDto';
import { TerrainType } from '../terrain/TerrainType';
import * as config from '../config';

import { ARENA_KIOSKS } from './arenaLayout';

const TILE = config.TILE_SIZE_LARGE;
// Authored board width and the strip of it mirrored into each wing.
const MAP_W = config.MAP_SIZE;
const OFFSET = config.MAP_OFFSET.x;
const WING = config.MAP_WING_COLS * config.HALF_TILE_SIZE;

const PAD_TYPES = [TerrainType.RechargePad, TerrainType.UpgradePad];

// Part of `region` between authored x = from..to, or null.
function clipX(
  region: MapDtoTerrainRegion,
  from: number,
  to: number,
): { a: number; b: number } | null {
  const a = Math.max(region.x, from);
  const b = Math.min(region.x + region.width, to);
  return b > a ? { a, b } : null;
}

/**
 * Field-coordinate terrain for one authored region: the region itself
 * (centred), plus its mirror image in the left wing (from the map's left
 * edge strip) and in the right wing (from its right edge strip). Mirroring
 * keeps each stage's own mix of brick, steel, forest, water and ice.
 */
function widenRegion(region: MapDtoTerrainRegion): MapDtoTerrainRegion[] {
  const out: MapDtoTerrainRegion[] = [{ ...region, x: region.x + OFFSET }];

  // Mirror about the authored map's left edge (field x = OFFSET)
  const left = clipX(region, 0, WING);
  if (left !== null) {
    out.push({ ...region, x: OFFSET - left.b, width: left.b - left.a });
  }

  // Mirror about its right edge (field x = OFFSET + MAP_W)
  const right = clipX(region, MAP_W - WING, MAP_W);
  if (right !== null) {
    out.push({
      ...region,
      x: OFFSET + 2 * MAP_W - right.b,
      width: right.b - right.a,
    });
  }

  return out;
}

/**
 * Turns an authored 13x13 (26x26 half-tile) map into the widescreen
 * 44x26 battle field, in field coordinates:
 * - the map centred, its outer 9 half-tile columns mirrored into the wings;
 * - Eagle base (authored, now centred at the bottom) untouched;
 * - spawns cleared: players flanking the base, 5 enemy lanes on the top row;
 * - stations and default pads placed on the wide field.
 * Every stage (all 70) goes through here, so no map needs re-authoring.
 */
export function buildArena(mapConfig: MapConfig, _seed: number): MapConfig {
  // Deep copy: the authored map must stay untouched
  const dto = JSON.parse(JSON.stringify(mapConfig.getDto()));

  // Authored pads sit on the 13x13 grid; the 4.5-tile shift would put them
  // off the 64px pad grid, so the arena places its own (withDefaultPads).
  const authored: MapDtoTerrainRegion[] = (dto.terrain?.regions ?? []).filter(
    (region: MapDtoTerrainRegion) => !PAD_TYPES.includes(region.type),
  );

  dto.terrain = { regions: authored.flatMap(widenRegion) };
  dto.spawn = {
    ...dto.spawn,
    player: { locations: config.FIELD_PLAYER_SPAWN_POSITIONS.slice(0, 2) },
    enemy: {
      ...dto.spawn?.enemy,
      locations: config.FIELD_ENEMY_SPAWN_POSITIONS,
    },
  };

  const arena = new MapConfig();
  arena.fromDto(dto);

  // Every spawn (co-op seats included) and station must be drivable
  [...config.FIELD_PLAYER_SPAWN_POSITIONS, ...config.FIELD_ENEMY_SPAWN_POSITIONS].forEach(
    ({ x, y }) => arena.clearTerrainRect(new Rect(x, y, TILE, TILE)),
  );
  ARENA_KIOSKS.forEach(({ col, row }) => {
    arena.clearTerrainRect(new Rect(col * TILE, row * TILE, TILE, TILE));
  });

  const regions = withDefaultPads(arena.getTerrainRegions(), arena.getPlayerSpawnPositions());
  const widened = arena.getDto();
  widened.terrain = { regions };
  arena.fromDto(widened);
  return arena;
}

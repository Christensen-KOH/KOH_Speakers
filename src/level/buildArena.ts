import { Rect } from '../core/Rect';
import { withDefaultPads } from '../entities/pads';
import { MapConfig } from '../map';
import * as config from '../config';

import { ARENA_KIOSKS } from './arenaLayout';

const TILE = config.TILE_SIZE_LARGE;

/**
 * Turns an authored 13x13 map into the battle field: the classic board as
 * authored, with its default pads and the ground under the stations
 * cleared. Enemies spawn at the map's own spawn points.
 */
export function buildArena(mapConfig: MapConfig, _seed: number): MapConfig {
  const arena = new MapConfig();
  // Deep copy: clearing terrain must not touch the authored map
  arena.fromDto(JSON.parse(JSON.stringify(mapConfig.getDto())));

  ARENA_KIOSKS.forEach(({ col, row }) => {
    arena.clearTerrainRect(new Rect(col * TILE, row * TILE, TILE, TILE));
  });

  const regions = withDefaultPads(arena.getTerrainRegions(), arena.getPlayerSpawnPositions());
  const dto = arena.getDto();
  dto.terrain = { regions };
  arena.fromDto(dto);
  return arena;
}

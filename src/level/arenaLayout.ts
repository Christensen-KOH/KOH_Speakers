import * as config from '../config';

const T = config.TILE_SIZE_LARGE;
const N = config.FIELD_TILE_COUNT;
const MAP_COL = config.MAP_OFFSET.x / T;
const MAP_ROW = config.MAP_OFFSET.y / T;

export interface ArenaZone {
  name: string;
  // Field coordinates (px)
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  // No obstacles are scattered inside (plus a one-tile margin)
  keepClear: boolean;
}

export interface ArenaStation {
  // Top-left tile of each 64px pad
  upgrade: { col: number; row: number };
  recharge: { col: number; row: number };
}

function zone(
  name: string,
  col: number,
  row: number,
  cols: number,
  rows: number,
  color: string,
  keepClear: boolean,
): ArenaZone {
  return { name, x: col * T, y: row * T, width: cols * T, height: rows * T, color, keepClear };
}

const STATION_COLS = 8;
const STATION_ROWS = 7;
const STATION_ROW = 29;
const WEST_STATION_COL = 5;
const EAST_STATION_COL = N - WEST_STATION_COL - STATION_COLS;

/**
 * Named floor zones of the 51x51 arena (Gimkit-style rooms). The arena
 * builder keeps the plazas open and places pads in the stations; the camera
 * paints the zones and their labels on the floor.
 */
export const ARENA_ZONES: ArenaZone[] = [
  zone('Frontline North', 1, 1, N - 2, 9, '#e5484d', false),
  zone('Frontline West', 1, 10, 4, 18, '#e5484d', false),
  zone('Frontline East', N - 5, 10, 4, 18, '#e5484d', false),
  zone('Central Plaza', 19, 16, 13, 11, '#3e7bfa', true),
  zone('Upgrade Station', WEST_STATION_COL, STATION_ROW, STATION_COLS, STATION_ROWS, '#f2a516', true),
  zone('Upgrade Station', EAST_STATION_COL, STATION_ROW, STATION_COLS, STATION_ROWS, '#f2a516', true),
  zone('Base Plaza', MAP_COL, MAP_ROW, config.MAP_TILE_COUNT, config.MAP_TILE_COUNT, '#2fb36b', true),
];

export const ARENA_STATIONS: ArenaStation[] = [WEST_STATION_COL, EAST_STATION_COL].map(
  (col) => ({
    upgrade: { col: col + 2, row: STATION_ROW + 3 },
    recharge: { col: col + STATION_COLS - 3, row: STATION_ROW + 3 },
  }),
);

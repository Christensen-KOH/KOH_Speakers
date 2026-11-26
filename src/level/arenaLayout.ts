export interface ArenaKiosk {
  kind: 'gadgets' | 'shield' | 'repair';
  // Top-left tile of the 64px station
  col: number;
  row: number;
}

// Vending-machine stations in a row across the middle of the widescreen
// field (64px tiles; 10.5 is the exact centre of the 22-tile width). The
// arena builder clears any terrain under them.
export const ARENA_KIOSKS: ArenaKiosk[] = [
  { kind: 'shield', col: 4, row: 6 },
  { kind: 'gadgets', col: 10.5, row: 6 },
  { kind: 'repair', col: 17, row: 6 },
];

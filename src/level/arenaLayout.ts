export interface ArenaKiosk {
  kind: 'gadgets' | 'shield' | 'repair';
  // Top-left tile of the 64px station
  col: number;
  row: number;
}

// Vending-machine stations in a row across the middle of the classic board.
// The arena builder clears any terrain under them.
export const ARENA_KIOSKS: ArenaKiosk[] = [
  { kind: 'shield', col: 3, row: 6 },
  { kind: 'gadgets', col: 6, row: 6 },
  { kind: 'repair', col: 9, row: 6 },
];

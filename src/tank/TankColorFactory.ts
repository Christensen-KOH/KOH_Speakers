import { TankColor } from './TankColor';

// Player slot order; slots 3+ only exist on the co-op battlefield.
export const PLAYER_COLORS = [
  TankColor.Primary,
  TankColor.Secondary,
  TankColor.Player3,
  TankColor.Player4,
  TankColor.Player5,
  TankColor.Player6,
  TankColor.Player7,
  TankColor.Player8,
];

// CSS colours matching each slot's tank, for name tags and lists.
export const PLAYER_CSS_COLORS = [
  '#ffd84d',
  '#5fd35f',
  '#4da6ff',
  '#ff6bd5',
  '#ff9f43',
  '#a77bff',
  '#3de0d0',
  '#e8e8e8',
];

export class TankColorFactory {
  public static createPlayerColor(playerIndex: number): TankColor {
    return PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
  }
}

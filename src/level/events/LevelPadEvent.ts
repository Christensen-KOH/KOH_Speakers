import { TerrainType } from '../../terrain';

export interface LevelPadEvent {
  playerIndex: number;
  padType: TerrainType;
}

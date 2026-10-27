export interface LevelWaveStartedEvent {
  // 1-based
  waveNumber: number;
  totalWaves: number;
  hasBoss: boolean;
}

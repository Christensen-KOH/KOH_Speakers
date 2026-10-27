import { GameUpdateArgs, Tag } from '../../game';
import { TerrainTile } from '../../gameObjects/TerrainTile';
import { TerrainType } from '../../terrain/TerrainType';
import * as config from '../../config';

import { PadGlyph, PadPainter } from './PadPainter';

const PULSE_PERIOD = 1.6;
// Repaint the pulse in steps rather than every frame to keep dirty rects low.
const PULSE_STEP = 0.1;

/**
 * Floor tile tanks drive over. It never blocks movement or bullets;
 * `LevelPadScript` checks which player tank is parked on it.
 */
export abstract class PadTerrainTile extends TerrainTile {
  public tags = [Tag.Pad];
  public zIndex = config.PAD_TILE_Z_INDEX;
  public painter: PadPainter;
  private time = 0;
  private sinceRepaint = 0;

  constructor(painter: PadPainter) {
    super(config.PAD_TILE_SIZE, config.PAD_TILE_SIZE);
    this.painter = painter;
  }

  protected update({ deltaTime }: GameUpdateArgs): void {
    this.time += deltaTime;
    this.sinceRepaint += deltaTime;
    if (this.sinceRepaint < PULSE_STEP) {
      return;
    }
    this.sinceRepaint = 0;

    const phase = (this.time % PULSE_PERIOD) / PULSE_PERIOD;
    this.painter.glow = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
    this.setNeedsPaint();
  }
}

export class RechargePadTerrainTile extends PadTerrainTile {
  public type = TerrainType.RechargePad;

  constructor() {
    super(new PadPainter('#0b3b24', '#2ee59d', PadGlyph.Plus));
  }
}

export class UpgradePadTerrainTile extends PadTerrainTile {
  public type = TerrainType.UpgradePad;

  constructor() {
    super(new PadPainter('#3d2f05', '#ffcf3d', PadGlyph.Arrow));
  }
}

import { GameObject } from '../../core/GameObject';
import { Painter } from '../../core/Painter';
import { RenderContext } from '../../core/render';
import { RenderObject } from '../../core/RenderObject';
import { GameUpdateArgs } from '../../game';
import * as config from '../../config';

export enum StationKind {
  Gadgets = 'gadgets',
  Shield = 'shield',
  Repair = 'repair',
}

interface StationLook {
  sign: string;
  body: string;
  accent: string;
  glyph: string[];
}

// Glyphs on an 8x8 grid, drawn as filled cells so they stay pixel-crisp.
export const STATION_LOOKS: Record<StationKind, StationLook> = {
  [StationKind.Gadgets]: {
    sign: 'GADGETS',
    body: '#3d2f05',
    accent: '#ffcf3d',
    glyph: [
      '...##...',
      '.#.##.#.',
      '..####..',
      '###..###',
      '###..###',
      '..####..',
      '.#.##.#.',
      '...##...',
    ],
  },
  [StationKind.Shield]: {
    sign: 'SHIELD STATION',
    body: '#0b2a4a',
    accent: '#3ea6ff',
    glyph: [
      '.######.',
      '########',
      '########',
      '########',
      '.######.',
      '..####..',
      '...##...',
      '........',
    ],
  },
  [StationKind.Repair]: {
    sign: 'REPAIR BAY',
    body: '#0b3b24',
    accent: '#2fd06b',
    glyph: [
      '........',
      '...##...',
      '...##...',
      '.######.',
      '.######.',
      '...##...',
      '...##...',
      '........',
    ],
  },
};

const PULSE_PERIOD = 1.6;
// Repaint the pulse in steps rather than every frame to keep dirty rects low.
const PULSE_STEP = 0.1;

/** Vending-machine plate: body, lit screen with the glyph, accent rim. */
class StationPainter extends Painter {
  public glow = 1;
  public active = false;
  private readonly look: StationLook;

  constructor(look: StationLook) {
    super();
    this.look = look;
  }

  public paint(context: RenderContext, renderObject: RenderObject): void {
    const { x, y, width, height } = renderObject.getWorldBoundingBox().toRect();
    const { body, accent, glyph } = this.look;

    // Floor shadow, then the machine with a darker front face
    context.fillEllipse(x + width / 2 + 3, y + height - 4, width * 0.46, 8, 'rgba(22,32,48,0.28)');
    context.fillRect(x + 4, y + 4, width - 8, height - 10, body);
    context.fillRect(x + 4, y + height - 18, width - 8, 12, 'rgba(0,0,0,0.35)');
    context.strokeRect(x + 5, y + 5, width - 10, height - 12, accent, this.active ? 4 : 2);

    const cell = Math.floor((width * 0.5) / glyph.length);
    const glyphX = x + (width - cell * glyph.length) / 2;
    const glyphY = y + 10;

    const prevAlpha = context.getGlobalAlpha();
    context.setGlobalAlpha(prevAlpha * (0.5 + 0.5 * this.glow));
    glyph.forEach((row, rowIndex) => {
      for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
        if (row[colIndex] === '#') {
          context.fillRect(glyphX + colIndex * cell, glyphY + rowIndex * cell, cell, cell, accent);
        }
      }
    });
    context.setGlobalAlpha(prevAlpha);
  }
}

/**
 * Interactive station standing on the arena floor (Gimkit vending machine).
 * Tanks drive over it; `LevelStationScript` shows its sign and prompt and
 * runs the purchase.
 */
export class StationKiosk extends GameObject {
  public readonly kind: StationKind;
  public zIndex = config.PAD_TILE_Z_INDEX;
  public painter: StationPainter;
  private time = 0;
  private sinceRepaint = 0;

  constructor(kind: StationKind) {
    super(config.PAD_TILE_SIZE, config.PAD_TILE_SIZE);
    this.kind = kind;
    this.painter = new StationPainter(STATION_LOOKS[kind]);
  }

  /** A player tank is in range: draw the rim thicker. */
  public setActive(active: boolean): void {
    if (this.painter.active !== active) {
      this.painter.active = active;
      this.setNeedsPaint();
    }
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

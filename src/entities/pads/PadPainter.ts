import { Painter } from '../../core/Painter';
import { RenderContext } from '../../core/render';
import { RenderObject } from '../../core/RenderObject';

export enum PadGlyph {
  Plus = 'plus',
  Arrow = 'arrow',
}

// Glyphs on an 8x8 grid, drawn as filled cells so they stay pixel-crisp.
const GLYPH_CELLS: Record<PadGlyph, string[]> = {
  [PadGlyph.Plus]: [
    '........',
    '...##...',
    '...##...',
    '.######.',
    '.######.',
    '...##...',
    '...##...',
    '........',
  ],
  [PadGlyph.Arrow]: [
    '...##...',
    '..####..',
    '.######.',
    '########',
    '...##...',
    '...##...',
    '...##...',
    '........',
  ],
};

/**
 * Procedural floor pad: tinted plate, bright border and a centred glyph whose
 * brightness pulses with `glow` (0..1).
 */
export class PadPainter extends Painter {
  public glow = 1;
  private readonly baseColor: string;
  private readonly accentColor: string;
  private readonly glyph: PadGlyph;

  constructor(baseColor: string, accentColor: string, glyph: PadGlyph) {
    super();

    this.baseColor = baseColor;
    this.accentColor = accentColor;
    this.glyph = glyph;
  }

  public paint(context: RenderContext, renderObject: RenderObject): void {
    const { x, y, width, height } = renderObject
      .getWorldBoundingBox()
      .toRect();

    context.fillRect(x, y, width, height, this.baseColor);
    context.strokeRect(x + 2, y + 2, width - 4, height - 4, this.accentColor, 4);

    const rows = GLYPH_CELLS[this.glyph];
    const cell = Math.floor((width * 0.5) / rows.length);
    const glyphX = x + (width - cell * rows.length) / 2;
    const glyphY = y + (height - cell * rows.length) / 2;

    const prevAlpha = context.getGlobalAlpha();
    context.setGlobalAlpha(prevAlpha * (0.45 + 0.55 * this.glow));
    rows.forEach((row, rowIndex) => {
      for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
        if (row[colIndex] === '#') {
          context.fillRect(
            glyphX + colIndex * cell,
            glyphY + rowIndex * cell,
            cell,
            cell,
            this.accentColor,
          );
        }
      }
    });
    context.setGlobalAlpha(prevAlpha);
  }
}

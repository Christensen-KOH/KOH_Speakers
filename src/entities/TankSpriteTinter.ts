import { CanvasImage, Rect, SpriteLoader } from '../core';
import { TankColor } from '../tank';
import { SkinPalette, SKINS, skinColorId } from '../cosmetics/Cosmetics';

type Rgb = [number, number, number];

interface TintSet {
  // Sprite id prefix to copy from, e.g. "tank.enemy.default."
  source: string;
  // Prefix for the generated ids; the colour name is appended.
  target: string;
  tints: [TankColor, Rgb][];
}

// Target colour for the brightest pixel; darker pixels scale toward black.
const TINT_SETS: TintSet[] = [
  {
    source: `tank.enemy.${TankColor.Default}.`,
    target: 'tank.enemy.',
    tints: [
      [TankColor.Gold, [255, 206, 60]],
      [TankColor.Boss, [235, 48, 72]],
    ],
  },
  {
    // Co-op battlefield players 3-8 (1 and 2 have their own art)
    source: `tank.player.${TankColor.Primary}.`,
    target: 'tank.player.',
    tints: [
      [TankColor.Player3, [77, 166, 255]],
      [TankColor.Player4, [255, 107, 213]],
      [TankColor.Player5, [255, 159, 67]],
      [TankColor.Player6, [167, 123, 255]],
      [TankColor.Player7, [61, 224, 208]],
      [TankColor.Player8, [232, 232, 232]],
    ],
  },
];

/**
 * Generates extra tank skins (gold/boss enemies, co-op player colours) by
 * tinting existing sprites, so they need no extra art. Must run after
 * sprites are loaded.
 */
export class TankSpriteTinter {
  public static generate(spriteLoader: SpriteLoader): void {
    TINT_SETS.forEach((set) => this.generateSet(spriteLoader, set));
    this.generateSkins(spriteLoader);
  }

  /**
   * Tank Locker skins: every player sprite re-coloured through a 3-stop
   * palette (dark → mid → light by luminance), with an optional 1px rim.
   * Registered as "tank.player.skin-<id>-<phase>.<tier>.<dir>.<frame>".
   */
  private static generateSkins(spriteLoader: SpriteLoader): void {
    const source = `tank.player.${TankColor.Primary}.`;
    const sourceIds = spriteLoader.getIds().filter((id) => id.startsWith(source));
    if (sourceIds.length === 0) {
      return;
    }
    const sourceSprites = sourceIds.map((id) => spriteLoader.load(id));
    const sheet = sourceSprites[0].image;

    SKINS.forEach((skin) => {
      skin.palettes.forEach((palette, phase) => {
        const canvas = document.createElement('canvas');
        canvas.width = sheet.getWidth();
        canvas.height = sheet.getHeight();
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingEnabled = false;
        context.drawImage(sheet.getElement(), 0, 0);

        sourceSprites.forEach((sprite) => {
          this.paletteRect(context, sprite.sourceRect, palette);
        });

        const image = new CanvasImage(canvas);
        const color = skinColorId(skin.id, phase);
        sourceIds.forEach((id, index) => {
          const rect = sourceSprites[index].sourceRect;
          spriteLoader.register(
            `tank.player.${color}.${id.slice(source.length)}`,
            image,
            new Rect(rect.x, rect.y, rect.width, rect.height),
          );
        });
      });
    });
  }

  private static paletteRect(
    context: CanvasRenderingContext2D,
    rect: Rect,
    palette: SkinPalette,
  ): void {
    const imageData = context.getImageData(rect.x, rect.y, rect.width, rect.height);
    const { data } = imageData;
    const { width, height } = imageData;
    const opaque = new Uint8Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) {
        continue;
      }
      opaque[i / 4] = 1;
      const t = (data[i] + data[i + 1] + data[i + 2]) / (3 * 255);
      const [from, to, k] =
        t < 0.5
          ? [palette.dark, palette.mid, t / 0.5]
          : [palette.mid, palette.light, (t - 0.5) / 0.5];
      data[i] = from[0] + (to[0] - from[0]) * k;
      data[i + 1] = from[1] + (to[1] - from[1]) * k;
      data[i + 2] = from[2] + (to[2] - from[2]) * k;
    }

    if (palette.outline) {
      const [r, g, b] = palette.outline;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (opaque[y * width + x] === 0) {
            continue;
          }
          // Edge pixel: an opaque pixel touching transparency or the frame edge
          const edge =
            x === 0 ||
            y === 0 ||
            x === width - 1 ||
            y === height - 1 ||
            opaque[y * width + x - 1] === 0 ||
            opaque[y * width + x + 1] === 0 ||
            opaque[(y - 1) * width + x] === 0 ||
            opaque[(y + 1) * width + x] === 0;
          if (edge) {
            const i = (y * width + x) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
          }
        }
      }
    }

    context.putImageData(imageData, rect.x, rect.y);
  }

  private static generateSet(spriteLoader: SpriteLoader, set: TintSet): void {
    const sourceIds = spriteLoader
      .getIds()
      .filter((id) => id.startsWith(set.source));
    if (sourceIds.length === 0) {
      return;
    }

    const sourceSprites = sourceIds.map((id) => spriteLoader.load(id));
    const sheet = sourceSprites[0].image;

    set.tints.forEach(([color, rgb]) => {
      const canvas = document.createElement('canvas');
      canvas.width = sheet.getWidth();
      canvas.height = sheet.getHeight();

      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingEnabled = false;
      context.drawImage(sheet.getElement(), 0, 0);

      sourceSprites.forEach((sprite) => {
        this.tintRect(context, sprite.sourceRect, rgb);
      });

      const image = new CanvasImage(canvas);
      sourceIds.forEach((id, index) => {
        const targetId = `${set.target}${color}.${id.slice(set.source.length)}`;
        const sourceRect = sourceSprites[index].sourceRect;
        spriteLoader.register(
          targetId,
          image,
          new Rect(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height),
        );
      });
    });
  }

  private static tintRect(
    context: CanvasRenderingContext2D,
    rect: Rect,
    [r, g, b]: Rgb,
  ): void {
    const imageData = context.getImageData(rect.x, rect.y, rect.width, rect.height);
    const { data } = imageData;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) {
        continue;
      }
      // Lift shadows a little so the tint reads on dark pixels too.
      const luminance = (data[i] + data[i + 1] + data[i + 2]) / (3 * 255);
      const level = 0.25 + luminance * 0.75;
      data[i] = r * level;
      data[i + 1] = g * level;
      data[i + 2] = b * level;
    }

    context.putImageData(imageData, rect.x, rect.y);
  }
}

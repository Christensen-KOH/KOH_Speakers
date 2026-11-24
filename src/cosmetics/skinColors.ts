import { getSkin, SkinId, skinColorId } from './Cosmetics';

/**
 * Sprite colour ids to cycle through for a skin. Classic keeps the player's
 * own slot colour; animated skins return one id per phase.
 */
export function getSkinColorFrames(id: SkinId, slotColor: string): string[] {
  const skin = getSkin(id);
  if (skin.palettes.length === 0) {
    return [slotColor];
  }
  return skin.palettes.map((_, phase) => skinColorId(skin.id, phase));
}

/** Which phase of an animated skin to show at `clock` seconds. */
export function getSkinPhase(id: SkinId, clock: number): number {
  const skin = getSkin(id);
  if (skin.palettes.length <= 1 || !skin.frameSeconds) {
    return 0;
  }
  return Math.floor(clock / skin.frameSeconds) % skin.palettes.length;
}

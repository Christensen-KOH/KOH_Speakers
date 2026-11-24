/**
 * Tank Locker catalog: skins (palette swaps of the player tank sprites,
 * generated on a canvas at load time) and movement trails (pixel puffs).
 * Pure data, shared by the solo game, the co-op host and co-op clients.
 */

import {
  DEFAULT_SKIN,
  DEFAULT_TRAIL,
  isSkinId,
  isTrailId,
  SkinId,
  TrailId,
} from '../live/protocol';

// Ids are defined with the network protocol so host and clients agree.
export { DEFAULT_SKIN, DEFAULT_TRAIL, isSkinId, isTrailId };
export type { SkinId, TrailId };

export type Rgb = [number, number, number];

export interface SkinPalette {
  // Darkest pixel of the source sprite maps to `dark`, brightest to `light`.
  dark: Rgb;
  mid: Rgb;
  light: Rgb;
  // Optional 1px rim drawn around the tank silhouette.
  outline?: Rgb;
}

export interface SkinDef {
  id: SkinId;
  name: string;
  price: number;
  tagline: string;
  // CSS swatch for the locker cards.
  swatch: string;
  // Classic keeps the player's slot colour, so it has no palette.
  palettes: SkinPalette[];
  // Seconds per palette when there are several (animated skins).
  frameSeconds?: number;
}

export interface TrailDef {
  id: TrailId;
  name: string;
  price: number;
  tagline: string;
  swatch: string;
  colors: string[];
  // Puff behaviour.
  count: number;
  speed: number;
  life: number;
  size: number;
}


// Hue-shifting gold → orange → amber phases for the elite skin.
const SOLAR_PHASES: SkinPalette[] = [
  { dark: [120, 50, 0], mid: [255, 150, 20], light: [255, 236, 120], outline: [255, 250, 200] },
  { dark: [140, 40, 0], mid: [255, 110, 10], light: [255, 210, 80], outline: [255, 230, 140] },
  { dark: [150, 30, 10], mid: [255, 80, 30], light: [255, 190, 60], outline: [255, 200, 90] },
  { dark: [140, 40, 0], mid: [255, 110, 10], light: [255, 210, 80], outline: [255, 230, 140] },
];

export const SKINS: SkinDef[] = [
  {
    id: 'classic',
    name: 'Classic Gold',
    price: 0,
    tagline: 'The original. Free for every cadet.',
    swatch: 'linear-gradient(135deg, #8a6a10, #ffd84d)',
    palettes: [],
  },
  {
    id: 'cobalt',
    name: 'Cobalt Striker',
    price: 150,
    tagline: 'Starter blue with a cyan edge.',
    swatch: 'linear-gradient(135deg, #0b2a7a, #3aa0ff 60%, #8ff4ff)',
    palettes: [{ dark: [10, 30, 110], mid: [40, 130, 255], light: [150, 240, 255] }],
  },
  {
    id: 'crimson',
    name: 'Crimson Fury',
    price: 400,
    tagline: 'Red plating over black steel.',
    swatch: 'linear-gradient(135deg, #111, #6a0010 40%, #ff3045)',
    palettes: [{ dark: [18, 6, 8], mid: [190, 20, 40], light: [255, 90, 90] }],
  },
  {
    id: 'emerald',
    name: 'Emerald Viper',
    price: 600,
    tagline: 'Neon green and very sneaky.',
    swatch: 'linear-gradient(135deg, #003b16, #18d860 60%, #b6ff6a)',
    palettes: [{ dark: [0, 50, 20], mid: [30, 220, 90], light: [190, 255, 110] }],
  },
  {
    id: 'arctic',
    name: 'Arctic Ghost',
    price: 900,
    tagline: 'White armour, ice-blue frost.',
    swatch: 'linear-gradient(135deg, #5a8fb8, #cfefff 60%, #ffffff)',
    palettes: [{ dark: [70, 120, 170], mid: [190, 230, 255], light: [255, 255, 255] }],
  },
  {
    id: 'cyber',
    name: 'Cyber Neon',
    price: 1300,
    tagline: 'Magenta hull with a cyan glow.',
    swatch: 'linear-gradient(135deg, #2a0040, #ff2fd0 60%, #44f6ff)',
    palettes: [
      { dark: [40, 0, 70], mid: [230, 40, 200], light: [255, 150, 240], outline: [60, 250, 255] },
    ],
  },
  {
    id: 'obsidian',
    name: 'Obsidian Stealth',
    price: 1800,
    tagline: 'Matte black with gold trim.',
    swatch: 'linear-gradient(135deg, #050505, #2a2a2a 60%, #e6b84a)',
    palettes: [
      { dark: [8, 8, 10], mid: [38, 38, 44], light: [90, 90, 100], outline: [230, 184, 74] },
    ],
  },
  {
    id: 'solar',
    name: 'Solar Champion',
    price: 3500,
    tagline: 'Elite! A blazing, shifting sun.',
    swatch: 'linear-gradient(135deg, #a33a00, #ff8a00 45%, #ffe27a)',
    palettes: SOLAR_PHASES,
    frameSeconds: 0.12,
  },
];

export const TRAILS: TrailDef[] = [
  {
    id: 'none',
    name: 'No Trail',
    price: 0,
    tagline: 'Clean tracks.',
    swatch: 'linear-gradient(135deg, #333, #555)',
    colors: [],
    count: 0,
    speed: 0,
    life: 0,
    size: 0,
  },
  {
    id: 'fire',
    name: 'Fire Sparks',
    price: 250,
    tagline: 'Hot embers behind you.',
    swatch: 'linear-gradient(135deg, #b31b00, #ff7a00 60%, #ffe066)',
    colors: ['#ffe066', '#ff9a1f', '#ff4a1a'],
    count: 3,
    speed: 70,
    life: 0.45,
    size: 5,
  },
  {
    id: 'frost',
    name: 'Frost Mist',
    price: 450,
    tagline: 'A cold, drifting fog.',
    swatch: 'linear-gradient(135deg, #3d7fb0, #bfe9ff 60%, #ffffff)',
    colors: ['#ffffff', '#c8f0ff', '#7fcfff'],
    count: 3,
    speed: 35,
    life: 0.7,
    size: 7,
  },
  {
    id: 'neon',
    name: 'Neon Pixel Trail',
    price: 750,
    tagline: 'Arcade pixels in every colour.',
    swatch: 'linear-gradient(135deg, #ff2fd0, #44f6ff 50%, #b6ff3a)',
    colors: ['#ff2fd0', '#44f6ff', '#b6ff3a', '#ffe14d'],
    count: 2,
    speed: 25,
    life: 0.6,
    size: 6,
  },
  {
    id: 'stardust',
    name: 'Gold Star Dust',
    price: 1200,
    tagline: 'Leave a sparkle of glory.',
    swatch: 'linear-gradient(135deg, #8a5a00, #ffd84d 60%, #fff8c8)',
    colors: ['#fff8c8', '#ffd84d', '#ffb800'],
    count: 3,
    speed: 55,
    life: 0.6,
    size: 4,
  },
];

export function getSkin(id: SkinId): SkinDef {
  return SKINS.find((skin) => skin.id === id) ?? SKINS[0];
}

export function getTrail(id: TrailId): TrailDef {
  return TRAILS.find((trail) => trail.id === id) ?? TRAILS[0];
}

/** Tank sprite colour id for one palette of a skin ("skin-cobalt-0"). */
export function skinColorId(id: SkinId, phase: number): string {
  return `skin-${id}-${phase}`;
}

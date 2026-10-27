import {
  AudioLoader,
  CollisionSystem,
  ColorSpriteFontGenerator,
  ImageLoader,
  RectFontLoader,
  SpriteFontLoader,
  SpriteLoader,
  State,
} from '../core';
import { ScreenShake } from '../entities/fx';
import { EconomySession } from '../gimkit-economy';
import type { KitLibrary } from '../kits';
import type { LiveSession } from '../live';
import type { Match } from '../match';
import type {
  AdaptiveControls,
  CanvasPointer,
  Hud,
  OverlayGate,
  QuestionController,
  ShopController,
  UiRoot,
} from '../ui';
import { InputHintSettings, InputManager } from '../input';
import { MapLoader } from '../map';
import { PointsHighscoreManager } from '../points';

import { AudioManager } from './AudioManager';
import { GameState } from './GameState';
import { GameStorage } from './GameStorage';
import { Session } from './Session';

export interface GameUpdateArgs {
  audioManager: AudioManager;
  audioLoader: AudioLoader;
  collisionSystem: CollisionSystem;
  colorSpriteFontGenerator: ColorSpriteFontGenerator;
  controls: AdaptiveControls;
  deltaTime: number;
  // Unscaled frame time while the level runs in bullet-time (Blitz clock).
  realDeltaTime?: number;
  economy: EconomySession;
  imageLoader: ImageLoader;
  inputHintSettings: InputHintSettings;
  inputManager: InputManager;
  kitLibrary: KitLibrary;
  liveSession: LiveSession;
  gameState: State<GameState>;
  gameStorage: GameStorage;
  hud: Hud;
  mapLoader: MapLoader;
  match: Match;
  overlayGate: OverlayGate;
  pointer: CanvasPointer;
  pointsHighscoreManager: PointsHighscoreManager;
  questionController: QuestionController;
  rectFontLoader: RectFontLoader;
  screenShake: ScreenShake;
  session: Session;
  shopController: ShopController;
  spriteFontLoader: SpriteFontLoader;
  spriteLoader: SpriteLoader;
  uiRoot: UiRoot;
}

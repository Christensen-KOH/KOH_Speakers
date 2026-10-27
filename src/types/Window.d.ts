import { GameLoop } from '../core';
import type { GameSceneRouter } from '../scenes';
import type { EconomySession } from '../gimkit-economy';
import type { KitLibrary } from '../kits';
import type { LiveSession } from '../live';
import type { Match } from '../match';
import type { OverlayGate, QuestionController, ShopController } from '../ui';

declare global {
  interface Window {
    gameLoop: GameLoop;
    // Dev-only handles for debugging TankKit systems from the console
    tankKit: {
      economy: EconomySession;
      kitLibrary: KitLibrary;
      liveSession: LiveSession;
      match: Match;
      overlayGate: OverlayGate;
      questionController: QuestionController;
      sceneRouter: GameSceneRouter;
      shopController: ShopController;
    };
  }

  type NativeCanvas = HTMLCanvasElement | OffscreenCanvas;

  type NativeContext =
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
}

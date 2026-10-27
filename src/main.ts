import Stats from 'stats.js';

import {
  AudioLoader,
  CollisionSystem,
  ColorSpriteFontGenerator,
  GameObject,
  GameLoop,
  GameRenderer,
  ImageLoader,
  Logger,
  RectFontLoader,
  SpriteFontLoader,
  SpriteLoader,
  State,
  Vector,
} from './core';
import { DebugGameLoopMenu, DebugInspector } from './debug';
import {
  AudioManager,
  GameUpdateArgs,
  GameState,
  GameStorage,
  Session,
} from './game';
import { InputHintSettings, InputManager } from './input';
import { ManifestMapListReader, MapLoader } from './map';
import { PointsHighscoreManager } from './points';
import { GameSceneRouter, GameSceneType } from './scenes';
import { EconomySession } from './gimkit-economy';
import { KitLibrary } from './kits';
import { LiveSession, LiveStudentBridge } from './live';
import { Match, MatchSettingsStore, toEconomySettings } from './match';
import {
  AdaptiveControls,
  CommandHub,
  Hud,
  OverlayGate,
  TeacherStudio,
  QuestionController,
  ShopController,
  UiRoot,
} from './ui';
import { ScreenShake, TankSpriteTinter } from './entities';

import * as config from './config';

import audioManifest from '../data/audio.manifest.json';
import spriteManifest from '../data/sprite.manifest.json';
import spriteFontConfig from '../data/fonts/sprite-font.json';
import rectFontConfig from '../data/fonts/rect-font.json';
import mapManifest from '../data/map.manifest.json';

const loadingElement = document.querySelector('[data-loading]');

const log = new Logger('main', Logger.Level.Debug);

const gameRenderer = new GameRenderer({
  // debug: true,
  height: config.CANVAS_HEIGHT,
  width: config.CANVAS_WIDTH,
});

const gameStorage = new GameStorage(config.STORAGE_NAMESPACE);
gameStorage.load();

const inputManager = new InputManager(gameStorage);
inputManager.listen();

const audioLoader = new AudioLoader(audioManifest);
const imageLoader = new ImageLoader();

const spriteFontLoader = new SpriteFontLoader(imageLoader);
spriteFontLoader.register(config.PRIMARY_SPRITE_FONT_ID, spriteFontConfig);

const colorSpriteFontGenerator = new ColorSpriteFontGenerator(spriteFontLoader);
colorSpriteFontGenerator.register(
  config.PRIMARY_SPRITE_FONT_ID,
  config.COLOR_BLACK,
);

const spriteLoader = new SpriteLoader(imageLoader, spriteManifest);

const rectFontLoader = new RectFontLoader();
rectFontLoader.register(config.PRIMARY_RECT_FONT_ID, rectFontConfig, {
  scale: config.TILE_SIZE_SMALL,
});

const manifestMapListReader = new ManifestMapListReader(mapManifest);
const mapLoader = new MapLoader(manifestMapListReader);

const audioManager = new AudioManager(audioLoader, gameStorage);
audioManager.loadSettings();

const session = new Session();

const economy = new EconomySession();

const match = new Match();
match.setSettings(new MatchSettingsStore().load());

const screenShake = new ScreenShake();

const uiRoot = new UiRoot(gameRenderer.getDomElement());

const kitLibrary = new KitLibrary();

const overlayGate = new OverlayGate(inputManager);

const hud = new Hud(uiRoot.getLayer());

const questionController = new QuestionController(
  uiRoot.getLayer(),
  economy,
  overlayGate,
  kitLibrary,
);

const shopController = new ShopController(
  uiRoot.getLayer(),
  economy,
  overlayGate,
);

// Sheet and shop hand over to each other (Q in the shop, B in the sheet)
// Keyboard + mouse on computers, floating joystick + tap on touch screens
const controls = new AdaptiveControls(
  inputManager,
  overlayGate,
  questionController,
  session,
  uiRoot.getStage(),
  uiRoot.getLayer(),
);

shopController.questionsRequested.addListener((playerIndex) =>
  questionController.open(playerIndex),
);
questionController.shopRequested.addListener((playerIndex) =>
  shopController.open(playerIndex),
);

const commandHub = new CommandHub(
  uiRoot.getLayer(),
  hud,
  overlayGate,
  questionController,
  shopController,
);
// Middle-click / mouse side buttons open and close the Hub
controls.hubToggleRequested.addListener(() => commandHub.toggle(0));

// Teacher Studio: kits, flashcards and class rules, before a game starts
const teacherStudio = new TeacherStudio({
  library: kitLibrary,
  onLaunch: () => sceneRouter.clearAndPush(GameSceneType.LiveHost),
  // Typing in the studio must not drive the arcade menus
  onOpenChanged: (open) => (open ? inputManager.unlisten() : inputManager.listen()),
});
uiRoot.getTopBar().studioRequested.addListener(() => teacherStudio.open());
// The button belongs to menus, not to a running battle
overlayGate.changed.addListener(() =>
  uiRoot.getTopBar().setStudioVisible(overlayGate.getLevel() === null),
);
const openAdminFromUrl = (): void => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('admin') === '1' || window.location.hash === '#admin') {
    teacherStudio.open();
  }
};
window.addEventListener('hashchange', openAdminFromUrl);

const liveSession = new LiveSession();
new LiveStudentBridge(liveSession, economy, questionController, match, session);

// Every new game starts with fresh resources, upgrades and question queue
session.started.addListener(() => {
  match.begin();
  economy.start(
    toEconomySettings(match.getSettings()),
    session.getPlayers().length,
  );
  questionController.startMatch();
});

const inputHintSettings = new InputHintSettings(gameStorage);

const pointsHighscoreManager = new PointsHighscoreManager(gameStorage);

const collisionSystem = new CollisionSystem();

const sceneRouter = new GameSceneRouter();
// Students open the teacher's ?join=CODE link straight into the join screen
const joinParams = new URLSearchParams(window.location.search);
const joinCode = joinParams.get('room') ?? joinParams.get('join');
if (joinCode !== null) {
  sceneRouter.start(GameSceneType.LiveJoin, { code: joinCode });
} else {
  sceneRouter.start(GameSceneType.MainMenu);
}
sceneRouter.transitionStarted.addListener(() => {
  collisionSystem.reset();
});

const debugInspector = new DebugInspector(gameRenderer.getDomElement());
debugInspector.listen();
debugInspector.click.addListener((position: Vector) => {
  const intersections: GameObject[] = [];

  const scene = sceneRouter.getCurrentScene();
  scene.getRoot().traverseDescedants((child) => {
    if (child.getWorldBoundingBox().containsPoint(position)) {
      intersections.push(child);
    }
  });
  log.debug(intersections);
});

const gameState = new State<GameState>(GameState.Playing);

const updateArgs: GameUpdateArgs = {
  audioManager,
  audioLoader,
  collisionSystem,
  colorSpriteFontGenerator,
  controls,
  deltaTime: 0,
  economy,
  gameStorage,
  hud,
  imageLoader,
  inputHintSettings,
  inputManager,
  gameState,
  kitLibrary,
  liveSession,
  mapLoader,
  match,
  overlayGate,
  pointer: uiRoot.getPointer(),
  pointsHighscoreManager,
  questionController,
  rectFontLoader,
  screenShake,
  session,
  shopController,
  spriteFontLoader,
  spriteLoader,
  uiRoot,
};

const gameLoop = new GameLoop();

const stats = new Stats();
const debugGameLoopMenu = new DebugGameLoopMenu(gameLoop);

if (config.IS_DEV) {
  document.body.appendChild(stats.dom);
  debugGameLoopMenu.attach();
}

gameLoop.tick.addListener((event) => {
  stats.begin();

  inputManager.update();

  updateArgs.deltaTime = event.deltaTime;

  const scene = sceneRouter.getCurrentScene();
  scene.invokeUpdate(updateArgs);

  gameRenderer.render(scene.getRoot());

  screenShake.update(event.deltaTime);
  gameRenderer.getDomElement().style.transform = screenShake.getTransform();

  gameState.update();

  // One-frame pointer events (move/click) have now been seen by the scene
  uiRoot.getPointer().endFrame();

  stats.end();
});

async function main(): Promise<void> {
  log.time('Audio preload');
  loadingElement.textContent = 'Loading audio...';
  await audioLoader.preloadAllAsync();
  log.timeEnd('Audio preload');

  log.time('Rect font preload');
  loadingElement.textContent = 'Loading rects fonts...';
  await rectFontLoader.preloadAll();
  log.timeEnd('Rect font preload');

  log.time('Sprite font preload');
  loadingElement.textContent = 'Loading sprite fonts...';
  await spriteFontLoader.preloadAllAsync();
  log.timeEnd('Sprite font preload');

  log.time('Color sprite font generation');
  loadingElement.textContent = 'Generating sprite font colors...';
  colorSpriteFontGenerator.generate(
    config.PRIMARY_SPRITE_FONT_ID,
    config.COLOR_WHITE,
  );
  colorSpriteFontGenerator.generate(
    config.PRIMARY_SPRITE_FONT_ID,
    config.COLOR_GRAY,
  );
  colorSpriteFontGenerator.generate(
    config.PRIMARY_SPRITE_FONT_ID,
    config.COLOR_RED,
  );
  colorSpriteFontGenerator.generate(
    config.PRIMARY_SPRITE_FONT_ID,
    config.COLOR_YELLOW,
  );
  log.timeEnd('Color sprite font generation');

  log.time('Sprites preload');
  loadingElement.textContent = 'Loading sprites...';
  await spriteLoader.preloadAllAsync();
  TankSpriteTinter.generate(spriteLoader);
  log.timeEnd('Sprites preload');

  log.time('Input bindings load');
  loadingElement.textContent = 'Loading input bindings...';
  inputManager.loadAllBindings();
  log.timeEnd('Input bindings load');

  document.body.removeChild(loadingElement);
  uiRoot.mount(document.body);
  openAdminFromUrl();

  gameLoop.start();
  // gameLoop.next();
}

main();

if (config.IS_DEV) {
  window.gameLoop = gameLoop;
  window.tankKit = {
    economy,
    kitLibrary,
    liveSession,
    match,
    overlayGate,
    questionController,
    sceneRouter,
    shopController,
  };
}

import { GameUpdateArgs, Session } from '../../game';
import { SceneMenuTitle } from '../../gameObjects';
import { InputManager } from '../../input';
import {
  getModeInfo,
  Match,
  MatchMode,
  MatchSettings,
  MatchSettingsStore,
} from '../../match';
import { HostOptionsPanel } from '../../ui/HostOptionsPanel';

import { GameScene } from '../GameScene';
import { GameSceneType } from '../GameSceneType';

export interface MainHostParams {
  // Which main-menu entry led here; picks a fitting default mode.
  players?: number;
}

/** Host / Game Options: picks mode, kit and balance, then stage select. */
export class MainHostScene extends GameScene<MainHostParams> {
  private panel: HostOptionsPanel;
  private inputManager: InputManager;
  private session: Session;
  private match: Match;
  private readonly store = new MatchSettingsStore();

  protected setup({ inputManager, kitLibrary, match, session, uiRoot }: GameUpdateArgs): void {
    this.root.add(new SceneMenuTitle('GAME OPTIONS'));

    this.inputManager = inputManager;
    this.session = session;
    this.match = match;

    // The panel takes the keyboard (Enter starts, Esc goes back)
    this.inputManager.unlisten();

    const settings = this.store.load();
    const players = this.params?.players ?? getModeInfo(settings.mode).players;
    if (getModeInfo(settings.mode).players !== players) {
      settings.mode = players === 2 ? MatchMode.Coop : MatchMode.BaseDefense;
    }

    this.panel = new HostOptionsPanel(uiRoot.getLayer(), kitLibrary, settings);
    this.panel.startRequested.addListener(this.handleStart);
    this.panel.backRequested.addListener(this.handleBack);
  }

  private handleStart = (settings: MatchSettings): void => {
    this.store.save(settings);
    this.match.setSettings(settings);
    this.session.setMultiplayer(this.match.getPlayerCount() === 2);

    this.close();
    this.navigator.clearAndPush(GameSceneType.LevelSelection);
  };

  private handleBack = (): void => {
    this.close();
    this.navigator.back();
  };

  private close(): void {
    this.panel.destroy();
    this.inputManager.listen();
  }
}

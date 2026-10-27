import { GameUpdateArgs } from '../../game';
import { SceneMenuTitle } from '../../gameObjects';
import { RewardLevel } from '../../gimkit-economy';
import { InputManager } from '../../input';
import { kitFromLive } from '../../live';
import { LiveJoinPanel } from '../../ui/LiveJoinPanel';

import { GameScene } from '../GameScene';
import { GameSceneType } from '../GameSceneType';

export interface LiveJoinParams {
  // Prefilled from a ?join=CODE link.
  code?: string;
}

/** Student joins a live class and waits for the teacher to start. */
export class LiveJoinScene extends GameScene<LiveJoinParams> {
  private panel: LiveJoinPanel;
  private inputManager: InputManager;
  private updateArgs: GameUpdateArgs;

  protected setup(updateArgs: GameUpdateArgs): void {
    const { inputManager, liveSession, uiRoot } = updateArgs;
    this.updateArgs = updateArgs;

    this.root.add(new SceneMenuTitle('LIVE CLASS'));

    this.inputManager = inputManager;
    this.inputManager.unlisten();

    this.panel = new LiveJoinPanel(uiRoot.getLayer(), liveSession, this.params?.code ?? '');
    this.panel.startRequested.addListener(this.handleStart);
    this.panel.exitRequested.addListener(this.handleExit);
  }

  private handleStart = (): void => {
    const { liveSession, mapLoader, match, questionController, session } = this.updateArgs;
    const room = liveSession.getRoom();
    const kit = liveSession.getKit() ? kitFromLive(liveSession.getKit()) : null;
    if (room === null || kit === null) {
      return;
    }

    questionController.setKitOverride(kit);
    match.startLive(
      {
        rewardLevel: room.settings.rewardLevel as RewardLevel,
        movementCostsFuel: room.settings.movementCostsFuel,
        startShells: room.settings.startShells,
        startCash: room.settings.startCash,
        rewardMultiplier: room.settings.rewardMultiplier,
      },
      (liveSession.getRemainingMs() ?? room.settings.durationMinutes * 60 * 1000) / 1000,
    );

    // Fresh resources and question queue for this student; the battlefield
    // itself runs on the teacher's host.
    session.reset();
    session.setSeenIntro(true);
    session.setMultiplayer(false);
    session.start(1, mapLoader.getItemsCount());

    this.close();
    this.navigator.clearAndPush(GameSceneType.CoopClient);
  };

  private handleExit = (): void => {
    this.close();
    this.navigator.clearAndPush(GameSceneType.MainMenu);
  };

  private close(): void {
    this.panel.destroy();
    this.inputManager.listen();
  }
}

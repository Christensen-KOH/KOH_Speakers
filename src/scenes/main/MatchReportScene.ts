import { GameUpdateArgs } from '../../game';
import { SceneMenuTitle } from '../../gameObjects';
import { InputManager } from '../../input';
import { buildMatchReport, MatchReport, mistakesToKit } from '../../match';
import { ReportPanel } from '../../ui/ReportPanel';

import { GameScene } from '../GameScene';
import { GameSceneType } from '../GameSceneType';

/** Shown after every match, before high scores reset the session. */
export class MatchReportScene extends GameScene {
  private panel: ReportPanel;
  private inputManager: InputManager;
  private leaveLive: (() => void) | null = null;

  protected setup(updateArgs: GameUpdateArgs): void {
    const {
      economy,
      inputManager,
      kitLibrary,
      match,
      questionController,
      session,
      uiRoot,
    } = updateArgs;

    this.root.add(new SceneMenuTitle('REPORT'));

    this.inputManager = inputManager;
    this.inputManager.unlisten();

    const playerCount = session.isMultiplayer() ? 2 : 1;
    const players = economy
      .getPlayers()
      .slice(0, playerCount)
      .map((player, index) => ({
        score: session.getPlayer(index).getGamePoints(),
        answered: player.getAnsweredCount(),
        correct: player.getCorrectCount(),
        bestStreak: player.getBestStreak(),
        cashEarned: player.getCashEarned(),
        knockouts: match.getKnockouts(index),
      }));

    const report: MatchReport = buildMatchReport(
      match.getMode(),
      match.getOutcome(),
      players,
      questionController.getHistory(),
    );

    if (match.isLive()) {
      const rank = updateArgs.liveSession.getRank();
      if (rank !== null) {
        report.subtitle += ` · #${rank.rank} of ${rank.of} in class`;
      }
      this.leaveLive = () => {
        updateArgs.liveSession.leave();
        questionController.setKitOverride(null);
      };
    }

    this.panel = new ReportPanel(uiRoot.getLayer(), report);
    this.panel.continueRequested.addListener(this.handleContinue);
    this.panel.saveKitRequested.addListener(() => {
      const sourceName = match.isLive()
        ? (updateArgs.liveSession.getKit()?.name ?? 'Live class')
        : kitLibrary.getActive().name;
      const kit = mistakesToKit(report.mistakes, sourceName);
      if (kit !== null) {
        kitLibrary.saveCustom(kit);
        this.panel.showSavedKit(kit);
      }
    });
  }

  private handleContinue = (): void => {
    this.leaveLive?.();
    this.panel.destroy();
    this.inputManager.listen();
    this.navigator.clearAndPush(GameSceneType.MainHighscore);
  };
}

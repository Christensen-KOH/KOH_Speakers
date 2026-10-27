import { GameUpdateArgs } from '../../game';
import { EconomySession, getKillBounty } from '../../gimkit-economy';
import type { LiveSession } from '../../live';
import { KNOCKOUT_BOUNTY, Match } from '../../match';
import { TankDeathReason } from '../../tank';
import { TerrainType } from '../../terrain';
import type { Hud, OverlayGate, QuestionController, ShopController } from '../../ui';
import { QUESTION_KEY_LABELS } from '../../ui/overlayKeys';
import { isTouchUi } from '../../ui/touchUi';

import { LevelScript } from '../LevelScript';
import {
  LevelEnemyDiedEvent,
  LevelPadEvent,
  LevelPlayerDiedEvent,
  LevelWaveStartedEvent,
} from '../events';

// Pressing fire with no shells opens the sheet, but not again right after
// the player closed it with the button still held.
const OUT_OF_SHELLS_REOPEN_MS = 2000;

/**
 * Connects the economy to the level: HUD, resource alerts, kill bounties,
 * floating rewards, pad behaviour (Upgrade Pad opens the shop) and opening
 * the question sheet when the tank is out of shells.
 */
export class LevelEconomyScript extends LevelScript {
  private economy: EconomySession;
  private match: Match;
  private live: LiveSession;
  private hud: Hud;
  private gate: OverlayGate;
  private questions: QuestionController;
  private shop: ShopController;
  private cleanups: (() => void)[] = [];
  private lastAutoOpen = -Infinity;
  // Players respawn on a Recharge Pad; explain it once per level only.
  private hasShownSafeZoneTip = false;

  protected setup(updateArgs: GameUpdateArgs): void {
    this.economy = updateArgs.economy;
    this.match = updateArgs.match;
    this.live = updateArgs.liveSession;
    this.hud = updateArgs.hud;
    this.gate = updateArgs.overlayGate;
    this.questions = updateArgs.questionController;
    this.shop = updateArgs.shopController;

    const playerCount = this.session.isMultiplayer() ? 2 : 1;
    this.hud.show(playerCount);

    this.eventBus.enemyDied.addListener(this.handleEnemyDied);
    this.eventBus.waveStarted.addListener(this.handleWaveStarted);
    this.eventBus.padEntered.addListener(this.handlePadEntered);
    this.eventBus.playerDied.addListener(this.handlePlayerDied);

    this.economy.getPlayers().slice(0, playerCount).forEach((player, index) => {
      this.cleanups.push(
        player.answered.addListener((result) => {
          if (result.payout === null) {
            return;
          }
          this.hud.popupAtStat(index, 'cash', `+$${result.payout.cash}`, 'cash');
          this.hud.popupAtStat(index, 'shells', `+${result.payout.shells}`, 'shells');
        }),
        player.fireRefused.addListener(() => this.openQuestionsForAmmo(index)),
      );
    });

    this.cleanups.push(
      this.shop.purchased.addListener((purchase) => {
        this.hud.popupAtStat(purchase.playerIndex, 'cash', `-$${purchase.price}`, 'spend');
      }),
    );

    // "Click when out of ammo" also opens the sheet
    const stage = updateArgs.uiRoot.getStage();
    const handleClick = (): void => {
      if (this.economy.getPlayer(0).getShells() === 0) {
        this.openQuestionsForAmmo(0, true);
      }
    };
    stage.addEventListener('mousedown', handleClick);
    this.cleanups.push(() => stage.removeEventListener('mousedown', handleClick));

    this.gate.detached.addListenerOnce(() => {
      this.cleanups.forEach((cleanup) => cleanup());
      this.cleanups = [];
      this.hud.hide();
    });
  }

  protected update(): void {
    if (this.match.isTimed()) {
      const rank = this.match.isLive() ? this.live.getRank() : null;
      this.hud.setTimer(
        this.match.getBlitzRemaining(),
        rank ? ` · #${rank.rank}/${rank.of}` : '',
      );
    }

    const tanks = this.world.getPlayerTanks();
    const playerCount = this.session.isMultiplayer() ? 2 : 1;

    const alerts: string[] = [];
    for (let index = 0; index < playerCount; index += 1) {
      const player = this.economy.getPlayer(index);
      const tank = tanks[index];
      this.hud.render(index, {
        cash: player.cash.getBalance(),
        fuel: player.getFuel() / player.getMaxFuel(),
        shells: player.getShells(),
        streak: player.getStreak(),
        hearts: tank && tank.isAlive() ? tank.attributes.health : 0,
      });

      const who = playerCount > 1 ? `P${index + 1}: ` : '';
      const press =
        isTouchUi() && playerCount === 1
          ? 'Tap ⚡ Hub to answer questions'
          : `Press ${QUESTION_KEY_LABELS[index]} or click ⚡ Hub to answer questions`;
      if (player.isOutOfFuel()) {
        alerts.push(`${who}LOW FUEL! ${press}`);
      } else if (player.getShells() === 0) {
        alerts.push(`${who}OUT OF SHELLS! ${press}`);
      }
    }

    const alert = alerts.length > 0 ? alerts.join('  ·  ') : null;
    this.hud.setAlert(this.gate.isFree() ? alert : null);
  }

  private openQuestionsForAmmo(playerIndex: number, force = false): void {
    const now = performance.now();
    if (!force && now - this.lastAutoOpen < OUT_OF_SHELLS_REOPEN_MS) {
      return;
    }
    if (!this.gate.isFree()) {
      return;
    }
    this.lastAutoOpen = now;
    this.questions.open(playerIndex);
  }

  private handleEnemyDied = (event: LevelEnemyDiedEvent): void => {
    if (event.reason === TankDeathReason.WipeoutPowerup) {
      return;
    }
    const bounty = getKillBounty(event.type.variant);
    const player = this.economy.getPlayer(event.hitterPartyIndex);
    if (bounty <= 0 || player === undefined) {
      return;
    }
    player.earn(bounty);
    const { x, y } = event.centerPosition;
    this.hud.popupAtField(x, y, `+$${bounty}`, 'cash');
  };

  private handlePlayerDied = (event: LevelPlayerDiedEvent): void => {
    const rival = event.knockedOutBy;
    if (rival === null || rival === undefined || rival === event.partyIndex) {
      return;
    }
    this.match.addKnockout(rival);
    this.economy.getPlayer(rival).earn(KNOCKOUT_BOUNTY);
    const { x, y } = event.centerPosition;
    this.hud.popupAtField(x, y, `KO! +$${KNOCKOUT_BOUNTY}`, 'cash');
  };

  private handleWaveStarted = (event: LevelWaveStartedEvent): void => {
    this.hud.setWave(event.waveNumber, event.totalWaves, event.hasBoss);
  };

  private handlePadEntered = (event: LevelPadEvent): void => {
    // Pads show no prompts: the Command Hub (Tab / Q) covers questions and shop.
    if (
      event.padType === TerrainType.RechargePad &&
      !this.hasShownSafeZoneTip
    ) {
      this.hasShownSafeZoneTip = true;
      this.hud.toast('Safe zone: refuelling. Time stops while the Hub is open.');
    }
  };
}

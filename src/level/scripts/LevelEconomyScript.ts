import { TankLabels } from '../../coop/TankLabels';
import { GameUpdateArgs } from '../../game';
import { EconomySession, getKillBounty } from '../../gimkit-economy';
import type { LiveSession } from '../../live';
import { KNOCKOUT_BOUNTY, Match } from '../../match';
import { TankDeathReason } from '../../tank';
import { TankState } from '../../gameObjects';
import { TerrainType } from '../../terrain';
import type { Hud, OverlayGate, ShopController } from '../../ui';
import { battleCamera } from '../../ui/Camera';
import { outOfResourceText } from '../../ui/outOfAmmo';
import * as config from '../../config';

import { LevelScript } from '../LevelScript';
import {
  LevelEnemyDiedEvent,
  LevelPadEvent,
  LevelPlayerDiedEvent,
  LevelWaveStartedEvent,
} from '../events';

// Pressing fire with no shells repeats the toast at most this often.
const OUT_OF_SHELLS_TOAST_MS = 2000;

/**
 * Connects the economy to the level: HUD (HP + Shield, resources), resource
 * alerts, kill bounties, the kill feed, floating rewards and HP bars over
 * the tanks. Running out of shells only shows a toast: the question sheet
 * opens when the player asks for it (⚡ Answer Questions, Q / Tab).
 */
export class LevelEconomyScript extends LevelScript {
  private economy: EconomySession;
  private match: Match;
  private live: LiveSession;
  private hud: Hud;
  private gate: OverlayGate;
  private shop: ShopController;
  private cleanups: (() => void)[] = [];
  private lastEmptyToast = -Infinity;
  private labels: TankLabels;
  // Players respawn on a Recharge Pad; explain it once per level only.
  private hasShownSafeZoneTip = false;

  protected setup(updateArgs: GameUpdateArgs): void {
    this.economy = updateArgs.economy;
    this.match = updateArgs.match;
    this.live = updateArgs.liveSession;
    this.hud = updateArgs.hud;
    this.gate = updateArgs.overlayGate;
    this.shop = updateArgs.shopController;

    const playerCount = this.session.isMultiplayer() ? 2 : 1;
    this.hud.show(playerCount);
    this.labels = new TankLabels(updateArgs.uiRoot.getLayer());

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
        player.fireRefused.addListener(() => this.toastOutOfShells(index)),
      );
    });

    this.cleanups.push(
      this.shop.purchased.addListener((purchase) => {
        this.hud.popupAtStat(purchase.playerIndex, 'cash', `-$${purchase.price}`, 'spend');
      }),
    );

    this.gate.detached.addListenerOnce(() => {
      this.cleanups.forEach((cleanup) => cleanup());
      this.cleanups = [];
      this.labels.destroy();
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
        hp: tank && tank.isAlive() ? tank.hp : 0,
        armor: tank && tank.isAlive() ? tank.armor : 0,
      });

      if (index === 0 && tank && tank.isAlive()) {
        const { x, y } = tank.getCenter();
        battleCamera.follow({ x, y, rotation: tank.rotation, moving: tank.state === TankState.Moving });
      }

      if (player.isOutOfFuel()) {
        alerts.push(outOfResourceText('fuel', index, playerCount));
      } else if (player.getShells() === 0) {
        alerts.push(outOfResourceText('shells', index, playerCount));
      }
    }

    const alert = alerts.length > 0 ? alerts.join('  ·  ') : null;
    this.hud.setAlert(this.gate.isFree() ? alert : null);

    // Compact HP / Shield bars over each tank
    this.labels.update(
      tanks
        .map((tank, index) => ({ tank, index }))
        .filter(({ tank }) => tank && tank.isAlive() && !tank.isRemoved)
        .map(({ tank, index }) => {
          const { x, y } = tank.getCenter();
          return {
            id: `p${index}`,
            slot: index,
            name: playerCount > 1 ? `P${index + 1}` : 'You',
            x,
            y,
            hp: tank.hp,
            maxHp: 100,
            armor: tank.armor,
            thinking: false,
          };
        }),
    );
  }

  // Never opens the sheet by itself: a small toast says how to reload
  private toastOutOfShells(playerIndex: number): void {
    const now = performance.now();
    if (now - this.lastEmptyToast < OUT_OF_SHELLS_TOAST_MS || !this.gate.isFree()) {
      return;
    }
    this.lastEmptyToast = now;
    const playerCount = this.session.isMultiplayer() ? 2 : 1;
    this.hud.toast(outOfResourceText('shells', playerIndex, playerCount));
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
    const name = (index: number): string =>
      this.session.isMultiplayer() ? `P${index + 1}` : 'You';
    const victim = name(event.partyIndex);
    const lives = this.session.getPlayer(event.partyIndex);
    const comeback = lives && lives.isAlive() ? ` · back in ${config.PLAYER_SPAWN_DELAY} s` : '';

    const rival = event.knockedOutBy;
    if (rival === null || rival === undefined || rival === event.partyIndex) {
      this.hud.killFeed(`💥 Enemy tank knocked out ${victim}${comeback}`);
      return;
    }
    this.match.addKnockout(rival);
    this.economy.getPlayer(rival).earn(KNOCKOUT_BOUNTY);
    this.hud.killFeed(`💥 ${name(rival)} knocked out ${victim}${comeback}`);
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

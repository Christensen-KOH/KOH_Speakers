import { StationKind, StationKiosk, STATION_LOOKS } from '../../entities/stations';
import { GameUpdateArgs } from '../../game';
import type { PlayerTank } from '../../gameObjects';
import {
  EconomySession,
  getShopOffers,
  OfferStatus,
  purchaseItem,
  ShopCategory,
} from '../../gimkit-economy';
import { PLAYER_MAX_HP, PLAYER_MAX_SHIELD } from '../../tank';
import type { Hud, OverlayGate, ShopController } from '../../ui';
import { StationSigns } from '../../ui/StationSigns';
import { isTouchUi } from '../../ui/touchUi';
import * as config from '../../config';

import { ARENA_KIOSKS } from '../arenaLayout';
import { LevelScript } from '../LevelScript';

// Tank centre within this distance of a station centre can use it (px)
const STATION_REACH = 64;
export const SHIELD_CAN_PRICE = 20;
export const SHIELD_CAN_AMOUNT = 25;
export const REPAIR_PRICE = 15;
export const REPAIR_AMOUNT = 50;
// Snowbrawl med pack: stand still this long; moving cancels it
export const REPAIR_CHANNEL_SECONDS = 2;
// Drift allowed while channelling (px), so a nudge from a wall doesn't cancel
const REPAIR_STILL_TOLERANCE = 3;

interface RepairChannel {
  tank: PlayerTank;
  elapsed: number;
  x: number;
  y: number;
}

/**
 * Gimkit-style vending machines on the arena floor: Shield Station (Shield
 * Can), Gadgets (next cannon upgrade, or the full shop) and Repair Bay
 * (channelled repair). Driving up shows a prompt; E or a tap on the prompt
 * uses the station. Player 1 only.
 */
export class LevelStationScript extends LevelScript {
  private kiosks: StationKiosk[] = [];
  private signs: StationSigns;
  private economy: EconomySession;
  private hud: Hud;
  private gate: OverlayGate;
  private shop: ShopController;
  private near: StationKiosk | null = null;
  private repair: RepairChannel | null = null;
  private cleanups: (() => void)[] = [];

  protected setup(updateArgs: GameUpdateArgs): void {
    this.economy = updateArgs.economy;
    this.hud = updateArgs.hud;
    this.gate = updateArgs.overlayGate;
    this.shop = updateArgs.shopController;

    const size = config.TILE_SIZE_LARGE;
    this.kiosks = ARENA_KIOSKS.map(({ kind, col, row }) => {
      const kiosk = new StationKiosk(kind as StationKind);
      kiosk.position.set(col * size, row * size);
      this.world.field.add(kiosk);
      return kiosk;
    });
    // Field coordinates straight from the layout: the kiosks have no world
    // matrix until their first update
    this.signs = new StationSigns(
      updateArgs.uiRoot.getLayer(),
      ARENA_KIOSKS.map(({ kind, col, row }) => {
        const look = STATION_LOOKS[kind as StationKind];
        return { text: look.sign, color: look.accent, x: (col + 0.5) * size, y: (row + 0.5) * size };
      }),
    );

    const handleKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing = target !== null && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (event.key.toLowerCase() !== 'e' || event.repeat || typing) {
        return;
      }
      this.interact();
    };
    document.addEventListener('keydown', handleKey);
    this.cleanups.push(
      () => document.removeEventListener('keydown', handleKey),
      this.hud.promptActivated.addListener(() => this.interact()),
    );

    this.gate.detached.addListenerOnce(() => {
      this.cleanups.forEach((cleanup) => cleanup());
      this.cleanups = [];
      this.signs.destroy();
      this.hud.setPrompt(null);
    });
  }

  protected update({ deltaTime }: GameUpdateArgs): void {
    this.signs.update();

    const tank = this.getTank();
    const near = tank !== null ? this.findStation(tank) : null;
    if (near !== this.near) {
      this.near?.setActive(false);
      near?.setActive(true);
      this.near = near;
    }

    this.updateRepair(deltaTime);

    if (!this.gate.isFree()) {
      this.hud.setPrompt(null);
      return;
    }
    if (this.repair !== null) {
      const percent = Math.round((this.repair.elapsed / REPAIR_CHANNEL_SECONDS) * 100);
      this.hud.setPrompt(`🔧 Repairing… hold still (${percent}%)`, true);
      return;
    }
    this.hud.setPrompt(near !== null ? this.getPromptText(near, tank) : null);
  }

  private getTank(): PlayerTank | null {
    const tank = this.world.getPlayerTanks()[0];
    return tank && tank.isAlive() && !tank.isRemoved ? tank : null;
  }

  private findStation(tank: PlayerTank): StationKiosk | null {
    const { x, y } = tank.getCenter();
    return (
      this.kiosks.find((kiosk) => {
        const center = kiosk.getCenter();
        return Math.hypot(center.x - x, center.y - y) <= STATION_REACH;
      }) ?? null
    );
  }

  private getNextCannon() {
    const level = this.gate.getLevel();
    const player = this.economy.getPlayer(0);
    return (
      getShopOffers(player, { hasTurret: level ? level.hasTurret() : false }).find(
        (offer) =>
          offer.item.category === ShopCategory.Weapon && offer.status === OfferStatus.Available,
      ) ?? null
    );
  }

  private getPromptText(kiosk: StationKiosk, tank: PlayerTank): string {
    const key = isTouchUi() ? '[Tap]' : '[Press E]';
    switch (kiosk.kind) {
      case StationKind.Shield:
        return tank.armor >= PLAYER_MAX_SHIELD
          ? '🛡 Shield full'
          : `${key} Buy Shield Can ($${SHIELD_CAN_PRICE}) → +${SHIELD_CAN_AMOUNT} Shield`;
      case StationKind.Repair:
        return tank.hp >= PLAYER_MAX_HP
          ? '🔧 HP full'
          : `${key} Repair ($${REPAIR_PRICE}) → +${REPAIR_AMOUNT} HP · hold still ${REPAIR_CHANNEL_SECONDS} s`;
      case StationKind.Gadgets: {
        const cannon = this.getNextCannon();
        return cannon !== null
          ? `${key} Upgrade Cannon: ${cannon.item.name} ($${cannon.price})`
          : `${key} Open Gadget Shop`;
      }
    }
  }

  private interact(): void {
    const tank = this.getTank();
    const kiosk = this.near;
    const level = this.gate.getLevel();
    if (tank === null || kiosk === null || level === null || !level.canOpen() || !this.gate.isFree()) {
      return;
    }
    if (this.repair !== null) {
      return;
    }

    const player = this.economy.getPlayer(0);
    switch (kiosk.kind) {
      case StationKind.Shield: {
        if (tank.armor >= PLAYER_MAX_SHIELD) {
          return;
        }
        if (!player.cash.spend(SHIELD_CAN_PRICE)) {
          this.hud.toast(this.needCash(SHIELD_CAN_PRICE));
          return;
        }
        tank.addArmor(SHIELD_CAN_AMOUNT);
        this.hud.popupAtStat(0, 'cash', `-$${SHIELD_CAN_PRICE}`, 'spend');
        const { x, y } = tank.getCenter();
        this.hud.popupAtField(x, y - 30, `+${SHIELD_CAN_AMOUNT} 🛡`, 'shells');
        return;
      }
      case StationKind.Repair: {
        if (tank.hp >= PLAYER_MAX_HP) {
          return;
        }
        if (!player.cash.canAfford(REPAIR_PRICE)) {
          this.hud.toast(this.needCash(REPAIR_PRICE));
          return;
        }
        const { x, y } = tank.getCenter();
        this.repair = { tank, elapsed: 0, x, y };
        return;
      }
      case StationKind.Gadgets: {
        const cannon = this.getNextCannon();
        if (cannon === null) {
          this.shop.open(0);
          return;
        }
        const result = purchaseItem(player, cannon.item.id, { hasTurret: level.hasTurret() });
        if (result.ok === false) {
          this.hud.toast(result.reason);
          return;
        }
        tank.refreshLoadout();
        this.hud.popupAtStat(0, 'cash', `-$${result.price}`, 'spend');
        this.hud.toast(`Cannon upgraded: ${result.item.name}!`);
        return;
      }
    }
  }

  // Channelled repair: moving (or dying, or leaving the bay) cancels it
  private updateRepair(deltaTime: number): void {
    const repair = this.repair;
    if (repair === null) {
      return;
    }
    const { tank } = repair;
    const { x, y } = tank.getCenter();
    const moved = Math.hypot(x - repair.x, y - repair.y) > REPAIR_STILL_TOLERANCE;
    if (!tank.isAlive() || tank.isRemoved || moved) {
      this.repair = null;
      if (tank.isAlive()) {
        this.hud.toast('Repair cancelled: hold still to repair');
      }
      return;
    }

    repair.elapsed += deltaTime;
    if (repair.elapsed < REPAIR_CHANNEL_SECONDS) {
      return;
    }
    this.repair = null;
    if (!this.economy.getPlayer(0).cash.spend(REPAIR_PRICE)) {
      this.hud.toast(this.needCash(REPAIR_PRICE));
      return;
    }
    const gained = tank.repair(REPAIR_AMOUNT);
    this.hud.popupAtStat(0, 'cash', `-$${REPAIR_PRICE}`, 'spend');
    this.hud.popupAtField(x, y - 30, `+${gained} HP`, 'fuel');
  }

  private needCash(price: number): string {
    const missing = price - this.economy.getPlayer(0).cash.getBalance();
    return `Need $${missing} more. Answer questions to earn cash!`;
  }
}

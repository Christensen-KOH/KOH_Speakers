import { GameUpdateArgs } from '../../game';
import { PadTerrainTile } from '../../entities/pads';
import { TerrainType } from '../../terrain';
import * as config from '../../config';

import { LevelScript } from '../LevelScript';

/**
 * Tracks which pad each player tank is parked on, emits enter/exit events
 * (the shop and the question safe zone listen to them) and refuels tanks
 * sitting on a Recharge Pad.
 */
export class LevelPadScript extends LevelScript {
  private pads: PadTerrainTile[] = [];
  private currentPads: PadTerrainTile[] = [];

  public getPlayerPadType(playerIndex: number): TerrainType | null {
    const pad = this.currentPads[playerIndex];
    return pad ? pad.type : null;
  }

  protected setup(): void {
    this.world.field.children.forEach((child) => {
      if (child instanceof PadTerrainTile) {
        this.pads.push(child);
      }
    });
  }

  protected update({ deltaTime, economy }: GameUpdateArgs): void {
    this.world.getPlayerTanks().forEach((tank, playerIndex) => {
      const isActive = tank && tank.isAlive() && !tank.isRemoved;
      const center = isActive ? tank.getCenter() : null;
      const pad = center
        ? this.pads.find((candidate) =>
            candidate.getBoundingBox().containsPoint(center),
          ) ?? null
        : null;

      const prevPad = this.currentPads[playerIndex] ?? null;
      if (pad !== prevPad) {
        if (prevPad !== null) {
          this.eventBus.padExited.notify({
            playerIndex,
            padType: prevPad.type,
          });
        }
        if (pad !== null) {
          this.eventBus.padEntered.notify({ playerIndex, padType: pad.type });
        }
        this.currentPads[playerIndex] = pad;
      }

      if (pad !== null && pad.type === TerrainType.RechargePad) {
        economy
          .getPlayer(playerIndex)
          .addFuel(config.RECHARGE_PAD_FUEL_PER_SECOND * deltaTime);
      }
    });
  }
}

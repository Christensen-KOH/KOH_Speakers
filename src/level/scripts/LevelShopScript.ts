import { GameUpdateArgs } from '../../game';
import {
  EMP_DURATION,
  ShopItemId,
  STEEL_FORTRESS_DURATION,
} from '../../gimkit-economy';
import type { ShopPurchase } from '../../ui';

import { LevelScript } from '../LevelScript';

import { LevelBaseScript } from './LevelBaseScript';
import { LevelEnemyScript } from './LevelEnemyScript';
import { LevelTurretScript } from './LevelTurretScript';

/** Applies the in-level effects of shop purchases. */
export class LevelShopScript extends LevelScript {
  private readonly baseScript: LevelBaseScript;
  private readonly enemyScript: LevelEnemyScript;
  private readonly turretScript: LevelTurretScript;

  constructor(
    baseScript: LevelBaseScript,
    enemyScript: LevelEnemyScript,
    turretScript: LevelTurretScript,
  ) {
    super();
    this.baseScript = baseScript;
    this.enemyScript = enemyScript;
    this.turretScript = turretScript;
  }

  protected setup({ overlayGate, shopController }: GameUpdateArgs): void {
    const unsubscribe = shopController.purchased.addListener(this.handlePurchase);
    overlayGate.detached.addListenerOnce(unsubscribe);
  }

  private handlePurchase = ({ playerIndex, item }: ShopPurchase): void => {
    switch (item.id) {
      case ShopItemId.TwinBlaster:
      case ShopItemId.PlasmaCannon:
      case ShopItemId.ScatterShot:
      case ShopItemId.SpeedBoost:
      case ShopItemId.HeavyArmor: {
        // Re-arm the tank on the field now; future spawns pick it up too.
        const tank = this.world.getPlayerTanks()[playerIndex];
        if (tank && tank.isAlive()) {
          tank.refreshLoadout(item.id === ShopItemId.HeavyArmor);
        }
        break;
      }
      case ShopItemId.BrickBuilder:
        this.baseScript.repairWalls();
        break;
      case ShopItemId.SteelFortress:
        this.baseScript.fortify(STEEL_FORTRESS_DURATION);
        break;
      case ShopItemId.AutoTurret:
        this.turretScript.placeTurret(playerIndex);
        break;
      case ShopItemId.EmpBlast:
        this.enemyScript.freezeAll(EMP_DURATION);
        break;
      default:
        break;
    }
  };
}

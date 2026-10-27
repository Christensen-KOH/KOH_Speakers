import { Subject } from '../../core';

import { DebugMenu, DebugMenuOptions } from '../DebugMenu';

export enum DebugTankKitAction {
  SpawnGold = 'spawn-gold',
  SpawnBoss = 'spawn-boss',
  PlaceTurret = 'place-turret',
  Shake = 'shake',
  KillAll = 'kill-all',
}

export class DebugLevelTankKitMenu extends DebugMenu {
  public action = new Subject<DebugTankKitAction>();

  constructor(options: DebugMenuOptions = {}) {
    super('TankKit', options);

    this.appendButton('Spawn gold tank', () => {
      this.action.notify(DebugTankKitAction.SpawnGold);
    });
    this.appendButton('Spawn boss tank', () => {
      this.action.notify(DebugTankKitAction.SpawnBoss);
    });
    this.appendButton('Place turret', () => {
      this.action.notify(DebugTankKitAction.PlaceTurret);
    });
    this.appendButton('Kill all enemies', () => {
      this.action.notify(DebugTankKitAction.KillAll);
    });
    this.appendButton('Shake', () => {
      this.action.notify(DebugTankKitAction.Shake);
    });
  }
}

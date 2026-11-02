import { GameObject } from '../core';
import { Field, PlayerTank } from '../gameObjects';
import * as config from '../config';

export class LevelWorld {
  public sceneRoot: GameObject;
  public field: Field;
  // Classic-board-sized box fixed on screen for notices (pause, game over,
  // wave banner), so they stay in view while the camera roams the arena.
  public screenField: GameObject;
  private playerTanks: PlayerTank[] = [];

  constructor(sceneRoot: GameObject) {
    this.sceneRoot = sceneRoot;

    this.field = new Field();

    this.screenField = new GameObject(config.MAP_SIZE, config.MAP_SIZE);
    this.screenField.screenSpace = true;
    this.screenField.position.set(config.BORDER_LEFT_WIDTH, config.BORDER_TOP_BOTTOM_HEIGHT);
    sceneRoot.add(this.screenField);
  }

  public addPlayerTank(playerIndex: number, playerTank: PlayerTank): void {
    this.playerTanks[playerIndex] = playerTank;
    this.field.add(playerTank);
  }

  public removePlayerTank(playerIndex: number): void {
    const playerTank = this.playerTanks[playerIndex];

    if (playerTank === null || playerTank === undefined) {
      return;
    }

    playerTank.removeSelf();

    this.playerTanks[playerIndex] = null;
  }

  public getPlayerTanks(): PlayerTank[] {
    return this.playerTanks;
  }
}

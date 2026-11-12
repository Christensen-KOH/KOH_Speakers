import { GameObject } from '../../core';

import { LevelEnemyCounterItem } from './LevelEnemyCounterItem';

const MAX_ITEMS = 20;

export class LevelEnemyCounter extends GameObject {
  // The side panel fits 20 icons; with longer stages it shows the last 20
  // enemies still to come.

  private count = 0;

  constructor(count = 0) {
    super(64, 320);

    this.count = count;
  }

  public setCount(nextCount: number): void {
    this.count = nextCount;

    this.removeAllChildren();
    this.addItems(nextCount);
    this.dirtyPaintBox();
  }

  protected setup(): void {
    this.addItems(this.count);
  }

  private addItems(count: number): void {
    for (let i = 0; i < Math.min(count, MAX_ITEMS); i += 1) {
      const item = new LevelEnemyCounterItem();

      const x = item.size.width * (i % 2);
      const y = item.size.height * Math.floor(i / 2);

      item.position.set(x, y);

      this.add(item);
    }
  }
}

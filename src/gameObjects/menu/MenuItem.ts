import { GameObject, Subject, Vector } from '../../core';
import { GameUpdateArgs } from '../../game';

export abstract class MenuItem extends GameObject {
  public focused = new Subject();
  public unfocused = new Subject();
  public selected = new Subject();
  protected focusable = true;
  public isFocused = false;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public updateFocused(updateArgs?: GameUpdateArgs): void {
    // Virtual
  }

  public setFocusable(focusable: boolean): void {
    this.focusable = focusable;
    this.setNeedsPaint();
  }

  public isFocusable(): boolean {
    return this.focusable;
  }

  public focus(): void {
    this.isFocused = true;
    this.focused.notify(null);
  }

  public unfocus(): void {
    this.isFocused = false;
    this.unfocused.notify(null);
  }

  /**
   * The item was clicked at `point` (canvas pixels). Return true when the
   * click was an adjustment (e.g. a ← → arrow) rather than a selection.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public pointerActivate(point: Vector): boolean {
    return false;
  }

  public select(): void {
    this.selected.notify(null);
  }
}

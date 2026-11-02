import { GamepadButtonCode, InputBinding } from '../../core';

import { InputControl } from '../InputControl';

export class PrimaryGamepadInputBinding extends InputBinding {
  constructor() {
    super();

    this.setDefault(InputControl.Up, GamepadButtonCode.Up);
    this.setDefault(InputControl.Down, GamepadButtonCode.Down);
    this.setDefault(InputControl.Left, GamepadButtonCode.Left);
    this.setDefault(InputControl.Right, GamepadButtonCode.Right);
    // Start and Y open the Command Hub in battle, so Back/View pauses
    this.setDefault(InputControl.Select, GamepadButtonCode.Back);
    // A / Cross fires; holding the right trigger keeps firing
    this.setDefault(InputControl.PrimaryAction, GamepadButtonCode.A);
    this.setDefault(InputControl.SecondaryAction, GamepadButtonCode.RightTrigger);
    this.setDefault(InputControl.Rewind, GamepadButtonCode.LeftBumper);
    this.setDefault(InputControl.FastForward, GamepadButtonCode.RightBumper);
  }
}

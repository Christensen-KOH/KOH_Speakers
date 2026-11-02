import { GamepadButtonCode } from '../codes';
import { InputDevice } from '../InputDevice';

// Analog stick travel ignored around center, so worn sticks don't drift.
const STICK_DEAD_ZONE = 0.2;

/**
 * Left stick as D-pad presses (the tank moves in 4 directions, so only the
 * dominant axis counts). Shared with the Hub's gamepad navigation.
 */
export function readStickCodes(gamepad: Gamepad): number[] {
  const x = gamepad.axes[0] ?? 0;
  const y = gamepad.axes[1] ?? 0;
  if (Math.max(Math.abs(x), Math.abs(y)) < STICK_DEAD_ZONE) {
    return [];
  }
  if (Math.abs(x) > Math.abs(y)) {
    return [x < 0 ? GamepadButtonCode.Left : GamepadButtonCode.Right];
  }
  return [y < 0 ? GamepadButtonCode.Up : GamepadButtonCode.Down];
}

// Hat-switch positions, clockwise from up, in steps of 2/7 from -1.
const HAT_CODES: number[][] = [
  [GamepadButtonCode.Up],
  [GamepadButtonCode.Up, GamepadButtonCode.Right],
  [GamepadButtonCode.Right],
  [GamepadButtonCode.Down, GamepadButtonCode.Right],
  [GamepadButtonCode.Down],
  [GamepadButtonCode.Down, GamepadButtonCode.Left],
  [GamepadButtonCode.Left],
  [GamepadButtonCode.Up, GamepadButtonCode.Left],
];

/**
 * D-pad as buttons 12-15. Pads the browser knows ("standard" mapping)
 * report it as those buttons already; generic USB/Bluetooth pads often
 * report it as a hat-switch axis (usually axis 9) instead.
 */
export function readDpadCodes(gamepad: Gamepad): number[] {
  const codes = [
    GamepadButtonCode.Up,
    GamepadButtonCode.Down,
    GamepadButtonCode.Left,
    GamepadButtonCode.Right,
  ].filter((code) => gamepad.buttons[code]?.pressed === true);
  if (codes.length > 0 || gamepad.mapping === 'standard') {
    return codes;
  }
  const hat = gamepad.axes[9];
  // Centered hats rest outside [-1, 1]
  if (hat === undefined || Math.abs(hat) > 1.05) {
    return [];
  }
  return HAT_CODES[Math.round((hat + 1) * 3.5) % 8];
}

/** D-pad and left stick together (drive and menu directions). */
export function readDirectionCodes(gamepad: Gamepad): number[] {
  const codes = readDpadCodes(gamepad);
  for (const code of readStickCodes(gamepad)) {
    if (!codes.includes(code)) {
      codes.push(code);
    }
  }
  return codes;
}

export class GamepadInputDevice implements InputDevice {
  private deviceIndex: number;
  private isListening = false;
  private downCodes: number[] = [];
  private holdCodes: number[] = [];
  private upCodes: number[] = [];

  constructor(deviceIndex: number) {
    this.deviceIndex = deviceIndex;
  }

  public isConnected(): boolean {
    const gamepad = this.getGamepad();

    if (gamepad === null) {
      return false;
    }

    return true;
  }

  public listen(): void {
    this.isListening = true;
  }

  public unlisten(): void {
    this.isListening = false;
  }

  public update(): void {
    if (!this.isListening) {
      return;
    }

    const gamepad = this.getGamepad();
    if (gamepad === null) {
      return;
    }

    // Extract buttons that are in pressed state
    const codes = [];

    const { buttons } = gamepad;
    for (let i = 0; i < buttons.length; i += 1) {
      const button = buttons[i];
      if (button.pressed === true) {
        codes.push(i);
      }
    }
    for (const code of readDirectionCodes(gamepad)) {
      if (!codes.includes(code)) {
        codes.push(code);
      }
    }

    const downCodes = [];
    const holdCodes = [];

    for (const code of codes) {
      // Newly pressed key, which was not previously down or hold
      if (!this.downCodes.includes(code) && !this.holdCodes.includes(code)) {
        downCodes.push(code);
      }

      // Button that was down on previous frame is now considered hold, because
      // it is still down on current frame.
      // Hold continues to be hold.
      if (this.downCodes.includes(code) || this.holdCodes.includes(code)) {
        holdCodes.push(code);
      }
    }

    // Find buttons that were down or hold on previous frame, which means
    // that in current frame they are considered up

    const upCodes = [];

    for (const code of this.downCodes) {
      if (!codes.includes(code)) {
        upCodes.push(code);
      }
    }

    for (const code of this.holdCodes) {
      if (!codes.includes(code)) {
        upCodes.push(code);
      }
    }

    this.downCodes = downCodes;
    this.holdCodes = holdCodes;
    this.upCodes = upCodes;
  }

  public getDownCodes(): number[] {
    return this.downCodes;
  }

  public getHoldCodes(): number[] {
    return this.holdCodes;
  }

  public getUpCodes(): number[] {
    return this.upCodes;
  }

  private getGamepad(): Gamepad {
    const gamepads = navigator.getGamepads();

    // Firefox will have empty array
    if (gamepads.length === 0) {
      return null;
    }

    // Device N is the Nth connected pad, not browser slot N: after a
    // reconnect Chrome may put the only pad in slot 1 or 2.
    // Chrome fills the array with nulls until a button is pressed.
    const connected = Array.from(gamepads).filter(
      (gamepad) => gamepad !== null && gamepad.connected,
    );

    return connected[this.deviceIndex] ?? null;
  }
}

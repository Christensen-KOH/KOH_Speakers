import { describe, expect, it } from 'vitest';

import { KeyboardInputDevice } from './KeyboardInputDevice';

const LEFT = 37;

describe('KeyboardInputDevice virtual keys', () => {
  it('goes through down, hold and up like a real key', () => {
    const device = new KeyboardInputDevice();
    device.listen();

    device.pressVirtual(LEFT);
    device.update();
    expect(device.getDownCodes()).toEqual([LEFT]);
    device.update();
    expect(device.getHoldCodes()).toEqual([LEFT]);

    device.releaseVirtual(LEFT);
    device.update();
    expect(device.getUpCodes()).toEqual([LEFT]);
    device.unlisten();
  });

  it('ignores presses while not listening and drops held keys on unlisten', () => {
    const device = new KeyboardInputDevice();
    device.pressVirtual(LEFT);
    device.update();
    expect(device.getDownCodes()).toEqual([]);

    device.listen();
    device.pressVirtual(LEFT);
    device.unlisten();
    device.listen();
    device.update();
    expect(device.getDownCodes()).toEqual([]);
    device.unlisten();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScreenShake } from './ScreenShake';

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches: reduce }));
}

describe('ScreenShake', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('decays linearly to still', () => {
    stubReducedMotion(false);
    const shake = new ScreenShake();
    shake.shake(10, 1);
    expect(shake.getAmplitude()).toBe(10);
    shake.update(0.5);
    expect(shake.getAmplitude()).toBe(5);
    expect(shake.getTransform()).toMatch(/^translate\(/);
    shake.update(0.5);
    expect(shake.getTransform()).toBe('');
  });

  it('keeps the stronger of two overlapping shakes', () => {
    stubReducedMotion(false);
    const shake = new ScreenShake();
    shake.shake(16, 1);
    shake.shake(4, 1);
    expect(shake.getAmplitude()).toBe(16);
  });

  it('does nothing for reduced-motion users', () => {
    stubReducedMotion(true);
    const shake = new ScreenShake();
    shake.shake(16, 1);
    expect(shake.getTransform()).toBe('');
  });
});

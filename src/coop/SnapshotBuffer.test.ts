import { describe, expect, it } from 'vitest';

import { lerp, SnapshotBuffer } from './SnapshotBuffer';

describe('SnapshotBuffer', () => {
  it('blends the two snapshots around the render time', () => {
    const buffer = new SnapshotBuffer<{ x: number }>();
    buffer.push({ x: 0 }, 1000);
    buffer.push({ x: 100 }, 1050);
    buffer.push({ x: 200 }, 1100);

    // render time = now - delay = 1075 → between the 2nd and 3rd
    const sample = buffer.sample(1175, 100);
    expect(sample.from.x).toBe(100);
    expect(sample.to.x).toBe(200);
    expect(lerp(sample.from.x, sample.to.x, sample.alpha)).toBe(150);
  });

  it('holds the oldest or newest snapshot outside the buffered range', () => {
    const buffer = new SnapshotBuffer<{ x: number }>();
    expect(buffer.sample(0)).toBeNull();
    buffer.push({ x: 5 }, 1000);
    buffer.push({ x: 9 }, 1050);
    expect(buffer.sample(900, 100)).toEqual({ from: { x: 5 }, to: { x: 5 }, alpha: 0 });
    expect(buffer.sample(5000, 100)).toEqual({ from: { x: 9 }, to: { x: 9 }, alpha: 1 });
    expect(buffer.latest()).toEqual({ x: 9 });
  });
});

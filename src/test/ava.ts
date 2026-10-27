import { expect, test as vitestTest } from 'vitest';

// Minimal adapter so the original ava-style unit tests run under Vitest.
interface Assertions {
  is<T>(actual: T, expected: T): void;
  deepEqual<T>(actual: T, expected: T): void;
  throws(fn: () => unknown): void;
}

const assertions: Assertions = {
  is: (actual, expected) => expect(actual).toBe(expected),
  deepEqual: (actual, expected) => expect(actual).toEqual(expected),
  throws: (fn) => expect(fn).toThrow(),
};

export default function test(
  name: string,
  fn: (t: Assertions) => void,
): void {
  vitestTest(name, () => fn(assertions));
}

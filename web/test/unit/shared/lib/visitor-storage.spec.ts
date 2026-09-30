import { describe, expect, it } from 'vitest';

import {
  forgetVisitor,
  readVisitor,
  VISITOR_PREFIX,
  writeVisitor,
} from '@/shared/lib/visitor-storage';
import type { VisitorStorage } from '@/shared/lib/visitor-storage';

/** A storage in memory, to read back what was written. */
function memory(
  initial: Record<string, string> = {},
): VisitorStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));

  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

/** What a private window or a blocked origin does: every access throws. */
const throwing = (): VisitorStorage => {
  throw new DOMException('blocked', 'SecurityError');
};

const asNumber = (value: unknown) => (typeof value === 'number' ? value : undefined);

describe('a convenience of this browser', () => {
  it('reads back what was written, under the prefix of the visitor', () => {
    const storage = memory();

    writeVisitor('size', 30, () => storage);

    expect(storage.values.get(`${VISITOR_PREFIX}size`)).toBe('30');
    expect(readVisitor('size', asNumber, () => storage)).toBe(30);
  });

  it('answers nothing for a key never written', () => {
    expect(readVisitor('size', asNumber, () => memory())).toBeUndefined();
  });

  it('answers nothing for a value it does not recognise — an older version, or a hand edit', () => {
    const storage = memory({ [`${VISITOR_PREFIX}size`]: '"thirty"' });

    expect(readVisitor('size', asNumber, () => storage)).toBeUndefined();
  });

  it('answers nothing for what is not JSON at all, without throwing', () => {
    const storage = memory({ [`${VISITOR_PREFIX}size`]: '{not json' });

    expect(readVisitor('size', asNumber, () => storage)).toBeUndefined();
  });

  it('answers nothing when the storage itself throws — the default takes over', () => {
    expect(readVisitor('size', asNumber, throwing)).toBeUndefined();
  });

  it('carries on when a write is refused — a full quota, a blocked origin', () => {
    expect(() => {
      writeVisitor('size', 30, throwing);
    }).not.toThrow();
  });

  it('uses the browser storage when none is given', () => {
    writeVisitor('size', 12);

    expect(readVisitor('size', asNumber)).toBe(12);
    expect(localStorage.getItem(`${VISITOR_PREFIX}size`)).toBe('12');
  });
});

describe('forgetting a convenience — plan 06, S-201', () => {
  it('removes what was kept, under the prefix of the visitor', () => {
    const removed: string[] = [];

    forgetVisitor('locale', () => ({ removeItem: (key) => removed.push(key) }));

    expect(removed).toEqual([`${VISITOR_PREFIX}locale`]);
  });

  it('carries on when the storage refuses — forgotten for this page only', () => {
    expect(() => {
      forgetVisitor('locale', () => {
        throw new DOMException('blocked', 'SecurityError');
      });
    }).not.toThrow();
  });

  it('uses the browser storage when none is given', () => {
    localStorage.setItem(`${VISITOR_PREFIX}density`, '"comfortable"');

    forgetVisitor('density');

    expect(localStorage.getItem(`${VISITOR_PREFIX}density`)).toBeNull();
  });
});

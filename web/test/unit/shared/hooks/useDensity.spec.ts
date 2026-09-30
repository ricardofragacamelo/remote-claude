import { describe, expect, it } from 'vitest';

import { applyDensity, initialDensity, useDensity } from '@/shared/hooks/useDensity';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import type { VisitorStorage } from '@/shared/lib/visitor-storage';

function saved(value: string | null): () => VisitorStorage {
  return () => ({ getItem: () => value, setItem: () => undefined });
}

const blocked = (): VisitorStorage => {
  throw new DOMException('blocked', 'SecurityError');
};

describe('the density a visitor starts with — plan 06, S-143, S-206', () => {
  it('is compact for somebody who never picked', () => {
    expect(initialDensity(saved(null))).toBe('compact');
  });

  it('is what they picked', () => {
    expect(initialDensity(saved('"comfortable"'))).toBe('comfortable');
  });

  it('is compact when what was kept is not one of ours, or cannot be read', () => {
    expect(initialDensity(saved('"huge"'))).toBe('compact');
    expect(initialDensity(saved('7'))).toBe('compact');
    expect(initialDensity(blocked)).toBe('compact');
  });
});

describe('picking a density', () => {
  it('keeps the choice for this browser', () => {
    useDensity.getState().setDensity('comfortable');

    expect(useDensity.getState().density).toBe('comfortable');
    expect(localStorage.getItem(`${VISITOR_PREFIX}density`)).toBe('"comfortable"');
  });

  it('forgets the choice when the default is picked again', () => {
    useDensity.getState().setDensity('comfortable');

    useDensity.getState().setDensity('compact');

    expect(localStorage.getItem(`${VISITOR_PREFIX}density`)).toBeNull();
  });

  it('puts the density on the page, where the tokens of the scale read it', () => {
    const root = document.createElement('html');

    applyDensity('comfortable', root);
    expect(root.dataset['density']).toBe('comfortable');

    applyDensity('compact', root);
    expect(root.dataset['density']).toBe('compact');
  });

  it('puts it on the document when nobody names a root', () => {
    applyDensity('comfortable');

    expect(document.documentElement.dataset['density']).toBe('comfortable');
  });
});

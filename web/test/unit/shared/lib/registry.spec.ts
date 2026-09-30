import { describe, expect, it, vi } from 'vitest';

import { createRegistry } from '@/shared/lib/registry';
import type { RegistryEntry } from '@/shared/lib/registry';

interface Entry extends RegistryEntry {
  readonly label: string;
}

const entry = (id: string, position: number, extra: Partial<Entry> = {}): Entry => ({
  id,
  position,
  label: id,
  ...extra,
});

describe('a registry', () => {
  it('lists what was registered in the order of the positions, not of the registering', () => {
    const registry = createRegistry<Entry>('test', [entry('c', 300)]);

    registry.register(entry('a', 100));
    registry.register(entry('b', 200));

    expect(registry.entries().map((each) => each.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders two entries at the same position by id, so the order never depends on luck', () => {
    const registry = createRegistry<Entry>('test');

    registry.register(entry('zeta', 100));
    registry.register(entry('alpha', 100));

    expect(registry.entries().map((each) => each.id)).toEqual(['alpha', 'zeta']);
  });

  it('refuses an id that is already taken, saying which', () => {
    const registry = createRegistry<Entry>('views', [entry('explorer', 100)]);

    expect(() => registry.register(entry('explorer', 200))).toThrow(
      'views: "explorer" is already registered',
    );
  });

  it('lets the owner of a held place take it over', () => {
    const registry = createRegistry<Entry>('views', [
      entry('explorer', 100, { placeholder: true }),
    ]);

    registry.register(entry('explorer', 100, { label: 'the real one' }));

    expect(registry.entries()).toEqual([entry('explorer', 100, { label: 'the real one' })]);
  });

  it('gives a held place back to its placeholder when its owner is taken out', () => {
    const held = entry('explorer', 100, { placeholder: true });
    const registry = createRegistry<Entry>('views', [held]);
    const remove = registry.register(entry('explorer', 100, { label: 'the real one' }));

    remove();

    expect(registry.entries()).toEqual([held]);
  });

  it('takes an entry back out, once', () => {
    const registry = createRegistry<Entry>('test');
    const remove = registry.register(entry('a', 100));

    remove();
    remove();

    expect(registry.entries()).toEqual([]);
  });

  it('tells whoever listens when something comes or goes, and stops when asked', () => {
    const registry = createRegistry<Entry>('test');
    const listener = vi.fn();
    const stop = registry.subscribe(listener);

    const remove = registry.register(entry('a', 100));
    remove();
    stop();
    registry.register(entry('b', 100));

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('answers the same list until something changes — what a render compares', () => {
    const registry = createRegistry<Entry>('test', [entry('a', 100)]);
    const first = registry.entries();

    expect(registry.entries()).toBe(first);
    registry.register(entry('b', 200));
    expect(registry.entries()).not.toBe(first);
  });
});

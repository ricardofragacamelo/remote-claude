import { describe, expect, it } from 'vitest';

import { enterKeyContext, isKeyContextActive } from '@/features/commands/store/key-contexts';

describe('the contexts of the shortcuts', () => {
  it('has the global one live always', () => {
    expect(isKeyContextActive('global')).toBe(true);
  });

  it('keeps a context live while anybody holds it, and letting go twice counts once', () => {
    expect(isKeyContextActive('workbench')).toBe(false);
    const first = enterKeyContext('workbench');
    const second = enterKeyContext('workbench');

    first();
    first();
    expect(isKeyContextActive('workbench')).toBe(true);

    second();
    expect(isKeyContextActive('workbench')).toBe(false);
  });
});

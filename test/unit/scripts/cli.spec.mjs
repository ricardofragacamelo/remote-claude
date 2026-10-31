import { afterEach, describe, expect, it } from 'vitest';

import { hasCheckFlag } from '../../../scripts/lib/cli.mjs';

/**
 * The one flag `contracts.mjs` and `env-docs.mjs` share (plan 13, dup-gate cycle): whether a run
 * only checks what is generated, instead of writing it.
 */
describe('hasCheckFlag', () => {
  const original = process.argv;

  afterEach(() => {
    process.argv = original;
  });

  it('is true with --check on the command line', () => {
    process.argv = [...original, '--check'];
    expect(hasCheckFlag()).toBe(true);
  });

  it('is false without it', () => {
    process.argv = original.filter((arg) => arg !== '--check');
    expect(hasCheckFlag()).toBe(false);
  });
});

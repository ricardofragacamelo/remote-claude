import { describe, expect, it } from 'vitest';

import { pluginStateOf } from '@domain/engines/claude';

describe('pluginStateOf — plan 13, B-27, S-128', () => {
  it('is current when the digest matches what was approved', () => {
    expect(pluginStateOf('abc', { digest: 'abc' })).toBe('current');
  });

  it('is changed when the digest no longer matches', () => {
    expect(pluginStateOf('abc', { digest: 'def' })).toBe('changed');
  });

  it('is unreadable when the manifest could not be read at all', () => {
    expect(pluginStateOf('abc', null)).toBe('unreadable');
  });
});

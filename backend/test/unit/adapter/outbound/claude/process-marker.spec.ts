import { describe, expect, it } from 'vitest';

import {
  markedEnvironment,
  OWNER_VALUE,
  PROCESS_MARKER,
} from '@adapter/outbound/claude/process-marker';

describe('markedEnvironment — B-03', () => {
  it('keeps the environment of the backend, and adds the mark', () => {
    expect(markedEnvironment({ PATH: '/usr/bin', HOME: '/home/me' }, 4242)).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/me',
      [PROCESS_MARKER.owner]: OWNER_VALUE,
      [PROCESS_MARKER.parentPid]: '4242',
    });
  });

  it('overwrites a mark inherited from somewhere else — the parent is this backend', () => {
    const inherited = { [PROCESS_MARKER.parentPid]: '1' };

    expect(markedEnvironment(inherited, 4242)[PROCESS_MARKER.parentPid]).toBe('4242');
  });
});

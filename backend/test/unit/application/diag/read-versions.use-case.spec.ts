import { describe, expect, it } from 'vitest';

import { ReadVersionsUseCase } from '@application/diag';
import type { InstallationVersions } from '@application/diag';

describe('ReadVersionsUseCase', () => {
  it('answers what the source reads, missing pieces and all', () => {
    const versions: InstallationVersions = {
      backend: { version: '1.0.0', reason: null },
      node: { version: '24.0.0', reason: null },
      defaultEngine: 'claude',
      engines: [
        {
          engine: 'claude',
          displayName: 'Claude Code',
          state: 'available',
          binary: { version: '2.1.277', reason: null },
          library: { version: '0.3.0', reason: null },
        },
      ],
    };

    expect(new ReadVersionsUseCase({ read: () => versions }).execute()).toBe(versions);
  });
});

import { describe, expect, it } from 'vitest';

import { ReadVersionsUseCase } from '@application/diag';
import type { InstallationVersions } from '@application/diag';

describe('ReadVersionsUseCase', () => {
  it('answers what the source reads, missing pieces and all', () => {
    const versions: InstallationVersions = {
      backend: { version: '1.0.0', reason: null },
      agentSdk: { version: '0.3.0', reason: null },
      claudeCli: { version: null, reason: 'notInstalled' },
      node: { version: '24.0.0', reason: null },
    };

    expect(new ReadVersionsUseCase({ read: () => versions }).execute()).toBe(versions);
  });
});

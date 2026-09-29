import { describe, expect, it } from 'vitest';

import { InstallationVersionReader } from '@adapter/outbound/diag/installation-versions.reader';
import type { VersionReaders } from '@adapter/outbound/diag/installation-versions.reader';

describe('InstallationVersionReader', () => {
  it('reads the versions of this very installation by default — plan 06, S-65', () => {
    const versions = new InstallationVersionReader().read();

    expect(versions.backend).toEqual({ version: '0.0.0', reason: null });
    expect(versions.agentSdk.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(versions.claudeCli.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(versions.node).toEqual({ version: process.versions.node, reason: null });
  });

  it('answers null and the reason for what it cannot read — S-66', () => {
    const readers: VersionReaders = {
      backend: () => ({ version: null, reason: 'unreadable' }),
      agentSdk: () => ({ version: null, reason: 'notInstalled' }),
      claudeCli: () => ({ version: null, reason: 'notInstalled' }),
      node: () => '24.0.0',
    };

    expect(new InstallationVersionReader(readers).read()).toEqual({
      backend: { version: null, reason: 'unreadable' },
      agentSdk: { version: null, reason: 'notInstalled' },
      claudeCli: { version: null, reason: 'notInstalled' },
      node: { version: '24.0.0', reason: null },
    });
  });

  it('reads once, however often it is asked — S-68', () => {
    let reads = 0;
    const reader = new InstallationVersionReader({
      backend: () => ({ version: '1', reason: null }),
      agentSdk: () => ({ version: '2', reason: null }),
      claudeCli: () => {
        reads += 1;
        return { version: '3', reason: null };
      },
      node: () => '4',
    });

    reader.read();
    reader.read();

    expect(reads).toBe(1);
  });
});

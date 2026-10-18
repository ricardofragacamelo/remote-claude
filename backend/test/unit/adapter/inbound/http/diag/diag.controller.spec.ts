import { describe, expect, it } from 'vitest';

import { DiagController } from '@adapter/inbound/http/diag/diag.controller';
import { ReadVersionsUseCase } from '@application/diag';
import type { ComponentVersion, EngineVersions, InstallationVersions } from '@application/diag';

const READ: ComponentVersion = { version: '1.2.3', reason: null };
const UNREAD: ComponentVersion = { version: null, reason: 'notInstalled' };

const engineOf = (overrides: Partial<EngineVersions> = {}): EngineVersions => ({
  engine: 'claude',
  displayName: 'Claude Code',
  state: 'available',
  binary: READ,
  library: READ,
  ...overrides,
});

const controllerFor = (versions: InstallationVersions): DiagController =>
  new DiagController(new ReadVersionsUseCase({ read: () => versions }));

describe('GET /diag/versions — the line of each engine enabled (plan 28, B-37, S-108)', () => {
  it('lists every engine, each with its own state and parts', () => {
    const response = controllerFor({
      backend: READ,
      node: READ,
      defaultEngine: 'claude',
      engines: [engineOf(), engineOf({ engine: 'other', state: 'unavailable', library: null })],
    }).read();

    expect(response.engines).toEqual([
      {
        engine: 'claude',
        displayName: 'Claude Code',
        state: 'available',
        binary: READ,
        library: READ,
      },
      {
        engine: 'other',
        displayName: 'Claude Code',
        state: 'unavailable',
        binary: READ,
        library: null,
      },
    ]);
  });

  it('answers the backend and Node as the installation read them — S-65', () => {
    const response = controllerFor({
      backend: READ,
      node: UNREAD,
      defaultEngine: 'claude',
      engines: [engineOf()],
    }).read();

    expect(response.backend).toEqual(READ);
    expect(response.node).toEqual(UNREAD);
    expect(response.defaultEngine).toBe('claude');
  });
});

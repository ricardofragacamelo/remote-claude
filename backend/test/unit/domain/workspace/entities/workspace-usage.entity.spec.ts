import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import { WorkspacePath, WorkspaceUsage } from '@domain/workspace';

const owner = UserId.create('auth|owner');
const root = WorkspacePath.create('/srv/projects');
const at = new Date('2026-09-18T10:00:00.000Z');

describe('WorkspaceUsage', () => {
  it('records who reached which root, and when', () => {
    const usage = WorkspaceUsage.record(owner, root, 'Projects', at);

    expect(usage.snapshot()).toEqual({ userId: owner, root, label: 'Projects', lastUsedAt: at });
  });

  it('rehydrates to something indistinguishable from what was recorded', () => {
    const usage = WorkspaceUsage.record(owner, root, 'Projects', at);

    expect(WorkspaceUsage.restore(usage.snapshot()).snapshot()).toEqual(usage.snapshot());
  });

  it('exposes the pair that is its identity', () => {
    const usage = WorkspaceUsage.record(owner, root, 'Projects', at);

    expect(usage.userId.value).toBe('auth|owner');
    expect(usage.root.value).toBe('/srv/projects');
    expect(usage.lastUsedAt).toEqual(at);
    expect(usage.label).toBe('Projects');
  });
});

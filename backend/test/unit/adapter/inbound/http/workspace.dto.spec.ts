import { describe, expect, it } from 'vitest';

import {
  resolveWorkspaceSchema,
  toWorkspaceDto,
} from '@adapter/inbound/http/workspace/workspace.dto';
import { aWorkspace } from '../../../../support/builders/workspace.builder';

describe('the workspace DTO', () => {
  it('carries the path, the label and the last use', () => {
    const at = new Date('2026-09-18T10:00:00.000Z');

    expect(toWorkspaceDto(aWorkspace().usedAt(at))).toEqual({
      path: '/srv/projects',
      label: 'Projects',
      lastUsedAt: '2026-09-18T10:00:00.000Z',
    });
  });

  it('carries `null` for a root nobody has opened yet', () => {
    expect(toWorkspaceDto(aWorkspace()).lastUsedAt).toBeNull();
  });

  it('never carries who else may reach the root', () => {
    // Who else the operator listed is nobody's business but the operator's, and the caller
    // already knows that they themselves may.
    expect(JSON.stringify(toWorkspaceDto(aWorkspace()))).not.toContain('auth|owner');
  });

  it('accepts a path on the query string', () => {
    expect(resolveWorkspaceSchema.safeParse({ path: '/srv/projects' }).success).toBe(true);
  });

  it.each([{}, { path: '' }, { path: 42 }])('refuses the query %j', (query) => {
    expect(resolveWorkspaceSchema.safeParse(query).success).toBe(false);
  });
});

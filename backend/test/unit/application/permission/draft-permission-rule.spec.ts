import { describe, expect, it } from 'vitest';

import { draftPermissionRule } from '@application/permission';
import { UserId } from '@domain/auth';

const now = new Date('2026-11-06T12:00:00.000Z');
const owner = UserId.create('auth|owner');

/** What `evaluate`, `preview` and `simulate` all build for a pattern nobody has granted. */
describe('draftPermissionRule', () => {
  it('builds an `always` rule when no folder is given', () => {
    const draft = draftPermissionRule(
      { pattern: 'shell(git status:*)', decision: 'allow' },
      owner,
      null,
      now,
    );

    expect(draft.scope).toBe('always');
    expect(draft.projectPath).toBeNull();
    expect(draft.engine).toBeNull();
  });

  it('builds a `project` rule scoped to the given folder', () => {
    const draft = draftPermissionRule(
      { pattern: 'shell(git status:*)', decision: 'deny' },
      owner,
      '/srv/projects/app',
      now,
    );

    expect(draft.scope).toBe('project');
    expect(draft.projectPath).toBe('/srv/projects/app');
    expect(draft.decision).toBe('deny');
  });

  it('restricts the rule to an engine when one is given', () => {
    const draft = draftPermissionRule(
      { pattern: 'shell(git status:*)', decision: 'allow', engine: 'claude' },
      owner,
      null,
      now,
    );

    expect(draft.engine).toBe('claude');
  });

  it('is never persisted — it carries no id a repository would recognise', () => {
    const draft = draftPermissionRule(
      { pattern: 'shell(git status:*)', decision: 'allow' },
      owner,
      null,
      now,
    );

    expect(draft.id).toBe('');
  });
});

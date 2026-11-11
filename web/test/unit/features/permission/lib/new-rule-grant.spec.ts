import { describe, expect, it } from 'vitest';

import { grantInputOf } from '@/features/permission/lib/new-rule-grant';

describe('grantInputOf — the review step’s own POST /permission-rules input (plan 15, B-27)', () => {
  it('writes the plain fields every draft carries', () => {
    expect(
      grantInputOf({
        pattern: 'shell(git status)',
        decision: 'allow',
        scope: 'always',
        folder: null,
        expiresAt: '2026-12-31T00:00:00.000Z',
        breadthIsBroad: false,
      }),
    ).toEqual({
      pattern: 'shell(git status)',
      decision: 'allow',
      scope: 'always',
      expiresAt: '2026-12-31T00:00:00.000Z',
    });
  });

  it('sends the folder as projectPath only when the scope is project and a folder was picked', () => {
    expect(
      grantInputOf({
        pattern: 'shell',
        decision: 'deny',
        scope: 'project',
        folder: '/home/user/project',
        expiresAt: '',
        breadthIsBroad: false,
      }),
    ).toMatchObject({ projectPath: '/home/user/project' });
  });

  it('never sends projectPath for an always-scoped draft, even if a folder is somehow set', () => {
    const input = grantInputOf({
      pattern: 'shell',
      decision: 'allow',
      scope: 'always',
      folder: '/home/user/project',
      expiresAt: '',
      breadthIsBroad: false,
    });
    expect(input).not.toHaveProperty('projectPath');
  });

  it('never sends projectPath for a project-scoped draft whose folder is still null', () => {
    const input = grantInputOf({
      pattern: 'shell',
      decision: 'allow',
      scope: 'project',
      folder: null,
      expiresAt: '',
      breadthIsBroad: false,
    });
    expect(input).not.toHaveProperty('projectPath');
  });

  it('sends acknowledgeBroad only when the draft’s own width is broad', () => {
    expect(
      grantInputOf({
        pattern: 'file.edit',
        decision: 'allow',
        scope: 'always',
        folder: null,
        expiresAt: '',
        breadthIsBroad: true,
      }),
    ).toMatchObject({ acknowledgeBroad: true });
  });

  it('never sends acknowledgeBroad for a narrow or unbounded draft', () => {
    const input = grantInputOf({
      pattern: 'shell(git status)',
      decision: 'allow',
      scope: 'always',
      folder: null,
      expiresAt: '',
      breadthIsBroad: false,
    });
    expect(input).not.toHaveProperty('acknowledgeBroad');
  });
});

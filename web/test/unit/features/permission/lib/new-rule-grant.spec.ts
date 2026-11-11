import { describe, expect, it } from 'vitest';

import { grantInputOf, simulationInputOf } from '@/features/permission/lib/new-rule-grant';

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

describe('simulationInputOf — "if this rule existed" against the trail (D-15, plan 15, B-27)', () => {
  it('adds the one draft pattern and decision, with the server’s own cap', () => {
    expect(
      simulationInputOf({
        pattern: 'shell(git status)',
        decision: 'allow',
        scope: 'always',
        folder: null,
      }),
    ).toEqual({
      add: [{ pattern: 'shell(git status)', decision: 'allow' }],
      limit: 200,
    });
  });

  it('reads the folder’s own invocations only when the scope is project and a folder was picked', () => {
    expect(
      simulationInputOf({
        pattern: 'shell',
        decision: 'deny',
        scope: 'project',
        folder: '/home/user/project',
      }),
    ).toEqual({
      add: [{ pattern: 'shell', decision: 'deny' }],
      folder: '/home/user/project',
      limit: 200,
    });
  });

  it('never sends a folder for an always-scoped draft', () => {
    const input = simulationInputOf({
      pattern: 'shell',
      decision: 'allow',
      scope: 'always',
      folder: '/home/user/project',
    });
    expect(input).not.toHaveProperty('folder');
  });

  it('never sends a folder for a project-scoped draft whose folder is still null', () => {
    const input = simulationInputOf({
      pattern: 'shell',
      decision: 'allow',
      scope: 'project',
      folder: null,
    });
    expect(input).not.toHaveProperty('folder');
  });
});

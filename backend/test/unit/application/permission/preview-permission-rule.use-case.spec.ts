import { beforeEach, describe, expect, it } from 'vitest';

import { PreviewPermissionRuleUseCase } from '@application/permission';
import { PermissionRule } from '@domain/permission';
import type { PermissionRuleDraft } from '@domain/permission';
import { UserId } from '@domain/auth';
import { InMemoryPermissionRuleRepository } from '../../../support/fakes/in-memory-permission-rule.repository';
import { StubRuleFolderResolver } from '../../../support/fakes/stub-rule-folder-resolver';

const now = new Date('2026-11-06T12:00:00.000Z');
const owner = UserId.create('auth|owner');
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

function rule(id: string, overrides: Partial<PermissionRuleDraft> = {}): PermissionRule {
  return PermissionRule.create(
    {
      id,
      userId: owner,
      sessionId: null,
      projectPath: null,
      pattern: 'shell(git status:*)',
      decision: 'allow',
      scope: 'always',
      createdAt: now,
      // A decade past `now`, not 60 seconds: the fake's `listAllMatching` (unlike `page`) checks
      // `active` against a real `new Date()`, not the fixed clock above — a short window ages out
      // as soon as the suite runs any later than the moment this file was written.
      expiresAt: new Date(now.getTime() + TEN_YEARS_MS),
      ...overrides,
    },
    TEN_YEARS_MS,
  );
}

describe('PreviewPermissionRuleUseCase', () => {
  let repository: InMemoryPermissionRuleRepository;
  let folders: StubRuleFolderResolver;
  let useCase: PreviewPermissionRuleUseCase;

  beforeEach(() => {
    repository = new InMemoryPermissionRuleRepository();
    folders = new StubRuleFolderResolver();
    useCase = new PreviewPermissionRuleUseCase(repository, folders);
  });

  it('describes the reach and the breadth of a pattern nobody has granted yet', async () => {
    const preview = await useCase.execute({
      userId: owner,
      pattern: 'shell(git push --force:*)',
      decision: 'allow',
      scope: 'always',
    });

    expect(preview.pattern).toBe('shell(git push --force:*)');
    expect(preview.breadth).toBe('narrow');
    expect(preview.reach).toMatchObject({ kind: 'shell', form: 'prefix' });
  });

  it('never refuses a wide pattern — breadth is reported, not enforced here', async () => {
    const preview = await useCase.execute({
      userId: owner,
      pattern: 'shell',
      decision: 'allow',
      scope: 'always',
    });

    expect(preview.breadth).toBe('unbounded');
  });

  it('refuses a pattern outside the canonical grammar', async () => {
    await expect(
      useCase.execute({
        userId: owner,
        pattern: 'Bash(git status:*)',
        decision: 'allow',
        scope: 'always',
      }),
    ).rejects.toThrow();
  });

  it('finds what the draft would mean against the caller active rules — S-110', async () => {
    repository.rules.push(rule('a'));

    const preview = await useCase.execute({
      userId: owner,
      pattern: 'shell(git status:*)',
      decision: 'allow',
      scope: 'always',
    });

    expect(preview.findings).toEqual([
      {
        kind: 'identical',
        ruleIds: ['a'],
        messageKey: 'permission.ruleFinding.identical',
        params: {},
      },
    ]);
  });

  it('resolves a `project` draft folder through the allowlist — S-192', async () => {
    await useCase.execute({
      userId: owner,
      pattern: 'shell(git status:*)',
      decision: 'allow',
      scope: 'project',
      projectPath: '/srv/projects/app',
    });

    expect(folders.calls).toEqual([{ raw: '/srv/projects/app', userId: owner }]);
  });

  it('never writes anything — only a read of the active rules', async () => {
    await useCase.execute({
      userId: owner,
      pattern: 'shell(git status:*)',
      decision: 'allow',
      scope: 'always',
    });

    expect(repository.rules).toHaveLength(0);
  });
});

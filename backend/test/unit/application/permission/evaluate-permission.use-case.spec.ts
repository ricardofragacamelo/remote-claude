import { beforeEach, describe, expect, it } from 'vitest';

import { EvaluatePermissionUseCase } from '@application/permission';
import { PermissionRegistry } from '@application/permission';
import { SessionRegistry } from '@application/session';
import { PermissionRule } from '@domain/permission';
import type { PermissionRuleDraft } from '@domain/permission';
import { UserId } from '@domain/auth';
import {
  aConversation,
  aSession,
  RecordingHandle,
} from '../../../support/builders/session.builder';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryPermissionRuleRepository } from '../../../support/fakes/in-memory-permission-rule.repository';
import { StubRuleFolderResolver } from '../../../support/fakes/stub-rule-folder-resolver';

const now = new Date('2026-11-06T12:00:00.000Z');
const owner = UserId.create('auth|owner');

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
      expiresAt: new Date(now.getTime() + 60_000),
      ...overrides,
    },
    60_000,
  );
}

describe('EvaluatePermissionUseCase', () => {
  let repository: InMemoryPermissionRuleRepository;
  let registry: PermissionRegistry;
  let sessions: SessionRegistry;
  let folders: StubRuleFolderResolver;
  let useCase: EvaluatePermissionUseCase;

  beforeEach(() => {
    repository = new InMemoryPermissionRuleRepository();
    registry = new PermissionRegistry();
    sessions = new SessionRegistry(10, new FixedClock(now));
    folders = new StubRuleFolderResolver();
    useCase = new EvaluatePermissionUseCase(
      repository,
      registry,
      sessions,
      folders,
      new FixedClock(now),
    );
  });

  it('lets a matching allow through when nothing refuses — S-94', async () => {
    repository.rules.push(rule('a'));

    const result = await useCase.execute({
      userId: owner,
      engine: 'claude',
      kind: 'shell',
      subject: { command: 'git status' },
    });

    expect(result.outcome).toBe('allow');
    expect(result.answeringRule?.id).toBe('a');
    expect(result.reasons).toEqual(['ruleAnswers']);
  });

  it('lets a deny win over an allow, and says why — denyWins', async () => {
    repository.rules.push(rule('allow'), rule('deny', { decision: 'deny' }));

    const result = await useCase.execute({
      userId: owner,
      engine: 'claude',
      kind: 'shell',
      subject: { command: 'git status' },
    });

    expect(result.outcome).toBe('deny');
    expect(result.answeringRule?.id).toBe('deny');
    expect(result.reasons).toEqual(['denyWins']);
    expect(result.matching).toHaveLength(2);
  });

  it('asks when nothing answers and the mode is ask — noRule', async () => {
    const result = await useCase.execute({
      userId: owner,
      engine: 'claude',
      kind: 'shell',
      subject: { command: 'git status' },
      mode: 'ask',
    });

    expect(result.outcome).toBe('ask');
    expect(result.reasons).toEqual(['noRule']);
    expect(result.answeringRule).toBeNull();
  });

  it('refuses a write in read-only mode before any rule is read — readOnlyMode', async () => {
    repository.rules.push(rule('allow', { pattern: 'file.edit(src/**)' }));

    const result = await useCase.execute({
      userId: owner,
      engine: 'claude',
      kind: 'file.edit',
      subject: { paths: ['/srv/projects/app/src/a.ts'] },
      mode: 'readOnly',
    });

    expect(result.outcome).toBe('deny');
    expect(result.reasons).toEqual(['readOnlyMode']);
  });

  it('allows what Permitir tudo would, when no rule answers — allowAllMode', async () => {
    const result = await useCase.execute({
      userId: owner,
      engine: 'claude',
      kind: 'shell',
      subject: { command: 'git status' },
      mode: 'allowAll',
    });

    expect(result.outcome).toBe('allow');
    expect(result.reasons).toEqual(['allowAllMode']);
    expect(result.answeringRule).toBeNull();
  });

  it('includes a draft as one more rule, not persisted — S-104', async () => {
    const result = await useCase.execute({
      userId: owner,
      engine: 'claude',
      kind: 'shell',
      subject: { command: 'git status' },
      draft: { pattern: 'shell(git status:*)', decision: 'allow' },
    });

    expect(result.outcome).toBe('allow');
    expect(result.answeringRule?.id).toBe('');
    expect(repository.rules).toHaveLength(0);
  });

  it('adds the session rules and the current mode of a live session of the caller — S-108', async () => {
    const session = aSession({ permissionMode: 'allowAll' });
    sessions.add({ session, handle: new RecordingHandle(), conversation: aConversation() });
    registry.addRule(
      rule('session-rule', { scope: 'session', sessionId: session.id, decision: 'deny' }),
    );

    const result = await useCase.execute({
      userId: owner,
      engine: 'claude',
      kind: 'shell',
      subject: { command: 'git status' },
      sessionId: session.id,
    });

    expect(result.outcome).toBe('deny');
    expect(result.answeringRule?.id).toBe('session-rule');
  });

  it("refuses somebody else's live session the same way the session module does", async () => {
    const session = aSession({ ownerId: 'auth|somebody-else' });
    sessions.add({ session, handle: new RecordingHandle(), conversation: aConversation() });

    await expect(
      useCase.execute({
        userId: owner,
        engine: 'claude',
        kind: 'shell',
        subject: { command: 'git status' },
        sessionId: session.id,
      }),
    ).rejects.toThrow();
  });

  it('resolves a given folder through the allowlist, never touching disk blindly — S-99', async () => {
    folders.unreachable.add('/srv/projects/other');

    await useCase.execute({
      userId: owner,
      engine: 'claude',
      kind: 'shell',
      subject: { command: 'git status' },
      folder: '/srv/projects/app',
    });

    expect(folders.calls).toEqual([{ raw: '/srv/projects/app', userId: owner }]);
  });

  it('lets only an `always` rule answer when there is no folder — S-100', async () => {
    repository.rules.push(
      rule('project', { scope: 'project', projectPath: '/srv/projects/app' }),
      rule('always'),
    );

    const result = await useCase.execute({
      userId: owner,
      engine: 'claude',
      kind: 'shell',
      subject: { command: 'git status' },
    });

    expect(result.answeringRule?.id).toBe('always');
  });

  it('never has a side effect — the repository and the registry are read, never written', async () => {
    repository.rules.push(rule('a'));

    await useCase.execute({
      userId: owner,
      engine: 'claude',
      kind: 'shell',
      subject: { command: 'git status' },
    });

    expect(repository.rules).toHaveLength(1);
  });
});

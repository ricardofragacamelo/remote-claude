import { beforeEach, describe, expect, it } from 'vitest';

import {
  ExportPermissionRulesUseCase,
  EMPTY_PERMISSION_RULE_FILTER,
} from '@application/permission';
import { RecordAuditEventUseCase } from '@application/audit';
import { PermissionRule } from '@domain/permission';
import { aPermissionModule, PERMISSION_OWNER } from '../../../support/builders/permission.builder';

const owner = PERMISSION_OWNER;

describe('ExportPermissionRulesUseCase', () => {
  let harness: ReturnType<typeof aPermissionModule>;
  let useCase: ExportPermissionRulesUseCase;

  beforeEach(() => {
    harness = aPermissionModule();
    useCase = new ExportPermissionRulesUseCase(
      new RecordAuditEventUseCase(harness.trail, harness.ids),
      harness.rules,
      harness.ids,
      harness.clock,
    );
  });

  function rule(
    overrides: Partial<Parameters<typeof PermissionRule.create>[0]> = {},
  ): PermissionRule {
    const now = harness.clock.now();
    const tenYears = 10 * 365 * 24 * 60 * 60 * 1000;

    return PermissionRule.create(
      {
        id: 'r1',
        userId: owner,
        sessionId: null,
        projectPath: null,
        pattern: 'shell(git status:*)',
        decision: 'allow',
        scope: 'always',
        createdAt: now,
        expiresAt: new Date(now.getTime() + tenYears),
        ...overrides,
      },
      tenYears,
    );
  }

  it('writes the pattern, decision, scope, projectPath and expiresAt — no id, no userId — S-136', async () => {
    harness.rules.rules.push(rule());

    const file = await useCase.execute(owner, EMPTY_PERMISSION_RULE_FILTER);

    expect(file).toMatchObject({ format: 'remote-claude.permission-rules', version: 1 });
    expect(file.rules).toEqual([
      {
        pattern: 'shell(git status:*)',
        decision: 'allow',
        scope: 'always',
        projectPath: null,
        expiresAt: rule().expiresAt.toISOString(),
      },
    ]);
    expect(file.rules[0]).not.toHaveProperty('id');
    expect(file.rules[0]).not.toHaveProperty('userId');
  });

  it('carries `engine` only for a rule restricted to one — S-136', async () => {
    harness.rules.rules.push(rule({ engine: 'claude' }));

    const file = await useCase.execute(owner, EMPTY_PERMISSION_RULE_FILTER);

    expect(file.rules[0]).toMatchObject({ engine: 'claude' });
  });

  it('never exports a rule the migration switched off — S-136', async () => {
    harness.rules.rules.push(rule({ disabledReason: 'ambiguous' } as never));

    const file = await useCase.execute(owner, EMPTY_PERMISSION_RULE_FILTER);

    expect(file.rules).toHaveLength(0);
  });

  it('respects the same filters the listing takes — S-136', async () => {
    harness.rules.rules.push(rule({ pattern: 'shell(a)', decision: 'allow' }));
    harness.rules.rules.push(rule({ id: 'r2', pattern: 'shell(b)', decision: 'deny' }));

    const file = await useCase.execute(owner, {
      ...EMPTY_PERMISSION_RULE_FILTER,
      decision: 'deny',
    });

    expect(file.rules).toHaveLength(1);
    expect(file.rules[0]).toMatchObject({ pattern: 'shell(b)' });
  });

  it('writes `permission.rulesExported` with the count — S-137', async () => {
    harness.rules.rules.push(rule());

    await useCase.execute(owner, EMPTY_PERMISSION_RULE_FILTER);

    const events = harness.trail.appended.filter(
      (event) => event.kind === 'permission.rulesExported',
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.details).toMatchObject({ count: 1 });
  });
});

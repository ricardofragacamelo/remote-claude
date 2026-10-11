import { describe, expect, it } from 'vitest';

import { RuleMigrationCountError } from '@application/permission';
import type { MigrateRulesUseCase, RuleMigrationReport } from '@application/permission';
import { RuleMigrationJob } from '@infra/jobs/rule-migration.job';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

const REPORT: RuleMigrationReport = {
  nativeBefore: 3,
  activeBefore: 2,
  converted: 2,
  disabled: 1,
  activeConverted: 1,
  activeDisabled: 1,
  skipped: 0,
  remaining: 0,
  disabledRules: [{ id: 'r3', nativePattern: 'Bash', detail: 'wholeShell' }],
  tagged: { auditEntries: 4, permissionRequests: 1 },
};

/** A migration that answers what it is told to. */
function migration(outcome: () => Promise<RuleMigrationReport>): MigrateRulesUseCase {
  return { execute: outcome } as unknown as MigrateRulesUseCase;
}

describe('RuleMigrationJob — plan 28, B-33', () => {
  it('logs the count at info, and each rule it switched off', async () => {
    const logger = new RecordingLogger();

    await new RuleMigrationJob(
      migration(() => Promise.resolve(REPORT)),
      logger.logger,
    ).onApplicationBootstrap();

    const lines = logger.withOp('permission.rule.migrate');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      level: 'info',
      nativeBefore: 3,
      activeBefore: 2,
      converted: 2,
      disabled: 1,
      activeConverted: 1,
      activeDisabled: 1,
      taggedAuditEntries: 4,
      taggedPermissionRequests: 1,
    });
    expect(lines[1]).toMatchObject({
      level: 'info',
      ruleId: 'r3',
      nativePattern: 'Bash',
      detail: 'wholeShell',
    });
  });

  it('logs a count that does not add up as an error, and lets the boot go on', async () => {
    const logger = new RecordingLogger();
    const report = { ...REPORT, remaining: 1 };

    await expect(
      new RuleMigrationJob(
        migration(() => Promise.reject(new RuleMigrationCountError(report))),
        logger.logger,
      ).onApplicationBootstrap(),
    ).resolves.toBeUndefined();

    expect(logger.withOp('permission.rule.migrate')).toEqual([
      expect.objectContaining({ level: 'error', remaining: 1, nativeBefore: 3 }),
    ]);
  });

  it('logs any other failure as an error, and lets the boot go on', async () => {
    const logger = new RecordingLogger();

    await new RuleMigrationJob(
      migration(() => Promise.reject(new Error('database gone'))),
      logger.logger,
    ).onApplicationBootstrap();

    const [line] = logger.withOp('permission.rule.migrate');
    expect(line).toMatchObject({ level: 'error' });
    expect(JSON.stringify(line)).toContain('database gone');
  });
});

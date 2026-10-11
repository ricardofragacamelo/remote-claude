import type { OnApplicationBootstrap } from '@nestjs/common';

import { RuleMigrationCountError } from '@application/permission';
import type { MigrateRulesUseCase, RuleMigrationReport } from '@application/permission';
import type { Logger } from '@shared/logging/logger';

/** The counts of a run, as a log line carries them — never the patterns, which are listed apart. */
function countsOf(report: RuleMigrationReport): Record<string, number> {
  return {
    nativeBefore: report.nativeBefore,
    activeBefore: report.activeBefore,
    converted: report.converted,
    disabled: report.disabled,
    activeConverted: report.activeConverted,
    activeDisabled: report.activeDisabled,
    skipped: report.skipped,
    remaining: report.remaining,
    taggedAuditEntries: report.tagged.auditEntries,
    taggedPermissionRequests: report.tagged.permissionRequests,
  };
}

/**
 * The data step of plan 28 · B-33, once per boot, after the SQL migrations (which run as the
 * database module initialises) and before the server listens: the rules still in an engine's grammar
 * are translated or switched off, and the records of a call get their kind.
 *
 * A failure does not stop the boot, and is loud. Nothing it leaves undone authorises anything: a rule
 * still in an engine's grammar answers nothing, and the next boot tries again. Built by the module's
 * factory, like every other class here that holds no decorator.
 */
export class RuleMigrationJob implements OnApplicationBootstrap {
  constructor(
    private readonly migrate: MigrateRulesUseCase,
    private readonly logger: Logger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const context = {
      op: 'permission.rule.migrate',
      layer: 'infrastructure',
      module: 'permission',
    };

    try {
      const report = await this.migrate.execute();

      this.logger.info(
        { ...context, ...countsOf(report) },
        'the permission rules are in the canonical grammar: active before = converted + disabled',
      );

      for (const rule of report.disabledRules) {
        this.logger.info(
          { ...context, ruleId: rule.id, nativePattern: rule.nativePattern, detail: rule.detail },
          'a rule had no unambiguous canonical translation and was switched off',
        );
      }
    } catch (error) {
      if (error instanceof RuleMigrationCountError) {
        this.logger.error(
          { ...context, ...countsOf(error.report) },
          'the rule migration does not add up; the rules left behind answer nothing until the next boot',
        );
        return;
      }

      this.logger.error(
        { ...context, err: error },
        'the rules could not be migrated; a rule still in an engine grammar answers nothing',
      );
    }
  }
}

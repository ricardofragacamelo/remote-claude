import type { UserId } from '@domain/auth';
import type { Clock, IdGenerator } from '@domain/shared';
import type { RecordAuditEventUseCase } from '@application/audit';
import {
  RULE_EXPORT_FORMAT,
  RULE_EXPORT_VERSION,
  exportItemOf,
  type RuleExportFile,
} from './rule-export-file';
import type {
  PermissionRuleListFilter,
  PermissionRuleRepository,
} from './ports/permission-rule.repository';

/**
 * `GET /permission-rules/export` — the caller's own rules, in the file [D-17](../../../../docs/plans/15-rules-management/decisions.md#d-17--exportar-e-importar)
 * describes: no `id`, no `userId`, no origin, the pattern canonical and `engine` only on a
 * restricted rule. A `disabled` rule never leaves — it answers nothing here, and would only arrive
 * somewhere it cannot be recreated as it was (S-136).
 */
export class ExportPermissionRulesUseCase {
  constructor(
    private readonly trail: RecordAuditEventUseCase,
    private readonly rules: PermissionRuleRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, filter: PermissionRuleListFilter): Promise<RuleExportFile> {
    const now = this.clock.now();
    const all = await this.rules.listAllMatching(userId, filter);
    const exportable = all.filter((rule) => rule.statusAt(now) !== 'disabled');

    await this.trail.execute({
      userId,
      kind: 'permission.rulesExported',
      subjectId: this.ids.next(),
      subjectLabel: `${String(exportable.length)} rule(s)`,
      details: { count: exportable.length },
      at: now,
    });

    return {
      format: RULE_EXPORT_FORMAT,
      version: RULE_EXPORT_VERSION,
      exportedAt: now.toISOString(),
      rules: exportable.map(exportItemOf),
    };
  }
}

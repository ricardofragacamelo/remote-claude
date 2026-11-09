import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import {
  EMPTY_PERMISSION_RULE_FILTER,
  type PermissionRuleRepository,
} from './ports/permission-rule.repository';
import type { PermissionSettings } from './permission-settings';
import { parseImportFile, verdictOfImportItem, type ImportItemVerdict } from './rule-export-file';

/** What the file said about one item, kept only for a screen to show — never read back for logic. */
export interface PreviewedImportItem {
  readonly index: number;
  readonly pattern: string;
  readonly decision: string;
  readonly scope: string;
  readonly verdict: ImportItemVerdict;
}

export interface RuleImportPreview {
  readonly digest: string;
  readonly items: readonly PreviewedImportItem[];
}

/**
 * `POST /permission-rules/import/preview` — one verdict per item of the file: `new`, `existing`,
 * or `invalid` with the code that would refuse it ([15 · B-18], D-17, S-138). Read only: nothing
 * is written, and a `project` item's path is not resolved yet — there is no `folderMap` until
 * applying ([15 · D-17]).
 */
export class PreviewRuleImportUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly settings: PermissionSettings,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRuleImportTooLargeError} over 256 KB or 500 rules
   * @throws {import('@domain/permission').PermissionRuleImportUnsupportedError} not this file at all
   */
  async execute(userId: UserId, file: string): Promise<RuleImportPreview> {
    const parsed = parseImportFile(file);
    const now = this.clock.now();
    const active = await this.rules.listAllMatching(userId, {
      ...EMPTY_PERMISSION_RULE_FILTER,
      status: ['active'],
    });
    const lifetimes = {
      allow: [this.settings.ruleDefaultLifetimeMs, this.settings.ruleMaxLifetimeMs] as const,
      deny: [this.settings.ruleDenyDefaultLifetimeMs, this.settings.ruleDenyMaxLifetimeMs] as const,
    };

    return {
      digest: parsed.digest,
      items: parsed.items.map((item, index) => ({
        index,
        pattern: stringOf(item['pattern']),
        decision: stringOf(item['decision']),
        scope: stringOf(item['scope']),
        verdict: verdictOfImportItem(item, active, userId, now, lifetimes),
      })),
    };
  }
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

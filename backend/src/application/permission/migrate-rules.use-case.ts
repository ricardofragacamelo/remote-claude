import { readRulePattern } from '@domain/permission';
import type { Clock } from '@domain/shared';
import type { ToolClassifiers } from '@application/engine';
import { INVOCATION_TABLES } from './ports/tool-kind-backfill.store';
import type { InvocationTable, ToolKindBackfillStore } from './ports/tool-kind-backfill.store';
import type { RuleMigrationStore } from './ports/rule-migration.store';
import type { RuleDialects } from './rule-dialects';

/** Why a migrated rule was switched off — the one reason the rules screen shows (plan 28, D-18). */
export const UNTRANSLATABLE = 'untranslatable';

/** Why a translation the dialect gave was not taken: it is not in the canonical grammar. */
export const INVALID_TRANSLATION = 'invalidTranslation';

/** How many records of a call are read, and given their kind, at a time. */
export const BACKFILL_BATCH = 500;

/** A rule the migration switched off, and why the dialect could not translate it. */
export interface DisabledRule {
  readonly id: string;
  readonly nativePattern: string;

  /** The dialect's code — `wholeShell`, `relativePath`… — for the log; the rule says `untranslatable`. */
  readonly detail: string;
}

/** What one run of the migration did — logged by whoever ran it. */
export interface RuleMigrationReport {
  /** The rules found in an engine's grammar, and how many of them were active. */
  readonly nativeBefore: number;
  readonly activeBefore: number;

  readonly converted: number;
  readonly disabled: number;

  /** Of the active ones, how many were converted and how many switched off. */
  readonly activeConverted: number;
  readonly activeDisabled: number;

  /** Rules another run rewrote between being read and being written: left alone. */
  readonly skipped: number;

  /** Rules still in an engine's grammar after the run — none, or the run failed its count. */
  readonly remaining: number;

  readonly disabledRules: readonly DisabledRule[];

  /** The records of a call that got their kind, by table. */
  readonly tagged: Readonly<Record<InvocationTable, number>>;
}

/**
 * The count of a migration does not add up: rules are still in an engine's grammar after it ran —
 * written meanwhile, or not written by the store. Nothing is lost — such a rule answers nothing, and
 * the next boot migrates it — but a migration that cannot account for every rule must not report
 * success.
 */
export class RuleMigrationCountError extends Error {
  constructor(readonly report: RuleMigrationReport) {
    super(
      `the rule migration does not add up: ${report.nativeBefore} found, ${report.converted} ` +
        `converted, ${report.disabled} disabled, ${report.skipped} skipped, ` +
        `${report.remaining} still in an engine's grammar`,
    );
    this.name = 'RuleMigrationCountError';
  }
}

/**
 * The data step of plan 28 · B-33, run once at boot after the SQL migrations: no rule is left in an
 * engine's grammar, and every record of a call has its kind (D-18).
 *
 * 1. **every rule in an engine's grammar is translated** by that engine's dialect. A translation
 *    that is unambiguous replaces the pattern, the old one kept beside it; one that is not —
 *    or that the canonical grammar does not read — **switches the rule off**, its pattern kept, so
 *    the rules screen lists it for the person to write again. A rule is never deleted;
 * 2. **the count is checked**: the active rules before are the converted plus the disabled ones
 *    (reported, for the log), and no rule is left in an engine's grammar afterwards — or
 *    {@link RuleMigrationCountError};
 * 3. **every record of a call with no kind gets one**, from the engine's classifier — a name it
 *    does not know is `other` (S-99).
 *
 * Idempotent: everything it writes, it writes only where nothing was written yet, so a second run
 * finds nothing to do (S-98, S-134).
 */
export class MigrateRulesUseCase {
  constructor(
    private readonly rules: RuleMigrationStore,
    private readonly invocations: ToolKindBackfillStore,
    private readonly dialects: RuleDialects,
    private readonly classifiers: ToolClassifiers,
    private readonly clock: Clock,
  ) {}

  /** @throws {RuleMigrationCountError} when the rules cannot all be accounted for */
  async execute(): Promise<RuleMigrationReport> {
    const counts = await this.migrateRules();
    const remaining = (await this.rules.nativeRules(this.clock.now())).length;
    const tagged = await this.backfill();
    const report: RuleMigrationReport = { ...counts, remaining, tagged };

    if (remaining > 0) {
      throw new RuleMigrationCountError(report);
    }

    return report;
  }

  private async migrateRules(): Promise<Omit<RuleMigrationReport, 'tagged' | 'remaining'>> {
    const native = await this.rules.nativeRules(this.clock.now());
    const disabledRules: DisabledRule[] = [];
    let converted = 0;
    let activeConverted = 0;
    let activeDisabled = 0;
    let skipped = 0;

    for (const rule of native) {
      const translation = this.dialects.translate(rule.engine, rule.pattern);
      const pattern =
        'pattern' in translation && readRulePattern(translation.pattern) !== null
          ? translation.pattern
          : null;

      if (pattern !== null) {
        if (await this.rules.convert(rule.id, pattern)) {
          converted += 1;
          activeConverted += rule.active ? 1 : 0;
        } else {
          skipped += 1;
        }
        continue;
      }

      if (await this.rules.disable(rule.id, UNTRANSLATABLE)) {
        activeDisabled += rule.active ? 1 : 0;
        disabledRules.push({
          id: rule.id,
          nativePattern: rule.pattern,
          detail:
            'untranslatable' in translation ? translation.untranslatable : INVALID_TRANSLATION,
        });
      } else {
        skipped += 1;
      }
    }

    return {
      nativeBefore: native.length,
      activeBefore: native.filter((rule) => rule.active).length,
      converted,
      disabled: disabledRules.length,
      activeConverted,
      activeDisabled,
      skipped,
      disabledRules,
    };
  }

  /** Every record of a call with no kind, given the one the engine's classifier reads. */
  private async backfill(): Promise<Record<InvocationTable, number>> {
    const tagged: Record<InvocationTable, number> = { auditEntries: 0, permissionRequests: 0 };

    for (const table of INVOCATION_TABLES) {
      let after: string | null = null;

      for (;;) {
        const batch = await this.invocations.untagged(table, after, BACKFILL_BATCH);
        const last = batch.at(-1);

        if (last === undefined) {
          break;
        }

        tagged[table] += await this.invocations.tag(
          table,
          batch.map((record) => ({
            id: record.id,
            // The record does not say which engine; it was the default one's, the only one there was.
            kind: this.classifiers.classify(null, record.toolName, record.input).kind,
          })),
        );
        after = last.id;
      }
    }

    return tagged;
  }
}

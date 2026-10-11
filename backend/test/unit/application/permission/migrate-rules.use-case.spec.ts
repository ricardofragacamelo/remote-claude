import { beforeEach, describe, expect, it } from 'vitest';

import {
  BACKFILL_BATCH,
  INVALID_TRANSLATION,
  MigrateRulesUseCase,
  NO_DIALECT,
  RuleDialects,
  RuleMigrationCountError,
  UNTRANSLATABLE,
} from '@application/permission';
import type {
  InvocationKind,
  InvocationTable,
  NativeRule,
  RuleDialect,
  RuleMigrationStore,
  ToolKindBackfillStore,
  UntaggedInvocation,
} from '@application/permission';
import { claudeRuleDialect } from '@adapter/outbound/engines/claude/rule-dialect';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { claudeClassifiers } from '../../../support/builders/tool.builder';

const NOW = new Date('2026-10-10T12:00:00.000Z');

interface StoredRule extends NativeRule {
  grammar: 'native' | 'canonical';
  canonical: string | null;
  disabledReason: string | null;
}

/** The rules table, as the migration sees it. */
class InMemoryRuleMigrationStore implements RuleMigrationStore {
  readonly rules: StoredRule[] = [];

  /** Ids another run converts between the read and the write. */
  readonly takenMeanwhile = new Set<string>();

  /** Ids this store refuses to write, as if the row vanished. */
  readonly stuck = new Set<string>();

  add(id: string, pattern: string, overrides: Partial<StoredRule> = {}): void {
    this.rules.push({
      id,
      pattern,
      engine: null,
      active: true,
      grammar: 'native',
      canonical: null,
      disabledReason: null,
      ...overrides,
    });
  }

  nativeRules(): Promise<NativeRule[]> {
    return Promise.resolve(
      this.rules
        .filter((rule) => rule.grammar === 'native')
        .map(({ id, pattern, engine, active }) => ({ id, pattern, engine, active })),
    );
  }

  convert(ruleId: string, pattern: string): Promise<boolean> {
    return Promise.resolve(this.write(ruleId, (rule) => (rule.canonical = pattern)));
  }

  disable(ruleId: string, reason: string): Promise<boolean> {
    return Promise.resolve(this.write(ruleId, (rule) => (rule.disabledReason = reason)));
  }

  private write(ruleId: string, change: (rule: StoredRule) => void): boolean {
    const rule = this.rules.find((each) => each.id === ruleId);

    if (rule === undefined || this.stuck.has(ruleId)) {
      return false;
    }

    if (this.takenMeanwhile.has(ruleId)) {
      rule.grammar = 'canonical';
      return false;
    }

    if (rule.grammar !== 'native') {
      return false;
    }

    change(rule);
    rule.grammar = 'canonical';
    return true;
  }
}

/** The two records of a call, as the backfill sees them. */
class InMemoryToolKindBackfill implements ToolKindBackfillStore {
  readonly rows: Record<InvocationTable, (UntaggedInvocation & { kind: string | null })[]> = {
    auditEntries: [],
    permissionRequests: [],
  };

  readonly reads: (string | null)[] = [];

  untagged(
    table: InvocationTable,
    afterId: string | null,
    limit: number,
  ): Promise<UntaggedInvocation[]> {
    this.reads.push(afterId);

    return Promise.resolve(
      this.rows[table]
        .filter((row) => row.kind === null && (afterId === null || row.id > afterId))
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, limit)
        .map(({ id, toolName, input }) => ({ id, toolName, input })),
    );
  }

  tag(table: InvocationTable, kinds: readonly InvocationKind[]): Promise<number> {
    let written = 0;

    for (const { id, kind } of kinds) {
      const row = this.rows[table].find((each) => each.id === id);

      if (row !== undefined && row.kind === null) {
        row.kind = kind;
        written += 1;
      }
    }

    return Promise.resolve(written);
  }
}

describe('MigrateRulesUseCase — plan 28, B-33', () => {
  let rules: InMemoryRuleMigrationStore;
  let invocations: InMemoryToolKindBackfill;
  let migrate: MigrateRulesUseCase;

  const build = (dialects: readonly RuleDialect[] = [claudeRuleDialect]) =>
    new MigrateRulesUseCase(
      rules,
      invocations,
      new RuleDialects(dialects, 'claude'),
      claudeClassifiers(),
      new FixedClock(NOW),
    );

  beforeEach(() => {
    rules = new InMemoryRuleMigrationStore();
    invocations = new InMemoryToolKindBackfill();
    migrate = build();
  });

  it('converts every translatable rule, keeping no engine — S-97, S-133', async () => {
    rules.add('r1', 'Bash(git status:*)');
    rules.add('r2', 'Edit(/srv/a.ts)');
    rules.add('r3', 'mcp__srv__tool');

    const report = await migrate.execute();

    expect(rules.rules.map((rule) => [rule.id, rule.canonical, rule.grammar])).toEqual([
      ['r1', 'shell(git status:*)', 'canonical'],
      ['r2', 'file.edit(/srv/a.ts)', 'canonical'],
      ['r3', 'mcp(srv:tool)', 'canonical'],
    ]);
    expect(rules.rules.every((rule) => rule.engine === null)).toBe(true);
    expect(report).toMatchObject({ nativeBefore: 3, converted: 3, disabled: 0, remaining: 0 });
  });

  it('switches off what has no unambiguous translation, with the reason — S-133', async () => {
    rules.add('r1', 'Bash');
    rules.add('r2', 'AskUserQuestion');
    rules.add('r3', 'Read(src/a.ts)');

    const report = await migrate.execute();

    expect(rules.rules.map((rule) => [rule.disabledReason, rule.canonical])).toEqual([
      [UNTRANSLATABLE, null],
      [UNTRANSLATABLE, null],
      [UNTRANSLATABLE, null],
    ]);
    expect(report.disabledRules).toEqual([
      { id: 'r1', nativePattern: 'Bash', detail: 'wholeShell' },
      { id: 'r2', nativePattern: 'AskUserQuestion', detail: 'noCanonicalKind' },
      { id: 'r3', nativePattern: 'Read(src/a.ts)', detail: 'relativePath' },
    ]);
  });

  it('counts the active rules: active before = converted + disabled — S-133', async () => {
    rules.add('r1', 'Bash(ls)');
    rules.add('r2', 'Bash');
    rules.add('r3', 'Bash(pwd)', { active: false });
    rules.add('r4', 'TodoWrite', { active: false });

    const report = await migrate.execute();

    expect(report).toMatchObject({
      nativeBefore: 4,
      activeBefore: 2,
      converted: 2,
      disabled: 2,
      activeConverted: 1,
      activeDisabled: 1,
      skipped: 0,
    });
    expect(report.activeConverted + report.activeDisabled).toBe(report.activeBefore);
  });

  it('finds nothing to do the second time — S-134', async () => {
    rules.add('r1', 'Bash(ls)');
    rules.add('r2', 'Bash');
    await migrate.execute();
    const before = structuredClone(rules.rules);

    const again = await migrate.execute();

    expect(again).toMatchObject({ nativeBefore: 0, converted: 0, disabled: 0, skipped: 0 });
    expect(rules.rules).toEqual(before);
  });

  it('leaves alone a rule another run got to first, and says so', async () => {
    rules.add('r1', 'Bash(ls)');
    rules.add('r2', 'Bash');
    rules.takenMeanwhile.add('r1');
    rules.takenMeanwhile.add('r2');

    const report = await migrate.execute();

    expect(report).toMatchObject({ converted: 0, disabled: 0, skipped: 2, remaining: 0 });
    expect(report.disabledRules).toEqual([]);
  });

  it('refuses to report success when a rule is still in the engine grammar afterwards', async () => {
    rules.add('r1', 'Bash(ls)');
    rules.stuck.add('r1');
    invocations.rows.auditEntries.push({ id: 'a1', toolName: 'Bash', input: {}, kind: null });

    const failure = await migrate.execute().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RuleMigrationCountError);
    expect((failure as RuleMigrationCountError).report).toMatchObject({
      nativeBefore: 1,
      skipped: 1,
      remaining: 1,
    });
    expect((failure as RuleMigrationCountError).message).toContain('1 still in');
    // The records of a call are still given their kind.
    expect(invocations.rows.auditEntries[0]?.kind).toBe('shell');
  });

  it('switches off a rule of an engine that has no dialect, and one whose translation the grammar refuses', async () => {
    const sloppy: RuleDialect = { engine: 'sloppy', translate: () => ({ pattern: 'Bash(x)' }) };
    migrate = build([claudeRuleDialect, sloppy]);
    rules.add('r1', 'whatever', { engine: 'gone' });
    rules.add('r2', 'x', { engine: 'sloppy' });

    const report = await migrate.execute();

    expect(report.disabledRules.map((rule) => rule.detail)).toEqual([
      NO_DIALECT,
      INVALID_TRANSLATION,
    ]);
  });

  it('gives every old record of a call its kind, by the classifier — S-97, S-99', async () => {
    invocations.rows.auditEntries.push(
      { id: 'a1', toolName: 'Bash', input: { command: 'ls' }, kind: null },
      { id: 'a2', toolName: 'SomethingNobodyKnows', input: {}, kind: null },
      { id: 'a3', toolName: 'Edit', input: {}, kind: 'file.edit' },
    );
    invocations.rows.permissionRequests.push(
      { id: 'p1', toolName: 'mcp__srv__x', input: {}, kind: null },
      { id: 'p2', toolName: 'WebFetch', input: { url: 'https://a.com' }, kind: null },
    );

    const report = await migrate.execute();

    expect(invocations.rows.auditEntries.map((row) => row.kind)).toEqual([
      'shell',
      'other',
      'file.edit',
    ]);
    expect(invocations.rows.permissionRequests.map((row) => row.kind)).toEqual([
      'mcp',
      'web.fetch',
    ]);
    expect(report.tagged).toEqual({ auditEntries: 2, permissionRequests: 2 });
  });

  it('reads the records in batches, by id, until none is left', async () => {
    for (let index = 0; index < BACKFILL_BATCH + 2; index += 1) {
      invocations.rows.auditEntries.push({
        id: `a${String(index).padStart(4, '0')}`,
        toolName: 'Read',
        input: {},
        kind: null,
      });
    }

    const report = await migrate.execute();

    expect(report.tagged.auditEntries).toBe(BACKFILL_BATCH + 2);
    expect(invocations.reads).toEqual([
      null,
      `a${String(BACKFILL_BATCH - 1).padStart(4, '0')}`,
      `a${String(BACKFILL_BATCH + 1).padStart(4, '0')}`,
      null,
    ]);
  });

  it('tags nothing twice — S-98', async () => {
    invocations.rows.auditEntries.push({ id: 'a1', toolName: 'Bash', input: {}, kind: null });
    await migrate.execute();

    const again = await migrate.execute();

    expect(again.tagged).toEqual({ auditEntries: 0, permissionRequests: 0 });
  });
});

describe('RuleDialects', () => {
  it('asks the default engine for a rule that does not say, and the named one otherwise', () => {
    const other: RuleDialect = { engine: 'other', translate: () => ({ pattern: 'agent' }) };
    const dialects = new RuleDialects([claudeRuleDialect, other], 'claude');

    expect(dialects.translate(null, 'Bash(ls)')).toEqual({ pattern: 'shell(ls)' });
    expect(dialects.translate('other', 'Bash(ls)')).toEqual({ pattern: 'agent' });
    expect(dialects.translate('missing', 'Bash(ls)')).toEqual({ untranslatable: NO_DIALECT });
  });
});

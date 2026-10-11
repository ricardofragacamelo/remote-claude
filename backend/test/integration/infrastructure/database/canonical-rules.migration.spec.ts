import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { claudeRuleDialect } from '@adapter/outbound/engines/claude/rule-dialect';
import { DrizzlePermissionRuleRepository } from '@adapter/outbound/persistence/permission/drizzle-permission-rule.repository';
import { DrizzleRuleMigrationStore } from '@adapter/outbound/persistence/permission/drizzle-rule-migration.store';
import { DrizzleToolKindBackfillStore } from '@adapter/outbound/persistence/permission/drizzle-tool-kind-backfill.store';
import { MigrateRulesUseCase, RuleDialects, UNTRANSLATABLE } from '@application/permission';
import type { RuleMigrationReport } from '@application/permission';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate, migrationFiles } from '@infra/database/migrator';
import { startPostgres } from '../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../support/containers/postgres';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { aPersistenceContext } from '../../../support/fakes/persistence-context';
import { claudeClassifiers, claudeTool } from '../../../support/builders/tool.builder';

const MIGRATION = '0023_canonical_rules.sql';
const MIGRATIONS = path.resolve(
  import.meta.dirname,
  '../../../../src/infrastructure/database/migrations',
);

const NOW = new Date('2026-10-10T12:00:00.000Z');
const OWNER = 'auth|owner';
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const PROJECT = '/srv/projects/app';

/** Every row of the translation table (plan 28, B-31 §2): the rule as Claude wrote it, and ours. */
const TRANSLATED: readonly [native: string, canonical: string][] = [
  ['Bash(git status)', 'shell(git status)'],
  ['Bash(git status:*)', 'shell(git status:*)'],
  ['Read', 'file.read'],
  ['NotebookRead', 'file.read'],
  ['Read(/etc/hosts)', 'file.read(/etc/hosts)'],
  ['Edit', 'file.edit'],
  ['MultiEdit', 'file.edit'],
  ['NotebookEdit', 'file.edit'],
  [`Edit(${PROJECT}/a.ts)`, `file.edit(${PROJECT}/a.ts)`],
  ['Write', 'file.write'],
  [`Write(${PROJECT}/b.ts)`, `file.write(${PROJECT}/b.ts)`],
  ['WebFetch', 'web.fetch'],
  ['WebFetch(domain:example.com)', 'web.fetch(domain:example.com)'],
  ['WebSearch', 'web.search'],
  ['Glob', 'search'],
  ['Grep', 'search'],
  [`Grep(${PROJECT}/src)`, `search(${PROJECT}/src)`],
  ['Task', 'agent'],
  ['Agent', 'agent'],
  ['mcp__github__create_issue', 'mcp(github:create_issue)'],
  ['mcp__github', 'mcp(github:*)'],
];

/** The rules with no unambiguous translation, and why the dialect says so. */
const UNTRANSLATED: readonly [native: string, detail: string][] = [
  ['Bash', 'wholeShell'],
  ['Read(src/a.ts)', 'relativePath'],
  ['Edit(/srv/*.ts)', 'globPath'],
  ['WebFetch(https://example.com/a)', 'exactUrl'],
  ['WebSearch(vitest)', 'matcherNotSupported'],
  ['Task(explore)', 'matcherNotSupported'],
  ['AskUserQuestion', 'noCanonicalKind'],
  ['ExitPlanMode', 'noCanonicalKind'],
  ['TodoWrite', 'noCanonicalKind'],
  ['LS', 'noCanonicalKind'],
];

/**
 * S-91: the invocations each migrated rule answered before — the old matcher, on the tool it named —
 * and the ones it did not. `WebFetch(domain:…)` and `mcp__server` are not here: the old matcher read
 * them as an exact URL and a tool named like a server, so they never answered anything, and their
 * translation is what they meant in the settings.
 */
const SAME_INVOCATIONS: readonly [
  native: string,
  toolName: string,
  input: Record<string, unknown>,
  matched: boolean,
][] = [
  ['Bash(git status)', 'Bash', { command: 'git status' }, true],
  ['Bash(git status)', 'Bash', { command: 'git status -s' }, false],
  ['Bash(git status:*)', 'Bash', { command: 'git status -s' }, true],
  ['Bash(git status:*)', 'Bash', { command: 'git statusx' }, false],
  ['Bash(git status:*)', 'Bash', { command: 'git status && rm -rf ~' }, false],
  ['Read', 'Read', { file_path: '/anywhere/at/all' }, true],
  ['Read(/etc/hosts)', 'Read', { file_path: '/etc/hosts' }, true],
  ['Read(/etc/hosts)', 'Read', { file_path: '/etc/hosts2' }, false],
  ['Edit', 'Edit', { file_path: `${PROJECT}/z.ts` }, true],
  [`Edit(${PROJECT}/a.ts)`, 'Edit', { file_path: `${PROJECT}/a.ts` }, true],
  [`Edit(${PROJECT}/a.ts)`, 'Edit', { file_path: `${PROJECT}/a.tsx` }, false],
  ['Write', 'Write', { file_path: `${PROJECT}/z.ts` }, true],
  [`Write(${PROJECT}/b.ts)`, 'Write', { file_path: `${PROJECT}/b.ts` }, true],
  [`Write(${PROJECT}/b.ts)`, 'Write', { file_path: `${PROJECT}/c.ts` }, false],
  ['WebFetch', 'WebFetch', { url: 'https://example.com/a' }, true],
  ['WebSearch', 'WebSearch', { query: 'vitest' }, true],
  ['Glob', 'Glob', { pattern: '**/*.ts' }, true],
  ['Grep', 'Grep', { pattern: 'TODO' }, true],
  [`Grep(${PROJECT}/src)`, 'Grep', { pattern: 'x', path: `${PROJECT}/src` }, true],
  [`Grep(${PROJECT}/src)`, 'Grep', { pattern: 'x', path: `${PROJECT}/lib` }, false],
  ['Task', 'Task', { description: 'x' }, true],
  ['Agent', 'Agent', { description: 'x' }, true],
  ['mcp__github__create_issue', 'mcp__github__create_issue', {}, true],
  ['mcp__github__create_issue', 'mcp__github__close_issue', {}, false],
];

/** Inserts a rule as a backend before `0023` wrote one. */
function insertRule(
  connection: DatabaseConnection,
  id: string,
  pattern: string,
  state: { revoked?: boolean; expired?: boolean } = {},
) {
  const grantedAt = new Date(NOW.getTime() - 3_600_000);
  const expiresAt = new Date(NOW.getTime() + (state.expired === true ? -60_000 : 3_600_000));

  return connection.pool.query(
    `INSERT INTO "permission_rules"
       ("id", "user_id", "scope", "project_path", "pattern", "decision", "granted_at", "expires_at", "revoked_at")
     VALUES ($1, $2, 'always', NULL, $3, 'allow', $4, $5, $6)`,
    [id, OWNER, pattern, grantedAt, expiresAt, state.revoked === true ? grantedAt : null],
  );
}

/** Inserts a record of a call in [table], as a backend before `0023` wrote one. */
function insertCall(
  connection: DatabaseConnection,
  table: 'audit_entries' | 'permission_requests',
  id: string,
  toolName: string,
  input = '{}',
) {
  return table === 'audit_entries'
    ? connection.pool.query(
        `INSERT INTO "audit_entries" ("id", "user_id", "session_id", "tool_use_id", "tool_name", "input", "decision", "at")
         VALUES ($1, $2, $3, $1, $4, $6::jsonb, 'recorded', $5)`,
        [id, OWNER, SESSION, toolName, NOW, input],
      )
    : connection.pool.query(
        `INSERT INTO "permission_requests" ("id", "user_id", "session_id", "tool_use_id", "tool_name", "input", "risk_hint", "status", "requested_at", "expires_at")
         VALUES ($1, $2, $3, $1, $4, $6::jsonb, 'write', 'pending', $5, $5)`,
        [id, OWNER, SESSION, toolName, NOW, input],
      );
}

type RuleRow = {
  id: string;
  pattern: string;
  engine: string | null;
  grammar: string;
  disabled_reason: string | null;
  native_pattern: string | null;
};

async function rulesById(connection: DatabaseConnection): Promise<Record<string, RuleRow>> {
  const rows = await connection.pool.query<RuleRow>(
    `SELECT "id", "pattern", "engine", "grammar", "disabled_reason", "native_pattern"
       FROM "permission_rules" ORDER BY "id"`,
  );
  return Object.fromEntries(rows.rows.map((row) => [row.id, row]));
}

async function kinds(
  connection: DatabaseConnection,
  table: 'audit_entries' | 'permission_requests',
): Promise<Record<string, string | null>> {
  const rows = await connection.pool.query<{ id: string; tool_kind: string | null }>(
    `SELECT "id", "tool_kind" FROM "${table}" ORDER BY "id"`,
  );
  return Object.fromEntries(rows.rows.map((row) => [row.id, row.tool_kind]));
}

/**
 * The canonical rules (plan 28, B-33): migration `0023` and the data step at boot, over the rules and
 * the records a backend before it wrote — S-91, S-97, S-98, S-99, S-133, S-134.
 */
describe('migration 0023 and the rule migration — the canonical rules', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  let migrateRules: MigrateRulesUseCase;

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
    const before = mkdtempSync(path.join(tmpdir(), 'rc-migrations-'));
    for (const file of (await migrationFiles(MIGRATIONS)).filter((name) => name < MIGRATION)) {
      copyFileSync(path.join(MIGRATIONS, file), path.join(before, file));
    }
    await migrate(connection.pool, before);

    for (const [index, [native]] of TRANSLATED.entries()) {
      await insertRule(connection, `t${String(index).padStart(2, '0')}`, native);
    }
    for (const [index, [native]] of UNTRANSLATED.entries()) {
      await insertRule(connection, `u${String(index).padStart(2, '0')}`, native);
    }
    await insertRule(connection, 'x-revoked', 'Bash(ls)', { revoked: true });
    await insertRule(connection, 'x-expired', 'Bash', { expired: true });

    await insertCall(connection, 'audit_entries', 'a1', 'Bash');
    await insertCall(connection, 'audit_entries', 'a2', 'Edit');
    await insertCall(connection, 'audit_entries', 'a3', 'mcp__github__create_issue');
    await insertCall(connection, 'audit_entries', 'a4', 'NothingTheClassifierKnows');
    await insertCall(connection, 'audit_entries', 'a5', 'BashTool');
    await insertCall(connection, 'permission_requests', 'p1', 'WebFetch');
    await insertCall(connection, 'permission_requests', 'p2', 'SomethingElse');
    await insertCall(connection, 'permission_requests', 'p3', 'Bash', '[1, 2]');

    await migrate(connection.pool, MIGRATIONS);

    const context = aPersistenceContext(connection.db, { clock: new FixedClock(NOW) });
    migrateRules = new MigrateRulesUseCase(
      new DrizzleRuleMigrationStore(context),
      new DrizzleToolKindBackfillStore(context),
      new RuleDialects([claudeRuleDialect], 'claude'),
      claudeClassifiers(),
      new FixedClock(NOW),
    );
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  describe('the SQL migration', () => {
    it('marks every rule written before it as native, with no engine and nothing else', async () => {
      const rows = Object.values(await rulesById(connection));

      expect(rows).toHaveLength(TRANSLATED.length + UNTRANSLATED.length + 2);
      expect(
        rows.every(
          (row) =>
            row.grammar === 'native' &&
            row.engine === null &&
            row.disabled_reason === null &&
            row.native_pattern === null,
        ),
      ).toBe(true);
    });

    it('leaves the kind of the old records empty, for the data step', async () => {
      expect(Object.values(await kinds(connection, 'audit_entries'))).toEqual([
        null,
        null,
        null,
        null,
        null,
      ]);
    });

    it('has no default grammar: a new row has to say which', async () => {
      await expect(
        connection.pool.query(
          `INSERT INTO "permission_rules" ("id", "user_id", "scope", "pattern", "decision", "granted_at", "expires_at")
           VALUES ('n1', 'auth|x', 'always', 'shell', 'deny', now(), now() + interval '1 hour')`,
        ),
      ).rejects.toThrow('grammar');
    });

    it.each([
      ['grammar', `'medieval'`, 'NULL', 'NULL', 'permission_rules_grammar_known'],
      [
        'disabled',
        `'native'`,
        `'untranslatable'`,
        'NULL',
        'permission_rules_disabled_is_canonical',
      ],
      ['engine', `'canonical'`, 'NULL', `'Claude Code'`, 'permission_rules_engine_form'],
    ])('refuses a rule whose %s breaks its CHECK', async (_, grammar, reason, engine, check) => {
      await expect(
        connection.pool.query(
          `INSERT INTO "permission_rules" ("id", "user_id", "scope", "pattern", "decision", "granted_at", "expires_at", "grammar", "disabled_reason", "engine")
           VALUES ('bad', 'auth|x', 'always', 'shell', 'deny', now(), now() + interval '1 hour', ${grammar}, ${reason}, ${engine})`,
        ),
      ).rejects.toThrow(check);
    });

    it('lets the trail take a kind once, and refuses every other change as before', async () => {
      await insertCall(connection, 'audit_entries', 'z1', 'Bash');

      await expect(
        connection.pool.query(`UPDATE "audit_entries" SET "tool_name" = 'X' WHERE "id" = 'z1'`),
      ).rejects.toThrow('append-only');
      await expect(
        connection.pool.query(
          `UPDATE "audit_entries" SET "tool_kind" = 'shell', "tool_name" = 'X' WHERE "id" = 'z1'`,
        ),
      ).rejects.toThrow('append-only');
      await connection.pool.query(
        `UPDATE "audit_entries" SET "tool_kind" = 'shell' WHERE "id" = 'z1'`,
      );
      await expect(
        connection.pool.query(`UPDATE "audit_entries" SET "tool_kind" = 'other' WHERE "id" = 'z1'`),
      ).rejects.toThrow('append-only');
      await expect(
        connection.pool.query(`UPDATE "audit_entries" SET "tool_kind" = NULL WHERE "id" = 'z1'`),
      ).rejects.toThrow('append-only');

      expect((await kinds(connection, 'audit_entries'))['z1']).toBe('shell');
    });

    it('changes nothing when it runs again', async () => {
      const before = await rulesById(connection);

      await connection.pool.query(readFileSync(path.join(MIGRATIONS, MIGRATION), 'utf8'));

      expect(await rulesById(connection)).toEqual(before);
      const index = await connection.pool.query(
        `SELECT 1 FROM pg_indexes WHERE "indexname" = 'audit_entries_user_id_tool_kind_seq_idx'`,
      );
      expect(index.rowCount).toBe(1);
    });
  });

  describe('the data step', () => {
    let report: RuleMigrationReport;

    beforeAll(async () => {
      report = await migrateRules.execute();
    });

    it('converts every translatable rule, keeping the old pattern and no engine — S-97, S-133', async () => {
      const rows = await rulesById(connection);

      for (const [index, [native, canonical]] of TRANSLATED.entries()) {
        expect(rows[`t${String(index).padStart(2, '0')}`], native).toMatchObject({
          pattern: canonical,
          native_pattern: native,
          grammar: 'canonical',
          engine: null,
          disabled_reason: null,
        });
      }
    });

    it('switches off what has no unambiguous translation, keeping its pattern — S-133', async () => {
      const rows = await rulesById(connection);

      for (const [index, [native, detail]] of UNTRANSLATED.entries()) {
        const id = `u${String(index).padStart(2, '0')}`;

        expect(rows[id], native).toMatchObject({
          pattern: native,
          native_pattern: native,
          grammar: 'canonical',
          disabled_reason: UNTRANSLATABLE,
        });
        expect(report.disabledRules).toContainEqual({ id, nativePattern: native, detail });
      }
    });

    it('accounts for every rule: active before = converted + disabled — S-133', () => {
      expect(report).toMatchObject({
        nativeBefore: TRANSLATED.length + UNTRANSLATED.length + 2,
        activeBefore: TRANSLATED.length + UNTRANSLATED.length,
        converted: TRANSLATED.length + 1,
        disabled: UNTRANSLATED.length + 1,
        activeConverted: TRANSLATED.length,
        activeDisabled: UNTRANSLATED.length,
        skipped: 0,
        remaining: 0,
      });
      expect(report.activeConverted + report.activeDisabled).toBe(report.activeBefore);
    });

    it('converts a revoked or expired rule too, which stays what it was', async () => {
      const rows = await rulesById(connection);

      expect(rows['x-revoked']).toMatchObject({ pattern: 'shell(ls)', grammar: 'canonical' });
      expect(rows['x-expired']).toMatchObject({ pattern: 'Bash', disabled_reason: UNTRANSLATABLE });
    });

    it('gives every old record its kind, and an unknown name `other` — S-97, S-99', async () => {
      expect(await kinds(connection, 'audit_entries')).toEqual({
        a1: 'shell',
        a2: 'file.edit',
        a3: 'mcp',
        a4: 'other',
        a5: 'shell',
        z1: 'shell',
      });
      expect(await kinds(connection, 'permission_requests')).toEqual({
        p1: 'web.fetch',
        p2: 'other',
        // An input that is not an object is read as an empty one: the name still gives the kind.
        p3: 'shell',
      });
      expect(report.tagged).toEqual({ auditEntries: 5, permissionRequests: 3 });
    });

    it('lists the disabled rules with their old pattern, and answers by none of them — S-133', async () => {
      const repository = new DrizzlePermissionRuleRepository(
        aPersistenceContext(connection.db, { clock: new FixedClock(NOW) }),
      );
      const owner = UserId.create(OWNER);

      const listed = await repository.listFor(owner);
      const applicable = await repository.findApplicable(owner, PROJECT, NOW);

      expect(
        listed.filter((rule) => rule.statusAt(NOW) === 'disabled').map((rule) => rule.ruleContent),
      ).toEqual(expect.arrayContaining(UNTRANSLATED.map(([native]) => native)));
      expect(applicable.map((rule) => rule.ruleContent).sort()).toEqual(
        TRANSLATED.map(([, canonical]) => canonical).sort(),
      );
    });

    it('answers with each migrated rule the same invocations as before — S-91', async () => {
      const repository = new DrizzlePermissionRuleRepository(
        aPersistenceContext(connection.db, { clock: new FixedClock(NOW) }),
      );
      const applicable = await repository.findApplicable(UserId.create(OWNER), PROJECT, NOW);
      const subject = {
        userId: UserId.create(OWNER),
        sessionId: SessionId.create(SESSION),
        projectPath: PROJECT,
      };

      for (const [native, toolName, input, matched] of SAME_INVOCATIONS) {
        const canonical = TRANSLATED.find(([written]) => written === native)?.[1];
        const rule = applicable.find((each) => each.ruleContent === canonical);

        expect(rule, native).toBeDefined();
        expect(
          rule?.matches(subject, claudeTool(toolName, input, PROJECT), NOW),
          `${native} on ${toolName} ${JSON.stringify(input)}`,
        ).toBe(matched);
      }
    });

    it('finds nothing to do the second time, and changes nothing — S-98, S-134', async () => {
      const rules = await rulesById(connection);
      const audit = await kinds(connection, 'audit_entries');
      const requests = await kinds(connection, 'permission_requests');

      const again = await migrateRules.execute();

      expect(again).toMatchObject({
        nativeBefore: 0,
        converted: 0,
        disabled: 0,
        skipped: 0,
        remaining: 0,
        tagged: { auditEntries: 0, permissionRequests: 0 },
      });
      expect(await rulesById(connection)).toEqual(rules);
      expect(await kinds(connection, 'audit_entries')).toEqual(audit);
      expect(await kinds(connection, 'permission_requests')).toEqual(requests);
    });
  });
});

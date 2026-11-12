import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  MAX_IMPORT_BYTES,
  RULE_EXPORT_FORMAT,
  RULE_EXPORT_VERSION,
  digestOfImportFile,
} from '@application/permission';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/** The second account, used wherever the rule is about one user not reaching another's. */
const OTHER = 'auth|other';

/** The ceiling and the default this suite runs with — see `testEnvironment`. */
const MAX_LIFETIME_MS = 86_400_000;
const DEFAULT_LIFETIME_MS = 3_600_000;

/**
 * A real directory inside this suite's allowlist root (plan 15, B-09): a `project` rule's path is
 * now resolved against it, not merely normalised, so a path outside every root — `/srv/projects/app`
 * was never one — would be `403 WORKSPACE_NOT_ALLOWED` instead of the `201` these scenarios expect.
 * Set in `beforeAll`, once the suite's own allowlist exists.
 */
let PROJECT: string;

/**
 * `/permission-rules`, against the real application — plan 03, F0.
 *
 * The filter, the guard, the pipe, the container and PostgreSQL are the real ones. What only the
 * database can prove is here: the advisory lock that makes the same rule granted five times at
 * once one row, the CHECK constraints, and the trail that refuses to forget a grant.
 */
describe('the permission rules HTTP surface', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    harness = await startTestApp(database.url, identity);
    token = await identity.accessToken({ subject: SUBJECT });
    otherToken = await identity.accessToken({ subject: OTHER });
    PROJECT = path.join(harness.allowlist.root, 'app');
    mkdirSync(PROJECT);
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    // A rule left behind would make the next scenario's grant come back as "already there". The
    // trail is **not** cleaned and cannot be — assertions on it are scoped by the rule's id.
    await context().db.execute('DELETE FROM permission_rules');
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  const context = (): PersistenceContext =>
    harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT);

  /** A function, not a value: `PROJECT` is only set once `beforeAll` has run. */
  const rule = (): Record<string, unknown> => ({
    pattern: 'shell(git status:*)',
    decision: 'allow',
    scope: 'project',
    projectPath: PROJECT,
  });

  const grant = (body: Record<string, unknown> = rule(), as: string = token): request.Test =>
    http().post('/permission-rules').set('authorization', `Bearer ${as}`).send(body);

  const revoke = (ruleId: string, as: string = token): request.Test =>
    http().delete(`/permission-rules/${ruleId}`).set('authorization', `Bearer ${as}`);

  const list = (as: string = token, query = ''): request.Test =>
    http().get(`/permission-rules${query}`).set('authorization', `Bearer ${as}`);

  /** In the future by `ms`, as the ISO string a client would send. */
  const inFuture = (ms: number): string => new Date(Date.now() + ms).toISOString();

  /** The kinds the trail recorded about one rule, oldest first. */
  const trailFor = async (ruleId: string): Promise<string[]> => {
    const rows = await context().db.execute(
      `SELECT kind FROM audit_events WHERE subject_id = '${ruleId}' ORDER BY seq`,
    );

    return rows.rows.map((row) => String(row['kind']));
  };

  const rowCount = async (): Promise<number> => {
    const rows = await context().db.execute('SELECT count(*)::int AS n FROM permission_rules');
    return Number(rows.rows[0]?.['n']);
  };

  describe('POST /permission-rules', () => {
    it('grants a rule, with 201 and the default lifetime', async () => {
      const response = await grant();

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        scope: 'project',
        kind: 'shell',
        toolName: 'shell',
        pattern: 'shell(git status:*)',
        decision: 'allow',
        projectPath: PROJECT,
        engine: null,
        grantedBy: SUBJECT,
        status: 'active',
        revokedAt: null,
        disabled: null,
      });
      const lifetime =
        Date.parse(String(response.body.expiresAt)) - Date.parse(String(response.body.grantedAt));
      expect(lifetime).toBe(DEFAULT_LIFETIME_MS);
    });

    it('normalises the project path the way a session`s workspace is', async () => {
      const response = await grant({ ...rule(), projectPath: `${PROJECT}/` });

      expect(response.body.projectPath).toBe(PROJECT);
    });

    it('hands back the same rule when granted twice, and records it once — S-10', async () => {
      const first = await grant();
      const again = await grant();

      expect(again.status).toBe(201);
      expect(again.body.id).toBe(first.body.id);
      expect(await rowCount()).toBe(1);
      expect(await trailFor(String(first.body.id))).toEqual(['permission.ruleGranted']);
    });

    it('stores one row when the same rule is granted five times at once — S-10', async () => {
      // The advisory lock is what makes this true: whether a rule is active depends on the clock,
      // so no unique index can say it.
      const responses = await Promise.all(Array.from({ length: 5 }, () => grant()));

      expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
      expect(await rowCount()).toBe(1);
    });

    it('refuses a pattern outside the grammar, with 400 — S-47', async () => {
      const response = await grant({ ...rule(), pattern: 'shell(git *' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: 'PERMISSION_RULE_PATTERN_INVALID',
        messageKey: 'permission.error.rulePatternInvalid',
        params: { pattern: 'shell(git *', reason: 'syntax' },
      });
      expect(await rowCount()).toBe(0);
    });

    it.each([
      ['Bash(git status:*)', 'syntax'],
      ['mcp__github__create_issue', 'syntax'],
      ['file.edit(src:*)', 'prefixOutsideShell'],
      ['web.fetch(https://example.com)', 'domainExpected'],
      ['tasks', 'unknownKind'],
    ])(
      'refuses %j, outside the canonical grammar, with 400 and the reason %s — S-93',
      async (pattern, reason) => {
        const response = await grant({ ...rule(), pattern });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatchObject({
          code: 'PERMISSION_RULE_PATTERN_INVALID',
          params: { pattern, reason },
        });
        expect(await rowCount()).toBe(0);
      },
    );

    it.each([
      ['question', 'allow'],
      ['plan', 'allow'],
      ['question', 'deny'],
      ['plan(x)', 'deny'],
    ])(
      'refuses %s for %s, which asks the person, with 422, and stores nothing — plan 24, S-31; S-95',
      async (pattern, decision) => {
        const response = await grant({ pattern, decision, scope: 'always' });

        expect(response.status).toBe(422);
        expect(response.body.error).toMatchObject({
          code: 'PERMISSION_RULE_TOOL_INTERACTIVE',
          messageKey: 'permission.error.ruleToolInteractive',
          params: { kind: pattern.split('(')[0] },
          httpEquivalent: 422,
        });
        expect(await rowCount()).toBe(0);
      },
    );

    it.each([
      ['file.edit(src/**)', 'file.edit'],
      ['web.fetch(domain:example.com)', 'web.fetch'],
      ['mcp(github:*)', 'mcp'],
      ['agent', 'agent'],
    ])('grants %s, of the kind %s — S-92', async (pattern, kind) => {
      // `file.edit(src/**)`, `mcp(github:*)` and bare `agent` are `broad` by the D-09 table (plan
      // 15, B-09); `web.fetch(domain:…)` is `narrow` and ignores the flag.
      const response = await grant({ ...rule(), pattern, acknowledgeBroad: true });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ pattern, kind, toolName: kind });
    });

    it('grants a rule restricted to an engine, apart from the same rule for every engine — S-94', async () => {
      const everyEngine = await grant();
      const claudeOnly = await grant({ ...rule(), engine: 'claude' });

      expect(claudeOnly.status).toBe(201);
      expect(claudeOnly.body).toMatchObject({ engine: 'claude', pattern: rule().pattern });
      expect(claudeOnly.body.id).not.toBe(everyEngine.body.id);
      expect((await grant({ ...rule(), engine: 'claude' })).body.id).toBe(claudeOnly.body.id);
    });

    it.each(['Claude', 'a b', ''])('refuses the engine %j at the edge', async (engine) => {
      const response = await grant({ ...rule(), engine });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('accepts a lifetime at the ceiling', async () => {
      // A minute short of it, since the request takes time to reach the server and the ceiling is
      // measured from the moment of the grant there.
      const response = await grant({ ...rule(), expiresAt: inFuture(MAX_LIFETIME_MS - 60_000) });

      expect(response.status).toBe(201);
    });

    it('refuses a lifetime past the ceiling, with 422, instead of cutting it — S-49', async () => {
      const response = await grant({ ...rule(), expiresAt: inFuture(MAX_LIFETIME_MS + 60_000) });

      expect(response.status).toBe(422);
      expect(response.body.error).toMatchObject({
        code: 'PERMISSION_RULE_EXPIRY_TOO_LONG',
        params: { maxMs: MAX_LIFETIME_MS },
      });
      expect(await rowCount()).toBe(0);
    });

    it('refuses a rule that would already be over — S-61', async () => {
      const response = await grant({
        ...rule(),
        expiresAt: new Date(Date.now() - 1).toISOString(),
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: 'INVALID_INPUT',
        messageKey: 'permission.error.ruleExpiryInvalid',
      });
    });

    it('refuses a project rule that names no project', async () => {
      const response = await grant({ pattern: 'shell', decision: 'allow', scope: 'project' });

      expect(response.status).toBe(400);
      expect(response.body.error.messageKey).toBe('permission.error.scopeUnsupported');
    });

    it.each<[() => Record<string, unknown>, string]>([
      [() => ({ ...rule(), scope: 'session' }), 'a session rule, which is granted from the card'],
      [() => ({ ...rule(), decision: 'maybe' }), 'a third decision'],
      [() => ({ ...rule(), expiresAt: 'tomorrow' }), 'a date that is not one'],
      [() => ({ ...rule(), pattern: '' }), 'an empty pattern'],
    ])('refuses at the edge — %s', async (body) => {
      const response = await grant(body());

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('refuses a caller with no credential, with 401', async () => {
      const response = await http().post('/permission-rules').send(rule());

      expect(response.status).toBe(401);
    });

    it('refuses a `templateId` the catalog does not have — S-36', async () => {
      const response = await grant({ ...rule(), templateId: 'not-a-real-template' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
      expect(await rowCount()).toBe(0);
    });

    it('accepts a `templateId` the catalog has, and records it on the rule', async () => {
      const response = await grant({ ...rule(), templateId: 'git-read-only' });

      expect(response.status).toBe(201);
      expect(response.body.templateId).toBe('git-read-only');
    });
  });

  describe('GET /permission-rules', () => {
    it('lists only the caller`s rules, newest first', async () => {
      await grant({ ...rule(), pattern: 'shell(ls)' });
      await grant({ ...rule(), pattern: 'shell(pwd)', scope: 'always', projectPath: undefined });
      await grant({ ...rule(), pattern: 'shell(id)' }, otherToken);

      const response = await list();

      expect(response.status).toBe(200);
      expect(
        response.body.rules.map((listed: { pattern: string; scope: string }) => [
          listed.pattern,
          listed.scope,
        ]),
      ).toEqual([
        ['shell(pwd)', 'always'],
        ['shell(ls)', 'project'],
      ]);
    });

    it('keeps an expired rule listed, marked as expired', async () => {
      const granted = await grant();
      await context().db.execute(
        `UPDATE permission_rules
           SET granted_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
         WHERE id = '${String(granted.body.id)}'`,
      );

      expect((await list()).body.rules).toEqual([
        expect.objectContaining({ id: granted.body.id, status: 'expired' }),
      ]);
    });

    it('lists a rule the migration switched off, with its old pattern and why — S-133', async () => {
      await context().db.execute(
        `INSERT INTO permission_rules
           (id, user_id, scope, pattern, decision, granted_at, expires_at, grammar, disabled_reason, native_pattern)
         VALUES ('disabled-1', '${SUBJECT}', 'always', 'Bash', 'allow', now(), now() + interval '1 hour',
                 'canonical', 'untranslatable', 'Bash')`,
      );

      // Out of the default listing (plan 15, D-20 revision, S-01, S-224) — only `status=disabled`
      // shows it.
      expect((await list()).body.rules).toEqual([]);

      expect((await list(token, '?status=disabled')).body.rules).toEqual([
        expect.objectContaining({
          id: 'disabled-1',
          kind: null,
          toolName: 'Bash',
          pattern: 'Bash',
          engine: null,
          status: 'disabled',
          disabled: { reason: 'untranslatable' },
        }),
      ]);

      const revoked = await revoke('disabled-1');

      expect(revoked.status).toBe(200);
      expect(revoked.body).toMatchObject({
        status: 'revoked',
        disabled: { reason: 'untranslatable' },
      });
      expect((await list()).body.rules).toEqual([]);
    });

    it('is empty, not an error, for somebody with no rule', async () => {
      // `nextCursor` is additive (plan 15, D-13) — `null` on an empty page, same as a full one.
      expect((await list(otherToken)).body).toEqual({ rules: [], nextCursor: null });
    });

    it('filters by scope, decision, engine, kind, folder and q — plan 15, B-10', async () => {
      await grant({ ...rule(), pattern: 'shell(ls)', scope: 'always', projectPath: undefined });
      await grant({
        ...rule(),
        pattern: 'file.edit(src/**)',
        engine: 'claude',
        acknowledgeBroad: true,
      });

      const byScope = await list(token, '?scope=always');
      expect(byScope.body.rules.map((r: { pattern: string }) => r.pattern)).toEqual(['shell(ls)']);

      const byDecision = await list(token, '?decision=deny');
      expect(byDecision.body.rules).toEqual([]);

      const byEngine = await list(token, '?engine=claude');
      expect(byEngine.body.rules.map((r: { pattern: string }) => r.pattern)).toEqual([
        'file.edit(src/**)',
      ]);

      const byKind = await list(token, '?kind=file.edit');
      expect(byKind.body.rules.map((r: { pattern: string }) => r.pattern)).toEqual([
        'file.edit(src/**)',
      ]);

      const byFolder = await list(token, `?folder=${encodeURIComponent(PROJECT)}`);
      expect(byFolder.body.rules.map((r: { pattern: string }) => r.pattern)).toEqual([
        'file.edit(src/**)',
      ]);

      // `shell(` can only ever match the pattern — never the folder, whose random suffix
      // (mkdtemp) could otherwise coincide with a plain `ls` and make this flaky (S-46).
      const byQ = await list(token, `?q=${encodeURIComponent('shell(')}`);
      expect(byQ.body.rules.map((r: { pattern: string }) => r.pattern)).toEqual(['shell(ls)']);
    });

    it('filters by expiresBefore — only active rules, strict comparison — S-43', async () => {
      const granted = await grant({
        ...rule(),
        pattern: 'shell(a)',
        scope: 'always',
        projectPath: undefined,
      });
      await context().db.execute(
        `UPDATE permission_rules SET expires_at = now() + interval '1 hour' WHERE id = '${String(granted.body.id)}'`,
      );

      const before = await list(token, `?expiresBefore=${encodeURIComponent(inFuture(7_200_000))}`);
      expect(before.body.rules.map((r: { id: string }) => r.id)).toEqual([granted.body.id]);

      const after = await list(token, `?expiresBefore=${encodeURIComponent(inFuture(1_800_000))}`);
      expect(after.body.rules).toEqual([]);
    });

    it('reads `reach`, `breadth` and `etag` on every item — plan 15, B-10', async () => {
      await grant();

      const response = await list();

      expect(response.body.rules[0]).toMatchObject({
        reach: { kind: 'shell', form: 'prefix', content: 'git status' },
        breadth: 'narrow',
      });
      expect(typeof response.body.rules[0].etag).toBe('string');
      expect(response.body.rules[0].etag).not.toBe('');
    });

    it('sorts by pattern and by expiresAt, both directions — S-47', async () => {
      await grant({ ...rule(), pattern: 'shell(bbb)', scope: 'always', projectPath: undefined });
      await grant({ ...rule(), pattern: 'shell(aaa)', scope: 'always', projectPath: undefined });

      const asc = await list(token, '?sort=pattern&order=asc');
      expect(asc.body.rules.map((r: { pattern: string }) => r.pattern)).toEqual([
        'shell(aaa)',
        'shell(bbb)',
      ]);

      const desc = await list(token, '?sort=expiresAt&order=desc');
      expect(desc.body.rules).toHaveLength(2);
    });

    it('sorts by useCount, reading it from the trail — plan 15, B-11', async () => {
      const low = await grant({
        ...rule(),
        pattern: 'shell(low)',
        scope: 'always',
        projectPath: undefined,
      });
      const high = await grant({
        ...rule(),
        pattern: 'shell(high)',
        scope: 'always',
        projectPath: undefined,
      });
      await context().db.execute(
        `INSERT INTO audit_entries (id, user_id, session_id, tool_use_id, tool_name, tool_kind, input, decision, rule_id, scope, auto, at)
         VALUES ('e-${String(high.body.id)}', '${SUBJECT}', '01J0ABCDEFGHJKMNPQRSTVWXYZ', null, 'Bash', 'shell', '{}', 'allowed', '${String(high.body.id)}', 'always', true, now())`,
      );

      const response = await list(token, '?sort=useCount&order=desc');

      expect(response.body.rules.map((r: { id: string }) => r.id)).toEqual([
        high.body.id,
        low.body.id,
      ]);
      expect(response.body.rules[0].usage).toMatchObject({ count: 1 });
    });

    it('pages by cursor without repeating or skipping a rule — S-50', async () => {
      await grant({ ...rule(), pattern: 'shell(a)', scope: 'always', projectPath: undefined });
      await grant({ ...rule(), pattern: 'shell(b)', scope: 'always', projectPath: undefined });
      await grant({ ...rule(), pattern: 'shell(c)', scope: 'always', projectPath: undefined });

      const first = await list(token, '?pageSize=2');
      expect(first.body.rules).toHaveLength(2);
      expect(first.body.nextCursor).not.toBeNull();

      const second = await list(
        token,
        `?pageSize=2&cursor=${encodeURIComponent(String(first.body.nextCursor))}`,
      );
      expect(second.body.rules).toHaveLength(1);
      expect(second.body.nextCursor).toBeNull();

      const all = [...first.body.rules, ...second.body.rules].map(
        (r: { pattern: string }) => r.pattern,
      );
      expect(new Set(all).size).toBe(3);
    });

    it('refuses a cursor this server never emitted — S-48', async () => {
      const response = await list(token, '?cursor=not-a-real-cursor');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('GET /permission-rules/summary', () => {
    const summary = (as: string = token, query = ''): request.Test =>
      http().get(`/permission-rules/summary${query}`).set('authorization', `Bearer ${as}`);

    it('counts by status, decision and scope over the same predicate as the listing', async () => {
      await grant({ ...rule(), pattern: 'shell(a)', scope: 'always', projectPath: undefined });
      const denied = await grant({ ...rule(), pattern: 'shell(b)', decision: 'deny' });
      await revoke(String(denied.body.id));

      const response = await summary();

      expect(response.status).toBe(200);
      expect(response.body.byStatus).toMatchObject({ active: 1, revoked: 1, disabled: 0 });
      expect(response.body.byDecision).toEqual({ allow: 1, deny: 0 });
      expect(response.body.byScope).toEqual({ always: 1, project: 0 });
      expect(response.body.expiringBefore).toBe(0);
    });

    it('narrows by scope, decision, engine and expiresBefore — same filters as the listing', async () => {
      await grant({ ...rule(), pattern: 'shell(a)', scope: 'always', projectPath: undefined });
      await grant({ ...rule(), pattern: 'shell(b)', decision: 'deny' });
      await grant({
        ...rule(),
        pattern: 'file.edit(src/**)',
        engine: 'claude',
        acknowledgeBroad: true,
      });

      const byScope = await summary(token, '?scope=always');
      expect(byScope.body.byStatus.active).toBe(1);

      const byDecision = await summary(token, '?decision=deny');
      expect(byDecision.body.byStatus.active).toBe(1);

      const byEngine = await summary(token, '?engine=claude');
      expect(byEngine.body.byStatus.active).toBe(1);

      const byExpiresBefore = await summary(
        token,
        `?expiresBefore=${encodeURIComponent(inFuture(MAX_LIFETIME_MS))}`,
      );
      expect(byExpiresBefore.body.expiringBefore).toBe(3);
    });
  });

  describe('GET /permission-rules/templates — plan 15, B-17', () => {
    const templates = (as: string = token): request.Test =>
      http().get('/permission-rules/templates').set('authorization', `Bearer ${as}`);

    it('answers with the catalog, each rule carrying its reach and breadth', async () => {
      const response = await templates();

      expect(response.status).toBe(200);
      expect(response.body.templates.length).toBeGreaterThan(0);

      const gitReadOnly = (response.body.templates as Array<Record<string, unknown>>).find(
        (template) => template['id'] === 'git-read-only',
      );

      expect(gitReadOnly).toMatchObject({
        name: { messageKey: 'permission.ruleTemplate.gitReadOnlyName' },
        description: { messageKey: 'permission.ruleTemplate.gitReadOnlyDescription' },
      });
      expect(gitReadOnly?.['rules']).toContainEqual(
        expect.objectContaining({
          pattern: 'shell(git status:*)',
          decision: 'allow',
          breadth: 'narrow',
        }),
      );
    });

    it('never answers with an `allow` rule this server would call unbounded', async () => {
      const response = await templates();
      const rules = (response.body.templates as Array<Record<string, unknown>>).flatMap(
        (template) => template['rules'] as Array<Record<string, unknown>>,
      );

      for (const rule of rules.filter((item) => item['decision'] === 'allow')) {
        expect(rule['breadth']).not.toBe('unbounded');
      }
    });

    it('refuses a caller with no credential, with 401', async () => {
      expect((await http().get('/permission-rules/templates')).status).toBe(401);
    });
  });

  describe('GET /permission-rules/export — plan 15, B-18', () => {
    const exportRules = (as: string = token, query = ''): request.Test =>
      http().get(`/permission-rules/export${query}`).set('authorization', `Bearer ${as}`);

    it('writes the pattern, decision, scope, projectPath, expiresAt — no id, no userId — S-136', async () => {
      await grant({
        ...rule(),
        pattern: 'shell(git status:*)',
        scope: 'always',
        projectPath: undefined,
      });

      const response = await exportRules();

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ format: 'remote-claude.permission-rules', version: 1 });
      expect(response.body.rules).toContainEqual(
        expect.objectContaining({
          pattern: 'shell(git status:*)',
          decision: 'allow',
          scope: 'always',
        }),
      );
      expect(response.body.rules[0]).not.toHaveProperty('id');
      expect(response.body.rules[0]).not.toHaveProperty('userId');
    });

    it('respects the same filters the listing takes — S-136', async () => {
      await grant({ ...rule(), pattern: 'shell(a)', scope: 'always', projectPath: undefined });
      await grant({
        ...rule(),
        pattern: 'shell(b)',
        scope: 'always',
        projectPath: undefined,
        decision: 'deny',
      });

      const response = await exportRules(token, '?decision=deny');

      expect(response.body.rules).toHaveLength(1);
      expect(response.body.rules[0]).toMatchObject({ pattern: 'shell(b)' });
    });

    it('records `permission.rulesExported` — S-137', async () => {
      await grant({ ...rule(), scope: 'always', projectPath: undefined });

      await exportRules();

      const rows = await context().db.execute(
        `SELECT count(*)::int AS n FROM audit_events WHERE kind = 'permission.rulesExported' AND user_id = '${SUBJECT}'`,
      );

      expect(Number(rows.rows[0]?.['n'])).toBeGreaterThan(0);
    });

    it('refuses a caller with no credential, with 401', async () => {
      expect((await http().get('/permission-rules/export')).status).toBe(401);
    });
  });

  describe('POST /permission-rules/import/preview and /import — plan 15, B-18', () => {
    const fileOf = (rules: readonly Record<string, unknown>[]): string =>
      JSON.stringify({
        format: RULE_EXPORT_FORMAT,
        version: RULE_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        rules,
      });

    const previewImport = (file: string, as: string = token): request.Test =>
      http()
        .post('/permission-rules/import/preview')
        .set('authorization', `Bearer ${as}`)
        .send({ file });

    const applyImport = (body: Record<string, unknown>, as: string = token): request.Test =>
      http().post('/permission-rules/import').set('authorization', `Bearer ${as}`).send(body);

    it('answers `422` for an unknown format/version, or malformed JSON — S-140', async () => {
      expect((await previewImport('{not json')).status).toBe(422);
      expect(
        (await previewImport(JSON.stringify({ format: 'other', version: 1, rules: [] }))).status,
      ).toBe(422);
      expect(
        (await previewImport(JSON.stringify({ format: RULE_EXPORT_FORMAT, version: 2, rules: [] })))
          .status,
      ).toBe(422);
    });

    it('answers `400` for a body with no `file` at all — the pipe refuses it first', async () => {
      const response = await http()
        .post('/permission-rules/import/preview')
        .set('authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('answers `413` over the 256 KB ceiling — S-141', async () => {
      const big = 'x'.repeat(MAX_IMPORT_BYTES + 1);

      expect((await previewImport(big)).status).toBe(413);
    });

    it('answers with a verdict per item, the digest to apply with — S-138', async () => {
      const file = fileOf([
        { pattern: 'shell(pnpm test:*)', decision: 'allow', scope: 'always' },
        { pattern: 'Bash(git status)', decision: 'allow', scope: 'always' },
      ]);

      const response = await previewImport(file);

      expect(response.status).toBe(200);
      expect(response.body.digest).toBe(digestOfImportFile(file));
      expect(response.body.items).toMatchObject([
        { index: 0, verdict: 'new' },
        { index: 1, verdict: 'invalid', code: 'PERMISSION_RULE_PATTERN_INVALID' },
      ]);
    });

    it("ignores the file's own dono fields — every rule is born from the caller — S-139", async () => {
      const file = fileOf([
        {
          pattern: 'shell(pnpm test:*)',
          decision: 'allow',
          scope: 'always',
          userId: 'auth|somebody-else',
          id: 'not-mine',
        },
      ]);

      const response = await applyImport({
        file,
        digest: digestOfImportFile(file),
        accept: [0],
        acknowledgeBroad: [],
        folderMap: {},
      });

      expect(response.status).toBe(200);
      expect(response.body.rules[0]).toMatchObject({ grantedBy: SUBJECT, grantedVia: 'import' });
      expect(response.body.rules[0].id).not.toBe('not-mine');
    });

    it("refuses a `digest` that is not the file's own — S-143", async () => {
      const file = fileOf([{ pattern: 'shell(pnpm test:*)', decision: 'allow', scope: 'always' }]);

      const response = await applyImport({
        file,
        digest: 'not-the-real-digest',
        accept: [0],
        acknowledgeBroad: [],
        folderMap: {},
      });

      expect(response.status).toBe(400);
      expect(await rowCount()).toBe(0);
    });

    it('maps a `project` item through `folderMap`, validated as a creation would be — S-144', async () => {
      const file = fileOf([
        {
          pattern: 'shell(git status:*)',
          decision: 'allow',
          scope: 'project',
          projectPath: '/remote/machine/app',
        },
      ]);

      const response = await applyImport({
        file,
        digest: digestOfImportFile(file),
        accept: [0],
        acknowledgeBroad: [],
        folderMap: { '/remote/machine/app': PROJECT },
      });

      expect(response.status).toBe(200);
      expect(response.body.rules[0]).toMatchObject({ projectPath: PROJECT });
    });

    it('refuses a `project` item mapped outside the allowlist, same as a creation would — S-144', async () => {
      const file = fileOf([
        {
          pattern: 'shell(git status:*)',
          decision: 'allow',
          scope: 'project',
          projectPath: '/remote/machine/app',
        },
      ]);

      const response = await applyImport({
        file,
        digest: digestOfImportFile(file),
        accept: [0],
        acknowledgeBroad: [],
        folderMap: { '/remote/machine/app': '/srv/not-allowed' },
      });

      expect(response.status).toBe(422);
      expect(await rowCount()).toBe(0);
    });

    it('creates each rule once across two simultaneous imports of the same file — S-146', async () => {
      const file = fileOf([{ pattern: 'shell(pnpm test:*)', decision: 'allow', scope: 'always' }]);
      const body = {
        file,
        digest: digestOfImportFile(file),
        accept: [0],
        acknowledgeBroad: [],
        folderMap: {},
      };

      const [first, second] = await Promise.all([applyImport(body), applyImport(body)]);

      expect([first.body.counts.created, second.body.counts.created].sort()).toEqual([0, 1]);
      expect(await rowCount()).toBe(1);
    });

    it('refuses a caller with no credential, with 401', async () => {
      expect(
        (
          await http()
            .post('/permission-rules/import/preview')
            .send({ file: fileOf([]) })
        ).status,
      ).toBe(401);
      expect(
        (
          await http()
            .post('/permission-rules/import')
            .send({
              file: fileOf([]),
              digest: digestOfImportFile(fileOf([])),
              accept: [],
              acknowledgeBroad: [],
              folderMap: {},
            })
        ).status,
      ).toBe(401);
    });
  });

  describe('GET /permission-rules/:ruleId/invocations and /history', () => {
    it('reads the rule`s own invocations, never a stranger`s — plan 15, B-11, S-60, S-61', async () => {
      const granted = await grant();
      await context().db.execute(
        `INSERT INTO audit_entries (id, user_id, session_id, tool_use_id, tool_name, tool_kind, input, decision, rule_id, scope, auto, at)
         VALUES ('inv-1', '${SUBJECT}', '01J0ABCDEFGHJKMNPQRSTVWXYZ', null, 'Bash', 'shell', '{"command":"git status"}', 'allowed', '${String(granted.body.id)}', 'project', true, now())`,
      );

      const mine = await http()
        .get(`/permission-rules/${String(granted.body.id)}/invocations`)
        .set('authorization', `Bearer ${token}`);

      expect(mine.status).toBe(200);
      expect(mine.body.invocations).toHaveLength(1);
      expect(mine.body.invocations[0]).toMatchObject({ id: 'inv-1', kind: 'shell' });

      const stranger = await http()
        .get(`/permission-rules/${String(granted.body.id)}/invocations`)
        .set('authorization', `Bearer ${otherToken}`);

      expect(stranger.status).toBe(403);

      const missing = await http()
        .get('/permission-rules/no-such-rule/invocations')
        .set('authorization', `Bearer ${token}`);

      expect(missing.status).toBe(404);
    });

    it('reads the rule`s own history — plan 15, B-11', async () => {
      const granted = await grant();

      const response = await http()
        .get(`/permission-rules/${String(granted.body.id)}/history`)
        .set('authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'permission.ruleGranted' })]),
      );

      const stranger = await http()
        .get(`/permission-rules/${String(granted.body.id)}/history`)
        .set('authorization', `Bearer ${otherToken}`);

      expect(stranger.status).toBe(403);
    });
  });

  describe('GET /permission-rules/:ruleId', () => {
    const open = (ruleId: string, as: string = token): request.Test =>
      http().get(`/permission-rules/${ruleId}`).set('authorization', `Bearer ${as}`);

    it('opens an active rule, with `200`', async () => {
      const granted = await grant();

      const response = await open(String(granted.body.id));

      expect(response.status).toBe(200);
      // `findings`, `usage` and `folderReachable` are what `GET /:ruleId` adds over the grant
      // response (plan 15, B-15, B-22) — the redundancy analysis, the trail and the allowlist,
      // none of which `POST` bothers with for the rule it just created.
      expect(response.body).toEqual({
        ...granted.body,
        findings: [],
        usage: { count: 0, lastUsedAt: null, windowDays: expect.any(Number) },
        folderReachable: true,
        expiryCeiling: expect.any(String),
      });
    });

    it('opens a revoked rule too, saying when it was revoked — S-50', async () => {
      // The listing leaves it out on purpose; the trail still points at it.
      const granted = await grant();
      await revoke(String(granted.body.id));

      const response = await open(String(granted.body.id));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'revoked', revokedAt: expect.any(String) });
      expect((await list()).body.rules).toEqual([]);
    });

    it('answers `404` for a rule that does not exist — S-74', async () => {
      const response = await open('no-such-rule');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PERMISSION_RULE_NOT_FOUND');
    });

    it('answers `403` for somebody else`s rule — S-74', async () => {
      const granted = await grant();

      const response = await open(String(granted.body.id), otherToken);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PERMISSION_NOT_OWNED');
    });

    it('counts the rule’s own usage — the same trail the invocations route reads (plan 15, B-22)', async () => {
      const granted = await grant();
      await context().db.execute(
        `INSERT INTO audit_entries (id, user_id, session_id, tool_use_id, tool_name, tool_kind, input, decision, rule_id, scope, auto, at)
         VALUES ('inv-usage-1', '${SUBJECT}', '01J0ABCDEFGHJKMNPQRSTVWXYZ', null, 'Bash', 'shell', '{"command":"git status"}', 'allowed', '${String(granted.body.id)}', 'project', true, now())`,
      );

      const response = await open(String(granted.body.id));

      expect(response.status).toBe(200);
      expect(response.body.usage).toMatchObject({ count: 1, lastUsedAt: expect.any(String) });
    });

    it('says a disabled rule has no usage to count, and no folder to reach — plan 28, D-18', async () => {
      await context().db.execute(
        `INSERT INTO permission_rules
           (id, user_id, scope, pattern, decision, granted_at, expires_at, grammar, disabled_reason, native_pattern)
         VALUES ('disabled-usage-1', '${SUBJECT}', 'always', 'Bash', 'allow', now(), now() + interval '1 hour',
                 'canonical', 'untranslatable', 'Bash')`,
      );

      const response = await open('disabled-usage-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        usage: null,
        folderReachable: null,
        expiryCeiling: null,
      });
    });
  });

  describe('DELETE /permission-rules/:ruleId', () => {
    it('revokes it, takes it off the list, and records both facts — S-13', async () => {
      const granted = await grant();

      const response = await revoke(String(granted.body.id));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: granted.body.id, status: 'revoked' });
      expect(response.body.revokedAt).toBeTypeOf('string');
      expect((await list()).body.rules).toEqual([]);
      expect(await trailFor(String(granted.body.id))).toEqual([
        'permission.ruleGranted',
        'permission.ruleRevoked',
      ]);
      // Kept, not deleted: the history points at it.
      expect(await rowCount()).toBe(1);
    });

    it('answers the same when revoked twice, and records it once — S-55', async () => {
      const granted = await grant();

      const first = await revoke(String(granted.body.id));
      const second = await revoke(String(granted.body.id));

      expect(second.status).toBe(200);
      expect(second.body.revokedAt).toBe(first.body.revokedAt);
      expect(await trailFor(String(granted.body.id))).toEqual([
        'permission.ruleGranted',
        'permission.ruleRevoked',
      ]);
    });

    it('answers both the same, and records once, when two clients revoke together — S-46', async () => {
      const granted = await grant();

      const [first, second] = await Promise.all([
        revoke(String(granted.body.id)),
        revoke(String(granted.body.id)),
      ]);

      expect([first.status, second.status]).toEqual([200, 200]);
      expect(second.body).toEqual(first.body);
      expect(await trailFor(String(granted.body.id))).toEqual([
        'permission.ruleGranted',
        'permission.ruleRevoked',
      ]);
    });

    it('grants anew after a revocation, instead of handing the revoked one back', async () => {
      const granted = await grant();
      await revoke(String(granted.body.id));

      const again = await grant();

      expect(again.body.id).not.toBe(granted.body.id);
      expect(again.body.status).toBe('active');
    });

    it('answers 404 for a rule that does not exist — S-54', async () => {
      const response = await revoke('01J0NOSUCHRULE000000000000');

      expect(response.status).toBe(404);
      expect(response.body.error).toMatchObject({
        code: 'PERMISSION_RULE_NOT_FOUND',
        messageKey: 'permission.error.ruleNotFound',
      });
    });

    it('answers 403 for somebody else`s, which keeps applying to them — S-53', async () => {
      const granted = await grant();

      const response = await revoke(String(granted.body.id), otherToken);

      expect(response.status).toBe(403);
      expect(response.body.error).toMatchObject({
        code: 'PERMISSION_NOT_OWNED',
        messageKey: 'permission.error.ruleNotOwned',
      });
      expect((await list()).body.rules).toEqual([
        expect.objectContaining({ id: granted.body.id, status: 'active' }),
      ]);
    });
  });

  describe('PATCH /permission-rules/:ruleId — plan 15, B-12', () => {
    const patch = (
      ruleId: string,
      expiresAt: string,
      ifMatch: string | undefined,
      as: string = token,
    ): request.Test => {
      const req = http()
        .patch(`/permission-rules/${ruleId}`)
        .set('authorization', `Bearer ${as}`)
        .send({ expiresAt });

      return ifMatch === undefined ? req : req.set('if-match', ifMatch);
    };

    it('extends, and records the before and after — S-65', async () => {
      const granted = await grant();
      const extended = inFuture(DEFAULT_LIFETIME_MS + 60_000);

      const response = await patch(String(granted.body.id), extended, String(granted.body.etag));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: granted.body.id, expiresAt: extended });
      expect(response.body.etag).not.toBe(granted.body.etag);
      expect(await trailFor(String(granted.body.id))).toEqual([
        'permission.ruleGranted',
        'permission.ruleExpiryChanged',
      ]);
    });

    it('shortens the same way', async () => {
      const granted = await grant({ ...rule(), expiresAt: inFuture(60_000) });
      const shortened = inFuture(1_000);

      const response = await patch(String(granted.body.id), shortened, String(granted.body.etag));

      expect(response.status).toBe(200);
      expect(response.body.expiresAt).toBe(shortened);
    });

    it('answers `428` with no `If-Match` — S-68', async () => {
      const granted = await grant();

      const response = await patch(
        String(granted.body.id),
        inFuture(DEFAULT_LIFETIME_MS + 1_000),
        undefined,
      );

      expect(response.status).toBe(428);
      expect(response.body.error).toMatchObject({
        code: 'PRECONDITION_REQUIRED',
        messageKey: 'permission.error.ruleIfMatchRequired',
      });
    });

    it('answers `412` with a stale `If-Match`, naming the current one — S-69', async () => {
      const granted = await grant();

      const response = await patch(
        String(granted.body.id),
        inFuture(DEFAULT_LIFETIME_MS + 1_000),
        '"not-the-etag"',
      );

      expect(response.status).toBe(412);
      expect(response.body.error).toMatchObject({ code: 'PERMISSION_RULE_CHANGED' });
    });

    it('a revoked rule never comes back by a `PATCH` — S-70', async () => {
      const granted = await grant();
      await revoke(String(granted.body.id));

      const response = await patch(
        String(granted.body.id),
        inFuture(DEFAULT_LIFETIME_MS + 1_000),
        String(granted.body.etag),
      );

      expect(response.status).toBe(409);
      expect(response.body.error).toMatchObject({
        code: 'PERMISSION_RULE_STATE_CONFLICT',
        params: { status: 'revoked' },
      });
    });

    it('answers `400` for a validity that is not in the future — S-67', async () => {
      const granted = await grant();

      const response = await patch(
        String(granted.body.id),
        new Date().toISOString(),
        String(granted.body.etag),
      );

      expect(response.status).toBe(400);
    });

    it('answers `422` past the ceiling, counted from now — D-14', async () => {
      const granted = await grant();

      const response = await patch(
        String(granted.body.id),
        inFuture(MAX_LIFETIME_MS + 60_000),
        String(granted.body.etag),
      );

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('PERMISSION_RULE_EXPIRY_TOO_LONG');
    });

    it('writes nothing and records nothing for the same validity sent again — S-73', async () => {
      const granted = await grant();

      const response = await patch(
        String(granted.body.id),
        String(granted.body.expiresAt),
        String(granted.body.etag),
      );

      expect(response.status).toBe(200);
      expect(await trailFor(String(granted.body.id))).toEqual(['permission.ruleGranted']);
    });

    it('answers `404` for a rule that does not exist', async () => {
      const response = await patch('no-such-rule', inFuture(60_000), '"etag"');

      expect(response.status).toBe(404);
    });

    it('answers `403` for somebody else`s rule, which keeps applying to them', async () => {
      const granted = await grant();

      const response = await patch(
        String(granted.body.id),
        inFuture(DEFAULT_LIFETIME_MS + 1_000),
        String(granted.body.etag),
        otherToken,
      );

      expect(response.status).toBe(403);
    });

    it('answers `400` for a body that also tries to change the pattern — only validity edits, S-79', async () => {
      const granted = await grant();

      const response = await http()
        .patch(`/permission-rules/${String(granted.body.id)}`)
        .set('authorization', `Bearer ${token}`)
        .set('if-match', String(granted.body.etag))
        .send({ expiresAt: inFuture(60_000), pattern: 'shell(rm -rf:*)' });

      expect(response.status).toBe(400);
      expect(
        (
          await context().db.execute(
            `SELECT pattern FROM permission_rules WHERE id = '${String(granted.body.id)}'`,
          )
        ).rows[0]?.['pattern'],
      ).toBe(granted.body.pattern);
    });

    it('extending clears the expiry reminder — S-78', async () => {
      const granted = await grant();
      await context().db.execute(
        `UPDATE permission_rules SET expiry_reminded_at = now() WHERE id = '${String(granted.body.id)}'`,
      );

      await patch(
        String(granted.body.id),
        inFuture(DEFAULT_LIFETIME_MS + 1_000),
        String(granted.body.etag),
      );

      const row = await context().db.execute(
        `SELECT expiry_reminded_at FROM permission_rules WHERE id = '${String(granted.body.id)}'`,
      );
      expect(row.rows[0]?.['expiry_reminded_at']).toBeNull();
    });

    it('shortening leaves the expiry reminder alone', async () => {
      const granted = await grant({ ...rule(), expiresAt: inFuture(60_000) });
      await context().db.execute(
        `UPDATE permission_rules SET expiry_reminded_at = now() WHERE id = '${String(granted.body.id)}'`,
      );

      await patch(String(granted.body.id), inFuture(1_000), String(granted.body.etag));

      const row = await context().db.execute(
        `SELECT expiry_reminded_at FROM permission_rules WHERE id = '${String(granted.body.id)}'`,
      );
      expect(row.rows[0]?.['expiry_reminded_at']).not.toBeNull();
    });
  });

  describe('POST /permission-rules/revoke — plan 15, B-13', () => {
    const revokeBatch = (ids: string[], as: string = token): request.Test =>
      http().post('/permission-rules/revoke').set('authorization', `Bearer ${as}`).send({ ids });

    it('revokes several at once, each event sharing one batchId — S-80, S-83', async () => {
      const first = await grant({ ...rule(), pattern: 'shell(git status:*)' });
      const second = await grant({ ...rule(), pattern: 'shell(git diff:*)' });

      const response = await revokeBatch([String(first.body.id), String(second.body.id)]);

      expect(response.status).toBe(200);
      expect(response.body.rules.map((r: { status: string }) => r.status)).toEqual([
        'revoked',
        'revoked',
      ]);
      const firstDetails = await context().db.execute(
        `SELECT details FROM audit_events WHERE subject_id = '${String(first.body.id)}' AND kind = 'permission.ruleRevoked'`,
      );
      const secondDetails = await context().db.execute(
        `SELECT details FROM audit_events WHERE subject_id = '${String(second.body.id)}' AND kind = 'permission.ruleRevoked'`,
      );
      expect(firstDetails.rows[0]?.['details']).toEqual(secondDetails.rows[0]?.['details']);
    });

    it('revokes nothing when one id in the lot does not exist — S-81, S-82', async () => {
      const granted = await grant();

      const response = await revokeBatch([String(granted.body.id), 'no-such-rule']);

      expect(response.status).toBe(404);
      expect((await list()).body.rules).toEqual([
        expect.objectContaining({ id: granted.body.id, status: 'active' }),
      ]);
    });

    it('is idempotent per id — already revoked comes back unchanged — S-85', async () => {
      const granted = await grant();
      await revoke(String(granted.body.id));

      const response = await revokeBatch([String(granted.body.id)]);

      expect(response.status).toBe(200);
      expect(response.body.rules[0]).toMatchObject({ status: 'revoked' });
      expect(await trailFor(String(granted.body.id))).toEqual([
        'permission.ruleGranted',
        'permission.ruleRevoked',
      ]);
    });

    it('answers `400` for an empty lot, or more than the ceiling — S-84', async () => {
      expect((await revokeBatch([])).status).toBe(400);
      expect((await revokeBatch(Array.from({ length: 101 }, (_, i) => `rule-${i}`))).status).toBe(
        400,
      );
    });
  });

  describe('POST /permission-rules/restore — plan 15, B-13', () => {
    const restore = (ids: string[], as: string = token): request.Test =>
      http().post('/permission-rules/restore').set('authorization', `Bearer ${as}`).send({ ids });

    it('restores a revoked rule within the window — S-87, S-88', async () => {
      const granted = await grant();
      await revoke(String(granted.body.id));

      const response = await restore([String(granted.body.id)]);

      expect(response.status).toBe(201);
      expect(response.body.rules[0]).toMatchObject({
        pattern: granted.body.pattern,
        status: 'active',
        grantedVia: 'restore',
        restoredFrom: granted.body.id,
      });
      expect(await trailFor(String(response.body.rules[0].id))).toEqual(['permission.ruleGranted']);
    });

    it('answers `409` for a rule that was never revoked — S-89', async () => {
      const granted = await grant();

      const response = await restore([String(granted.body.id)]);

      expect(response.status).toBe(409);
      expect(response.body.error).toMatchObject({
        code: 'PERMISSION_RULE_STATE_CONFLICT',
        params: { status: 'active' },
      });
    });

    it('confers breadth again — an old unbounded allow does not come back — S-90', async () => {
      const granted = await grant({ pattern: 'shell', decision: 'deny', scope: 'always' });
      await revoke(String(granted.body.id));
      // `deny` is never too broad — flip it to `allow` directly, as a rule granted before the
      // breadth check existed would read (the card never confronts breadth either, S-34).
      await context().db.execute(
        `UPDATE permission_rules SET decision = 'allow' WHERE id = '${String(granted.body.id)}'`,
      );

      const response = await restore([String(granted.body.id)]);

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('PERMISSION_RULE_TOO_BROAD');
    });

    it('restoring twice gives one rule each time, never a duplicate row — S-91', async () => {
      const granted = await grant();
      await revoke(String(granted.body.id));

      const [first, second] = await Promise.all([
        restore([String(granted.body.id)]),
        restore([String(granted.body.id)]),
      ]);

      expect([first.status, second.status]).toEqual([201, 201]);
      expect(second.body.rules[0].id).toBe(first.body.rules[0].id);
      expect(await rowCount()).toBe(2); // the original, revoked, and the one restored rule
    });

    it('answers `403` for somebody else`s revoked rule — S-93', async () => {
      const granted = await grant();
      await revoke(String(granted.body.id));

      const response = await restore([String(granted.body.id)], otherToken);

      expect(response.status).toBe(403);
    });

    it('answers `404` for a rule that does not exist', async () => {
      const response = await restore(['no-such-rule']);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /permission-rules/evaluate', () => {
    const evaluate = (body: Record<string, unknown>, as: string = token): request.Test =>
      http().post('/permission-rules/evaluate').set('authorization', `Bearer ${as}`).send(body);

    it('lets a matching allow through, naming the rule and the reason — S-94', async () => {
      const granted = await grant();

      const response = await evaluate({
        engine: 'claude',
        kind: 'shell',
        subject: { command: 'git status' },
        folder: PROJECT,
      });

      expect(response.status).toBe(200);
      expect(response.body.outcome).toBe('allow');
      expect(response.body.answeringRule.id).toBe(granted.body.id);
      expect(response.body.reasons).toEqual(['ruleAnswers']);
    });

    it('asks when nothing matches, with every caveat the engine declares — S-97, S-106', async () => {
      const response = await evaluate({
        engine: 'claude',
        kind: 'shell',
        subject: { command: 'git status' },
      });

      expect(response.status).toBe(200);
      expect(response.body.outcome).toBe('ask');
      expect(response.body.reasons).toEqual(['noRule']);
      expect(response.body.caveats.length).toBeGreaterThan(0);
    });

    it('includes a draft as one more rule, not persisted — S-104', async () => {
      const response = await evaluate({
        engine: 'claude',
        kind: 'shell',
        subject: { command: 'git status' },
        draft: { pattern: 'shell(git status:*)', decision: 'deny' },
      });

      expect(response.status).toBe(200);
      expect(response.body.outcome).toBe('deny');
      expect(await rowCount()).toBe(0);
    });

    it('refuses a folder outside the allowlist — S-99', async () => {
      const response = await evaluate({
        engine: 'claude',
        kind: 'shell',
        subject: { command: 'git status' },
        folder: '/not/in/the/allowlist',
      });

      expect(response.status).toBe(403);
    });

    it('never has a side effect — the rule count stays the same', async () => {
      await grant();

      await evaluate({
        engine: 'claude',
        kind: 'shell',
        subject: { command: 'git status' },
        folder: PROJECT,
      });

      expect(await rowCount()).toBe(1);
    });

    // A hypothetical test (the screen's own "Testar um comando", B-14) names no live session and
    // so has no engine to read one from — `engine` absent falls back to the installation's own
    // default, the same way a draft's own `engine` already did (`RuleDialects.translate`). Found
    // missing while writing plan 15's own first e2e spec (B-33): the schema required it, the web
    // never sent it, and no test before this one ever omitted it.
    it('answers a hypothetical call naming no engine at all, under the installation’s own default', async () => {
      const granted = await grant();

      const response = await evaluate({
        kind: 'shell',
        subject: { command: 'git status' },
        folder: PROJECT,
      });

      expect(response.status).toBe(200);
      expect(response.body.outcome).toBe('allow');
      expect(response.body.answeringRule.id).toBe(granted.body.id);
    });
  });

  describe('POST /permission-rules/preview', () => {
    const preview = (body: Record<string, unknown>, as: string = token): request.Test =>
      http().post('/permission-rules/preview').set('authorization', `Bearer ${as}`).send(body);

    it('describes the reach and breadth of a pattern nobody has granted yet', async () => {
      const response = await preview({
        pattern: 'shell(git push --force:*)',
        decision: 'allow',
        scope: 'always',
      });

      expect(response.status).toBe(200);
      expect(response.body.breadth).toBe('narrow');
      expect(response.body.reach).toMatchObject({ kind: 'shell', form: 'prefix' });
    });

    it('finds what the draft would mean against the active rules — S-110', async () => {
      await grant();

      const response = await preview(rule());

      expect(response.body.findings).toEqual([
        {
          kind: 'identical',
          ruleIds: [expect.any(String)],
          messageKey: 'permission.ruleFinding.identical',
          params: {},
        },
      ]);
    });

    it('refuses a pattern outside the canonical grammar — S-118', async () => {
      const response = await preview({
        pattern: 'Bash(git status:*)',
        decision: 'allow',
        scope: 'always',
      });

      expect(response.status).toBe(400);
    });

    it('never writes anything — only a read of the active rules', async () => {
      await preview({ pattern: 'shell(git status:*)', decision: 'allow', scope: 'always' });

      expect(await rowCount()).toBe(0);
    });
  });

  describe('POST /permission-rules/simulate — plan 15, B-16', () => {
    const simulate = (body: Record<string, unknown>, as: string = token): request.Test =>
      http().post('/permission-rules/simulate').set('authorization', `Bearer ${as}`).send(body);

    /** One decided entry of the caller's own, disclosed the same way `GET /audit-entries` would. */
    const recordDecision = async (id: string, decision: 'allowed' | 'denied'): Promise<void> => {
      await context().db.execute(
        `INSERT INTO audit_entries (id, user_id, session_id, tool_use_id, tool_name, tool_kind, input, decision, rule_id, scope, auto, at)
         VALUES ('${id}', '${SUBJECT}', '01J0ZZZZZZZZZZZZZZZZZZZZZZ', null, 'Bash', 'shell', '{"command":"git status"}', '${decision}', null, null, false, now())`,
      );
    };

    it('says what adding a deny would change, against the caller’s real last invocations — S-123', async () => {
      await recordDecision('sim-add-1', 'allowed');

      const response = await simulate({
        add: [{ pattern: 'shell(git status:*)', decision: 'deny' }],
      });

      expect(response.status).toBe(200);
      const change = (response.body.changes as Array<Record<string, unknown>>).find(
        (item) => (item['entry'] as Record<string, unknown>)['id'] === 'sim-add-1',
      );
      expect(change).toMatchObject({ before: 'allow', after: 'deny' });
      expect(response.body.assumedMode).toBe('ask');
    });

    it('refuses to remove somebody else’s rule, and reads nothing — S-131', async () => {
      const theirs = await grant(
        { ...rule(), scope: 'always', projectPath: undefined },
        otherToken,
      );

      const response = await simulate({ remove: [String(theirs.body.id)] });

      expect(response.status).toBe(403);
    });

    it('never writes anything, nor leaves an event behind, and repeating gives the same result — S-128', async () => {
      await recordDecision('sim-side-effect', 'allowed');
      const body = { add: [{ pattern: 'shell(rm:*)', decision: 'deny' }] };

      const first = await simulate(body);
      const second = await simulate(body);

      expect(await rowCount()).toBe(0);
      expect(second.body).toEqual(first.body);
    });

    it('answers `400` past the ceiling of `add`, `remove` or `limit` — S-126, S-130', async () => {
      expect(
        (
          await simulate({
            add: Array.from({ length: 11 }, () => ({
              pattern: 'shell(git status:*)',
              decision: 'allow',
            })),
          })
        ).status,
      ).toBe(400);
      expect(
        (await simulate({ remove: Array.from({ length: 101 }, (_, i) => `rule-${String(i)}`) }))
          .status,
      ).toBe(400);
      expect((await simulate({ limit: 1001 })).status).toBe(400);
    });

    it('accepts `limit` at 1 and at the ceiling of 1000 — S-126', async () => {
      expect((await simulate({ limit: 1 })).status).toBe(200);
      expect((await simulate({ limit: 1000 })).status).toBe(200);
    });
  });

  describe('the table itself', () => {
    it('refuses a project rule without its project, whoever writes it', async () => {
      await expect(
        context().db.execute(
          `INSERT INTO permission_rules (id, user_id, scope, pattern, decision, granted_at, expires_at, grammar)
           VALUES ('r1', 'u', 'project', 'shell', 'allow', now(), now() + interval '1 hour', 'canonical')`,
        ),
      ).rejects.toThrow();
    });

    it('refuses a rule that expires before it was granted, whoever writes it', async () => {
      await expect(
        context().db.execute(
          `INSERT INTO permission_rules (id, user_id, scope, pattern, decision, granted_at, expires_at, grammar)
           VALUES ('r2', 'u', 'always', 'shell', 'allow', now(), now(), 'canonical')`,
        ),
      ).rejects.toThrow();
    });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

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

const PROJECT = '/srv/projects/app';

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

  const rule = {
    pattern: 'Bash(git status:*)',
    decision: 'allow',
    scope: 'project',
    projectPath: PROJECT,
  };

  const grant = (body: Record<string, unknown> = rule, as: string = token): request.Test =>
    http().post('/permission-rules').set('authorization', `Bearer ${as}`).send(body);

  const revoke = (ruleId: string, as: string = token): request.Test =>
    http().delete(`/permission-rules/${ruleId}`).set('authorization', `Bearer ${as}`);

  const list = (as: string = token): request.Test =>
    http().get('/permission-rules').set('authorization', `Bearer ${as}`);

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
        toolName: 'Bash',
        pattern: 'Bash(git status:*)',
        decision: 'allow',
        projectPath: PROJECT,
        grantedBy: SUBJECT,
        status: 'active',
        revokedAt: null,
      });
      const lifetime =
        Date.parse(String(response.body.expiresAt)) - Date.parse(String(response.body.grantedAt));
      expect(lifetime).toBe(DEFAULT_LIFETIME_MS);
    });

    it('normalises the project path the way a session`s workspace is', async () => {
      const response = await grant({ ...rule, projectPath: `${PROJECT}/` });

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
      const response = await grant({ ...rule, pattern: 'Bash(git *' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: 'PERMISSION_RULE_PATTERN_INVALID',
        messageKey: 'permission.error.rulePatternInvalid',
      });
      expect(await rowCount()).toBe(0);
    });

    it('accepts a lifetime at the ceiling', async () => {
      // A minute short of it, since the request takes time to reach the server and the ceiling is
      // measured from the moment of the grant there.
      const response = await grant({ ...rule, expiresAt: inFuture(MAX_LIFETIME_MS - 60_000) });

      expect(response.status).toBe(201);
    });

    it('refuses a lifetime past the ceiling, with 422, instead of cutting it — S-49', async () => {
      const response = await grant({ ...rule, expiresAt: inFuture(MAX_LIFETIME_MS + 60_000) });

      expect(response.status).toBe(422);
      expect(response.body.error).toMatchObject({
        code: 'PERMISSION_RULE_EXPIRY_TOO_LONG',
        params: { maxMs: MAX_LIFETIME_MS },
      });
      expect(await rowCount()).toBe(0);
    });

    it('refuses a rule that would already be over — S-61', async () => {
      const response = await grant({ ...rule, expiresAt: new Date(Date.now() - 1).toISOString() });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: 'INVALID_INPUT',
        messageKey: 'permission.error.ruleExpiryInvalid',
      });
    });

    it('refuses a project rule that names no project', async () => {
      const response = await grant({ pattern: 'Bash', decision: 'allow', scope: 'project' });

      expect(response.status).toBe(400);
      expect(response.body.error.messageKey).toBe('permission.error.scopeUnsupported');
    });

    it.each<[Record<string, unknown>, string]>([
      [{ ...rule, scope: 'session' }, 'a session rule, which is granted from the card'],
      [{ ...rule, decision: 'maybe' }, 'a third decision'],
      [{ ...rule, expiresAt: 'tomorrow' }, 'a date that is not one'],
      [{ ...rule, pattern: '' }, 'an empty pattern'],
    ])('refuses %j at the edge — %s', async (body) => {
      const response = await grant(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('refuses a caller with no credential, with 401', async () => {
      const response = await http().post('/permission-rules').send(rule);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /permission-rules', () => {
    it('lists only the caller`s rules, newest first', async () => {
      await grant({ ...rule, pattern: 'Bash(ls)' });
      await grant({ ...rule, pattern: 'Bash(pwd)', scope: 'always', projectPath: undefined });
      await grant({ ...rule, pattern: 'Bash(id)' }, otherToken);

      const response = await list();

      expect(response.status).toBe(200);
      expect(
        response.body.rules.map((listed: { pattern: string; scope: string }) => [
          listed.pattern,
          listed.scope,
        ]),
      ).toEqual([
        ['Bash(pwd)', 'always'],
        ['Bash(ls)', 'project'],
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

    it('is empty, not an error, for somebody with no rule', async () => {
      expect((await list(otherToken)).body).toEqual({ rules: [] });
    });
  });

  describe('GET /permission-rules/:ruleId', () => {
    const open = (ruleId: string, as: string = token): request.Test =>
      http().get(`/permission-rules/${ruleId}`).set('authorization', `Bearer ${as}`);

    it('opens an active rule, with `200`', async () => {
      const granted = await grant();

      const response = await open(String(granted.body.id));

      expect(response.status).toBe(200);
      expect(response.body).toEqual(granted.body);
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

  describe('the table itself', () => {
    it('refuses a project rule without its project, whoever writes it', async () => {
      await expect(
        context().db.execute(
          `INSERT INTO permission_rules (id, user_id, scope, pattern, decision, granted_at, expires_at)
           VALUES ('r1', 'u', 'project', 'Bash', 'allow', now(), now() + interval '1 hour')`,
        ),
      ).rejects.toThrow();
    });

    it('refuses a rule that expires before it was granted, whoever writes it', async () => {
      await expect(
        context().db.execute(
          `INSERT INTO permission_rules (id, user_id, scope, pattern, decision, granted_at, expires_at)
           VALUES ('r2', 'u', 'always', 'Bash', 'allow', now(), now())`,
        ),
      ).rejects.toThrow();
    });
  });
});

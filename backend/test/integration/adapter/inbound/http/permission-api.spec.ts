import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  EndSessionPermissionsUseCase,
  ExtendPermissionUseCase,
  PermissionSettlement,
  PermissionRegistry,
  RequestPermissionUseCase,
  ResolvePermissionUseCase,
} from '@application/permission';
import { UserId } from '@domain/auth';
import { PermissionRequest } from '@domain/permission';
import { SessionId } from '@domain/session';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/** The second account, used wherever the rule is about one user not reaching another's. */
const OTHER = 'auth|other';

/** The session every request of this suite is asked in. */
const SESSION = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');

/** A session that exists as an id and owns none of this suite's requests. */
const ELSEWHERE = '01J0ZZZZZZZZZZZZZZZZZZZZZZ';

/**
 * `GET /sessions/:sessionId/permissions/:requestId`, against the real application.
 *
 * The filter, the guard and the container are the real ones, and so is the registry the socket
 * replays from — the requests are asked through the same use case `canUseTool` calls. Only the
 * deadline is taken out of the timing: a minute long, so a pending request stays pending however
 * loaded the machine is, and the expired case is produced by settling with the very answer the
 * deadline gives rather than by waiting for it.
 */
describe('the permission HTTP surface', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    harness = await startTestApp(database.url, identity, (builder) => builder, undefined, {
      RC_PERMISSION_TIMEOUT_MS: '60000',
      // Longer than the deadline, or extending would reach no further and spend nothing.
      RC_PERMISSION_EXTENSION_MS: '120000',
    });
    token = await identity.accessToken({ subject: SUBJECT });
    otherToken = await identity.accessToken({ subject: OTHER });
  });

  afterAll(async () => {
    // Settles whatever is still open, so no minute-long deadline outlives the suite.
    await harness.app.get(EndSessionPermissionsUseCase).execute(SESSION);
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  const revalidate = (requestId: string, bearer: string = token, sessionId = SESSION.value) =>
    http()
      .get(`/sessions/${sessionId}/permissions/${requestId}`)
      .set('authorization', `Bearer ${bearer}`);

  /** A question put exactly the way the session runtime puts one. */
  async function asked(requestId: string): Promise<void> {
    await harness.app.get(RequestPermissionUseCase).execute({
      requestId,
      sessionId: SESSION,
      userId: UserId.create(SUBJECT),
      projectPath: null,
      permissionMode: 'default',
      toolUseId: `toolu-${requestId}`,
      toolName: 'Bash',
      input: { command: 'rm -rf build/' },
    });
  }

  it('answers a pending request with the payload the socket would send — S-45', async () => {
    await asked('request-pending');
    await harness.app.get(ExtendPermissionUseCase).execute({
      requestId: 'request-pending',
      userId: UserId.create(SUBJECT),
      watchesSession: () => true,
    });

    const response = await revalidate('request-pending');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'pending',
      request: {
        requestId: 'request-pending',
        toolUseId: 'toolu-request-pending',
        toolName: 'Bash',
        title: 'permission.tool.Bash',
        description: 'rm -rf build/',
        input: { command: 'rm -rf build/' },
        riskHint: 'destructive',
        defaultToNo: true,
        expiresAt: expect.any(String),
        suggestions: [
          { scope: 'once', labelKey: 'permission.scope.once' },
          { scope: 'session', labelKey: 'permission.scope.session' },
          // No `project`: this request was opened with no workspace, and a project rule needs one.
          {
            scope: 'always',
            labelKey: 'permission.scope.always',
            pattern: 'Bash(rm -rf build/)',
            lifetimeMs: 3_600_000,
          },
        ],
      },
      // Two allowed by the suite's configuration, one already spent above.
      remainingExtensions: 1,
    });
  });

  it('answers a settled request with who settled it, and from where — S-46', async () => {
    await asked('request-answered');
    await harness.app.get(ResolvePermissionUseCase).execute({
      requestId: 'request-answered',
      decision: 'allow',
      reason: null,
      scope: 'once',
      userId: UserId.create(SUBJECT),
      resolvedFrom: 'web',
      watchesSession: () => true,
    });

    const response = await revalidate('request-answered');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'resolved',
      requestId: 'request-answered',
      decision: 'allow',
      auto: false,
      resolvedBy: SUBJECT,
      resolvedFrom: 'web',
    });
  });

  it('answers 410 for a request the deadline already refused — S-57', async () => {
    await asked('request-expired');
    const registry = harness.app.get(PermissionRegistry);
    const expired = registry.find('request-expired') as PermissionRequest;
    await harness.app
      .get(PermissionSettlement)
      .settle(expired, PermissionRequest.expiry(new Date()), { announce: true });

    const response = await revalidate('request-expired');

    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe('PERMISSION_REQUEST_EXPIRED');
    expect(response.body.error.httpEquivalent).toBe(410);
  });

  it('answers 404 for an id this process never saw', async () => {
    const response = await revalidate('request-never-asked');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PERMISSION_REQUEST_NOT_FOUND');
  });

  it('answers 403 for somebody else, and says nothing of the request — S-79', async () => {
    await asked('request-private');

    const response = await revalidate('request-private', otherToken);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PERMISSION_NOT_OWNED');
    // The refusal carries no field of the request: a stranger learns it exists, not what it asks.
    expect(JSON.stringify(response.body)).not.toContain('rm -rf');
  });

  it('answers 404 under a session the request is not of — S-80', async () => {
    await asked('request-misrouted');

    const response = await revalidate('request-misrouted', token, ELSEWHERE);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PERMISSION_REQUEST_NOT_FOUND');
  });

  it('answers 401 without a credential', async () => {
    const response = await http().get(`/sessions/${SESSION.value}/permissions/request-pending`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('logs both sides of the call at debug, like every other route', async () => {
    await revalidate('request-never-asked');

    // The interceptor is global, so a new controller gets it without asking — this proves it did.
    const url = `/sessions/${SESSION.value}/permissions/request-never-asked`;
    const edges = harness.log.lines
      .filter((line) => line['url'] === url)
      .map((line) => `${line.level}:${String(line['op'])}`);

    expect(edges).toEqual(expect.arrayContaining(['debug:http.request', 'debug:http.response']));
  });
});

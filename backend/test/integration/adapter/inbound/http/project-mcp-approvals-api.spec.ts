import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/engines/claude/query.factory';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

const OTHER = 'auth|project-mcp-other';

/**
 * `.mcp.json` approval, over HTTP, through the real application and a real PostgreSQL (plan 13,
 * B-24; D-11) — real files on disk because the climb, `.git` detection and the digest it computes
 * are exactly what a mocked filesystem cannot prove honestly.
 */
describe("the approval of a project's own MCP file — plan 13, B-24", () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  let other: string;
  let cases = 0;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT, OTHER]);
    root = allowlist.root;

    const createQuery: QueryFactory = (params) =>
      scriptedSdk({ fixture: 'text-turn' }).createQuery(params);
    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(createQuery),
      allowlist,
    );
    token = await identity.accessToken({ subject: SUBJECT });
    other = await identity.accessToken({ subject: OTHER });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    harness.log.lines.length = 0;
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const asAuth = (req: request.Test, as = token): request.Test =>
    req.set('authorization', `Bearer ${as}`);
  const get = (route: string, as = token) => asAuth(http().get(route), as);
  const put = (route: string, body: object, as = token) => asAuth(http().put(route), as).send(body);
  const del = (route: string, as = token) => asAuth(http().delete(route), as);

  function writeMcpJson(dir: string, content: unknown): void {
    writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify(content), 'utf8');
  }

  /**
   * A fresh folder of its own, with its own `.git` — every test gets one, never shared: an
   * `audit_events` row cannot be deleted (a 90-day retention floor refuses it), so two tests
   * naming the same (folder, name) would see each other's audit rows forever after.
   */
  function newCase(): string {
    cases += 1;
    const dir = path.join(root, `case-${String(cases)}`);
    mkdirSync(path.join(dir, '.git'), { recursive: true });
    return dir;
  }

  async function auditedKinds(subjectId: string): Promise<readonly string[]> {
    const rows = await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute(sql`SELECT kind, details FROM audit_events WHERE subject_id = ${subjectId}`);
    return rows.rows.map((row) => String((row as { kind: unknown }).kind));
  }

  it('shows pending for an entry nobody has decided on — S-100', async () => {
    const folder = newCase();
    writeMcpJson(folder, {
      mcpServers: { docs: { command: 'npx', args: ['-y', 'server'], env: { TOKEN: '${TOKEN}' } } },
    });

    const read = await get(
      `/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`,
    );

    expect(read.status).toBe(200);
    expect(read.body.servers).toHaveLength(1);
    expect(read.body.servers[0]).toMatchObject({
      folderPath: folder,
      name: 'docs',
      state: 'pending',
      env: [{ name: 'TOKEN', value: '${TOKEN}' }],
    });
    // S-105: the literal form travels unresolved and unredacted — there is no secret of ours here.
    expect(JSON.stringify(read.body)).toContain('${TOKEN}');
  });

  it('approves a remote entry, carrying its headers literal through to the client', async () => {
    const folder = newCase();
    writeMcpJson(folder, {
      mcpServers: {
        figma: {
          type: 'sse',
          url: 'https://mcp.example.com/figma',
          headers: { Authorization: 'Bearer ${TOKEN}' },
        },
      },
    });
    const shown = (
      await get(`/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`)
    ).body.servers[0];

    const approved = await put('/engines/claude/project-mcp-approvals', {
      folder,
      name: 'figma',
      digest: shown.digest,
    });

    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({
      state: 'approved',
      transport: 'sse',
      url: 'https://mcp.example.com/figma',
      headers: [{ name: 'Authorization', value: 'Bearer ${TOKEN}' }],
    });
  });

  it('approves at the digest shown, and a session opened afterwards has the server — S-101', async () => {
    const folder = newCase();
    writeMcpJson(folder, { mcpServers: { docs: { command: 'npx', args: ['-y', 'server'] } } });
    const shown = (
      await get(`/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`)
    ).body.servers[0];

    const approved = await put('/engines/claude/project-mcp-approvals', {
      folder,
      name: 'docs',
      digest: shown.digest,
    });
    expect(approved.status).toBe(200);
    expect(approved.body.state).toBe('approved');

    const socket = await TestSocket.open(harness.url);
    socket.send(
      commandFrame('connection.authenticate', {
        token,
        locale: 'en',
        client: { kind: 'web', version: '0.0.0' },
      }),
    );
    await socket.next();
    socket.send(commandFrame('session.start', { workspacePath: folder }));
    let started: Envelope | undefined;
    for (let taken = 0; taken < 200 && started === undefined; taken += 1) {
      const frame = await socket.next();
      if (frame.type === 'session.started') {
        started = frame;
      }
    }
    const sessionId = String(started?.payload?.['sessionId']);

    const status = await get(`/sessions/${sessionId}/mcp-servers`);
    expect(status.body.servers).toContainEqual(
      expect.objectContaining({ name: 'docs', status: 'connected' }),
    );
    socket.close();
  });

  it('refuses a digest that no longer matches — the file changed in between — S-102', async () => {
    const folder = newCase();
    writeMcpJson(folder, { mcpServers: { docs: { command: 'npx' } } });
    const shown = (
      await get(`/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`)
    ).body.servers[0];

    writeMcpJson(folder, { mcpServers: { docs: { command: 'node' } } });
    const approve = await put('/engines/claude/project-mcp-approvals', {
      folder,
      name: 'docs',
      digest: shown.digest,
    });

    expect(approve.status).toBe(409);
    expect(approve.body.error.code).toBe('MCP_APPROVAL_STALE');
  });

  it("shows changed once an approved entry's file is edited, and stays approved until then — S-103", async () => {
    const folder = newCase();
    writeMcpJson(folder, { mcpServers: { docs: { command: 'npx' } } });
    const shown = (
      await get(`/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`)
    ).body.servers[0];
    await put('/engines/claude/project-mcp-approvals', {
      folder,
      name: 'docs',
      digest: shown.digest,
    });

    const stillApproved = await get(
      `/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`,
    );
    expect(stillApproved.body.servers[0].state).toBe('approved');

    writeMcpJson(folder, { mcpServers: { docs: { command: 'node' } } });
    const nowChanged = await get(
      `/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`,
    );
    expect(nowChanged.body.servers[0].state).toBe('changed');
  });

  it('a changed entry carries what was actually approved beside the current content — plan 13, B-28, D-80, S-136', async () => {
    const folder = newCase();
    writeMcpJson(folder, {
      mcpServers: { docs: { command: 'npx', env: { TOKEN: '${TOKEN}' } } },
    });
    const shown = (
      await get(`/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`)
    ).body.servers[0];
    await put('/engines/claude/project-mcp-approvals', {
      folder,
      name: 'docs',
      digest: shown.digest,
    });

    writeMcpJson(folder, { mcpServers: { docs: { command: 'node' } } });
    const changed = await get(
      `/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`,
    );

    expect(changed.body.servers[0].state).toBe('changed');
    expect(changed.body.servers[0].command).toBe('node');
    expect(changed.body.servers[0].approvedSnapshot).toMatchObject({
      command: 'npx',
      env: [{ name: 'TOKEN', value: '${TOKEN}' }],
    });
  });

  it('a pending entry, and a rejected one, carry no approved snapshot', async () => {
    const folder = newCase();
    writeMcpJson(folder, { mcpServers: { docs: { command: 'npx' } } });

    const pending = await get(
      `/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`,
    );
    expect(pending.body.servers[0].approvedSnapshot).toBeNull();

    await del(
      `/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}&name=docs`,
    );
    const rejected = await get(
      `/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`,
    );
    expect(rejected.body.servers[0].approvedSnapshot).toBeNull();
  });

  it("answers everything asked of it on its own, never reading the CLI's own approval files — S-104", async () => {
    const folder = newCase();
    writeMcpJson(folder, { mcpServers: { docs: { command: 'npx' } } });
    mkdirSync(path.join(folder, '.claude'), { recursive: true });
    writeFileSync(
      path.join(folder, '.claude', 'settings.json'),
      JSON.stringify({ enableAllProjectMcpServers: true, enabledMcpjsonServers: ['docs'] }),
      'utf8',
    );

    const read = await get(
      `/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`,
    );

    // The CLI's own file would auto-approve this if anyone read it — ours does not.
    expect(read.body.servers[0].state).toBe('pending');
  });

  it('explains a file it cannot read, with nothing of it approvable, and keeps climbing — S-106', async () => {
    const folder = newCase();
    const sub = path.join(folder, 'packages', 'app');
    mkdirSync(sub, { recursive: true });
    writeFileSync(path.join(sub, '.mcp.json'), '{not json', 'utf8');
    writeMcpJson(folder, { mcpServers: { docs: { command: 'npx' } } });

    const read = await get(
      `/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(sub)}`,
    );

    expect(read.body.errors).toContainEqual({ folderPath: sub, reason: 'malformed' });
    expect(read.body.servers).toContainEqual(expect.objectContaining({ name: 'docs' }));
  });

  it('approving the same digest twice writes nothing a second time — S-107', async () => {
    const folder = newCase();
    writeMcpJson(folder, { mcpServers: { docs: { command: 'npx' } } });
    const shown = (
      await get(`/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`)
    ).body.servers[0];

    await put('/engines/claude/project-mcp-approvals', {
      folder,
      name: 'docs',
      digest: shown.digest,
    });
    await put('/engines/claude/project-mcp-approvals', {
      folder,
      name: 'docs',
      digest: shown.digest,
    });

    const subjectId = `${folder}\u001fdocs`;
    expect(
      (await auditedKinds(subjectId)).filter((kind) => kind === 'mcp.projectServerApproved'),
    ).toHaveLength(1);
  });

  it('audits approving and rejecting, each with the command por extenso — S-108', async () => {
    const folder = newCase();
    writeMcpJson(folder, { mcpServers: { docs: { command: 'npx', args: ['-y', 'server'] } } });
    const shown = (
      await get(`/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`)
    ).body.servers[0];
    const subjectId = `${folder}\u001fdocs`;

    await put('/engines/claude/project-mcp-approvals', {
      folder,
      name: 'docs',
      digest: shown.digest,
    });
    const approvedRows = await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute(
        sql`SELECT details FROM audit_events WHERE subject_id = ${subjectId} AND kind = 'mcp.projectServerApproved'`,
      );
    expect(JSON.stringify(approvedRows.rows[0])).toContain('npx');

    const rejected = await del(
      `/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}&name=docs`,
    );
    expect(rejected.status).toBe(204);
    expect(await auditedKinds(subjectId)).toContain('mcp.projectServerRejected');
  });

  it('never shows one user’s decision to another — S-109', async () => {
    const folder = newCase();
    writeMcpJson(folder, { mcpServers: { docs: { command: 'npx' } } });
    const shown = (
      await get(`/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`)
    ).body.servers[0];
    await put('/engines/claude/project-mcp-approvals', {
      folder,
      name: 'docs',
      digest: shown.digest,
    });

    const theirs = await get(
      `/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`,
      other,
    );
    expect(theirs.body.servers[0].state).toBe('pending');
  });

  it('refuses a folder outside the allowlist, or a root of somebody else — S-110', async () => {
    const folder = newCase();
    const outside = await get('/engines/claude/project-mcp-approvals?folder=/not-allowed');
    expect(outside.status).toBe(403);
    expect(outside.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');

    // Never added to the allowlist at all: the root's own path still contains `folder`, so this is
    // "a root that exists, declared for somebody else" — FORBIDDEN, not WORKSPACE_NOT_ALLOWED.
    const stranger = await identity.accessToken({ subject: 'auth|project-mcp-stranger' });
    const forbidden = await get(
      `/engines/claude/project-mcp-approvals?folder=${encodeURIComponent(folder)}`,
      stranger,
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });
});

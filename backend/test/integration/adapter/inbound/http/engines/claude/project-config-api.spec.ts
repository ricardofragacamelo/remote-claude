import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { startPostgres } from '../../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../../../support/app/test-app';
import type { TestApp } from '../../../../../../support/app/test-app';

const OTHER = 'auth|project-config-api-other';

describe('/engines/claude/project-config — plan 13, B-31', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let other: string;
  let root: string;
  let outsideDirs: string[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT, OTHER]);
    root = allowlist.root;
    harness = await startTestApp(database.url, identity, undefined, allowlist);
    token = await identity.accessToken({ subject: SUBJECT });
    other = await identity.accessToken({ subject: OTHER });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  afterEach(() => {
    for (const dir of outsideDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    outsideDirs = [];
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const asAuth = (req: request.Test, as = token): request.Test =>
    req.set('authorization', `Bearer ${as}`);
  const get = (route: string, as = token) => asAuth(http().get(route), as);

  let caseCount = 0;
  function project(): string {
    caseCount += 1;
    const dir = path.join(root, `project-config-${String(caseCount)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  function write(dir: string, relativePath: string, content: string): void {
    const full = path.join(dir, relativePath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }

  it('answers an empty, well-shaped view for a project with no .claude/ at all (S-141)', async () => {
    const dir = project();

    const response = await get(`/engines/claude/project-config?folder=${encodeURIComponent(dir)}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      folderPath: dir,
      // No project .claude/commands or .claude/agents directory here, so neither carries a
      // project-sourced row — but the installation itself may still offer its own built-in
      // agents (never built-in commands, which B-33 filters out), so `agents` is not asserted
      // empty here: whichever CLI runs this suite has its own fixed set, outside this product's
      // control (B-01's "declared vs resolved" distinction, by example).
      commands: [],
      hooks: [],
      permissions: [],
      plugins: { enabled: [], disabled: [], enableAllProjectMcpServers: false },
      issues: [],
    });
    expect(Array.isArray(response.body.agents)).toBe(true);
    expect(
      response.body.agents.every((agent: { sourceFile: unknown }) => agent.sourceFile === null),
    ).toBe(true);
    expect(Array.isArray(response.body.memory)).toBe(true);
    expect(response.body.memory.length).toBeGreaterThan(0);
    const root = response.body.memory.find((file: { origin: string }) => file.origin === 'root');
    expect(root).toMatchObject({
      exists: false,
      loadedByRule: true,
      loadedConfirmed: null,
      diverges: false,
    });
  });

  it('lists hooks, permissions and plugins declared in settings.json (S-141, S-179…S-181)', async () => {
    const dir = project();
    write(
      dir,
      '.claude/settings.json',
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo audited' }] }],
        },
        permissions: { deny: ['Bash(rm -rf /)'], allow: ['Bash(npm test)'] },
        enabledPlugins: { 'reviewer@team': true },
        enableAllProjectMcpServers: true,
      }),
    );

    const response = await get(`/engines/claude/project-config?folder=${encodeURIComponent(dir)}`);

    expect(response.status).toBe(200);
    expect(response.body.hooks).toEqual([
      { event: 'PreToolUse', matcher: 'Bash', command: 'echo audited' },
    ]);
    expect(response.body.permissions).toEqual([
      { rule: 'Bash(rm -rf /)', kind: 'deny', appliesHere: true },
      { rule: 'Bash(npm test)', kind: 'allow', appliesHere: false },
    ]);
    expect(response.body.plugins).toEqual({
      enabled: ['reviewer@team'],
      disabled: [],
      enableAllProjectMcpServers: true,
    });
  });

  it('lists a project slash command, with its source file (S-141, S-151)', async () => {
    const dir = project();
    write(dir, '.claude/commands/review.md', '---\ndescription: review a PR\n---\nBody');

    const response = await get(`/engines/claude/project-config?folder=${encodeURIComponent(dir)}`);

    expect(response.status).toBe(200);
    expect(response.body.commands).toContainEqual(
      expect.objectContaining({ name: 'review', sourceFile: '.claude/commands/review.md' }),
    );
  });

  it('flags a subagent whose frontmatter declares permissionMode (S-175)', async () => {
    const dir = project();
    // `name:` is required for the CLI to surface a project subagent at all (measured: a subagent
    // whose frontmatter omits it is silently absent from `supportedAgents()` — it is not inferred
    // from the file name the way a slash command's is). Recorded for B-36's own "new subagent"
    // template to get right later.
    write(
      dir,
      '.claude/agents/writer.md',
      '---\nname: writer\ndescription: writes code\npermissionMode: acceptEdits\n---\n',
    );

    const response = await get(`/engines/claude/project-config?folder=${encodeURIComponent(dir)}`);

    expect(response.status).toBe(200);
    expect(response.body.agents).toContainEqual(
      expect.objectContaining({ name: 'writer', risks: ['permissionMode'] }),
    );
  });

  it('explains a malformed settings.json as an issue, without failing the rest of the read (S-143)', async () => {
    const dir = project();
    write(dir, '.claude/settings.json', '{ not valid json');
    write(dir, '.claude/commands/deploy.md', '---\ndescription: deploy\n---\n');

    const response = await get(`/engines/claude/project-config?folder=${encodeURIComponent(dir)}`);

    expect(response.status).toBe(200);
    expect(response.body.issues).toEqual([{ path: '.claude/settings.json', reason: 'malformed' }]);
    expect(response.body.commands).toContainEqual(expect.objectContaining({ name: 'deploy' }));
  });

  it('does not read a settings.json that is a symlink escaping the project root (S-144)', async () => {
    const dir = project();
    const outside = mkdtempSync(path.join(tmpdir(), 'rc-project-config-outside-'));
    outsideDirs.push(outside);
    writeFileSync(
      path.join(outside, 'settings.json'),
      JSON.stringify({ permissions: { deny: ['secret'] } }),
      'utf8',
    );
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    symlinkSync(path.join(outside, 'settings.json'), path.join(dir, '.claude', 'settings.json'));

    const response = await get(`/engines/claude/project-config?folder=${encodeURIComponent(dir)}`);

    expect(response.status).toBe(200);
    expect(response.body.issues).toEqual([
      { path: '.claude/settings.json', reason: 'linkEscapesRoot' },
    ]);
    expect(response.body.permissions).toEqual([]);
  });

  it('reuses the cached read on an unchanged .claude/, and sees a new command once it changes (S-147)', async () => {
    const dir = project();
    write(dir, '.claude/commands/first.md', '---\ndescription: one\n---\n');

    const first = await get(`/engines/claude/project-config?folder=${encodeURIComponent(dir)}`);
    expect(first.body.commands).toHaveLength(1);

    const second = await get(`/engines/claude/project-config?folder=${encodeURIComponent(dir)}`);
    expect(second.body.commands).toHaveLength(1);

    write(dir, '.claude/commands/second.md', '---\ndescription: two\n---\n');
    // Deterministic instead of depending on real clock resolution between two fast writes landing
    // in the same directory (the filesystem's mtime granularity can be coarser than the time this
    // whole request/response round trip takes).
    const future = new Date(Date.now() + 60_000);
    utimesSync(path.join(dir, '.claude', 'commands'), future, future);

    const third = await get(`/engines/claude/project-config?folder=${encodeURIComponent(dir)}`);
    expect(third.body.commands).toHaveLength(2);
  });

  it('refuses a folder outside the allowlist (S-142)', async () => {
    const response = await get('/engines/claude/project-config?folder=/not/allowed');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
  });

  it('a second, unrelated caller sharing the same allowlist root reads the same view (not ownership-scoped)', async () => {
    const dir = project();
    const response = await get(
      `/engines/claude/project-config?folder=${encodeURIComponent(dir)}`,
      other,
    );
    expect(response.status).toBe(200);
  });

  it('rejects a request with no bearer token at all', async () => {
    const dir = project();
    const response = await http().get(
      `/engines/claude/project-config?folder=${encodeURIComponent(dir)}`,
    );
    expect(response.status).toBe(401);
  });
});

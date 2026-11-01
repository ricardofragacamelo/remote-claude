import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { callApi } from '../fixtures/api';
import { argvCarries, procEntries, processesMatching } from '../fixtures/live-process';
import { closedAfterTheRun, connected, startSession, workspaceFor } from '../fixtures/live-session';
import { answeredUntilTheTurnEnds, endedWithEveryMessageKnown } from '../fixtures/live-turns';
import { removeMcpServerNamed } from '../fixtures/project-mcp';
import { trailOf } from '../fixtures/rules';
import { scenario } from '../scenarios';

/**
 * 13·S-196…S-198 — what only the real Claude confirms about this plan's own composition, under
 * `strictMcpConfig`: a fixture MCP server added through the real store reaches `connected`, its
 * tool is asked through `canUseTool`/`PreToolUse` (D-13), and its secret never appears on the
 * subprocess's own command line (D-02). And a project subagent whose frontmatter widens the mode
 * to `acceptEdits` still asks before it writes (D-23) — or, if a newer CLI lets it through, the
 * run records that measured fact instead of failing silently.
 *
 * Everything runs in a folder made for the run, gone at the end — the same shape as the other
 * `smoke-live` specs ([claude-panel.spec.ts](claude-panel.spec.ts)).
 */

const live = scenario('live-claude-settings');
const expected = live.expect as {
  serverName: string;
  secretName: string;
  echoPrompt: string;
  subagentName: string;
  subagentFile: string;
  writeInstruction: string;
  writtenFile: string;
};

const context = workspaceFor(live.user);
const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const fixtureServerScript = path.join(
  repoRoot,
  'e2e',
  'fixtures',
  'mcp-server',
  'fixture-mcp-server.mjs',
);

/** A folder made for this run alone, gone at the end. */
function throwawayFolder(root: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(root, 'rc-settings-')));
}

/** Adds the fixture MCP server to this user's own store, scoped to [folder]. */
async function addFixtureServer(folder: string, secretValue: string): Promise<void> {
  const response = await callApi(context().user, '/engines/claude/mcp-servers', {
    method: 'POST',
    body: {
      name: expected.serverName,
      scope: 'folder',
      folderPath: folder,
      transport: 'stdio',
      command: 'node',
      args: [
        fixtureServerScript,
        '--name',
        expected.serverName,
        '--secret-variable',
        expected.secretName,
      ],
      env: [{ name: expected.secretName, value: secretValue }],
    },
  });
  expect(response.status).toBe(201);
}

/** Polls a session's own MCP indicator until nothing is left `pending`, or the bound runs out. */
async function connectedServers(
  sessionId: string,
  boundMs = 20_000,
): Promise<readonly { name: string; status: string }[]> {
  const started = Date.now();
  for (;;) {
    const response = await callApi(context().user, `/sessions/${sessionId}/mcp-servers`);
    expect(response.status).toBe(200);
    const { servers } = (await response.json()) as {
      servers: readonly { name: string; status: string }[];
    };
    if (!servers.some((server) => server.status === 'pending') || Date.now() - started > boundMs) {
      return servers;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

test(`${live.id} — the real Claude: a composed MCP server connects, its tool is asked, its secret stays off the cmdline, and a wider subagent still asks`, async () => {
  const folder = throwawayFolder(context().workspace);
  const secretValue = `smoke-live-${randomUUID()}`;
  await removeMcpServerNamed(context().user, expected.serverName);
  await addFixtureServer(folder, secretValue);

  fs.mkdirSync(path.join(folder, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(folder, '.claude', 'agents', `${expected.subagentName}.md`),
    expected.subagentFile,
  );

  const socket = await connected(context().user);

  try {
    const sessionId = await startSession(socket, folder);

    // S-196 — models and account are not empty; the composed server leaves `pending` and connects.
    const models = await callApi(context().user, `/sessions/${sessionId}/models`);
    expect(models.status).toBe(200);
    expect(((await models.json()) as { models: unknown[] }).models.length).toBeGreaterThan(0);
    const account = await callApi(context().user, '/engines/claude/account');
    expect(account.status).toBe(200);

    const servers = await connectedServers(sessionId);
    expect(servers.find((server) => server.name === expected.serverName)?.status).toBe('connected');

    // S-196 — the tool is asked through canUseTool/PreToolUse: the trail records it either way.
    const mark = socket.frames.length;
    socket.send('session.prompt', { sessionId, text: expected.echoPrompt });
    const echo = await answeredUntilTheTurnEnds(
      socket,
      () => true,
      'smoke-live allows the one MCP tool this turn can ask for',
      mark,
    );
    expect(
      echo.asked.some((call) => call.startsWith(`mcp__${expected.serverName}__echo:true`)),
    ).toBe(true);
    const trail = await trailOf(context().user, sessionId);
    expect(trail.some((entry) => entry.toolName === `mcp__${expected.serverName}__echo`)).toBe(
      true,
    );

    // S-196 — the secret never reaches the subprocess's own command line, only its masked form.
    const matches = processesMatching(procEntries(), [fixtureServerScript, expected.serverName]);
    expect(matches.length).toBeGreaterThan(0);
    for (const process of matches) {
      expect(argvCarries(process.argv, secretValue)).toBe(false);
    }

    // S-198 — a project subagent's own `permissionMode: acceptEdits` still asks before it writes
    // (D-23): the mark is the second turn's own, so an earlier `mcp__…:true` is never counted twice.
    const writtenPath = path.join(folder, expected.writtenFile);
    const delegateMark = socket.frames.length;
    socket.send('session.prompt', { sessionId, text: expected.writeInstruction });
    const delegated = await answeredUntilTheTurnEnds(
      socket,
      () => true,
      'smoke-live allows the one write this turn asks for',
      delegateMark,
    );
    const askedForWrite = delegated.asked.some((call) => call.startsWith('Write:'));
    const written = fs.existsSync(writtenPath);

    expect(written).toBe(true);
    if (!askedForWrite) {
      // Not a failure of this run: the task itself (F4-e2e.md, B-46) asks for the measured fact,
      // not a hard assertion, since a newer CLI could change what D-23's own hook sees.
      test.info().annotations.push({
        type: 'warning',
        description:
          `a project subagent with permissionMode: acceptEdits wrote ${expected.writtenFile} ` +
          'without canUseTool being asked — D-23 regression, open risk, see ' +
          'docs/plans/13-claude-settings/decisions.md#d-23',
      });
    }

    await endedWithEveryMessageKnown(socket, sessionId);
  } finally {
    closedAfterTheRun(socket, folder);
    await removeMcpServerNamed(context().user, expected.serverName);
  }
});

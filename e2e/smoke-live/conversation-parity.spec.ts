import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Envelope } from '@remote-claude/contracts';

import { closedAfterTheRun, connected, workspaceFor } from '../fixtures/live-session';
import { startConversation } from '../fixtures/history';
import { answeredUntilTheTurnEnds, endedWithEveryMessageKnown } from '../fixtures/live-turns';
import { scenario } from '../scenarios';

// Plan 26, F7 (B-31), against the real Claude — D-12 of plan 01 excuses it from every gate: it
// needs a login on this machine and spends quota, so `pnpm test:e2e:live` asks for it on purpose.
//
// Ports two of the three shapes B-01's spike measured (`scripts/conversation-parity-spike.mjs`)
// into something that keeps checking them on every CLI release, through the backend's actual WS
// contract instead of the raw SDK: S-86 (parent_tool_use_id on every frame a subagent produces) and
// S-87 (an answer's text blocks apart, in order). The spike's third shape — an MCP tool with no
// title — has nowhere to run here yet: `session.start` carries no field for an ad-hoc server, and
// won't until plan 13's settings screen gives a session one to attach.

const live = scenario('live-conversation-parity');
const expected = live.expect as {
  writerAgent: string;
  writerFile: string;
  writerAgentFile: string;
  subagentPrompt: string;
  blocksPrompt: string;
};

const context = workspaceFor(live.user);

/** A folder for one run, with the project subagent the fixture's own prompt delegates to. */
function throwawayFolder(root: string): string {
  const folder = fs.realpathSync(fs.mkdtempSync(path.join(root, 'rc-parity-')));

  fs.mkdirSync(path.join(folder, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(folder, '.claude', 'agents', `${expected.writerAgent}.md`),
    expected.writerAgentFile,
  );

  return folder;
}

/** The engine's own name of a started call — read here, by the adapter that reads it everywhere. */
function nativeOf(frame: Envelope): unknown {
  return (frame.payload as { origin?: { native?: unknown } }).origin?.native;
}

test(`${live.id} — a subagent's frames all carry parent_tool_use_id, and an answer keeps its text blocks apart`, async () => {
  const folder = throwawayFolder(context().workspace);
  const socket = await connected(context().user);

  try {
    const { sessionId } = await startConversation(socket, folder);

    // S-86 — a subagent of the project writes a file, asking for it: everything it says or does
    // carries the id of the Agent call that opened it, and the call itself is classified `agent`.
    const beforeSubagent = socket.frames.length;
    socket.send('session.prompt', { sessionId, text: expected.subagentPrompt });
    const delegated = await answeredUntilTheTurnEnds(
      socket,
      (question) => question.toolName === 'Write',
      'smoke-live only allows the Write this probe expects',
      beforeSubagent,
    );

    const agent = delegated.frames.find(
      (frame) => frame.type === 'tool.started' && nativeOf(frame) === 'Agent',
    );
    expect(agent).toBeDefined();
    expect(agent?.payload).toMatchObject({
      kind: 'agent',
      label: { messageKey: 'sessions.tool.agent', params: { type: expected.writerAgent } },
    });

    const opener = (agent?.payload as { toolUseId?: unknown }).toolUseId;
    // Strictly between the Agent call's own start and its own end — the main thread's reply that
    // follows it is a `message.completed` too, and belongs to nobody's subagent.
    const agentIndex = delegated.frames.indexOf(agent!);
    const agentDone = delegated.frames.findIndex(
      (frame, index) =>
        index > agentIndex &&
        frame.type === 'tool.completed' &&
        (frame.payload as { toolUseId?: unknown }).toolUseId === opener,
    );
    const ownedTypes = new Set([
      'message.delta',
      'message.completed',
      'tool.started',
      'tool.progress',
      'tool.completed',
    ]);
    const owned = delegated.frames
      .slice(agentIndex + 1, agentDone === -1 ? undefined : agentDone)
      .filter((frame) => ownedTypes.has(frame.type));
    expect(owned.length).toBeGreaterThan(0);
    for (const frame of owned) {
      expect(
        (frame.payload as { parentToolUseId?: unknown }).parentToolUseId,
        `${frame.type} of the subagent names the Agent call that opened it`,
      ).toBe(opener);
    }

    const write = delegated.frames.find(
      (frame) => frame.type === 'tool.started' && nativeOf(frame) === 'Write',
    );
    expect(write?.payload).toMatchObject({
      kind: 'file.write',
      parentToolUseId: opener,
    });

    // S-87 — text, a tool and text again: the blocks stay apart, each under its own id, in order.
    const beforeBlocks = socket.frames.length;
    socket.send('session.prompt', { sessionId, text: expected.blocksPrompt });
    const blocks = await answeredUntilTheTurnEnds(
      socket,
      (question) => question.toolName === 'Bash',
      'smoke-live only allows the Bash this probe expects',
      beforeBlocks,
    );

    const texts = blocks.frames.filter(
      (frame) =>
        frame.type === 'message.completed' &&
        (frame.payload as { role?: string }).role === 'assistant' &&
        ((frame.payload as { content?: { type: string }[] }).content ?? []).some(
          (block) => block.type === 'text',
        ),
    );
    const toolCalls = blocks.frames.filter((frame) => frame.type === 'tool.started');

    expect(texts.length).toBeGreaterThanOrEqual(2);
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    const blockIds = texts
      .flatMap(
        (frame) =>
          (frame.payload as { content?: { type: string; blockId?: unknown }[] }).content ?? [],
      )
      .filter((block) => block.type === 'text')
      .map((block) => block.blockId);
    expect(new Set(blockIds).size).toBe(blockIds.length);

    await endedWithEveryMessageKnown(socket, sessionId);
  } finally {
    closedAfterTheRun(socket, folder);
  }
});

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Envelope } from '@remote-claude/contracts';

import { callApi } from '../fixtures/api';
import { RED_PNG } from '../fixtures/claude-panel';
import { environment } from '../fixtures/environment';
import { startConversation, transcriptOf } from '../fixtures/history';
import { connected, workspaceFor } from '../fixtures/live-session';
import { answeredUntilTheTurnEnds, endedWithEveryMessageKnown } from '../fixtures/live-turns';
import type { E2eSocket } from '../fixtures/ws';
import { scenario } from '../scenarios';

/**
 * 08·S-270…S-272 — what the panel of Claude rests on and only the real Claude can confirm — plan 08,
 * F6, B-58.
 *
 * The hermetic suite replays recordings; these are the premises the recordings were taken under, to
 * be checked again on every new CLI: a reference is read by a `Read` the trail records (D-01), an
 * `@path` in the text is **not** expanded by the CLI behind the hook's back (R-10), the installation
 * answers for its models, its MCP servers and its context, a skill of the project is listed under the
 * name the menu inserts, an image reaches the model (D-02), and thinking and a subagent come shaped
 * as the recordings are.
 *
 * Everything runs in a folder made for the run ([04 · D-07](../../docs/plans/04-transcript-and-resume/decisions.md#d-07--onde-o-init-pode-escrever)),
 * with a codeword of its own, and gone at the end. The skills of the user and of the system are
 * plan 13's, which does not exist yet: only the project's is asserted.
 */

const live = scenario('live-panel');
const expected = live.expect as {
  notes: string;
  secret: string;
  referencePrompt: string;
  mentionPrompt: string;
  skill: string;
  skillFile: string;
  imagePrompt: string;
  colour: string;
  thinkingPrompt: string;
  subagentPrompt: string;
  readingTools: string[];
};

const context = workspaceFor(live.user);

/**
 * The folder of the run: the notes with a codeword, a secret with another one that nothing reads
 * before it is mentioned, and the skill of the project.
 */
function throwawayFolder(root: string, codeword: string, secret: string): string {
  // Real, as the session's folder is: the `Read` the trail records names it that way.
  const folder = fs.realpathSync(fs.mkdtempSync(path.join(root, 'rc-panel-')));

  fs.writeFileSync(path.join(folder, 'notes.md'), expected.notes.replace('{{codeword}}', codeword));
  fs.writeFileSync(path.join(folder, 'secret.md'), expected.secret.replace('{{codeword}}', secret));
  fs.mkdirSync(path.join(folder, '.claude', 'skills', expected.skill), { recursive: true });
  fs.writeFileSync(
    path.join(folder, '.claude', 'skills', expected.skill, 'SKILL.md'),
    expected.skillFile,
  );

  return folder;
}

/** Whether [candidate] names a place inside [folder] — or names none, as a subagent's call does. */
function insideOrNone(folder: string, candidate: unknown): boolean {
  if (candidate === undefined) {
    return true;
  }
  if (typeof candidate !== 'string') {
    return false;
  }

  const relative = path.relative(folder, path.resolve(folder, candidate));
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * One turn, its questions answered as a careful person would — reading inside the folder is
 * allowed, anything else refused — and answers the frames it produced.
 */
async function turn(
  socket: E2eSocket,
  sessionId: string,
  folder: string,
  prompt: Record<string, unknown>,
): Promise<readonly Envelope[]> {
  const mark = socket.frames.length;
  socket.send('session.prompt', { sessionId, ...prompt });

  const { frames } = await answeredUntilTheTurnEnds(
    socket,
    ({ toolName, input }) => {
      const named = (input ?? {}) as { file_path?: unknown; path?: unknown };
      return (
        expected.readingTools.includes(toolName) &&
        insideOrNone(folder, named.file_path ?? named.path)
      );
    },
    'smoke-live lets through only reading the folder of the run',
    mark,
  );

  return frames;
}

/** The blocks Claude finished in these frames — of the main conversation, or of a subagent. */
function blocksOf(
  frames: readonly Envelope[],
): { type: string; text?: string; thinking?: string }[] {
  return frames
    .filter(
      (frame) =>
        frame.type === 'message.completed' &&
        (frame.payload as { role?: string }).role === 'assistant',
    )
    .flatMap(
      (frame) =>
        (frame.payload as { content?: { type: string; text?: string; thinking?: string }[] })
          .content ?? [],
    );
}

/** What Claude said, as one string. */
function saidIn(frames: readonly Envelope[]): string {
  return blocksOf(frames)
    .map((block) => block.text ?? '')
    .join(' ');
}

/** The `Read`s of the trail of a session, by the file they read. */
async function readsOf(sessionId: string): Promise<string[]> {
  const response = await callApi(
    context().user,
    `/audit-entries?${new URLSearchParams({ sessionId, toolName: 'Read' }).toString()}`,
  );
  expect(response.status).toBe(200);
  const { entries } = (await response.json()) as {
    entries: { toolName: string; input: { file_path?: unknown } }[];
  };

  return entries
    .filter((entry) => entry.toolName === 'Read')
    .map((entry) => String(entry.input.file_path ?? ''));
}

/** Uploads an image to the session, as a drop from the desktop does, and answers its id. */
async function uploaded(sessionId: string, name: string, base64: string): Promise<string> {
  const form = new FormData();
  form.append('name', name);
  form.append('file', new Blob([Buffer.from(base64, 'base64')], { type: 'image/png' }), name);

  const response = await fetch(`${environment.backendUrl}/sessions/${sessionId}/attachments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${context().user.accessToken}` },
    body: form,
  });
  expect(response.status).toBe(201);

  return ((await response.json()) as { attachmentId: string }).attachmentId;
}

test(`${live.id} — the real Claude: references, @path, the installation, the skill, the image, thinking and a subagent`, async () => {
  const codeword = `cw-${randomUUID().slice(0, 8)}`;
  const secret = `cw-${randomUUID().slice(0, 8)}`;
  const folder = throwawayFolder(context().workspace, codeword, secret);
  const notes = path.join(folder, 'notes.md');
  const socket = await connected(context().user);

  try {
    const { sessionId, conversationId } = await startConversation(socket, folder);

    // S-270 — the installation answers about itself: its models, its MCP servers, its context.
    const models = await callApi(context().user, `/sessions/${sessionId}/models`);
    expect(models.status).toBe(200);
    expect(((await models.json()) as { models: unknown[] }).models.length).toBeGreaterThan(0);
    const servers = await callApi(context().user, `/sessions/${sessionId}/mcp-servers`);
    expect(servers.status).toBe(200);
    expect(Array.isArray(((await servers.json()) as { servers: unknown }).servers)).toBe(true);
    expect((await callApi(context().user, `/sessions/${sessionId}/context`)).status).toBe(200);

    // S-272 — the skill of the project, under the name the menu inserts.
    const menu = (await (
      await callApi(context().user, `/sessions/${sessionId}/commands`)
    ).json()) as { commands: { name: string; origin: string; label: string }[] };
    expect(menu.commands.find((command) => command.name === expected.skill)).toMatchObject({
      origin: 'project',
      label: expected.skill,
    });

    // S-270 — a reference is read by the tool, under the hook: the trail has the `Read` of it.
    const referenced = await turn(socket, sessionId, folder, {
      text: expected.referencePrompt,
      attachments: [{ kind: 'file', path: 'notes.md' }],
    });
    expect(saidIn(referenced)).not.toBe('');
    expect(await readsOf(sessionId)).toContain(notes);

    // S-273 — the prompt said on the stream is the one the conversation keeps, under the same id:
    // what an edit-and-resend forks from (D-19).
    const echoed = referenced.find(
      (frame) =>
        frame.type === 'message.completed' && (frame.payload as { role?: unknown }).role === 'user',
    );
    const kept = (await transcriptOf(context().user, conversationId)).events
      .filter((event) => event.type === 'message.completed' && event.payload['role'] === 'user')
      .map((event) => event.payload['messageId']);
    expect(kept).toContain((echoed?.payload as { messageId?: unknown } | undefined)?.messageId);

    // S-271 — `@secret.md` in the text never reaches the model behind the hook's back: unless a
    // `Read` of it is in the trail, its codeword is not known to the model.
    const mentioned = await turn(socket, sessionId, folder, { text: expected.mentionPrompt });
    const readIt = (await readsOf(sessionId)).includes(path.join(folder, 'secret.md'));
    expect(readIt || !saidIn(mentioned).includes(secret)).toBe(true);

    // S-272 — an image goes with the prompt and reaches the model.
    const attachmentId = await uploaded(sessionId, 'red.png', RED_PNG);
    const seen = await turn(socket, sessionId, folder, {
      text: expected.imagePrompt,
      attachments: [{ kind: 'upload', attachmentId }],
    });
    expect(saidIn(seen).toLowerCase()).toContain(expected.colour);

    // S-272 — thinking comes as the recordings have it: a block of its own, its text apart.
    const thought = blocksOf(
      await turn(socket, sessionId, folder, { text: expected.thinkingPrompt }),
    );
    const thinking = thought.filter((block) => block.type.includes('thinking'));
    expect(thinking.length).toBeGreaterThan(0);
    for (const block of thinking) {
      expect(['thinking', 'redacted_thinking']).toContain(block.type);
      expect(block.text).toBeUndefined();
    }

    // S-272 — a subagent's words and tools come marked with the tool that opened it.
    const delegated = await turn(socket, sessionId, folder, { text: expected.subagentPrompt });
    const agent = delegated.find(
      (frame) =>
        frame.type === 'tool.started' &&
        ['Agent', 'Task'].includes(String((frame.payload as { toolName?: unknown }).toolName)),
    );
    expect(agent).toBeDefined();
    const opener = (agent?.payload as { toolUseId?: unknown } | undefined)?.toolUseId;
    expect(
      delegated.some(
        (frame) => (frame.payload as { parentToolUseId?: unknown }).parentToolUseId === opener,
      ),
    ).toBe(true);

    await endedWithEveryMessageKnown(socket, sessionId);
  } finally {
    socket.close();
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

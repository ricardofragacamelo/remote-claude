import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

import { loadFixture } from '../../../../fakes/agent-sdk/fixture';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptOptions } from '../../../../fakes/agent-sdk/scripted-query';
import { ScriptedTranscripts } from '../../../../fakes/agent-sdk/scripted-transcripts';

const CWD = '/srv/projects/app';
const OURS = '6d0f7c52-8a43-4e57-9b1c-2f5e8d7a9c10';
const FORK = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';

/** A prompt iterable that hands over one prompt and then ends. */
async function* once(text: string): AsyncGenerator<SDKUserMessage> {
  await Promise.resolve();
  yield { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null };
}

/** Runs one scripted turn to its `result`, with every question answered yes. */
async function turn(
  script: ScriptOptions,
  options: Partial<Options>,
  text = 'Reply with the single word: pong. [fixture:text-turn]',
): Promise<SDKMessage[]> {
  const { createQuery } = scriptedSdk(script);
  const query = createQuery({
    prompt: once(text),
    options: {
      cwd: CWD,
      canUseTool: (_tool, input) => Promise.resolve({ behavior: 'allow', updatedInput: input }),
      ...options,
    },
  });

  const messages: SDKMessage[] = [];
  for await (const message of query) {
    messages.push(message);
    if (message.type === 'result') {
      break;
    }
  }

  return messages;
}

/** The API message ids the assistant answered with. */
function answerIds(messages: readonly { type: string; message?: unknown }[]): string[] {
  return messages
    .filter((message) => message.type === 'assistant')
    .map((message) => String((message.message as { id?: unknown }).id));
}

/**
 * The scripted backend is one Claude: what it replays, it writes — plan 04, F5.
 *
 * The end-to-end suite lists, reads back and continues conversations the replay held, so the replay
 * has to write them the way `persistSession: true` does, under the conversation the options name.
 * And a conversation never holds the same id twice: a replay that repeated the recording's ids on
 * every turn folded a continued conversation into one message on screen.
 */
describe('the scripted Agent SDK, writing what it replays', () => {
  let directory: string | null = null;

  afterEach(() => {
    if (directory !== null) {
      rmSync(directory, { recursive: true, force: true });
      directory = null;
    }
  });

  it('files a new conversation under its id and its directory, prompt first', async () => {
    const transcripts = new ScriptedTranscripts();

    const stream = await turn({ transcripts }, { sessionId: OURS });

    const [info] = await transcripts.listSessions({ dir: CWD });
    const messages = await transcripts.getSessionMessages(OURS);

    expect(info).toMatchObject({ sessionId: OURS, cwd: CWD });
    expect(info?.summary).toContain('pong');
    expect(messages[0]).toMatchObject({
      type: 'user',
      session_id: OURS,
      message: { role: 'user', content: expect.stringContaining('pong') },
    });
    expect(messages.every((message) => message.session_id === OURS)).toBe(true);
    // What was written is what was streamed: the same ids, so a reload after a gap recognises it.
    expect(answerIds(messages.slice(1))).toEqual(answerIds(stream));
  });

  it('continues one of ours in place, with ids of its own on every turn', async () => {
    const transcripts = new ScriptedTranscripts();

    const first = await turn({ transcripts }, { sessionId: OURS });
    const second = await turn({ transcripts }, { resume: OURS });

    const messages = await transcripts.getSessionMessages(OURS);
    const uuids = messages.map((message) => message.uuid);

    expect(messages.filter((message) => message.type === 'user')).toHaveLength(2);
    expect(new Set(uuids).size).toBe(uuids.length);
    expect(answerIds(second)).not.toEqual(answerIds(first));
    expect(await transcripts.listSessions({ dir: CWD })).toHaveLength(1);
  });

  it('forks one begun elsewhere under the new id, and writes nothing to the origin', async () => {
    const transcripts = new ScriptedTranscripts();
    await turn({ transcripts }, { sessionId: OURS });
    const before = await transcripts.getSessionMessages(OURS);

    await turn({ transcripts }, { resume: OURS, forkSession: true, sessionId: FORK });

    const forked = await transcripts.getSessionMessages(FORK);

    expect(await transcripts.getSessionMessages(OURS)).toEqual(before);
    expect(forked.slice(0, before.length).map((message) => message.uuid)).toEqual(
      before.map((message) => message.uuid),
    );
    expect(forked.length).toBeGreaterThan(before.length);
    expect(forked.every((message) => message.session_id === FORK)).toBe(true);
  });

  it('moves `lastModified` on with every write, however fast they come', async () => {
    const transcripts = new ScriptedTranscripts();
    await turn({ transcripts }, { sessionId: OURS });
    const first = (await transcripts.getSessionInfo(OURS))?.lastModified ?? 0;

    transcripts.persist(OURS, CWD, []);

    expect((await transcripts.getSessionInfo(OURS))?.lastModified).toBeGreaterThan(first);
  });

  it('writes the recorded files in the directory the session runs in', async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'rc-scripted-'));
    const [write] = loadFixture('tool-turn').canUseTool;
    const recorded = (write?.input ?? {}) as { file_path: string; content: string };

    await turn(
      { performWritesIn: 'cwd' },
      { cwd: directory, sessionId: OURS },
      'do the work [fixture:tool-turn]',
    );

    const written = path.join(directory, path.basename(recorded.file_path));
    expect(readFileSync(written, 'utf8')).toBe(recorded.content);
    expect(existsSync(recorded.file_path)).toBe(false);
  });

  it('names the directory the session runs in where the recording named its own — plan 06, S-207', async () => {
    const stream = await turn(
      { performWritesIn: 'cwd' },
      { cwd: CWD, sessionId: OURS },
      'where are you? [fixture:cwd-turn]',
    );

    const said = stream.flatMap((message) =>
      message.type === 'assistant' && Array.isArray(message.message.content)
        ? message.message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
        : [],
    );
    const result = stream.find((message) => message.type === 'result');

    expect(said).toEqual([CWD]);
    expect(result?.subtype === 'success' ? result.result : null).toBe(CWD);
  });

  it('leaves what a tool was given as the recording has it, and what nobody placed as recorded — plan 06, S-207', async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'rc-scripted-'));
    const moved = await turn(
      { performWritesIn: 'cwd' },
      { cwd: directory, sessionId: OURS },
      'do the work [fixture:tool-turn]',
    );
    const unplaced = await turn({}, { sessionId: OURS }, 'where are you? [fixture:cwd-turn]');

    const inputs = moved.flatMap((message) =>
      message.type === 'assistant' && Array.isArray(message.message.content)
        ? message.message.content.flatMap((block) =>
            block.type === 'tool_use' ? [JSON.stringify(block.input)] : [],
          )
        : [],
    );
    expect(inputs.some((input) => input.includes('"/workspace/summary.md"'))).toBe(true);
    expect(unplaced.find((message) => message.type === 'result')).toMatchObject({
      result: '/workspace',
    });
  });

  it('replays the recording byte for byte when there is no store to write to', async () => {
    const recording = loadFixture('text-turn');

    const stream = await turn({}, { sessionId: OURS });

    expect(stream.map((message) => message.uuid)).toEqual(
      recording.messages.map((message) => message.uuid),
    );
  });
});

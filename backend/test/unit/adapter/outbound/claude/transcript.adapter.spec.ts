import { beforeEach, describe, expect, it } from 'vitest';
import type { SDKSessionInfo, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import { AgentSdkTranscriptAdapter } from '@adapter/outbound/claude/transcript.adapter';
import type { TranscriptSdk } from '@adapter/outbound/claude/transcript-sdk';
import {
  ClaudeSessionId,
  TranscriptTimeoutError,
  TranscriptUnavailableError,
} from '@domain/transcript';
import {
  capturedTranscript,
  ScriptedTranscripts,
} from '../../../../fakes/agent-sdk/scripted-transcripts';
import { ManualScheduler } from '../../../../support/fakes/manual-scheduler';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import { conversationId } from '../../../../support/builders/transcript.builder';

const DIRECTORY = '/srv/projects/app';
const limits = { cachedSessions: 4, concurrentReads: 2, timeoutMs: 5_000 };

describe('AgentSdkTranscriptAdapter', () => {
  let sdk: ScriptedTranscripts;
  let scheduler: ManualScheduler;
  let log: RecordingLogger;
  let adapter: AgentSdkTranscriptAdapter;

  beforeEach(() => {
    sdk = new ScriptedTranscripts();
    scheduler = new ManualScheduler();
    log = new RecordingLogger();
    adapter = new AgentSdkTranscriptAdapter(sdk, limits, scheduler, log.logger);
  });

  /** The scripted store with some of its reads replaced — every method bound, none left out. */
  const build = (overrides: Partial<TranscriptSdk>): AgentSdkTranscriptAdapter =>
    new AgentSdkTranscriptAdapter(
      {
        listSessions: (options) => sdk.listSessions(options),
        getSessionInfo: (id) => sdk.getSessionInfo(id),
        getSessionMessages: (id) => sdk.getSessionMessages(id),
        ...overrides,
      },
      limits,
      scheduler,
      log.logger,
    );

  describe('listing', () => {
    it('asks for exactly one directory, and never for its worktrees — D-01', async () => {
      sdk
        .add({ sessionId: conversationId(1), directory: DIRECTORY, cwd: DIRECTORY })
        .add({ sessionId: conversationId(2), directory: DIRECTORY, cwd: '/wt', worktree: true });

      const sessions = await adapter.list(DIRECTORY);

      expect(sdk.calls.listSessions).toEqual([{ dir: DIRECTORY, includeWorktrees: false }]);
      expect(sessions.map((session) => session.id.value)).toEqual([conversationId(1)]);
    });

    it('describes each session with what the SDK reported, nothing more', async () => {
      sdk.add({
        sessionId: conversationId(1),
        directory: DIRECTORY,
        cwd: DIRECTORY,
        summary: 'fix the build',
        lastModified: 1_758_800_000_123,
      });

      const [session] = await adapter.list(DIRECTORY);

      expect(session).toMatchObject({
        summary: 'fix the build',
        cwd: DIRECTORY,
        gitBranch: null,
        createdAt: null,
        lastModified: 1_758_800_000_123,
      });
    });

    it('keeps the branch and the creation time when the SDK has them', async () => {
      const info: SDKSessionInfo = {
        sessionId: conversationId(1),
        summary: 's',
        lastModified: 2,
        gitBranch: 'main',
        createdAt: 1_000,
      };
      const [session] = await build({ listSessions: () => Promise.resolve([info]) }).list(
        DIRECTORY,
      );

      expect(session?.gitBranch).toBe('main');
      expect(session?.createdAt).toEqual(new Date(1_000));
      // No `cwd` reported, which is reported as such — the fence decides what that means.
      expect(session?.cwd).toBeNull();
    });

    it('leaves out a session whose id no client could ask for again', async () => {
      sdk
        .add({ sessionId: 'NOT-A-UUID', directory: DIRECTORY, cwd: DIRECTORY })
        .add({ sessionId: conversationId(1), directory: DIRECTORY, cwd: DIRECTORY });

      expect(await adapter.list(DIRECTORY)).toHaveLength(1);
      expect(log.withOp('claude.transcript.list')[0]).toMatchObject({
        sessions: 1,
        unaddressable: 1,
      });
    });
  });

  describe('describing one', () => {
    it('answers `null` for an id that names nothing — S-56', async () => {
      expect(await adapter.find(ClaudeSessionId.create(conversationId(9)))).toBeNull();
    });

    it('answers the session when there is one', async () => {
      sdk.add({ sessionId: conversationId(1), directory: DIRECTORY, cwd: DIRECTORY });

      expect((await adapter.find(ClaudeSessionId.create(conversationId(1))))?.cwd).toBe(DIRECTORY);
    });
  });

  describe('reading messages', () => {
    const seed = (lastModified = 1): void => {
      sdk.add({
        sessionId: conversationId(1),
        directory: DIRECTORY,
        cwd: DIRECTORY,
        lastModified,
        messages: capturedTranscript('tool-turn'),
      });
    };
    const find = async () => {
      const session = await adapter.find(ClaudeSessionId.create(conversationId(1)));
      if (session === null) throw new Error('seeded, and not found');
      return session;
    };

    it('reads the whole conversation, without `limit` or `offset`, as our events', async () => {
      seed();
      const messages = await adapter.messages(await find());

      expect(messages).toHaveLength(capturedTranscript('tool-turn').length);
      expect(messages[0]?.events[0]?.type).toBe('message.completed');
      expect(sdk.calls.getSessionMessages).toEqual([conversationId(1)]);
    });

    it('parses a conversation read twice only once — S-64', async () => {
      seed();
      const session = await find();

      await adapter.messages(session);
      await adapter.messages(session);

      expect(sdk.calls.getSessionMessages).toHaveLength(1);
      expect(log.withOp('claude.transcript.messages').map((line) => line['cache'])).toEqual([
        'miss',
        'hit',
      ]);
    });

    it('parses it again once it was written to — S-64', async () => {
      seed();
      await adapter.messages(await find());

      sdk.append(conversationId(1), capturedTranscript('tool-turn', 1), 2);
      const grown = await adapter.messages(await find());

      expect(sdk.calls.getSessionMessages).toHaveLength(2);
      expect(grown).toHaveLength(capturedTranscript('tool-turn').length * 2);
    });
  });

  describe('when the SDK fails', () => {
    it('answers CLAUDE_UNAVAILABLE, never the SDK`s own error — S-05', async () => {
      sdk.failWith = new Error('ENOENT: /home/someone/.claude/projects');

      const refusal = await adapter.list(DIRECTORY).catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(TranscriptUnavailableError);
      expect(refusal).toMatchObject({
        code: 'CLAUDE_UNAVAILABLE',
        messageKey: 'transcript.error.claudeUnavailable',
        params: { operation: 'list sessions' },
      });
    });

    it('logs the failure as an error, with what failed', async () => {
      sdk.failWith = new Error('boom');

      await adapter.find(ClaudeSessionId.create(conversationId(1))).catch(() => undefined);

      expect(log.lines.find((line) => line.level === 'error')).toMatchObject({
        op: 'claude.transcript.read',
        operation: 'describe a session',
      });
    });

    it('survives an SDK that rejects with something that is not an error', async () => {
      const odd = build({
        // An SDK may reject with anything; the adapter must survive what it gets.
        getSessionInfo: () => Promise.reject(new String('not an error') as unknown as Error),
      });

      await expect(odd.find(ClaudeSessionId.create(conversationId(1)))).rejects.toThrow(
        TranscriptUnavailableError,
      );
    });

    it('answers CLAUDE_TIMEOUT when the SDK does not answer in time — S-68', async () => {
      const hung = build({
        listSessions: () => new Promise<SDKSessionInfo[]>(() => undefined),
      });
      const listing = hung.list(DIRECTORY).catch((error: unknown) => error);

      expect(scheduler.delays).toEqual([5_000]);
      scheduler.fire();

      expect(await listing).toBeInstanceOf(TranscriptTimeoutError);
      expect(await listing).toMatchObject({ code: 'CLAUDE_TIMEOUT', params: { timeoutMs: 5_000 } });
      expect(log.lines.find((line) => line.level === 'warn')).toMatchObject({
        op: 'claude.transcript.read',
        operation: 'list sessions',
      });
    });

    it('calls the deadline off when the read answered in time', async () => {
      await adapter.list(DIRECTORY);

      expect(scheduler.armed).toBe(0);
    });

    it('does not cache a read that failed', async () => {
      sdk.add({ sessionId: conversationId(1), directory: DIRECTORY, cwd: DIRECTORY, messages: [] });
      const session = await adapter.find(ClaudeSessionId.create(conversationId(1)));
      if (session === null) throw new Error('seeded, and not found');

      sdk.failWith = new Error('boom');
      await expect(adapter.messages(session)).rejects.toThrow(TranscriptUnavailableError);

      sdk.failWith = null;
      await expect(adapter.messages(session)).resolves.toEqual([]);
    });
  });

  it('logs both sides of every read, and never a word of the conversation — S-72', async () => {
    const messages: SessionMessage[] = capturedTranscript('tool-turn');
    sdk.add({
      sessionId: conversationId(1),
      directory: DIRECTORY,
      cwd: DIRECTORY,
      summary: 'SECRET-SUMMARY',
      messages,
    });

    await adapter.list(DIRECTORY);
    const session = await adapter.find(ClaudeSessionId.create(conversationId(1)));
    if (session !== null) await adapter.messages(session);

    const written = JSON.stringify(log.lines);
    expect(log.lines.every((line) => line.level === 'debug')).toBe(true);
    expect(log.withOp('claude.transcript.read')).toHaveLength(3);
    expect(written).not.toContain('SECRET-SUMMARY');
    expect(written).not.toContain('two goals');
    expect(written).not.toContain('summary.md');
  });
});

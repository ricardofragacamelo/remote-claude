import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { Envelope } from '@remote-claude/contracts';

import { forgetLiveSessions, liveSessionStoreOf } from '@/features/session';
import { useEditAndResend } from '@/features/session/hooks/useEditAndResend';
import { forgetClaudePanel } from '@/features/session/store/claude-panel.store';
import type { StreamMessage } from '@/features/session/types/live-session';
import { forgetFolderTabs } from '@/features/workbench';
import { logger } from '@/shared/logging/logger';
import { aLiveSocket, hubEvent } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';
import { providers } from '../../../../support/render';
import { aCheckpointDto, aWireError, routeApi, SESSION } from '../../../../support/session-tools';

const FOLDER = '/srv/projects/app';
const CONVERSATION = 'conv-1';
const FORKED = '01J0FORKEDFORKEDFORKEDFORK';
const CHECKPOINTS = `/sessions/${SESSION}/checkpoints`;

const prompt = (messageId: string, text: string): StreamMessage => ({
  messageId,
  role: 'user',
  text,
  blocks: [{ kind: 'text', text }],
  streaming: null,
  isComplete: true,
  parentToolUseId: null,
  thinkingMs: null,
  thinkingSince: null,
});

let live: LiveSocket;

beforeEach(() => {
  forgetLiveSessions();
  live = aLiveSocket();
});

afterEach(() => {
  live.close();
  forgetClaudePanel(null);
  forgetFolderTabs();
  vi.restoreAllMocks();
});

function mount() {
  return renderHook(() => useEditAndResend(FOLDER, SESSION), { wrapper: providers() });
}

/**
 * The session on its conversation, as its store holds it — `workspacePath` only when the started
 * frame says it. Fed to the store directly: attaching is the screen's business, not this hook's.
 */
function started(extra: Record<string, unknown> = {}): void {
  act(() => {
    liveSessionStoreOf(SESSION)
      .getState()
      .apply(
        hubEvent(SESSION, 'session.started', 1, {
          sessionId: SESSION,
          claudeSessionId: CONVERSATION,
          ...extra,
        }) as unknown as Envelope,
      );
  });
}

const starts = () => live.sent().filter((frame) => frame['type'] === 'session.start');

describe('editing and sending again — plan 08, B-35', () => {
  it('sends nothing when nothing is being edited', () => {
    routeApi({ [CHECKPOINTS]: [{ checkpoints: [] }] });
    const hook = mount();
    live.connect();

    act(() => {
      hook.result.current.send('anything');
    });

    expect(starts()).toEqual([]);
  });

  it('cannot fork before the conversation is known', () => {
    routeApi({ [CHECKPOINTS]: [{ checkpoints: [] }] });
    const hook = mount();
    live.connect();

    act(() => {
      hook.result.current.forkFrom(prompt('u1', 'hello'));
    });

    expect(starts()).toEqual([]);
  });

  it('forks in the folder of the tab when the session did not say its own, once at a time', () => {
    routeApi({ [CHECKPOINTS]: [{ checkpoints: [] }] });
    const hook = mount();
    live.connect();
    started();

    act(() => {
      hook.result.current.forkFrom(prompt('u1', 'hello'));
    });
    act(() => {
      hook.result.current.forkFrom(prompt('u1', 'hello'));
    });

    expect(starts()).toHaveLength(1);
    expect(starts()[0]).toMatchObject({
      payload: { workspacePath: FOLDER, resumeSessionId: CONVERSATION, forkAt: 'u1' },
    });
    expect(hook.result.current.isSending).toBe(true);
  });

  it('sends nothing with the socket down', () => {
    routeApi({ [CHECKPOINTS]: [{ checkpoints: [] }] });
    const hook = mount();
    live.connect();
    started();
    live.close();

    act(() => {
      hook.result.current.forkFrom(prompt('u1', 'hello'));
    });

    expect(hook.result.current.isSending).toBe(false);
  });

  it('finds the undo point of the turn by what the prompt said, and keeps the latest edit', async () => {
    routeApi({
      [CHECKPOINTS]: [{ checkpoints: [aCheckpointDto({ promptId: 'p2', label: 'second' })] }],
    });
    const hook = mount();

    act(() => {
      hook.result.current.begin(prompt('u1', 'first'));
      hook.result.current.begin(prompt('u2', 'second'));
    });

    await waitFor(() => {
      expect(hook.result.current.editing).toEqual({
        messageId: 'u2',
        original: 'second',
        undoPoint: 'p2',
      });
    });
  });

  it('offers no undo, and says so in the log, when the points cannot be read', async () => {
    routeApi({
      [CHECKPOINTS]: [aWireError('CLAUDE_UNAVAILABLE', 'session.error.claudeUnavailable')],
    });
    const warn = vi.spyOn(logger, 'warn');
    const hook = mount();

    act(() => {
      hook.result.current.begin(prompt('u1', 'first'));
    });

    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ op: 'session.editUndoPoint', sessionId: SESSION }),
        expect.any(String),
      );
    });
    expect(hook.result.current.editing?.undoPoint).toBeNull();
  });

  it('reads a fork rejection that carries no trace by its frame', () => {
    routeApi({ [CHECKPOINTS]: [{ checkpoints: [] }] });
    const hook = mount();
    live.connect();
    started({ workspacePath: FOLDER });

    act(() => {
      hook.result.current.forkFrom(prompt('u1', 'hello'));
    });
    live.receive({
      v: 1,
      id: 'started-fork',
      kind: 'event',
      type: 'session.started',
      ts: '2026-09-30T12:00:00.000Z',
      seq: 1,
      correlationId: starts()[0]?.['id'],
      payload: { sessionId: FORKED, workspacePath: FOLDER },
    });
    live.receive({
      v: 1,
      id: 'err-fork',
      kind: 'error',
      type: 'error',
      ts: '2026-09-30T12:00:00.000Z',
      sessionId: FORKED,
      payload: {
        code: 'SESSION_FORK_REJECTED',
        messageKey: 'session.error.forkRejected',
        params: {},
      },
    });

    expect(hook.result.current.error).toMatchObject({
      code: 'SESSION_FORK_REJECTED',
      traceId: 'err-fork',
    });
    expect(hook.result.current.canResumeInstead).toBe(true);
  });

  it('resumes only after a refusal of the point', () => {
    routeApi({ [CHECKPOINTS]: [{ checkpoints: [] }] });
    const hook = mount();
    live.connect();

    act(() => {
      hook.result.current.resumeInstead();
    });

    expect(starts()).toEqual([]);
  });
});

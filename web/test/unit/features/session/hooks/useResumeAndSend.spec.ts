import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useResumeAndSend } from '@/features/session/hooks/useResumeAndSend';
import { claudePanelStore, forgetClaudePanel } from '@/features/session/store/claude-panel.store';
import { forgetLiveSessions } from '@/features/session';
import { forgetFolderTabs } from '@/features/workbench';
import { aLiveSocket } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';
import { providers } from '../../../../support/render';
import { aRefusal } from '../../../../support/session-tools';

const FOLDER = '/srv/projects/app';
const ENDED = '01J0ENDEDENDEDENDEDENDED00';
const RESUMED = '01J0RESUMEDRESUMEDRESUMED0';
const CONVERSATION = '6b41b192-a41b-46c2-b8d7-5098d8c825be';
const AT = '2026-10-02T12:00:00.000Z';

let live: LiveSocket;

beforeEach(() => {
  live = aLiveSocket();
  claudePanelStore(FOLDER).getState().show('session', ENDED);
});

afterEach(() => {
  live.close();
  forgetClaudePanel(null);
  forgetFolderTabs();
  forgetLiveSessions();
});

/** The box of the ended session, with the conversation it was — or not known. */
function anEndedBox(conversationId: string | null = CONVERSATION) {
  return renderHook(() => useResumeAndSend(FOLDER, ENDED, conversationId), {
    wrapper: providers(),
  });
}

const resumes = () => live.sent().filter((frame) => frame['type'] === 'session.start');
const prompts = () => live.sent().filter((frame) => frame['type'] === 'session.prompt');

/** The hub's answer to the resume of id `correlationId`: the session that continues it. */
function resumedFrame(correlationId: unknown): Record<string, unknown> {
  return {
    v: 1,
    id: `started-${RESUMED}`,
    kind: 'event',
    type: 'session.started',
    ts: AT,
    seq: 1,
    correlationId,
    payload: {
      sessionId: RESUMED,
      workspacePath: FOLDER,
      claudeSessionId: 'a-new-one',
      resumedFrom: CONVERSATION,
    },
  };
}

describe('sending in a session that ended resumes it — plan 09, B-06, D-05', () => {
  it('resumes nothing when the conversation the session was is not known', () => {
    const box = anEndedBox(null);
    live.connect();

    act(() => {
      box.result.current.send('go on');
    });

    expect(box.result.current.canResume).toBe(false);
    expect(resumes()).toEqual([]);
  });

  it('resumes the conversation, then sends the prompt there, in the same tab — S-87', async () => {
    const box = anEndedBox();
    live.connect();

    act(() => {
      box.result.current.send('go on');
    });
    expect(resumes()).toHaveLength(1);
    expect(resumes()[0]).toMatchObject({
      payload: { workspacePath: FOLDER, resumeSessionId: CONVERSATION },
    });
    expect(box.result.current.isResuming).toBe(true);

    live.receive(resumedFrame(resumes()[0]?.['id']));

    await waitFor(() => {
      expect(prompts()).toHaveLength(1);
    });
    expect(prompts()[0]).toMatchObject({ payload: { sessionId: RESUMED, text: 'go on' } });
    const panel = claudePanelStore(FOLDER).getState();
    expect(panel.active).toBe(`session:${RESUMED}`);
    expect(panel.tabs.map((tab) => tab.key)).toEqual([`session:${RESUMED}`]);
  });

  it('resumes once, however often it is sent before the answer — S-88', () => {
    const box = anEndedBox();
    live.connect();

    act(() => {
      box.result.current.send('once');
      box.result.current.send('twice');
    });

    expect(resumes()).toHaveLength(1);
  });

  it('gives the text back, with the reason, when the installation is full — S-89', () => {
    const box = anEndedBox();
    live.connect();

    act(() => {
      box.result.current.send('go on');
    });
    live.receive(
      aRefusal(String(resumes()[0]?.['id']), 'SESSION_LIMIT_REACHED', 'session.error.limit'),
    );

    expect(box.result.current.error?.code).toBe('SESSION_LIMIT_REACHED');
    expect(box.result.current.isResuming).toBe(false);
    expect(box.result.current.refusals).toBe(1);
    expect(claudePanelStore(FOLDER).getState().drafts[`session:${ENDED}`]).toBe('go on');
    expect(prompts()).toEqual([]);

    // Free again: the next send is a resume of its own.
    act(() => {
      box.result.current.send('go on');
    });
    expect(resumes()).toHaveLength(2);
  });

  it('sends nothing, and loses nothing, with the socket down', () => {
    const box = anEndedBox();

    act(() => {
      box.result.current.send('go on');
    });

    expect(box.result.current.refusals).toBe(1);
    expect(claudePanelStore(FOLDER).getState().drafts[`session:${ENDED}`]).toBe('go on');
    live.connect();
    expect(resumes()).toEqual([]);
  });
});

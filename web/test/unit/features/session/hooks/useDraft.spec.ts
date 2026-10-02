import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useDraft } from '@/features/session/hooks/useDraft';
import {
  claudePanelStore,
  DEFAULT_CHOICES,
  forgetClaudePanel,
} from '@/features/session/store/claude-panel.store';
import { forgetFolderTabs } from '@/features/workbench';
import { aLiveSocket } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';
import { providers } from '../../../../support/render';
import { aRefusal } from '../../../../support/session-tools';

const FOLDER = '/srv/projects/app';
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

let live: LiveSocket;

beforeEach(() => {
  live = aLiveSocket();
});

afterEach(() => {
  live.close();
  forgetClaudePanel(null);
  forgetFolderTabs();
});

/** The hook of a draft the panel has open. */
function aDraft() {
  const key = claudePanelStore(FOLDER).getState().openDraft();
  return { key, hook: renderHook(() => useDraft(FOLDER, key, FOLDER), { wrapper: providers() }) };
}

const starts = () => live.sent().filter((frame) => frame['type'] === 'session.start');

describe('a draft of the panel — plan 08, B-33', () => {
  it('answers to nothing it did not ask for', () => {
    const { hook } = aDraft();
    live.connect();

    live.receive(aRefusal('somebody-else', 'INVALID_INPUT', 'common.error.invalidInput'));

    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.isStarting).toBe(false);
  });

  it('keeps waiting through a frame that is neither its session nor its refusal', () => {
    const { hook } = aDraft();
    live.connect();

    act(() => {
      hook.result.current.send('hello');
    });
    live.receive(aRefusal('somebody-else', 'INVALID_INPUT', 'common.error.invalidInput'));

    expect(hook.result.current.isStarting).toBe(true);
    expect(hook.result.current.error).toBeNull();
  });

  it('sends nothing, and waits for nothing, with the socket down', () => {
    const { hook } = aDraft();

    act(() => {
      hook.result.current.send('hello');
    });

    expect(hook.result.current.isStarting).toBe(false);
    live.connect();
    expect(starts()).toEqual([]);
  });

  it('starts once, however often it is sent before the answer — S-154', () => {
    const { hook } = aDraft();
    live.connect();

    act(() => {
      hook.result.current.send('once');
      hook.result.current.send('twice');
    });

    expect(starts()).toHaveLength(1);
  });

  it('gives the prompt back and counts the refusal — S-153', () => {
    const { key, hook } = aDraft();
    live.connect();

    act(() => {
      hook.result.current.send('go');
    });
    live.receive(
      aRefusal(String(starts()[0]?.['id']), 'SESSION_LIMIT_REACHED', 'session.error.limitReached'),
    );

    expect(hook.result.current.refusals).toBe(1);
    expect(claudePanelStore(FOLDER).getState().drafts[key]).toBe('go');
    expect(hook.result.current.error?.code).toBe('SESSION_LIMIT_REACHED');
  });

  it('reads the defaults for a key the panel no longer has', () => {
    const hook = renderHook(() => useDraft(FOLDER, 'draft:gone', FOLDER), {
      wrapper: providers(),
    });

    expect(hook.result.current.choices).toEqual(DEFAULT_CHOICES);
    expect(hook.result.current.text).toBe('');
  });

  it('opens the session it asked for and sends the prompt there', async () => {
    const { key, hook } = aDraft();
    live.connect();

    act(() => {
      hook.result.current.choose({ mode: 'acceptEdits' });
    });
    act(() => {
      hook.result.current.send('go');
    });
    live.receive({
      v: 1,
      id: 'started',
      kind: 'event',
      type: 'session.started',
      ts: '2026-09-30T12:00:00.000Z',
      seq: 1,
      correlationId: starts()[0]?.['id'],
      payload: { sessionId: SESSION, workspacePath: FOLDER },
    });

    expect(starts()[0]).toMatchObject({ payload: { permissionMode: 'acceptEdits' } });
    // The prompt waits for the attachments the draft held — none here — and then leaves.
    await waitFor(() => {
      expect(live.lastSent('session.prompt')).toMatchObject({
        payload: { sessionId: SESSION, text: 'go' },
      });
    });
    expect(
      claudePanelStore(FOLDER)
        .getState()
        .tabs.map((tab) => tab.key),
    ).toEqual([`session:${SESSION}`]);
    expect(
      claudePanelStore(FOLDER)
        .getState()
        .tabs.some((tab) => tab.key === key),
    ).toBe(false);
  });
});

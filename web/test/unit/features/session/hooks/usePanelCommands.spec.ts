import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { commandRegistry } from '@/features/commands';
import { permissionQueueOf } from '@/features/permission';
import { forgetLiveSessions } from '@/features/session';
import { usePanelCommands } from '@/features/session/hooks/usePanelCommands';
import { usePanelTabs } from '@/features/session/hooks/usePanelTabs';
import { claudePanelStore, forgetClaudePanel } from '@/features/session/store/claude-panel.store';
import { liveSessionStoreOf } from '@/features/session/store/live-session.store';
import { aLiveSocket } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';
import { providers } from '../../../../support/render';

const FOLDER = '/srv/projects/app';

let live: LiveSocket;

beforeEach(() => {
  live = aLiveSocket();
});

afterEach(() => {
  live.close();
  forgetLiveSessions();
  forgetClaudePanel(null);
});

function commands(): void {
  renderHook(
    () => {
      usePanelCommands(FOLDER, usePanelTabs(FOLDER));
    },
    { wrapper: providers() },
  );
}

const cycle = () => {
  const command = commandRegistry.command('claude.cycleMode');
  expect(command).toBeDefined();
  return command as NonNullable<typeof command>;
};

describe('switching the mode from the palette — plan 09, D-09', () => {
  it('is not offered on a conversation of the history, which has no mode, and does nothing there', () => {
    live.connect();
    commands();
    act(() => {
      claudePanelStore(FOLDER).getState().show('conversation', 'c-1');
    });

    expect(cycle().when?.()).toBe(false);
    act(() => {
      cycle().run();
    });
    expect(live.lastSent('session.setPermissionMode')).toBeUndefined();
  });

  it('leaves the mode of a session as it was when nothing could be sent', () => {
    commands();
    act(() => {
      claudePanelStore(FOLDER).getState().show('session', 's-1');
    });

    expect(cycle().when?.()).toBe(true);
    act(() => {
      cycle().run();
    });

    expect(liveSessionStoreOf('s-1').getState().permissionMode).toBeNull();
  });
});

describe('going to the question waiting — plan 09, B-25', () => {
  const goTo = () => {
    const command = commandRegistry.command('claude.goToRequest');
    expect(command).toBeDefined();
    return command as NonNullable<typeof command>;
  };

  /** A question of `sessionId`, as the queue holds it. */
  function asked(sessionId: string, requestId: string): void {
    act(() => {
      permissionQueueOf(sessionId)
        .getState()
        .apply({
          v: 1,
          id: `frame-${requestId}`,
          kind: 'request',
          type: 'permission.requested',
          ts: '2026-10-03T12:00:00.000Z',
          payload: {
            requestId,
            toolUseId: 't1',
            toolName: 'Bash',
            title: 'permission.tool.Bash',
            riskHint: 'read',
            expiresAt: '2999-01-01T00:00:00.000Z',
          },
        });
    });
  }

  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => {
      run(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('is offered with a session, saying none waits — and then puts the focus in the box — S-71', () => {
    commands();
    expect(goTo().when?.()).toBe(false);

    act(() => {
      claudePanelStore(FOLDER).getState().show('session', 's-1');
    });
    const box = document.createElement('textarea');
    box.setAttribute('data-composer', FOLDER);
    document.body.append(box);

    expect(goTo().when?.()).toBe(true);
    expect(goTo().labelKey).toBe('command.claude.goToRequestNone');
    // From the box too, where a question leaves the focus of who writes (D-13).
    expect(commandRegistry.bindingOf('claude.goToRequest')).toMatchObject({
      key: 'Mod+Alt+P',
      allowInInput: true,
    });
    act(() => {
      void goTo().run();
    });

    expect(document.activeElement).toBe(box);
  });

  it('says how many wait, and takes the focus to the oldest, with the conversation on screen — S-71', () => {
    commands();
    act(() => {
      claudePanelStore(FOLDER).getState().show('session', 's-1');
      claudePanelStore(FOLDER).getState().showPane('changes');
    });
    asked('s-1', 'req-1');
    asked('s-1', 'req-2');
    const card = document.createElement('li');
    card.setAttribute('data-permission-request', 'req-1');
    card.tabIndex = -1;
    document.body.append(card);

    expect(goTo().labelKey).toBe('command.claude.goToRequest');
    expect(goTo().labelParams).toEqual({ count: 2 });
    act(() => {
      void goTo().run();
    });

    expect(claudePanelStore(FOLDER).getState().pane).toBe('chat');
    expect(document.activeElement).toBe(card);
  });
});

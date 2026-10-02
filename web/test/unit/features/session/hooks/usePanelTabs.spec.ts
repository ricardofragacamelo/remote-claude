import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { commandRegistry } from '@/features/commands';
import { usePanelCommands } from '@/features/session/hooks/usePanelCommands';
import { usePanelTabs } from '@/features/session/hooks/usePanelTabs';
import { claudePanelStore, forgetClaudePanel } from '@/features/session/store/claude-panel.store';
import { folderTabStore, forgetFolderTabs } from '@/features/workbench';
import { aLiveSocket } from '../../../../support/live-socket';
import { providers } from '../../../../support/render';

const FOLDER = '/srv/projects/app';

afterEach(() => {
  forgetClaudePanel(null);
  forgetFolderTabs();
});

function mount() {
  return renderHook(
    () => {
      const tabs = usePanelTabs(FOLDER);
      usePanelCommands(FOLDER, tabs);
      return tabs;
    },
    { wrapper: providers() },
  );
}

describe('the tabs of the panel and the folder tab — plan 08, B-32', () => {
  it('opens a draft when the folder tab shows nothing', () => {
    const hook = mount();

    expect(hook.result.current.active?.kind).toBe('draft');
  });

  it('shows on the folder tab the conversation picked in the panel, once', () => {
    const hook = mount();
    act(() => {
      claudePanelStore(FOLDER).getState().show('conversation', 'c1');
      claudePanelStore(FOLDER).getState().show('session', 's1');
    });

    act(() => {
      hook.result.current.activate('conversation:c1');
    });
    expect(folderTabStore(FOLDER).getState().conversationId).toBe('c1');

    act(() => {
      hook.result.current.activate('conversation:c1');
    });
    expect(folderTabStore(FOLDER).getState()).toMatchObject({
      conversationId: 'c1',
      sessionId: null,
    });
  });

  it('steps round the tabs, and does nothing with none', () => {
    const hook = mount();
    act(() => {
      claudePanelStore(FOLDER).getState().show('session', 's1');
    });

    act(() => {
      hook.result.current.step(1);
    });
    expect(hook.result.current.active?.kind).toBe('draft');

    act(() => {
      claudePanelStore(FOLDER).setState({ tabs: [], active: null });
      hook.result.current.step(-1);
    });
    expect(claudePanelStore(FOLDER).getState().active).toBeNull();
  });
});

describe('the commands of the panel — plan 08, B-40', () => {
  it('offers the interrupt and the changes only with a session on screen', () => {
    mount();

    expect(commandRegistry.command('claude.interrupt')?.when?.()).toBe(false);
    expect(commandRegistry.command('session.showChanges')?.when?.()).toBe(false);
    expect(commandRegistry.command('claude.nextConversation')?.when?.()).toBe(false);
  });

  it('interrupts nothing with no session on screen', () => {
    const live = aLiveSocket();
    live.connect();
    mount();

    act(() => {
      commandRegistry.command('claude.interrupt')?.run();
    });

    expect(live.lastSent('session.interrupt')).toBeUndefined();
    live.close();
  });
});

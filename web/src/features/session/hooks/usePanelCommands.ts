import { FileDiff, Focus, MessageSquarePlus, Octagon, SkipBack, SkipForward } from 'lucide-react';

import { useCommands } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';
import { folderTabStore } from '@/features/workbench';
import { wsClient } from '@/shared/api/ws';
import { interruptSession } from '../services/live-session.service';
import { claudePanelStore } from '../store/claude-panel.store';
import type { PanelTabs } from './usePanelTabs';

/** The id of the prompt box of the panel — what "focus the prompt" puts the focus in. */
export const COMPOSER_ID = 'prompt';

/** Puts the panel on screen and the focus in its prompt box, once it is there. */
function focusComposer(folder: string): void {
  folderTabStore(folder).getState().showSecondary();
  claudePanelStore(folder).getState().showPane('chat');
  requestAnimationFrame(() => {
    document.getElementById(COMPOSER_ID)?.focus();
  });
}

/**
 * The commands of the panel of Claude, live while its folder tab is on screen (plan 08, B-40): a new
 * conversation, the prompt box, the interrupt, the next and previous conversation and the changes —
 * each with its shortcut, in the palette, working with the focus anywhere in the tab (S-185). The
 * panel itself opens and closes with the workbench's own `Mod+Alt+B`.
 */
export function usePanelCommands(folder: string, tabs: PanelTabs): void {
  const activeSession = (): string | null =>
    tabs.active?.kind === 'session' ? tabs.active.sessionId : null;

  const declarations: CommandDeclaration[] = [
    {
      id: 'claude.newConversation',
      labelKey: 'command.claude.newConversation',
      category: 'file',
      icon: MessageSquarePlus,
      run: () => {
        tabs.newConversation();
        focusComposer(folder);
      },
      keys: [{ key: 'Mod+Alt+N', context: 'workbench' }],
    },
    {
      id: 'claude.focusComposer',
      labelKey: 'command.claude.focusComposer',
      category: 'go',
      icon: Focus,
      run: () => {
        focusComposer(folder);
      },
      keys: [{ key: 'Mod+Alt+L', context: 'workbench' }],
    },
    {
      id: 'claude.interrupt',
      labelKey: 'command.claude.interrupt',
      category: 'go',
      icon: Octagon,
      when: () => activeSession() !== null,
      run: () => {
        const sessionId = activeSession();
        if (sessionId !== null) interruptSession(wsClient, sessionId);
      },
      keys: [{ key: 'Mod+Alt+I', context: 'workbench' }],
    },
    {
      id: 'claude.nextConversation',
      labelKey: 'command.claude.nextConversation',
      category: 'go',
      icon: SkipForward,
      when: () => tabs.tabs.length > 1,
      run: () => {
        tabs.step(1);
      },
      keys: [{ key: 'Mod+Alt+]', context: 'workbench' }],
    },
    {
      id: 'claude.previousConversation',
      labelKey: 'command.claude.previousConversation',
      category: 'go',
      icon: SkipBack,
      when: () => tabs.tabs.length > 1,
      run: () => {
        tabs.step(-1);
      },
      keys: [{ key: 'Mod+Alt+[', context: 'workbench' }],
    },
    {
      id: 'session.showChanges',
      labelKey: 'command.session.showChanges',
      category: 'view',
      icon: FileDiff,
      when: () => activeSession() !== null,
      run: () => {
        folderTabStore(folder).getState().showSecondary();
        claudePanelStore(folder).getState().showPane('changes');
      },
      keys: [{ key: 'Mod+Alt+G', context: 'workbench' }],
    },
  ];

  useCommands(declarations);
}

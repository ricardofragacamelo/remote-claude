import { useCallback, useSyncExternalStore } from 'react';
import {
  FileDiff,
  Focus,
  MessageCircleQuestion,
  MessageSquarePlus,
  Octagon,
  ShieldCheck,
  SkipBack,
  SkipForward,
} from 'lucide-react';

import { useCommands } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';
import { permissionQueueOf } from '@/features/permission';
import type { PermissionRequest } from '@/features/permission';
import { folderTabStore } from '@/features/workbench';
import { wsClient } from '@/shared/api/ws';
import { capabilitiesIn } from '../lib/capabilities';
import { nextPanelMode, offeredModes, shownMode } from '../lib/panel-modes';
import { goToCard } from '../lib/request-finder';
import { interruptSession, setSessionPermissionMode } from '../services/live-session.service';
import { agentPanelStore } from '../store/agent-panel.store';
import { liveSessionStoreOf } from '../store/live-session.store';
import type { EngineDirectory } from '../types/engine';
import { useEngines } from './useEngines';
import { sessionShownIn } from './usePanelTabs';
import type { PanelTabs } from './usePanelTabs';

/**
 * Puts the focus in the prompt box of the panel of `folder` — the one box of that folder tab's
 * panel, found by the folder it is marked with (plan 09, B-15).
 */
export function focusComposerOf(folder: string): void {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLTextAreaElement>(`textarea[data-composer="${CSS.escape(folder)}"]`)
      ?.focus();
  });
}

/** Puts the panel on screen and the focus in its prompt box, once it is there. */
function focusComposer(folder: string): void {
  folderTabStore(folder).getState().showSecondary();
  agentPanelStore(folder).getState().showPane('chat');
  focusComposerOf(folder);
}

/**
 * The mode of the conversation on screen moves to the next one its engine announces, as the chip of
 * the bar would (plan 09, D-09; plan 28, B-27): a session's is sent — and shown at once, as its chip
 * does —, a draft's is what it will start with. A conversation of the history has none, and an
 * engine with one mode has nowhere to move.
 */
function cycleMode(folder: string, tabs: PanelTabs, directory: EngineDirectory | null): void {
  const active = tabs.active;

  if (active?.kind === 'session') {
    cycleSessionMode(active.sessionId, directory);
  } else if (active?.kind === 'draft') {
    const modes = offeredModes(capabilitiesIn(directory, null));
    const next = nextPanelMode(modes, shownMode(modes, active.choices.mode));
    if (next !== null) {
      agentPanelStore(folder)
        .getState()
        .setChoices(active.key, { ...active.choices, mode: next });
    }
  }
}

/** A live session's mode, to the next its engine announces — as its `session.started` said, or listed. */
function cycleSessionMode(sessionId: string, directory: EngineDirectory | null): void {
  const live = liveSessionStoreOf(sessionId);
  const { capabilities, conversation, permissionMode } = live.getState();
  const modes = offeredModes(
    capabilities ?? capabilitiesIn(directory, conversation?.engine ?? null),
  );
  // From the mode its chip shows: before the stream says one, the first the engine announces.
  const next = nextPanelMode(modes, shownMode(modes, permissionMode));

  if (next !== null && setSessionPermissionMode(wsClient, sessionId, next) !== null) {
    live.getState().noteMode(next);
  }
}

/** What a panel without a session waits on. */
const NONE: readonly PermissionRequest[] = [];

/** The requests the session on screen waits on, oldest first — none with no session. */
function usePendingOf(sessionId: string | null): readonly PermissionRequest[] {
  const queue = sessionId === null ? null : permissionQueueOf(sessionId);
  const subscribe = useCallback(
    (changed: () => void) => queue?.subscribe(changed) ?? (() => undefined),
    [queue],
  );

  return useSyncExternalStore(subscribe, () => queue?.getState().pending ?? NONE);
}

/**
 * The panel on screen with the conversation in it, and the focus on the oldest question — or, with
 * none, in the box: the label of the command already said nothing waits (plan 09, S-71).
 */
function goToRequest(folder: string, oldest: string | undefined): void {
  folderTabStore(folder).getState().showSecondary();
  agentPanelStore(folder).getState().showPane('chat');

  if (oldest === undefined) {
    focusComposerOf(folder);
  } else {
    goToCard(oldest);
  }
}

/**
 * The commands of the panel of the agent, live while its folder tab is on screen (plan 08, B-40): a new
 * conversation, the prompt box, the interrupt, the next and previous conversation and the changes —
 * each with its shortcut, in the palette, working with the focus anywhere in the tab (S-185). The
 * panel itself opens and closes with the workbench's own `Mod+Alt+B`. Since plan 09 (B-25), the way
 * to the question the session waits on, whose label says how many — or that none does.
 */
export function usePanelCommands(folder: string, tabs: PanelTabs): void {
  const activeSession = (): string | null => sessionShownIn(tabs);
  const pending = usePendingOf(sessionShownIn(tabs));
  const { directory } = useEngines();

  const declarations: CommandDeclaration[] = [
    {
      id: 'agent.newConversation',
      labelKey: 'command.agent.newConversation',
      category: 'file',
      icon: MessageSquarePlus,
      run: () => {
        tabs.newConversation();
        focusComposer(folder);
      },
      keys: [{ key: 'Mod+Alt+N', context: 'workbench' }],
    },
    {
      id: 'agent.focusComposer',
      labelKey: 'command.agent.focusComposer',
      category: 'go',
      icon: Focus,
      run: () => {
        focusComposer(folder);
      },
      keys: [{ key: 'Mod+Alt+L', context: 'workbench' }],
    },
    {
      id: 'agent.interrupt',
      labelKey: 'command.agent.interrupt',
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
      id: 'agent.goToRequest',
      labelKey:
        pending.length === 0 ? 'command.agent.goToRequestNone' : 'command.agent.goToRequest',
      labelParams: { count: pending.length },
      category: 'go',
      icon: MessageCircleQuestion,
      when: () => activeSession() !== null,
      run: () => {
        goToRequest(folder, pending[0]?.requestId);
      },
      // From the box too: a question that arrives while somebody writes leaves the focus there
      // (D-13), and this is the way to it without leaving the keyboard. The chord types nothing.
      keys: [{ key: 'Mod+Alt+P', context: 'workbench', allowInInput: true }],
    },
    {
      id: 'agent.cycleMode',
      labelKey: 'command.agent.cycleMode',
      category: 'go',
      icon: ShieldCheck,
      when: () => tabs.active !== null && tabs.active.kind !== 'conversation',
      run: () => {
        cycleMode(folder, tabs, directory);
      },
      // Not Shift+Tab, as the CLI: in a browser it is the way back through the focus (D-09).
      keys: [{ key: 'Mod+Shift+M', context: 'workbench' }],
    },
    {
      id: 'agent.nextConversation',
      labelKey: 'command.agent.nextConversation',
      category: 'go',
      icon: SkipForward,
      when: () => tabs.tabs.length > 1,
      run: () => {
        tabs.step(1);
      },
      keys: [{ key: 'Mod+Alt+]', context: 'workbench' }],
    },
    {
      id: 'agent.previousConversation',
      labelKey: 'command.agent.previousConversation',
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
        agentPanelStore(folder).getState().showPane('changes');
      },
      keys: [{ key: 'Mod+Alt+G', context: 'workbench' }],
    },
  ];

  useCommands(declarations);
}

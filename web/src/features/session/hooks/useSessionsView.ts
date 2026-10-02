import { useCallback, useState } from 'react';
import { useStore } from 'zustand';

import type { CommandDeclaration } from '@/features/commands';
import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { useCopy } from '@/shared/hooks/useCopy';
import type { Copy } from '@/shared/hooks/useCopy';
import { closeSession } from '../services/live-session.service';
import { arrangeConversations, arrangeLiveSessions } from '../services/sessions-view.service';
import type { SessionsFilter } from '../services/sessions-view.service';
import { sessionsViewStore } from '../store/sessions-view.store';
import type { SessionsViewState } from '../store/sessions-view.store';
import type { ConversationSummary } from '../types/history';
import type { LiveSessionSummary } from '../types/sessions-view';
import { useFolderSessions } from './useFolderSessions';
import type { FolderSessions } from './useFolderSessions';
import { useResumer } from './useResumeSession';
import type { Resumer } from './useResumeSession';

/** Where the view sends a row: the panel of the same tab, which the workbench owns. */
export interface SessionsViewTargets {
  /** A live session goes to the panel, attached from the start of what the buffer holds. */
  showSession(sessionId: string): void;

  /** A conversation of the history opens in the panel, read only, with the way to continue it. */
  showConversation(conversationId: string): void;
}

/** A conversation waiting for the person to confirm it may be forked while it is active elsewhere. */
export interface PendingFork {
  readonly conversation: ConversationSummary;
  confirm(): void;
  cancel(): void;
}

/** Everything the view of Claude's sessions shows and does, for one folder tab. */
export interface SessionsView {
  readonly folder: string;
  readonly state: SessionsViewState;
  readonly sessions: FolderSessions;

  /** The live sessions, filtered and ordered, each with the title of its conversation. */
  readonly running: readonly { readonly session: LiveSessionSummary; readonly title: string }[];

  /** Conversations begun elsewhere and written within the window — an estimate. */
  readonly elsewhere: readonly ConversationSummary[];

  /** The rest of the history: what is neither live here nor active elsewhere. */
  readonly history: readonly ConversationSummary[];

  /** Whether a filter hides something: the empty state says so and offers to clear it. */
  readonly isFiltered: boolean;

  /** The continue in flight, or the last one — whose refusal its row shows. */
  readonly resume: Resumer;
  readonly pendingFork: PendingFork | null;
  readonly copy: Copy;

  openSession(sessionId: string): void;
  openConversation(conversationId: string): void;

  /** Continues a conversation here: in place when it is ours, as a fork when it began elsewhere. */
  continueConversation(conversation: ConversationSummary): void;
  endSession(sessionId: string): void;
  refresh(): void;
}

/** The title of a live session: its conversation's, when the history has already listed it. */
function titles(
  conversations: readonly ConversationSummary[],
): (session: LiveSessionSummary) => string {
  const bySession = new Map(
    conversations.flatMap((conversation) =>
      conversation.liveSessionId === null
        ? []
        : [[conversation.liveSessionId, conversation.summary]],
    ),
  );

  return (session) => bySession.get(session.sessionId) ?? '';
}

/**
 * The view of a folder tab's sessions: what runs here, what looks active elsewhere, and the history
 * — with what each row leads to (plan 08, B-09, B-10).
 *
 * A live session is attached; a conversation opens read only in the panel, where it is continued.
 * Continuing one that is active elsewhere asks first: another process is writing it now, and the two
 * continuations will diverge (S-42).
 */
export function useSessionsView(folder: string, targets: SessionsViewTargets): SessionsView {
  const store = sessionsViewStore(folder);
  const state = useStore(store);
  const sessions = useFolderSessions(folder, state.includeSubfolders);
  const copy = useCopy();
  const resumer = useResumer(targets.showSession);
  const { resume } = resumer;
  const [forking, setForking] = useState<ConversationSummary | null>(null);

  const filter: SessionsFilter = { search: state.search, origin: state.origin, sort: state.sort };
  const conversations = sessions.history.conversations;
  const titleOf = titles(conversations);

  // A resume runs where the conversation ran — the folder of the tab, or one below it.
  const start = useCallback(
    (conversation: ConversationSummary) => {
      resume({ conversationId: conversation.conversationId, workspacePath: conversation.cwd });
    },
    [resume],
  );

  const continueConversation = useCallback(
    (conversation: ConversationSummary) => {
      if (conversation.activity === 'activeElsewhere') {
        setForking(conversation);
        return;
      }
      start(conversation);
    },
    [start],
  );

  return {
    folder,
    state,
    sessions,
    running: arrangeLiveSessions(sessions.live.sessions, filter, titleOf).map((session) => ({
      session,
      title: titleOf(session),
    })),
    elsewhere: arrangeConversations(
      conversations.filter((conversation) => conversation.activity === 'activeElsewhere'),
      filter,
    ),
    history: arrangeConversations(
      conversations.filter((conversation) => conversation.activity === 'idle'),
      filter,
    ),
    isFiltered: state.search.trim() !== '' || state.origin !== 'all',
    resume: resumer,
    pendingFork:
      forking === null
        ? null
        : {
            conversation: forking,
            confirm: () => {
              setForking(null);
              start(forking);
            },
            cancel: () => {
              setForking(null);
            },
          },
    copy,
    openSession: targets.showSession,
    openConversation: targets.showConversation,
    continueConversation,
    endSession: (sessionId) => {
      closeSession(wsClient, sessionId);
    },
    refresh: () => {
      sessions.live.reload();
      sessions.history.reload();
    },
  };
}

/** The row the palette acts on: the one selected, if it is still listed. */
function selectedRow(
  view: SessionsView,
):
  | { readonly kind: 'session'; readonly session: LiveSessionSummary }
  | { readonly kind: 'conversation'; readonly conversation: ConversationSummary }
  | null {
  const id = view.state.selected;
  const running = view.running.find((entry) => entry.session.sessionId === id);

  if (running !== undefined) {
    return { kind: 'session', session: running.session };
  }

  const conversation = [...view.elsewhere, ...view.history].find(
    (entry) => entry.conversationId === id,
  );

  return conversation === undefined ? null : { kind: 'conversation', conversation };
}

/**
 * The view's actions in the palette — the ones of a row act on the row selected, so every action of
 * the context menu is also a command (S-47).
 */
export function sessionsViewCommands(view: SessionsView): CommandDeclaration[] {
  const selected = () => selectedRow(view);

  return [
    {
      id: 'sessions.refresh',
      labelKey: 'command.sessions.refresh',
      category: 'view',
      run: view.refresh,
    },
    {
      id: 'sessions.toggleSubfolders',
      labelKey: 'command.sessions.toggleSubfolders',
      category: 'view',
      run: () => {
        view.state.setIncludeSubfolders(!view.state.includeSubfolders);
      },
    },
    {
      id: 'sessions.help',
      labelKey: 'command.sessions.help',
      category: 'help',
      run: () => {
        view.state.setHelpOpen(true);
      },
    },
    {
      id: 'sessions.openSelected',
      labelKey: 'command.sessions.openSelected',
      category: 'go',
      when: () => selected() !== null,
      run: () => {
        const row = selected();
        if (row?.kind === 'session') {
          view.openSession(row.session.sessionId);
        } else if (row !== null) {
          view.openConversation(row.conversation.conversationId);
        }
      },
    },
    {
      id: 'sessions.continueSelected',
      labelKey: 'command.sessions.continueSelected',
      category: 'go',
      when: () => selected()?.kind === 'conversation',
      run: () => {
        const row = selected();
        if (row?.kind === 'conversation') {
          view.continueConversation(row.conversation);
        }
      },
    },
    {
      id: 'sessions.copySelectedId',
      labelKey: 'command.sessions.copySelectedId',
      category: 'view',
      when: () => selected() !== null,
      run: () => {
        const row = selected();
        view.copy.copy(
          row?.kind === 'session' ? row.session.claudeSessionId : row?.conversation.conversationId,
        );
      },
    },
    {
      id: 'sessions.endSelected',
      labelKey: 'command.sessions.endSelected',
      category: 'view',
      when: () => selected()?.kind === 'session',
      run: () => {
        const row = selected();
        if (row?.kind === 'session') {
          view.endSession(row.session.sessionId);
        }
      },
    },
  ];
}

/** The refusal of a continue, when it is the one the row asked for. */
export function refusalFor(view: SessionsView, conversationId: string): AppError | null {
  return view.resume.target?.conversationId === conversationId ? view.resume.error : null;
}

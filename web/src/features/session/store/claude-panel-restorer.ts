import type { TabRestorer } from '@/features/workbench';
import { isRecord } from '@/shared/lib/json';
import type { ChangesFilter } from '../types/changes';
import {
  claudePanelStore,
  DEFAULT_CHOICES,
  forgetClaudePanel,
  latestSessions,
} from './claude-panel.store';
import type { DraftChoices, PanelTab, ReviewMarks } from './claude-panel.store';

/** What a reload gives the panel of a tab back: the filter of the changes, and the marks of review. */
export interface KeptClaudePanel {
  readonly changesFilter: ChangesFilter;
  readonly reviewed: Readonly<Record<string, ReviewMarks>>;

  /** The conversations open in the panel, and the one on screen — what was written is not kept. */
  readonly tabs: readonly PanelTab[];
  readonly active: string | null;
}

const MODES: readonly string[] = ['default', 'acceptEdits', 'plan'];
const EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** The choices of a draft, as far as they can be trusted: anything unreadable is the default. */
function choicesFrom(value: unknown): DraftChoices {
  if (!isRecord(value)) {
    return DEFAULT_CHOICES;
  }

  return {
    model: typeof value['model'] === 'string' ? value['model'] : null,
    mode: MODES.includes(value['mode'] as string)
      ? (value['mode'] as DraftChoices['mode'])
      : 'default',
    effort: EFFORTS.includes(value['effort'] as string)
      ? (value['effort'] as DraftChoices['effort'])
      : null,
  };
}

/** A kept tab, or nothing for one that does not read as a tab. */
function tabFrom(value: unknown): PanelTab[] {
  if (!isRecord(value) || typeof value['key'] !== 'string') {
    return [];
  }

  const key = value['key'];

  switch (value['kind']) {
    case 'draft':
      return [{ key, kind: 'draft', choices: choicesFrom(value['choices']) }];
    case 'session':
      return typeof value['sessionId'] === 'string'
        ? [{ key, kind: 'session', sessionId: value['sessionId'] }]
        : [];
    case 'conversation':
      return typeof value['conversationId'] === 'string'
        ? [{ key, kind: 'conversation', conversationId: value['conversationId'] }]
        : [];
    default:
      return [];
  }
}

const FILTERS: readonly string[] = ['pending', 'reviewed', 'all'];

/** The marks of one session, as far as they can be trusted: a path and a revision, both text. */
function marksFrom(value: unknown): ReviewMarks {
  return isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};
}

/** A kept panel, as far as it can be trusted: anything unreadable is its default. */
export function keptClaudePanelFrom(saved: unknown): KeptClaudePanel | undefined {
  if (!isRecord(saved)) {
    return undefined;
  }

  const reviewed = isRecord(saved['reviewed']) ? saved['reviewed'] : {};
  const tabs = (Array.isArray(saved['tabs']) ? saved['tabs'] : []).flatMap(tabFrom);
  const active = tabs.find((tab) => tab.key === saved['active'])?.key ?? null;

  return {
    tabs,
    active,
    changesFilter: FILTERS.includes(saved['changesFilter'] as string)
      ? (saved['changesFilter'] as ChangesFilter)
      : 'pending',
    reviewed: latestSessions(
      Object.fromEntries(Object.entries(reviewed).map(([id, marks]) => [id, marksFrom(marks)])),
    ),
  };
}

/**
 * The panel's part of what a folder tab keeps across a reload: "accepted" survives a reload because
 * it is the tab's state (D-18) — paths and hashes, never what a file says.
 */
export const CLAUDE_PANEL_RESTORER: TabRestorer<KeptClaudePanel> = {
  id: 'session.claudePanel',
  position: 310,
  version: 2,
  parse: keptClaudePanelFrom,
  capture: (path) => {
    const { changesFilter, reviewed, tabs, active } = claudePanelStore(path).getState();
    return { changesFilter, reviewed, tabs, active };
  },
  apply: (path, kept) => {
    claudePanelStore(path).setState(kept);
  },
  subscribe: (path, listener) => claudePanelStore(path).subscribe(listener),
  forget: forgetClaudePanel,
};

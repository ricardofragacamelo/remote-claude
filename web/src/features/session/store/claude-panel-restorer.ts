import type { TabRestorer } from '@/features/workbench';
import { isRecord } from '@/shared/lib/json';
import type { ChangesFilter } from '../types/changes';
import type { ContextItem } from '../types/context';
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

  /**
   * The context of each tab's next prompt (plan 08, S-221): paths and lines, an upload by the id the
   * server holds it under — never the bytes of a file of the desktop, which a draft holds in memory
   * only, nor a text a provider held.
   */
  readonly contexts: Readonly<Record<string, readonly ContextItem[]>>;
}

const MODES: readonly string[] = ['default', 'acceptEdits', 'plan', 'allowAll'];
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

const text = (value: unknown): value is string => typeof value === 'string';
const line = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1;

const UNCHECKED_FILE = { size: null, binary: false, missing: false } as const;

/** How each kind of kept item is read back — `[]` for one that does not read as its kind. */
const READERS: Readonly<
  Record<string, (id: string, value: Record<string, unknown>) => ContextItem[]>
> = {
  file: (id, { path }) => (text(path) ? [{ id, kind: 'file', path, ...UNCHECKED_FILE }] : []),
  folder: (id, { path }) => (text(path) ? [{ id, kind: 'folder', path }] : []),
  range: (id, { path, startLine, endLine }) =>
    text(path) && line(startLine) && line(endLine)
      ? [{ id, kind: 'range', path, startLine, endLine, ...UNCHECKED_FILE }]
      : [],
  upload: (id, value) => uploadFrom(id, value),
};

/** A kept item of the context, as far as it can be trusted — or nothing. */
function itemFrom(value: unknown): ContextItem[] {
  if (!isRecord(value) || !text(value['id'])) {
    return [];
  }

  const read = READERS[String(value['kind'])];
  return read === undefined ? [] : read(value['id'], value);
}

/** An upload the server holds, by its id — the only kind of upload a reload can give back. */
function uploadFrom(id: string, value: Record<string, unknown>): ContextItem[] {
  const { name, mediaType, attachmentId, size, uploadKind } = value;

  return text(name) &&
    text(mediaType) &&
    text(attachmentId) &&
    typeof size === 'number' &&
    (uploadKind === 'image' || uploadKind === 'text')
    ? [{ id, kind: 'upload', name, mediaType, size, uploadKind, attachmentId, error: null }]
    : [];
}

/** What a reload keeps of an item: an upload not held by the server, and a text, are not kept. */
function keptItem(item: ContextItem): boolean {
  return item.kind !== 'text' && (item.kind !== 'upload' || item.attachmentId !== null);
}

function contextsFrom(value: unknown): Record<string, readonly ContextItem[]> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, items]) => {
      const kept = (Array.isArray(items) ? items : []).flatMap(itemFrom);
      return kept.length === 0 ? [] : [[key, kept]];
    }),
  );
}

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
    contexts: contextsFrom(saved['contexts']),
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
    const { changesFilter, reviewed, tabs, active, contexts } = claudePanelStore(path).getState();
    return {
      changesFilter,
      reviewed,
      tabs,
      active,
      contexts: Object.fromEntries(
        Object.entries(contexts).map(([key, items]) => [key, items.filter(keptItem)]),
      ),
    };
  },
  apply: (path, kept) => {
    claudePanelStore(path).setState(kept);
  },
  subscribe: (path, listener) => claudePanelStore(path).subscribe(listener),
  forget: forgetClaudePanel,
};

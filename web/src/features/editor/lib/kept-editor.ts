import { isRecord } from '@/shared/lib/json';
import type { DiffSide, EditorGroup, EditorTab } from '../types/editor';
import { aDiffTab, aFileTab, aGroup, aPreviewTab, emptyLayout } from './layout';
import type { Layout } from './layout';

/** One tab as a reload gives it back — paths only, never content (07 · D-14). */
export type KeptTab =
  | {
      readonly kind: 'file' | 'preview';
      readonly path: string;
      readonly preview: boolean;
      readonly pinned: boolean;
    }
  | {
      readonly kind: 'diff';
      readonly left: DiffSide;
      readonly right: DiffSide;
      readonly pinned: boolean;
    };

export interface KeptGroup {
  readonly tabs: readonly KeptTab[];

  /** The index of the tab on screen, or `null`. */
  readonly active: number | null;
}

/** What a reload gives a folder tab's editor back (S-216): its groups and tabs, and the files opened last. */
export interface KeptEditor {
  readonly groups: readonly KeptGroup[];
  readonly activeGroup: number;
  readonly recent: readonly string[];
}

/** The state of an editor that a reload keeps. */
export interface KeptSource extends Layout {
  readonly recent: readonly string[];
}

function keptTab(tab: EditorTab): KeptTab | null {
  if (tab.kind !== 'diff') {
    return { kind: tab.kind, path: tab.path, preview: tab.preview, pinned: tab.pinned };
  }

  // A diff with a buffer side has nothing to show after a reload: the buffer is gone.
  return tab.left.source === 'disk' && tab.right.source === 'disk'
    ? { kind: 'diff', left: tab.left, right: tab.right, pinned: tab.pinned }
    : null;
}

function keptGroup(group: EditorGroup): KeptGroup {
  const tabs = group.tabs.flatMap((tab) => {
    const kept = keptTab(tab);
    return kept === null ? [] : [{ tab, kept }];
  });
  const active = tabs.findIndex(({ tab }) => tab.id === group.active);

  return { tabs: tabs.map(({ kept }) => kept), active: active === -1 ? null : active };
}

/** What of an editor a reload keeps — paths only. */
export function captureEditor(state: KeptSource): KeptEditor {
  return {
    groups: state.groups.map(keptGroup),
    activeGroup: Math.max(
      state.groups.findIndex((group) => group.id === state.activeGroup),
      0,
    ),
    recent: state.recent,
  };
}

function isSide(value: unknown): value is DiffSide {
  return (
    isRecord(value) &&
    typeof value['path'] === 'string' &&
    (value['source'] === 'disk' || value['source'] === 'buffer')
  );
}

function tabFrom(value: unknown): KeptTab | null {
  if (!isRecord(value) || typeof value['pinned'] !== 'boolean') {
    return null;
  }

  if (
    (value['kind'] === 'file' || value['kind'] === 'preview') &&
    typeof value['path'] === 'string' &&
    typeof value['preview'] === 'boolean'
  ) {
    return {
      kind: value['kind'],
      path: value['path'],
      preview: value['preview'],
      pinned: value['pinned'],
    };
  }

  return value['kind'] === 'diff' && isSide(value['left']) && isSide(value['right'])
    ? { kind: 'diff', left: value['left'], right: value['right'], pinned: value['pinned'] }
    : null;
}

function groupFrom(value: unknown): KeptGroup | null {
  if (!isRecord(value) || !Array.isArray(value['tabs'])) {
    return null;
  }

  const tabs = value['tabs'].map(tabFrom).filter((tab): tab is KeptTab => tab !== null);
  const active = value['active'];

  return {
    tabs,
    active: typeof active === 'number' && active >= 0 && active < tabs.length ? active : null,
  };
}

/**
 * A kept editor, as far as it can be trusted: a tab or a group that does not read as one is left out,
 * and anything else is the empty editor — never an error (06 · S-135).
 */
export function keptEditorFrom(saved: unknown): KeptEditor | undefined {
  if (!isRecord(saved) || !Array.isArray(saved['groups'])) {
    return undefined;
  }

  const groups = saved['groups']
    .map(groupFrom)
    .filter((group): group is KeptGroup => group !== null);
  const recent = Array.isArray(saved['recent'])
    ? saved['recent'].filter((path): path is string => typeof path === 'string')
    : [];
  const activeGroup = typeof saved['activeGroup'] === 'number' ? saved['activeGroup'] : 0;

  return { groups, activeGroup, recent };
}

/** A kept tab as a tab again. */
function tabOf(tab: KeptTab): EditorTab {
  if (tab.kind === 'diff') {
    return aDiffTab(tab.left, tab.right);
  }

  return tab.kind === 'file' ? aFileTab(tab.path, tab.preview) : aPreviewTab(tab.path, tab.preview);
}

/** The layout a kept editor gives back — new groups, the same tabs. */
export function layoutFrom(kept: KeptEditor): Layout {
  const groups = kept.groups
    .filter((group) => group.tabs.length > 0)
    .map((group) => {
      const tabs = group.tabs.map((tab) => ({ ...tabOf(tab), pinned: tab.pinned }));
      return aGroup(tabs, tabs[group.active ?? 0]?.id ?? null);
    });

  if (groups.length === 0) {
    return emptyLayout();
  }

  return { groups, activeGroup: (groups[kept.activeGroup] ?? groups[0])?.id ?? '' };
}

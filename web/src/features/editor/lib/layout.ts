import type {
  DiffSide,
  DiffTab,
  EditorGroup,
  EditorTab,
  FileTab,
  PreviewTab,
} from '../types/editor';
import { previewsText } from './preview-kinds';

/** The groups of a folder tab's editor area, and the one with the focus. */
export interface Layout {
  /** Never empty: an editor area with nothing open is one empty group. */
  readonly groups: readonly EditorGroup[];
  readonly activeGroup: string;
}

/** How many groups fit side by side — "open to the side" makes a second, and a third (B-33). */
export const MAX_GROUPS = 3;

/** The tab id of a file — one tab per file in a group. */
export function fileTabId(path: string): string {
  return `file:${path}`;
}

/** The tab id of a diff of two sides. */
export function diffTabId(left: DiffSide, right: DiffSide): string {
  return `diff:${sideId(left)}|${sideId(right)}`;
}

/** One side, as a tab id names it — a version of the history by its entry. */
function sideId(side: DiffSide): string {
  const version = side.version === undefined ? '' : `@${side.version.entryId}`;
  return `${side.source}:${side.path}${version}`;
}

export function aFileTab(path: string, preview: boolean): FileTab {
  return { id: fileTabId(path), kind: 'file', path, preview, pinned: false };
}

export function aDiffTab(left: DiffSide, right: DiffSide): DiffTab {
  return { id: diffTabId(left, right), kind: 'diff', left, right, preview: false, pinned: false };
}

/** The tab id of a file's preview — a group may show a file's editor and its preview side by side. */
export function previewTabId(path: string): string {
  return `preview:${path}`;
}

export function aPreviewTab(path: string, preview: boolean): PreviewTab {
  return { id: previewTabId(path), kind: 'preview', path, preview, pinned: false };
}

let groups = 0;

/** A new, empty group, with an id no other group of the page has. */
export function aGroup(tabs: readonly EditorTab[] = [], active: string | null = null): EditorGroup {
  groups += 1;
  return { id: `group-${String(groups)}`, tabs, active };
}

/** The layout of an editor area with nothing open. */
export function emptyLayout(): Layout {
  const group = aGroup();
  return { groups: [group], activeGroup: group.id };
}

/** The group with the focus — the first one when the id is stale. */
export function activeGroupOf(layout: Layout): EditorGroup {
  return (
    layout.groups.find((group) => group.id === layout.activeGroup) ??
    (layout.groups[0] as EditorGroup)
  );
}

/** The tab on screen in a group. */
export function activeTabOf(group: EditorGroup): EditorTab | undefined {
  return group.tabs.find((tab) => tab.id === group.active);
}

/** Pinned tabs first, each side in the order it had — pinning keeps a tab at the left. */
function ordered(tabs: readonly EditorTab[]): readonly EditorTab[] {
  return [...tabs.filter((tab) => tab.pinned), ...tabs.filter((tab) => !tab.pinned)];
}

function replaceGroup(layout: Layout, group: EditorGroup): Layout {
  return {
    ...layout,
    groups: layout.groups.map((each) => (each.id === group.id ? group : each)),
  };
}

/**
 * A tab put in a group, and made the one on screen there (S-209, S-214):
 *
 * - the group has it already → that one comes to the front, and stops being a preview when this is
 *   not one — opening the same file again never makes a second tab;
 * - it is a preview and the group has a preview → it takes that one's place;
 * - otherwise it goes right after the tab on screen.
 */
export function withTab(group: EditorGroup, tab: EditorTab): EditorGroup {
  const existing = group.tabs.find((each) => each.id === tab.id);

  if (existing !== undefined) {
    const kept = tab.preview || !existing.preview ? existing : { ...existing, preview: false };
    return {
      ...group,
      tabs: group.tabs.map((each) => (each === existing ? kept : each)),
      active: tab.id,
    };
  }

  const preview = tab.preview ? group.tabs.find((each) => each.preview) : undefined;

  if (preview !== undefined) {
    return {
      ...group,
      tabs: group.tabs.map((each) => (each === preview ? tab : each)),
      active: tab.id,
    };
  }

  const at = group.tabs.findIndex((each) => each.id === group.active);
  const tabs = [...group.tabs.slice(0, at + 1), tab, ...group.tabs.slice(at + 1)];

  return { ...group, tabs: ordered(tabs), active: tab.id };
}

/**
 * Opens a tab in the group with the focus — or, `toSide`, in the group to its right, made when there
 * is none and there is room for one (B-33). The group it lands in takes the focus.
 */
export function openIn(layout: Layout, tab: EditorTab, toSide: boolean): Layout {
  const current = activeGroupOf(layout);

  if (!toSide) {
    return replaceGroup({ ...layout, activeGroup: current.id }, withTab(current, tab));
  }

  const at = layout.groups.indexOf(current);
  const beside = layout.groups[at + 1];

  if (beside !== undefined || layout.groups.length >= MAX_GROUPS) {
    const target = beside ?? (layout.groups.at(-1) as EditorGroup);
    return replaceGroup({ ...layout, activeGroup: target.id }, withTab(target, tab));
  }

  const made = withTab(aGroup(), tab);
  const next = [...layout.groups.slice(0, at + 1), made, ...layout.groups.slice(at + 1)];

  return { groups: next, activeGroup: made.id };
}

/**
 * The tab that is on screen once `closed` go from a group: the neighbour to the right, else the one
 * to the left — as the editor people know does.
 */
function neighbourAfter(group: EditorGroup, closed: readonly string[]): string | null {
  const at = group.tabs.findIndex((tab) => tab.id === group.active);
  const right = group.tabs.slice(at + 1).find((tab) => !closed.includes(tab.id));
  const left = [...group.tabs.slice(0, Math.max(at, 0))]
    .reverse()
    .find((tab) => !closed.includes(tab.id));

  return (right ?? left)?.id ?? null;
}

/**
 * Tabs taken out of a group. A group left with nothing closes, unless it is the only one: an editor
 * area always has a group to open into (S-223).
 */
export function withoutTabs(layout: Layout, groupId: string, ids: readonly string[]): Layout {
  const group = layout.groups.find((each) => each.id === groupId);

  if (group === undefined) {
    return layout;
  }

  const tabs = group.tabs.filter((tab) => !ids.includes(tab.id));
  const active =
    group.active !== null && ids.includes(group.active) ? neighbourAfter(group, ids) : group.active;

  if (tabs.length > 0 || layout.groups.length === 1) {
    return replaceGroup(layout, { ...group, tabs, active: tabs.length === 0 ? null : active });
  }

  const at = layout.groups.indexOf(group);
  const groupsLeft = layout.groups.filter((each) => each !== group);
  const focus =
    layout.activeGroup === group.id
      ? (groupsLeft[Math.max(at - 1, 0)] as EditorGroup).id
      : layout.activeGroup;

  return { groups: groupsLeft, activeGroup: focus };
}

/** A tab moved to an index of its group — by a drag, or by the keyboard (S-213). Pinned stay left. */
export function movedTo(group: EditorGroup, id: string, index: number): EditorGroup {
  const tab = group.tabs.find((each) => each.id === id);

  if (tab === undefined) {
    return group;
  }

  const rest = group.tabs.filter((each) => each !== tab);
  const at = Math.min(Math.max(index, 0), rest.length);

  return { ...group, tabs: ordered([...rest.slice(0, at), tab, ...rest.slice(at)]) };
}

/**
 * A tab dragged from one group into another (S-221): it leaves the first — which closes when it was
 * its last — and lands in the second at `index`, on screen and with the focus.
 */
export function movedAcross(
  layout: Layout,
  from: string,
  id: string,
  to: string,
  index: number,
): Layout {
  const source = layout.groups.find((group) => group.id === from);
  const tab = source?.tabs.find((each) => each.id === id);
  const target = layout.groups.find((group) => group.id === to);

  if (tab === undefined || target === undefined || from === to) {
    return layout;
  }

  const landed = movedTo(
    withTab({ ...target, tabs: target.tabs.filter((each) => each.id !== id) }, tab),
    id,
    index,
  );
  const left = withoutTabs(replaceGroup(layout, landed), from, [id]);

  return { ...left, activeGroup: to };
}

/**
 * Every tab with `change` applied to the ones `pick` chooses — the tab on screen of each group
 * followed to what it became, its id included.
 */
export function mapTabs(
  layout: Layout,
  pick: (tab: EditorTab) => boolean,
  change: (tab: EditorTab) => EditorTab,
): Layout {
  return {
    ...layout,
    groups: layout.groups.map((group) => {
      const changed = group.tabs.map((tab) => (pick(tab) ? change(tab) : tab));
      const at = group.tabs.findIndex((tab) => tab.id === group.active);

      return { ...group, tabs: ordered(changed), active: changed[at]?.id ?? group.active };
    }),
  };
}

/** The file paths every group has open, each once. */
export function openPaths(layout: Layout): readonly string[] {
  const paths = layout.groups.flatMap((group) =>
    group.tabs.flatMap((tab) => (tab.kind === 'file' ? [tab.path] : [])),
  );

  return [...new Set(paths)];
}

/**
 * Whether some tab of the layout still shows a file's text — a buffer lives while one does, the
 * preview of a text kind included: the preview of a markdown file shows the buffer, unsaved changes
 * and all (S-312). The preview of a picture shows the bytes on disk, and keeps no buffer.
 */
export function isShown(layout: Layout, path: string): boolean {
  return layout.groups.some((group) =>
    group.tabs.some(
      (tab) =>
        (tab.kind === 'file' && tab.path === path) ||
        (tab.kind === 'preview' && tab.path === path && previewsText(path)) ||
        (tab.kind === 'diff' &&
          [tab.left, tab.right].some((side) => side.source === 'buffer' && side.path === path)),
    ),
  );
}

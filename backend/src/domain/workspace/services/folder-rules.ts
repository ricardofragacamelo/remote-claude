import type { WorkspaceFolder } from '../entities/workspace-folder.entity';
import { OpenFoldersLimitReachedError } from '../errors/open-folders-limit-reached.error';
import { OpenFoldersOrderConflictError } from '../errors/open-folders-order-conflict.error';
import type { WorkspacePath } from '../value-objects/workspace-path.value-object';

/**
 * How many folder tabs one user may have open.
 *
 * Eight, inside the sixteen sessions one connection may attach: the sessions of an inactive tab stay
 * attached, and the ten a machine runs fit ([06 · D-11](../../../../../docs/plans/06-workbench/decisions.md)).
 */
export const OPEN_FOLDERS_LIMIT = 8;

/**
 * How many unpinned folders the recent list keeps.
 *
 * A pinned folder is never counted against it and never dropped by it, and neither is one whose
 * tab is open — the ceiling trims history, never something the user is holding on to.
 */
export const RECENT_FOLDERS_LIMIT = 20;

/** What opening a folder comes to, given the folders the user already has. */
export interface OpeningDecision {
  /** A tab was already open for it: nothing new is added. */
  readonly alreadyOpen: boolean;
  /** Where its tab sits. */
  readonly position: number;
}

/**
 * Where a folder being opened goes among the tabs — or the refusal.
 *
 * Opening one that is already open is not an error and not a second tab: it answers the tab there
 * is, which is what makes the call safe to repeat.
 *
 * @param folders every folder of this user
 * @param path the real path being opened
 * @param limit how many tabs may be open
 * @throws {OpenFoldersLimitReachedError} a new tab, with the ceiling already reached
 */
export function decideOpening(
  folders: readonly WorkspaceFolder[],
  path: WorkspacePath,
  limit: number,
): OpeningDecision {
  const tabs = tabsOf(folders);
  const existing = tabs.find((tab) => tab.folder.path.equals(path));

  if (existing !== undefined) {
    return { alreadyOpen: true, position: existing.position };
  }

  if (tabs.length >= limit) {
    throw new OpenFoldersLimitReachedError(limit);
  }

  return { alreadyOpen: false, position: Math.max(-1, ...tabs.map((tab) => tab.position)) + 1 };
}

/** A folder on the recent list, with the instant that puts it there. */
export interface RecentFolder {
  readonly folder: WorkspaceFolder;
  readonly lastOpenedAt: Date;
}

/** The recent list, in the order the welcome screen shows it: pinned first, then newest first. */
export function orderRecent(folders: readonly WorkspaceFolder[]): RecentFolder[] {
  return recentOf(folders)
    .sort(byRecency)
    .map((recent) => ({ folder: recent.folder, lastOpenedAt: recent.openedAt }));
}

/**
 * The folders the recent list lets go of: the unpinned ones past the `limit` newest, whose tab is
 * not open. A pinned folder and an open one are never among them.
 */
export function recentBeyondLimit(
  folders: readonly WorkspaceFolder[],
  limit: number,
): WorkspaceFolder[] {
  return recentOf(folders)
    .filter((recent) => !recent.folder.pinned)
    .sort(byRecency)
    .slice(limit)
    .map((recent) => recent.folder)
    .filter((folder) => !folder.isOpen);
}

/** The open tabs, in the order the user left them. */
export function orderTabs(folders: readonly WorkspaceFolder[]): WorkspaceFolder[] {
  return tabsOf(folders)
    .sort((left, right) => left.position - right.position)
    .map((tab) => tab.folder);
}

/**
 * The position of each open tab in a new order.
 *
 * The order has to name every open tab exactly once — nothing more, nothing less. Anything else is
 * an order of some other set of tabs, usually one another window has already changed.
 *
 * @param folders every folder of this user
 * @param requested the new order
 * @returns the position of each path, keyed by its value
 * @throws {OpenFoldersOrderConflictError} the order is not an order of the open tabs
 */
export function reorderTabs(
  folders: readonly WorkspaceFolder[],
  requested: readonly WorkspacePath[],
): ReadonlyMap<string, number> {
  const open = new Set(tabsOf(folders).map((tab) => tab.folder.path.value));
  const positions = new Map(requested.map((path, index) => [path.value, index]));
  const sameSet =
    positions.size === requested.length &&
    positions.size === open.size &&
    [...positions.keys()].every((path) => open.has(path));

  if (!sameSet) {
    throw new OpenFoldersOrderConflictError(requested.length, open.size);
  }

  return positions;
}

/** A recent folder, as the rules compare it. */
interface Recent {
  readonly folder: WorkspaceFolder;
  readonly openedAt: Date;
  readonly at: number;
}

/** A folder whose tab is open, with where the tab sits. */
interface Tab {
  readonly folder: WorkspaceFolder;
  readonly position: number;
}

function recentOf(folders: readonly WorkspaceFolder[]): Recent[] {
  const recent: Recent[] = [];

  for (const folder of folders) {
    if (folder.lastOpenedAt !== null) {
      recent.push({ folder, openedAt: folder.lastOpenedAt, at: folder.lastOpenedAt.getTime() });
    }
  }

  return recent;
}

function tabsOf(folders: readonly WorkspaceFolder[]): Tab[] {
  const tabs: Tab[] = [];

  for (const folder of folders) {
    if (folder.tabPosition !== null) {
      tabs.push({ folder, position: folder.tabPosition });
    }
  }

  return tabs;
}

/** Pinned first; then the most recently opened first; the path breaks a tie, so the order is fixed. */
function byRecency(left: Recent, right: Recent): number {
  if (left.folder.pinned !== right.folder.pinned) {
    return left.folder.pinned ? -1 : 1;
  }

  if (left.at !== right.at) {
    return right.at - left.at;
  }

  return left.folder.path.value < right.folder.path.value ? -1 : 1;
}

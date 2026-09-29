import { UserId } from '@domain/auth';
import { WorkspaceFolder, WorkspacePath } from '@domain/workspace';
import type { WorkspaceFolderSnapshot } from '@domain/workspace';
import { OWNER } from './workspace.builder';

/** An instant tests measure recency from. */
export const OPENED_AT = new Date('2026-09-28T12:00:00.000Z');

/**
 * A folder a user opened, with sensible defaults — recent, unpinned, tab closed — so a test states
 * only what it cares about.
 */
export function aFolder(
  overrides: Partial<Omit<WorkspaceFolderSnapshot, 'path' | 'root' | 'userId'>> & {
    readonly path?: string;
    readonly root?: string;
    readonly user?: string;
  } = {},
): WorkspaceFolder {
  return WorkspaceFolder.restore({
    userId: UserId.create(overrides.user ?? OWNER),
    path: WorkspacePath.create(overrides.path ?? '/srv/projects/app'),
    root: WorkspacePath.create(overrides.root ?? '/srv/projects'),
    lastOpenedAt: overrides.lastOpenedAt === undefined ? OPENED_AT : overrides.lastOpenedAt,
    pinned: overrides.pinned ?? false,
    tabPosition: overrides.tabPosition === undefined ? null : overrides.tabPosition,
  });
}

/** `OPENED_AT` moved by a number of minutes — later for a positive one. */
export function minutesAfter(minutes: number): Date {
  return new Date(OPENED_AT.getTime() + minutes * 60_000);
}

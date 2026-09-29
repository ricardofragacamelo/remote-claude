import type { UserId } from '@domain/auth';
import {
  WorkspaceForbiddenError,
  WorkspaceNotADirectoryError,
  WorkspaceNotAllowedError,
  WorkspaceNotFoundError,
} from '@domain/workspace';
import type { WorkspaceAllowlist, WorkspaceFolder } from '@domain/workspace';
import type { WorkspaceAllowlistSource } from './ports/workspace-allowlist.port';
import type { WorkspaceDirectoryProbe } from './ports/workspace-directory.probe';
import type { WorkspaceFolderRepository } from './ports/workspace-folder.repository';
import { resolveFolder } from './resolve-folder';

/** Whether a folder a user opened can still be used. */
export type FolderState = 'available' | 'notAllowed' | 'missing';

/** A folder a user opened, as it stands **now**. */
export interface FolderView {
  readonly folder: WorkspaceFolder;
  /** The label of the root it lives under now, or `null` once it lives under none of theirs. */
  readonly rootLabel: string | null;
  readonly state: FolderState;
}

/**
 * A stored folder, revalidated.
 *
 * The record says the folder was opened; it does not say it may still be. A folder that left the
 * allowlist, or the disk, comes back **marked** instead of vanishing from the list — "gone" and
 * "no longer usable" are different answers for somebody looking for it (plan 06, S-37, S-47) — and
 * it is checked by the very gate that opened it, so the two can never disagree.
 *
 * @param allowlist the list as it is now
 */
export async function viewOf(
  allowlist: WorkspaceAllowlist,
  directories: WorkspaceDirectoryProbe,
  folder: WorkspaceFolder,
  userId: UserId,
): Promise<FolderView> {
  const root = allowlist.for(userId).find((workspace) => workspace.contains(folder.path));

  return {
    folder,
    rootLabel: root?.label ?? null,
    state: await stateOf(allowlist, directories, folder, userId),
  };
}

async function stateOf(
  allowlist: WorkspaceAllowlist,
  directories: WorkspaceDirectoryProbe,
  folder: WorkspaceFolder,
  userId: UserId,
): Promise<FolderState> {
  try {
    await resolveFolder(allowlist, directories, folder.path.value, userId);
    return 'available';
  } catch (error) {
    if (error instanceof WorkspaceNotAllowedError || error instanceof WorkspaceForbiddenError) {
      return 'notAllowed';
    }

    if (error instanceof WorkspaceNotFoundError || error instanceof WorkspaceNotADirectoryError) {
      return 'missing';
    }

    // Anything else is not an answer about the folder — the disk could not be asked — and saying
    // "missing" for it would turn "I cannot tell" into "it is not there".
    throw error;
  }
}

/** A user's folders as stored, and a way to see any one of them as it stands now. */
export interface FoldersOfUser {
  readonly folders: readonly WorkspaceFolder[];
  readonly view: (folder: WorkspaceFolder) => Promise<FolderView>;
}

/**
 * What the two listings of folders share — the tabs and the recent list: the stored records of one
 * user, each seen through {@link viewOf} against the allowlist **as it is now**, read once per call.
 */
export class RevalidatedFolders {
  constructor(
    private readonly allowlist: WorkspaceAllowlistSource,
    private readonly directories: WorkspaceDirectoryProbe,
    private readonly repository: WorkspaceFolderRepository,
  ) {}

  async of(userId: UserId): Promise<FoldersOfUser> {
    const allowlist = this.allowlist.current();

    return {
      folders: await this.repository.findByUser(userId),
      view: (folder) => viewOf(allowlist, this.directories, folder, userId),
    };
  }
}

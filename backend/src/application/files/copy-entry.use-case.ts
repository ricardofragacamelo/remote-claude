import type { UserId } from '@domain/auth';
import type { FileLimits } from './file-limits';
import type { FolderDisk } from './ports/folder-disk.port';
import type { EntryRelocator, RelocateCommand, RelocatedEntry } from './relocate-entry';

/**
 * Copies a file or a folder of an open folder, never over another — plan 07, B-14.
 *
 * A folder is copied all the way down; a link inside it is copied **as a link**, never followed —
 * following one would copy whatever it points at, inside the open folder or not (S-101). A folder
 * past the ceiling (entries or bytes) is refused before anything is copied (S-104), and a copy that
 * fails halfway removes what it had made (S-105). "Duplicate" is this, with a name the web picked.
 */
export class CopyEntryUseCase {
  constructor(
    private readonly relocator: EntryRelocator,
    private readonly disk: FolderDisk,
    private readonly limits: Pick<FileLimits, 'copyEntries' | 'copyBytes'>,
  ) {}

  execute(command: RelocateCommand, userId: UserId): Promise<RelocatedEntry> {
    return this.relocator.relocate(command, userId, 'file.copied', (copy) =>
      this.disk.copy(copy.source, copy.target, {
        entries: this.limits.copyEntries,
        bytes: this.limits.copyBytes,
      }),
    );
  }
}

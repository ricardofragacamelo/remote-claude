import type { UserId } from '@domain/auth';
import type { FolderDisk } from './ports/folder-disk.port';
import type { EntryRelocator, RelocateCommand, RelocatedEntry } from './relocate-entry';

/**
 * Renames or moves an entry of an open folder, **never over another** — plan 07, B-13.
 *
 * The `rename` of Linux replaces the destination in silence, which is exactly the defect to avoid
 * ([07 · D-12](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-12--mover-sem-sobrescrever)):
 * the disk moves a file by `link` and `unlink`, and a folder after a check under the lock. Across
 * filesystems it refuses (`crossDevice`) rather than copying and deleting behind the person's back
 * (S-95). The `If-Match` is optional — the web sends it when the file is open in a tab, which is what
 * makes "undo rename" safe.
 */
export class MoveEntryUseCase {
  constructor(
    private readonly relocator: EntryRelocator,
    private readonly disk: FolderDisk,
  ) {}

  execute(command: RelocateCommand, userId: UserId): Promise<RelocatedEntry> {
    return this.relocator.relocate(command, userId, 'file.moved', (move) =>
      this.disk.move(move.source, move.target),
    );
  }
}

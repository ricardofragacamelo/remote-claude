import { FilePath, needsHash, originOf } from '@domain/files';
import type { ChangeOrigin, Etag, FolderChange } from '@domain/files';
import type { Clock } from '@domain/shared';
import type { WorkspacePath } from '@domain/workspace';
import type { ClaudeWrites, UserWrites } from './claude-writes';
import type { FolderDisk } from './ports/folder-disk.port';

/** Told when a file could not be read to compare it — the label falls back, the change still goes. */
export type UnreadableReporter = (path: string, error: unknown) => void;

/** A change with who made it, as far as the server can tell. */
export interface LabelledChange extends FolderChange {
  readonly origin: ChangeOrigin;
}

/**
 * Who made each change of a window — 07 · B-22.
 *
 * The marks come from the two memories of recent writes, Claude's and the person's; the rule is the
 * domain's ({@link originOf}). The file is read only when a mark left known bytes there to compare
 * with, and read through the same fenced port as everything else in `files`: a path that cannot be
 * read — gone already, renamed, outside the fence — is simply not anybody's write.
 */
export class ChangeOrigins {
  constructor(
    private readonly claude: ClaudeWrites,
    private readonly user: UserWrites,
    private readonly disk: Pick<FolderDisk, 'version'>,
    private readonly clock: Clock,
    private readonly unreadable: UnreadableReporter,
  ) {}

  /** @param root the watched folder the paths are relative to */
  async label(root: WorkspacePath, changes: readonly FolderChange[]): Promise<LabelledChange[]> {
    const now = this.clock.now();
    const labelled: LabelledChange[] = [];

    for (const change of changes) {
      labelled.push({ ...change, origin: await this.originOf(root, change, now) });
    }

    return labelled;
  }

  private async originOf(
    root: WorkspacePath,
    change: FolderChange,
    now: Date,
  ): Promise<ChangeOrigin> {
    const real = change.path === '' ? root.value : `${root.value}/${change.path}`;
    const marks = [...this.claude.marksFor(real, now), ...this.user.marksFor(real, now)];
    const current = needsHash(change.kind, marks) ? await this.versionOf(root, change.path) : null;

    return originOf(change.kind, marks, current);
  }

  private async versionOf(root: WorkspacePath, path: string): Promise<Etag | null> {
    try {
      return await this.disk.version(FilePath.create(root, path));
    } catch (error) {
      // A label, never a decision: what cannot be read now is nobody's write. It is reported, and
      // the change itself still goes out.
      this.unreadable(path, error);
      return null;
    }
  }
}

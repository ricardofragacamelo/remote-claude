import type { UserId } from '@domain/auth';
import { pageOfSessions } from '@domain/transcript';
import type { Page, SessionListCursor, TranscriptSession } from '@domain/transcript';
import type { WorkspacePath } from '@domain/workspace';
import type { WorkspaceAllowlistSource } from '@application/workspace';
import type { TranscriptStore } from './ports/transcript-store.port';
import type { ListedTranscript, TranscriptAudience } from './transcript-audience';

/** Which sessions to list: one directory, one page, always for somebody. */
export interface ListTranscriptsQuery {
  readonly userId: UserId;

  /** The directory whose conversations to list — a root of the allowlist, or a path inside one. */
  readonly workspacePath: string;

  /**
   * Whether the conversations of the folders below it come too (plan 08, D-05). Off, the directory
   * is matched exactly, as the SDK lists it.
   */
  readonly includeSubfolders: boolean;

  /** Where the previous page ended, or `null` for the most recent sessions. */
  readonly after: SessionListCursor | null;

  readonly limit: number;
}

/**
 * The conversations of one workspace — ours and the ones begun elsewhere, each with its origin and
 * what it is doing now.
 *
 * The directory clears the allowlist **before** the SDK is asked anything: a path outside the
 * caller's roots is refused with the same answer that refuses running there (S-73), and costs no
 * read of the store. Then every session the SDK returns is fenced again, on the `cwd` it reports,
 * because the directory we asked about is not proof of where a session ran (S-54, S-55).
 *
 * It lists one directory with `listSessions({ dir })`, exactly. Only the "include subfolders" filter
 * of plan 08 (D-05) asks for the whole store — the SDK does not descend — and then keeps what ran
 * **inside** the folder, by the `cwd` the SDK reported: the fence is the same, and only where the
 * list comes from changed.
 */
export class ListTranscriptsUseCase {
  constructor(
    private readonly allowlist: WorkspaceAllowlistSource,
    private readonly store: TranscriptStore,
    private readonly audience: TranscriptAudience,
  ) {}

  /**
   * @throws {import('@domain/workspace').WorkspaceNotAllowedError} outside every root
   * @throws {import('@domain/workspace').WorkspaceForbiddenError} a root of somebody else
   * @throws {import('@domain/workspace').InvalidWorkspacePathError} not an absolute path
   */
  async execute(query: ListTranscriptsQuery): Promise<Page<ListedTranscript, SessionListCursor>> {
    const allowlist = this.allowlist.current();
    const { path } = allowlist.resolve(query.workspacePath, query.userId);

    const sessions = await this.sessionsOf(path, query.includeSubfolders);
    const visible = await this.audience.shown(sessions, query.userId, allowlist);

    return pageOfSessions(visible, query.after, query.limit);
  }

  /** The directory exactly, or everything that ran inside it — by the `cwd` the SDK reported. */
  private async sessionsOf(
    folder: WorkspacePath,
    includeSubfolders: boolean,
  ): Promise<readonly TranscriptSession[]> {
    if (!includeSubfolders) {
      return this.store.list(folder.value);
    }

    return (await this.store.listAll()).filter((session) => ranInside(session, folder));
  }
}

/**
 * Whether a session ran in the folder or below it, by path segment.
 *
 * The `cwd` is what the CLI's process had, which is a real path: a subfolder that is a link out of
 * the root records the place it points to, and that place is not inside (S-29).
 */
function ranInside(session: TranscriptSession, folder: WorkspacePath): boolean {
  const cwd = session.cwd;

  return cwd !== null && (cwd === folder.value || cwd.startsWith(`${folder.value}/`));
}

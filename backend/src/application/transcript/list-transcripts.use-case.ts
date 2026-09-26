import type { UserId } from '@domain/auth';
import { pageOfSessions, transcriptOriginFor } from '@domain/transcript';
import type { Page, SessionListCursor, VisibleTranscriptSession } from '@domain/transcript';
import type { WorkspaceAllowlistSource } from '@application/workspace';
import type { TranscriptOriginSource } from './ports/transcript-origin.source';
import type { TranscriptStore } from './ports/transcript-store.port';

/** Which sessions to list: one directory, one page, always for somebody. */
export interface ListTranscriptsQuery {
  readonly userId: UserId;

  /** The directory whose conversations to list — a root of the allowlist, or a path inside one. */
  readonly workspacePath: string;

  /** Where the previous page ended, or `null` for the most recent sessions. */
  readonly after: SessionListCursor | null;

  readonly limit: number;
}

/**
 * The conversations of one workspace — ours and the ones begun elsewhere, each with its origin.
 *
 * The directory clears the allowlist **before** the SDK is asked anything: a path outside the
 * caller's roots is refused with the same answer that refuses running there (S-73), and costs no
 * read of the store. Then every session the SDK returns is fenced again, on the `cwd` it reports,
 * because the directory we asked about is not proof of where a session ran (S-54, S-55).
 *
 * It lists per workspace, one `listSessions({ dir })` at a time, and never the whole store — the
 * two-level navigation of [D-03](../../../../docs/plans/04-transcript-and-resume/decisions.md).
 */
export class ListTranscriptsUseCase {
  constructor(
    private readonly allowlist: WorkspaceAllowlistSource,
    private readonly store: TranscriptStore,
    private readonly origins: TranscriptOriginSource,
  ) {}

  /**
   * @throws {import('@domain/workspace').WorkspaceNotAllowedError} outside every root
   * @throws {import('@domain/workspace').WorkspaceForbiddenError} a root of somebody else
   * @throws {import('@domain/workspace').InvalidWorkspacePathError} not an absolute path
   */
  async execute(
    query: ListTranscriptsQuery,
  ): Promise<Page<VisibleTranscriptSession, SessionListCursor>> {
    const allowlist = this.allowlist.current();
    const { path } = allowlist.resolve(query.workspacePath, query.userId);

    const sessions = await this.store.list(path.value);
    const openers = await this.origins.openersOf(sessions.map((session) => session.id));

    const visible = sessions.flatMap((session): VisibleTranscriptSession[] => {
      const origin = transcriptOriginFor(session, {
        allowlist,
        userId: query.userId,
        openedBy: openers.get(session.id.value),
      });

      return origin === null ? [] : [{ ...session, origin }];
    });

    return pageOfSessions(visible, query.after, query.limit);
  }
}

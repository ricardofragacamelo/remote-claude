import { SingleFlight } from '@application/shared';
import type { LiveSession } from './session-registry';

/**
 * How many answers a cache keeps. One per installation and workspace, and a machine has a handful
 * of workspaces and one installation at a time — the ceiling is there so that a long-lived process
 * that saw many versions does not keep every one of them.
 */
export const MAX_CACHED_LISTS = 16;

/**
 * Something the installation says about itself — its slash commands, its models — asked once and
 * remembered.
 *
 * Keyed by **the version of the CLI the session spawned and the workspace it runs in**. The version,
 * because the answer changes with the CLI and one cached across an update would offer what no longer
 * exists ([D-05](../../../../docs/plans/04-transcript-and-resume/decisions.md#d-05--o-menu-é-descoberta-não-fronteira));
 * the workspace, because a project's `.claude/` brings commands and skills of its own.
 *
 * Two sessions asking together make **one** call (S-36, S-167): the second waits on the first. An
 * answer whose version is unknown is shared while it is being asked and never kept — nothing would
 * say when it stopped being true. A failure is never kept either: the next ask tries again.
 */
export class InstallationCache<T> {
  private readonly answers = new Map<string, T>();
  private readonly asking = new SingleFlight<T>();

  constructor(private readonly capacity: number = MAX_CACHED_LISTS) {}

  /**
   * The answer for this session's installation and workspace — remembered, or asked of it.
   *
   * @throws whatever `ask` threw — and then nothing was cached
   */
  of(live: LiveSession, ask: (live: LiveSession) => Promise<T>): Promise<T> {
    const version = live.handle.cliVersion;
    const key = keyOf(version, live.session.workspace.value);

    const known = this.answers.get(key);
    if (known !== undefined) {
      // Taken out and put back, so the order of the map is the order of use and the eviction
      // below drops the one nobody asked for longest.
      this.answers.delete(key);
      this.answers.set(key, known);
      return Promise.resolve(known);
    }

    return this.asking.run(key, () =>
      ask(live).then((answer) => {
        if (version !== null) {
          this.remember(key, answer);
        }
        return answer;
      }),
    );
  }

  /**
   * Keeps an answer that was not asked of a live session — the query that only asks, of the
   * catalogue before a session (plan 08, D-13). An unknown version is never kept, as above.
   */
  put(version: string | null, workspace: string, answer: T): void {
    if (version !== null) {
      this.remember(keyOf(version, workspace), answer);
    }
  }

  /**
   * The answer remembered last for a workspace, whatever version gave it — what is known about an
   * installation before a session of it has said its version.
   */
  latestFor(workspace: string): T | null {
    let latest: T | null = null;

    for (const [key, answer] of this.answers) {
      if ((JSON.parse(key) as [string | null, string])[1] === workspace) {
        latest = answer;
      }
    }

    return latest;
  }

  private remember(key: string, answer: T): void {
    this.answers.set(key, answer);

    for (const oldest of this.answers.keys()) {
      if (this.answers.size <= this.capacity) {
        break;
      }
      this.answers.delete(oldest);
    }
  }
}

function keyOf(version: string | null, workspace: string): string {
  return JSON.stringify([version, workspace]);
}

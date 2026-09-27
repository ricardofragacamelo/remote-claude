import type { SlashCommand } from '@domain/session';
import type { LiveSession } from './session-registry';

/**
 * How many lists the catalogue keeps. One per installation and workspace, and a machine has a
 * handful of workspaces and one installation at a time — the ceiling is there so that a long-lived
 * process that saw many versions does not keep every one of them.
 */
export const MAX_CACHED_LISTS = 16;

/**
 * The slash commands of the installation, asked once and remembered.
 *
 * Keyed by **the version of the CLI the session spawned and the workspace it runs in**. The version,
 * because the list changes with the CLI and a list cached across an update would offer commands that
 * no longer exist ([D-05](../../../../docs/plans/04-transcript-and-resume/decisions.md#d-05--o-menu-é-descoberta-não-fronteira));
 * the workspace, because a project's `.claude/` brings commands and skills of its own, and the list
 * of one repository is not the list of another.
 *
 * Two sessions asking together make **one** call (S-36): the second waits on the first. A list
 * whose version is unknown is shared while it is being asked and never kept — nothing would say
 * when it stopped being true. A failure is never kept either: the next ask tries again.
 */
export class CommandCatalog {
  private readonly lists = new Map<string, readonly SlashCommand[]>();
  private readonly asking = new Map<string, Promise<readonly SlashCommand[]>>();

  constructor(private readonly capacity: number = MAX_CACHED_LISTS) {}

  /**
   * The whole list the installation offers this session, the hidden entries included.
   *
   * @throws whatever the session's `supportedCommands()` threw — and then nothing was cached
   */
  commandsOf(live: LiveSession): Promise<readonly SlashCommand[]> {
    const version = live.handle.cliVersion;
    const key = JSON.stringify([version, live.session.workspace.value]);

    const known = this.lists.get(key);
    if (known !== undefined) {
      // Taken out and put back, so the order of the map is the order of use and the eviction
      // below drops the one nobody asked for longest.
      this.lists.delete(key);
      this.lists.set(key, known);
      return Promise.resolve(known);
    }

    const pending = this.asking.get(key);
    if (pending !== undefined) {
      return pending;
    }

    const ask = live.handle
      .supportedCommands()
      .then((commands) => {
        if (version !== null) {
          this.remember(key, commands);
        }
        return commands;
      })
      .finally(() => {
        this.asking.delete(key);
      });

    this.asking.set(key, ask);
    return ask;
  }

  private remember(key: string, commands: readonly SlashCommand[]): void {
    this.lists.set(key, commands);

    for (const oldest of this.lists.keys()) {
      if (this.lists.size <= this.capacity) {
        break;
      }
      this.lists.delete(oldest);
    }
  }
}

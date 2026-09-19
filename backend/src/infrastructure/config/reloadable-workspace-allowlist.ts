import { readFileSync, realpathSync, statSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

import type { WorkspaceAllowlistSource } from '@application/workspace';
import { WorkspaceAllowlist } from '@domain/workspace';
import type { AllowlistFileSystem } from './workspace-allowlist';
import { loadWorkspaceAllowlist } from './workspace-allowlist';

/** The real filesystem, behind the two calls the loader makes. */
export const nodeAllowlistFileSystem: AllowlistFileSystem = {
  read: (file) => readFileSync(file, 'utf8'),
  realDirectory: (path) => {
    try {
      const real = realpathSync(path);
      return statSync(real).isDirectory() ? real : null;
    } catch {
      // Missing, unreadable or a broken link: all three mean this root cannot be used, and the
      // caller turns that into a boot failure naming the entry of the file.
      return null;
    }
  },
};

/**
 * The allowlist the backend is running with, and the only way to change it.
 *
 * The reload is a **method**, not a watcher. An allowlist that shrinks on its own underneath an
 * open session moves the security boundary without anybody deciding to, and one that grows on its
 * own does something worse — see docs/plans/01-live-session/decisions.md#d-02.
 *
 * The first load happens in the constructor, so a file that is missing, unreadable, empty or
 * malformed stops the container from being built and therefore stops the process. A backend up
 * with an allowlist it could not validate is worse than a backend that is down.
 */
export class ReloadableWorkspaceAllowlist implements WorkspaceAllowlistSource {
  private allowlist: WorkspaceAllowlist;

  /**
   * @param file absolute path of the allowlist file
   * @throws {import('@remote-claude/config').ConfigurationError} listing every problem at once
   */
  constructor(
    private readonly file: string,
    private readonly fs: AllowlistFileSystem = nodeAllowlistFileSystem,
    private readonly parse: (text: string) => unknown = (text) => parseYaml(text),
  ) {
    this.allowlist = this.read();
  }

  current(): WorkspaceAllowlist {
    return this.allowlist;
  }

  /**
   * Re-reads the file.
   *
   * A failed reload leaves the previous list in place and re-throws: replacing a working boundary
   * with nothing because somebody saved a half-edited file is the one outcome worse than both.
   */
  reload(): void {
    this.allowlist = this.read();
  }

  private read(): WorkspaceAllowlist {
    return new WorkspaceAllowlist(loadWorkspaceAllowlist(this.file, this.fs, this.parse));
  }
}

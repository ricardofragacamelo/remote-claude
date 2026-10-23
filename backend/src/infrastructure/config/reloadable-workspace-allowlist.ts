import { readFileSync, realpathSync, statSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

import type { MarketplaceAllowlistSource } from '@application/workspace';
import type { WorkspaceAllowlistSource } from '@application/workspace';
import { WorkspaceAllowlist } from '@domain/workspace';
import type { Workspace } from '@domain/workspace';
import type { Logger } from '@shared/logging/logger';
import type {
  AllowlistFileSystem,
  DeclaredMarketplace,
  LoadedAllowlist,
} from './workspace-allowlist';
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

/** What a reload changed: the roots that came in and the ones that left, by real path. */
export interface AllowlistChange {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/**
 * The allowlist the backend is running with, and the only way to change it.
 *
 * The reload is a **method**, not a watcher. An allowlist that shrinks on its own underneath an
 * open session moves the security boundary without anybody deciding to, and one that grows on its
 * own does something worse — see docs/plans/01-live-session/decisions.md#d-02. What calls it is
 * `SIGHUP`, sent by the operator (06 · D-15).
 *
 * The first load happens in the constructor, so a file that is missing, unreadable, empty or
 * malformed stops the container from being built and therefore stops the process. A backend up
 * with an allowlist it could not validate is worse than a backend that is down. The same
 * eagerness covers the `marketplaces` section (plan 13, B-47): a malformed one is exactly as fatal
 * as a malformed root, and for the same reason.
 */
export class ReloadableWorkspaceAllowlist
  implements WorkspaceAllowlistSource, MarketplaceAllowlistSource
{
  private workspaces: readonly Workspace[];
  private allowlist: WorkspaceAllowlist;
  private marketplaces: readonly DeclaredMarketplace[];

  /**
   * @param file absolute path of the allowlist file
   * @throws {import('@remote-claude/config').ConfigurationError} listing every problem at once
   */
  constructor(
    readonly file: string,
    private readonly fs: AllowlistFileSystem = nodeAllowlistFileSystem,
    private readonly parse: (text: string) => unknown = (text) => parseYaml(text),
  ) {
    const loaded = this.read();
    this.workspaces = loaded.workspaces;
    this.marketplaces = loaded.marketplaces;
    this.allowlist = new WorkspaceAllowlist(this.workspaces);
  }

  /**
   * The allowlist of a booting backend, and the boot line that says **which file** it is — with a
   * local copy beside the default, "which allowlist is this backend running?" is the first question
   * anybody asks (plan 06, S-61).
   *
   * @throws {import('@remote-claude/config').ConfigurationError} listing every problem at once
   */
  static load(file: string, logger: Logger): ReloadableWorkspaceAllowlist {
    const allowlist = new ReloadableWorkspaceAllowlist(file);

    logger.info(
      {
        op: 'allowlist.loaded',
        layer: 'infrastructure',
        module: 'workspace',
        file,
        roots: allowlist.roots(),
      },
      'workspace allowlist loaded',
    );

    return allowlist;
  }

  current(): WorkspaceAllowlist {
    return this.allowlist;
  }

  /** The real path of every root, in the order the file declares them. */
  roots(): readonly string[] {
    return this.workspaces.map((workspace) => workspace.root.value);
  }

  /** {@link MarketplaceAllowlistSource.list} */
  list(): readonly DeclaredMarketplace[] {
    return this.marketplaces;
  }

  /** {@link MarketplaceAllowlistSource.find} */
  find(name: string): DeclaredMarketplace | null {
    return this.marketplaces.find((marketplace) => marketplace.name === name) ?? null;
  }

  /**
   * Re-reads the file.
   *
   * A failed reload leaves the previous list in place and re-throws: replacing a working boundary
   * with nothing because somebody saved a half-edited file is the one outcome worse than both. The
   * declared marketplaces are replaced in the same call, so a marketplace a `SIGHUP` reload removes
   * stops being found (and a new session stops composing its plugins) from this call onward (S-213)
   * — no announcement needed, since every reader asks `list()`/`find()` fresh, never caching it.
   *
   * @throws {import('@remote-claude/config').ConfigurationError} the file is not valid any more
   */
  reload(): AllowlistChange {
    const before = new Set(this.roots());
    const next = this.read();
    const after = new Set(next.workspaces.map((workspace) => workspace.root.value));

    this.workspaces = next.workspaces;
    this.marketplaces = next.marketplaces;
    this.allowlist = new WorkspaceAllowlist(next.workspaces);

    return {
      added: [...after].filter((root) => !before.has(root)),
      removed: [...before].filter((root) => !after.has(root)),
    };
  }

  private read(): LoadedAllowlist {
    return loadWorkspaceAllowlist(this.file, this.fs, this.parse);
  }
}

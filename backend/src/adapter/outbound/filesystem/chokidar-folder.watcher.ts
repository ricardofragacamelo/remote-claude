import { stat } from 'node:fs/promises';
import { basename, relative, sep } from 'node:path';
import { watch } from 'chokidar';
import type { ChokidarOptions, FSWatcher } from 'chokidar';

import type { FolderWatcher, FolderWatchListener, OpenWatch } from '@application/files';
import { WATCH_RETRY_AFTER_SECONDS, WatchUnavailableError, isUnwatched } from '@domain/files';
import type { ChangeKind } from '@domain/files';
import type { Logger } from '@shared/logging/logger';
import { isSideFile } from './atomic-file.writer';

/** How a watcher is started — `chokidar.watch`, or a stand-in a suite controls. */
export type StartWatcher = (root: string, options: ChokidarOptions) => FSWatcher;

/** What each event of chokidar is, in the contract's words; the others are not changes. */
const KINDS: Readonly<Record<string, ChangeKind>> = {
  add: 'created',
  addDir: 'created',
  change: 'changed',
  unlink: 'deleted',
  unlinkDir: 'deleted',
};

/**
 * The codes of a refused watch: the user's inotify watches are spent (`ENOSPC`), or its inotify
 * instances or descriptors are (`EMFILE`).
 */
const LIMIT_CODES = new Set(['ENOSPC', 'EMFILE']);

/** One watcher's life, as the error handler needs it. */
interface Life {
  ready: boolean;
  /** The refusal seen before `ready`, kept until then. */
  refused: { readonly error: unknown } | null;
  stopped: boolean;
}

/** A path chokidar reports, relative to the root and in POSIX form. */
function relativeOf(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/');
}

/** The folder a raw event of chokidar was heard on. */
function watchedPathOf(details: unknown): unknown {
  return (details as { watchedPath?: unknown } | null)?.watchedPath;
}

function codeOf(error: unknown): unknown {
  return (error as NodeJS.ErrnoException | null)?.code;
}

/**
 * The folder watcher over `chokidar` — the choice of the B-19 spike (07 · D-08).
 *
 * Measured over a clone of this repository with its dependencies installed: `fs.watch` recursive
 * held ~50 000 inotify watches and put them inside `node_modules` too; `@parcel/watcher` held one
 * per watched folder but went **silent** when the limit ran out after it had started; `chokidar`
 * spent no watch on an excluded folder and said `ENOSPC` both at the start and later. It holds one
 * watch per file as well as per folder — the price of never going quiet.
 *
 * - **Excluded before watched:** `ignored` is asked before a folder is read, with the domain's
 *   {@link isUnwatched} — `.git` and the D-10 list never cost a watch (S-128, S-134).
 * - **Our own side files are not changes:** the temporary of an atomic save appears and goes in an
 *   instant; the save is the `changed` of the file saved.
 * - **The folder itself going is said:** a removed or renamed root is a deletion of `''`.
 * - **Links are not followed:** a link to a folder outside would watch outside, and a loop would
 *   watch forever; a link is reported as the entry it is.
 * - **The limit is said, never swallowed:** refused before `ready` → the start rejects with
 *   `WATCH_UNAVAILABLE` and nothing stays held (S-135); refused after → the listener hears
 *   `systemLimit` once, and the watcher closes.
 */
export class ChokidarFolderWatcher implements FolderWatcher {
  constructor(
    private readonly logger: Logger,
    private readonly start: StartWatcher = watch,
  ) {}

  async watch(root: string, listener: FolderWatchListener): Promise<OpenWatch> {
    const startedAt = Date.now();
    this.logger.debug({ op: 'files.watch', layer: 'adapter', folder: root }, 'starting a watcher');

    const watcher = this.start(root, {
      ignored: (path: string) => isUnwatched(relativeOf(root, path)) || isSideFile(basename(path)),
      ignoreInitial: true,
      followSymlinks: false,
      persistent: true,
    });
    const life: Life = { ready: false, refused: null, stopped: false };
    const close = this.closer(root, watcher);

    watcher.on('all', (event, path) => {
      const kind = KINDS[event];

      if (kind !== undefined) {
        listener.changed({ path: relativeOf(root, path), kind });
      }
    });
    watcher.on('error', (error) => {
      this.failed(root, error, life, listener, close);
    });
    watcher.on('raw', (event, name, details) => {
      if (event === 'rename' && name === basename(root) && watchedPathOf(details) === root) {
        void this.checkRoot(root, listener);
      }
    });

    await new Promise<void>((resolve) => watcher.once('ready', resolve));
    life.ready = true;

    return this.started(root, watcher, life, close, startedAt);
  }

  /** The end of the start: refused, or running — and how many folders it holds, for the log. */
  private async started(
    root: string,
    watcher: FSWatcher,
    life: Life,
    close: () => Promise<void>,
    startedAt: number,
  ): Promise<OpenWatch> {
    if (life.refused !== null) {
      await close();
      this.logger.warn(
        { op: 'files.watch', layer: 'adapter', folder: root, err: life.refused.error },
        'the system refused a watch; nothing is held',
      );
      throw new WatchUnavailableError(WATCH_RETRY_AFTER_SECONDS);
    }

    this.logger.debug(
      {
        op: 'files.watch',
        layer: 'adapter',
        folder: root,
        directories: Object.keys(watcher.getWatched()).length,
        durationMs: Date.now() - startedAt,
      },
      'watcher ready',
    );

    return { close };
  }

  private failed(
    root: string,
    error: unknown,
    life: Life,
    listener: FolderWatchListener,
    close: () => Promise<void>,
  ): void {
    if (!LIMIT_CODES.has(String(codeOf(error)))) {
      // An unreadable folder, a file gone between listing and watching: that part is not
      // watched, and the rest is. Said, and carried on.
      this.logger.warn(
        { op: 'files.watch', layer: 'adapter', folder: root, err: error },
        'a part of the folder could not be watched',
      );
      return;
    }

    if (!life.ready) {
      life.refused ??= { error };
      return;
    }

    if (!life.stopped) {
      life.stopped = true;
      this.logger.warn(
        { op: 'files.watch', layer: 'adapter', folder: root, err: error },
        'the system refused a watch on a running watcher; it stops',
      );
      listener.stopped('systemLimit');
      void close();
    }
  }

  /**
   * The root was renamed or removed: chokidar says so only when it is not busy with the files that
   * went with it, so the watcher asks the disk itself, and a root that is gone is a deletion of
   * `''` — the folder itself (S-144).
   */
  private async checkRoot(root: string, listener: FolderWatchListener): Promise<void> {
    try {
      await stat(root);
      this.logger.debug(
        { op: 'files.watch', layer: 'adapter', folder: root },
        'the watched folder is still there',
      );
    } catch (error) {
      this.logger.debug(
        { op: 'files.watch', layer: 'adapter', folder: root, err: error },
        'the watched folder is gone',
      );
      listener.changed({ path: '', kind: 'deleted' });
    }
  }

  /** Closing, once — however many ways the end arrives. */
  private closer(root: string, watcher: FSWatcher): () => Promise<void> {
    let closing: Promise<void> | null = null;

    return () => {
      closing ??= watcher.close().then(() => {
        this.logger.debug({ op: 'files.watch', layer: 'adapter', folder: root }, 'watcher closed');
      });

      return closing;
    };
  }
}

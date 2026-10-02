import type { CancelScheduled, Scheduler } from '@application/shared';
import type { UserId } from '@domain/auth';
import {
  WatchLimitReachedError,
  batchOf,
  foldInto,
  isUnwatched,
  relativeTo,
  takesAway,
} from '@domain/files';
import type { ChangeKind, FolderChange } from '@domain/files';
import type { IdGenerator } from '@domain/shared';
import type { WorkspacePath } from '@domain/workspace';
import type { ChangeOrigins, LabelledChange } from './change-origins';
import type { FolderResolver } from './ports/folder-resolver.port';
import type { FolderWatcher, OpenWatch, WatcherStop } from './ports/folder-watcher.port';

/** Why a subscription ended without its client asking — the contract's `reason`. */
export type WatchStopReason = WatcherStop | 'allowlistChanged';

/**
 * Where the changes of one subscription go — one per `watchId`, given by the transport.
 *
 * The transport numbers and sends; this module decides what. A sink never throws: a client that
 * cannot keep up is the transport's to handle (07 · S-155), and must not hold the watcher of the
 * others.
 */
export interface WatchSink {
  /** Whether the connection behind it is still there. */
  readonly open: boolean;
  changes(watchId: string, changes: readonly LabelledChange[], overflow: boolean): void;
  /** The subscription ended without its client asking — said once, and nothing follows it. */
  stopped(watchId: string, reason: WatchStopReason): void;
  /** The subscription is gone, whichever way it went: whatever the sink still holds, it drops. */
  end(): void;
}

/** The numbers the watching lives by — configured (`RC_FILES_WATCH_*`). */
export interface WatchSettings {
  /** How long changes gather before they go out as one event. */
  readonly windowMs: number;
  /** The most changes one event carries; past it, `overflow: true`. */
  readonly maxChangesPerEvent: number;
  /** The most folders one connection follows at once. */
  readonly maxPerConnection: number;
}

/** What `workspace.watch` asks for. */
export interface WatchRequest {
  readonly connectionId: string;
  readonly userId: UserId;
  /** The folder of the tab, as the client sent it. */
  readonly folder: string;
  readonly sink: WatchSink;
}

/** A subscription a reload of the allowlist ended, and what its folder is refused with now. */
export interface StoppedWatch {
  readonly watchId: string;
  readonly folder: string;
  readonly refusal: unknown;
}

/** The subscription a watch made — or the one it already was. */
export interface Watching {
  readonly watchId: string;
  /** The real path of the folder. */
  readonly folder: string;
}

/**
 * How many distinct paths one window of a watcher holds, as a multiple of the per-event ceiling,
 * before it stops counting and says `overflow` to everybody: a subfolder subscription still sees
 * its own handful when the rest of the tree is busy, and a `git checkout` of ten thousand files
 * costs a bounded map.
 */
const WINDOW_HEADROOM = 10;

/** One running watcher, and who follows it. */
interface Watched {
  readonly root: WorkspacePath;
  readonly ready: Promise<OpenWatch>;
  readonly subscriptions: Set<Subscription>;
  window: Map<string, ChangeKind>;
  overflow: boolean;
  flushing: Promise<void>;
  timer: CancelScheduled | null;
  closed: boolean;
}

/** One `watchId`. */
interface Subscription {
  readonly watchId: string;
  readonly connectionId: string;
  readonly userId: UserId;
  /** The folder as the client sent it — what a reload of the allowlist checks again. */
  readonly raw: string;
  readonly folder: string;
  /** Where the folder sits in the watched one; `''` is the watched folder itself. */
  readonly prefix: string;
  readonly sink: WatchSink;
  readonly watched: Watched;
  /** Its folder was deleted inside the current window. */
  gone: boolean;
}

/**
 * The subscriptions to folders, and the watchers behind them — 07 · B-21.
 *
 * **One watcher per real folder**, with a count of who follows it, and a subfolder of a folder
 * already watched rides on that watcher, told only of its own changes and relative to itself
 * (S-137, S-138). The watcher is closed when the last subscription goes, **whichever way it goes**
 * — unwatch, the socket dropping, a revocation that drops it, the shutdown, a reload of the
 * allowlist that takes the folder away, the folder deleted —, because a watcher left behind is
 * inotify budget the user's own editor needed (R-03, S-145).
 *
 * The changes of a watcher gather for a short window, fold into what they left (the domain's
 * {@link foldInto}), are labelled with who made them ({@link ChangeOrigins}) and go out to each
 * subscription, cut at the per-event ceiling. A window delivers after the previous one finished,
 * so two events of one subscription never cross.
 */
export class FolderWatches {
  private readonly watchers = new Map<string, Watched>();
  private readonly connections = new Map<string, Map<string, Subscription>>();
  /** The watchers being closed right now — what the shutdown waits for besides the open ones. */
  private readonly closing = new Set<Promise<void>>();

  constructor(
    private readonly folders: FolderResolver,
    private readonly watcher: FolderWatcher,
    private readonly origins: ChangeOrigins,
    private readonly scheduler: Scheduler,
    private readonly ids: IdGenerator,
    private readonly settings: WatchSettings,
  ) {}

  /** How many watchers are open — what the health screen of plan 16 reads. */
  get openWatchers(): number {
    return this.watchers.size;
  }

  /** How many subscriptions there are, over every connection. */
  get subscriptions(): number {
    return [...this.connections.values()].reduce((sum, mine) => sum + mine.size, 0);
  }

  /**
   * Follows a folder for one connection.
   *
   * The same folder again on the same connection is the same subscription — same `watchId`, and
   * the count does not rise (S-139).
   *
   * @throws whatever the folder is refused with — allowlist, owner, disk (S-136)
   * @throws {WatchLimitReachedError} the connection already follows as many as it may (S-141)
   * @throws {import('@domain/files').WatchUnavailableError} the system refused a watch (S-135)
   */
  async watch(request: WatchRequest): Promise<Watching> {
    const folder = await this.folders.resolve(request.folder, request.userId);
    const existing = this.subscriptionOf(request.connectionId, folder.value);

    if (existing !== undefined) {
      return { watchId: existing.watchId, folder: folder.value };
    }

    const subscription = this.subscribe(request, folder);

    try {
      await subscription.watched.ready;
    } catch (error) {
      await this.drop(subscription);
      throw error;
    }

    if (!request.sink.open) {
      // The socket went while the watcher was starting; its release has already run, and found
      // nothing of this one to release.
      await this.drop(subscription);
    }

    return { watchId: subscription.watchId, folder: folder.value };
  }

  /** Stops one subscription of a connection. One it does not know is not an error (S-140). */
  async unwatch(connectionId: string, watchId: string): Promise<boolean> {
    const subscription = this.connections.get(connectionId)?.get(watchId);

    if (subscription === undefined) {
      return false;
    }

    await this.drop(subscription);
    return true;
  }

  /**
   * Every subscription of a connection that is gone — the socket dropped, or was closed by a
   * revocation (S-142, S-147).
   *
   * @returns how many it had
   */
  async release(connectionId: string): Promise<number> {
    const mine = [...(this.connections.get(connectionId)?.values() ?? [])];

    await Promise.all(mine.map((subscription) => this.drop(subscription)));
    return mine.length;
  }

  /**
   * Asks again, for every subscription, whether its folder may still be followed — after a reload
   * of the allowlist. A refused one is told why and goes (S-143).
   *
   * @returns the subscriptions stopped, each with the refusal that stopped it
   */
  async revalidate(): Promise<readonly StoppedWatch[]> {
    const all = [...this.connections.values()].flatMap((mine) => [...mine.values()]);
    const refusals = await Promise.all(all.map((subscription) => this.refusalOf(subscription)));
    const stopped = all.flatMap((subscription, index) =>
      refusals[index] === null
        ? []
        : [
            {
              watchId: subscription.watchId,
              folder: subscription.folder,
              refusal: refusals[index],
            },
          ],
    );

    await Promise.all(
      all
        .filter((_, index) => refusals[index] !== null)
        .map((subscription) => this.stop(subscription, 'allowlistChanged')),
    );
    return stopped;
  }

  /**
   * The shutdown: every watcher closed, nobody told — the sockets are closing too (S-146). It also
   * waits for the closes already under way: the sockets closed a moment before let go of their
   * watchers, and the process may not end while one of those still holds its watches. Idempotent.
   *
   * @returns how many watchers it closed or waited for
   */
  async closeAll(): Promise<number> {
    const open = [...this.watchers.values()];
    const underWay = [...this.closing];

    for (const subscription of open.flatMap((watched) => [...watched.subscriptions])) {
      this.forget(subscription);
    }
    await Promise.all([...open.map((watched) => this.close(watched)), ...underWay]);
    return open.length + underWay.length;
  }

  private subscriptionOf(connectionId: string, folder: string): Subscription | undefined {
    return [...(this.connections.get(connectionId)?.values() ?? [])].find(
      (subscription) => subscription.folder === folder,
    );
  }

  private subscribe(request: WatchRequest, folder: WorkspacePath): Subscription {
    const mine = this.connections.get(request.connectionId) ?? new Map<string, Subscription>();

    if (mine.size >= this.settings.maxPerConnection) {
      throw new WatchLimitReachedError(this.settings.maxPerConnection);
    }

    const { watched, prefix } = this.watcherFor(folder);
    const subscription: Subscription = {
      watchId: `w_${this.ids.next()}`,
      connectionId: request.connectionId,
      userId: request.userId,
      raw: request.folder,
      folder: folder.value,
      prefix,
      sink: request.sink,
      watched,
      gone: false,
    };

    watched.subscriptions.add(subscription);
    mine.set(subscription.watchId, subscription);
    this.connections.set(request.connectionId, mine);

    return subscription;
  }

  /**
   * The watcher a folder rides on: its own, one of a folder above it, or a new one.
   *
   * A folder under an unwatched path of the one above (`node_modules/x` opened as a tab) gets a
   * watcher of its own — the one above never looks in there.
   */
  private watcherFor(folder: WorkspacePath): { watched: Watched; prefix: string } {
    for (const watched of this.watchers.values()) {
      const prefix = relativeTo(watched.root.value, folder.value);

      if (prefix !== null && !isUnwatched(prefix)) {
        return { watched, prefix };
      }
    }

    return { watched: this.start(folder), prefix: '' };
  }

  private start(root: WorkspacePath): Watched {
    const listener = {
      changed: (change: FolderChange): void => {
        this.gather(watched, change);
      },
      stopped: (reason: WatcherStop): void => {
        void this.stopEvery(watched, reason);
      },
    };
    const watched: Watched = {
      root,
      ready: this.watcher.watch(root.value, listener),
      subscriptions: new Set(),
      window: new Map(),
      overflow: false,
      flushing: Promise.resolve(),
      timer: null,
      closed: false,
    };

    this.watchers.set(root.value, watched);
    return watched;
  }

  /** One raw change into the window of its watcher; the window's timer starts with the first. */
  private gather(watched: Watched, change: FolderChange): void {
    if (watched.closed) {
      return;
    }

    if (change.kind === 'deleted') {
      this.markGone(watched, change.path);
    }

    if (!watched.overflow) {
      foldInto(watched.window, change);
      this.overflowWhenFull(watched);
    }

    watched.timer ??= this.scheduler.after(this.settings.windowMs, () => {
      this.flush(watched);
    });
  }

  private markGone(watched: Watched, deleted: string): void {
    for (const subscription of watched.subscriptions) {
      subscription.gone ||= takesAway(deleted, subscription.prefix);
    }
  }

  private overflowWhenFull(watched: Watched): void {
    if (watched.window.size > this.settings.maxChangesPerEvent * WINDOW_HEADROOM) {
      watched.overflow = true;
      watched.window = new Map();
    }
  }

  /** The window closes: what it held goes out, after whatever the previous one still delivers. */
  private flush(watched: Watched): void {
    const changes = [...watched.window].map(([path, kind]) => ({ path, kind }));
    const overflow = watched.overflow;

    watched.window = new Map();
    watched.overflow = false;
    watched.timer = null;
    watched.flushing = watched.flushing.then(() => this.deliver(watched, changes, overflow));
  }

  private async deliver(
    watched: Watched,
    changes: readonly FolderChange[],
    overflow: boolean,
  ): Promise<void> {
    const labelled = overflow ? [] : await this.origins.label(watched.root, changes);
    const gone = [...watched.subscriptions].filter((subscription) => subscription.gone);

    for (const subscription of watched.subscriptions) {
      if (!subscription.gone) {
        this.send(subscription, labelled, overflow);
      }
    }

    await Promise.all(gone.map((subscription) => this.stop(subscription, 'folderDeleted')));
  }

  /** One subscription's share of a window: its own paths, relative to itself, cut at the ceiling. */
  private send(
    subscription: Subscription,
    labelled: readonly LabelledChange[],
    overflow: boolean,
  ): void {
    if (overflow) {
      subscription.sink.changes(subscription.watchId, [], true);
      return;
    }

    const own = labelled.flatMap((change) => {
      const path = relativeTo(subscription.prefix, change.path);
      return path === null ? [] : [{ ...change, path }];
    });

    if (own.length > 0) {
      const batch = batchOf(own, this.settings.maxChangesPerEvent);
      subscription.sink.changes(subscription.watchId, batch.changes, batch.overflow);
    }
  }

  /** What the folder of a subscription is refused with now, or `null` while it is still allowed. */
  private async refusalOf(subscription: Subscription): Promise<unknown> {
    try {
      await this.folders.resolve(subscription.raw, subscription.userId);
      return null;
    } catch (error) {
      // The refusal is the answer, handed back to the caller, which logs it.
      return error;
    }
  }

  private async stopEvery(watched: Watched, reason: WatcherStop): Promise<void> {
    await Promise.all([...watched.subscriptions].map((each) => this.stop(each, reason)));
  }

  /** Tells a subscription it ended, and lets it go. */
  private async stop(subscription: Subscription, reason: WatchStopReason): Promise<void> {
    subscription.sink.stopped(subscription.watchId, reason);
    await this.drop(subscription);
  }

  /** Lets a subscription go; the last one of a watcher closes it. */
  private async drop(subscription: Subscription): Promise<void> {
    const watched = this.forget(subscription);

    if (watched !== null) {
      await this.close(watched);
    }
  }

  /**
   * Takes a subscription out of the books.
   *
   * @returns its watcher, when nobody follows it any more
   */
  private forget(subscription: Subscription): Watched | null {
    const mine = this.connections.get(subscription.connectionId);
    mine?.delete(subscription.watchId);

    if (mine?.size === 0) {
      this.connections.delete(subscription.connectionId);
    }

    const { watched } = subscription;
    watched.subscriptions.delete(subscription);
    subscription.sink.end();

    return watched.subscriptions.size === 0 ? watched : null;
  }

  private async close(watched: Watched): Promise<void> {
    if (watched.closed) {
      return;
    }

    watched.closed = true;
    watched.timer?.();
    this.watchers.delete(watched.root.value);

    const closing = this.letGo(watched);
    this.closing.add(closing);
    await closing;
    this.closing.delete(closing);
  }

  private async letGo(watched: Watched): Promise<void> {
    // A watcher that never started has nothing to close; its failure already reached every
    // `watch` that was waiting on it.
    const open = await watched.ready.catch(() => null);
    await open?.close();
  }
}

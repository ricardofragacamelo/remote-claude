import type { MarketplacePluginEntry, PluginManifest } from '@domain/engines/claude';
import type {
  MarketplacePluginSource,
  MarketplaceSourceFailure,
  PreparedMarketplacePlugin,
} from '@application/engines/claude';
import type { DeclaredMarketplace } from '@application/workspace';

/** One plugin a fake marketplace source answers, keyed by (marketplace url, plugin name). */
export interface FakeMarketplacePlugin {
  readonly manifest: PluginManifest;
  readonly digest: string;
}

/**
 * A `MarketplacePluginSource` a test fully controls — no `git`, no filesystem clone (plan 13,
 * B-47). `prepare()` answers a `stagedAt` path of the test's own choosing, and `commit`/`swap`
 * record what they were asked to do rather than touching disk, so a use-case test can assert on the
 * sequence of calls without a real directory existing anywhere.
 */
export class FakeMarketplacePluginSource implements MarketplacePluginSource {
  readonly committed: { stagedAt: string; destination: string }[] = [];
  readonly swapped: { stagedAt: string; destination: string }[] = [];
  readonly discarded: string[] = [];

  private readonly catalogs = new Map<string, readonly MarketplacePluginEntry[]>();
  private readonly plugins = new Map<string, FakeMarketplacePlugin>();
  private commits = new Map<string, string>();
  private nextStagedAt = 0;
  private readonly failingResolveCommit = new Set<string>();
  private readonly failingPrepare = new Map<string, MarketplaceSourceFailure>();

  /** What [source.url]'s catalogue answers — the plugin names and whether each is installable. */
  setCatalog(url: string, entries: readonly MarketplacePluginEntry[]): void {
    this.catalogs.set(url, entries);
  }

  /** What `prepare(source, pluginName)` answers for that pair, and at which commit. */
  setPlugin(url: string, pluginName: string, plugin: FakeMarketplacePlugin, commit: string): void {
    this.plugins.set(`${url}\u0000${pluginName}`, plugin);
    this.commits.set(url, commit);
  }

  /** What `resolveCommit(source)` answers, independent of any plugin being set. */
  setCommit(url: string, commit: string): void {
    this.commits.set(url, commit);
  }

  /** Makes `resolveCommit(source)` answer `{ kind: 'unavailable' }` for [url] from now on. */
  failResolveCommit(url: string): void {
    this.failingResolveCommit.add(url);
  }

  /**
   * Makes `prepare(source, pluginName)` answer [failure] (`{ kind: 'unavailable' }` by default) for
   * that pair from now on.
   */
  failPrepare(
    url: string,
    pluginName: string,
    failure: MarketplaceSourceFailure = { kind: 'unavailable' },
  ): void {
    this.failingPrepare.set(`${url}\u0000${pluginName}`, failure);
  }

  async listPlugins(
    source: DeclaredMarketplace['source'],
  ): Promise<readonly MarketplacePluginEntry[] | MarketplaceSourceFailure> {
    const catalog = this.catalogs.get(source.url);
    return catalog ?? { kind: 'unavailable' };
  }

  async resolveCommit(
    source: DeclaredMarketplace['source'],
  ): Promise<string | MarketplaceSourceFailure> {
    if (this.failingResolveCommit.has(source.url)) {
      return { kind: 'unavailable' };
    }
    const commit = this.commits.get(source.url);
    return commit ?? { kind: 'unavailable' };
  }

  async prepare(
    source: DeclaredMarketplace['source'],
    pluginName: string,
  ): Promise<PreparedMarketplacePlugin | MarketplaceSourceFailure> {
    const forcedFailure = this.failingPrepare.get(`${source.url}\u0000${pluginName}`);
    if (forcedFailure !== undefined) {
      return forcedFailure;
    }
    const plugin = this.plugins.get(`${source.url}\u0000${pluginName}`);
    if (plugin === undefined) {
      const catalog = this.catalogs.get(source.url);
      if (catalog !== undefined && !catalog.some((entry) => entry.name === pluginName)) {
        return { kind: 'pluginNotFound' };
      }
      return { kind: 'unavailable' };
    }

    this.nextStagedAt += 1;
    const stagedAt = `/fake-staged/${String(this.nextStagedAt)}`;
    const commit = this.commits.get(source.url) ?? 'commit0';
    return { manifest: plugin.manifest, digest: plugin.digest, commit, stagedAt };
  }

  async commit(stagedAt: string, destination: string): Promise<void> {
    this.committed.push({ stagedAt, destination });
  }

  async swap(stagedAt: string, destination: string): Promise<void> {
    this.swapped.push({ stagedAt, destination });
  }

  async discard(directory: string): Promise<void> {
    this.discarded.push(directory);
  }
}

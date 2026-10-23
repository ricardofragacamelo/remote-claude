import {
  describePlugin,
  describePluginUpdate,
  diffPluginManifests,
  PluginMarketplaceNotAllowedError,
  PluginNotFoundError,
  PluginPathInvalidError,
  PluginSourceUnavailableError,
} from '@domain/engines/claude';
import type { MarketplaceManifest, PluginManifestDiff } from '@domain/engines/claude';
import type { UserId } from '@domain/auth';
import type { DeclaredMarketplace } from '@application/workspace';
import { isSafePathSegment, marketplacePluginDestination } from './marketplace-plugin-path';
import type { MarketplaceSourceFailure } from './ports/marketplace-plugin-source.port';
import type { PluginWrite } from './ports/plugin-repository.port';
import type { PluginDependencies, PluginView } from './plugin.use-cases';
import { ownedPlugin, pluginEvent, viewOf } from './plugin.use-cases';

/** Turns a failure {@link import('./ports/marketplace-plugin-source.port').MarketplacePluginSource} reports into the matching domain error. */
function errorOfSourceFailure(failure: MarketplaceSourceFailure, nameForError: string): Error {
  switch (failure.kind) {
    case 'unavailable':
      return new PluginSourceUnavailableError(nameForError);
    case 'pathInvalid':
      return new PluginPathInvalidError(failure.reason);
    case 'pluginNotFound':
      return new PluginNotFoundError(nameForError);
  }
}

/** The marketplace declared under [name], or the refusal every route of this file shares. */
function declaredMarketplaceOf(deps: PluginDependencies, name: string): DeclaredMarketplace {
  const marketplace = deps.marketplaces.find(name);
  if (marketplace === null) {
    throw new PluginMarketplaceNotAllowedError(name);
  }
  return marketplace;
}

/** `GET /engines/claude/plugins/marketplaces` — the marketplaces this installation currently declares. */
export class ListMarketplacesUseCase {
  constructor(private readonly deps: PluginDependencies) {}

  execute(): readonly { readonly name: string }[] {
    return this.deps.marketplaces.list().map((marketplace) => ({ name: marketplace.name }));
  }
}

/**
 * `GET /engines/claude/plugins/marketplaces/:name` — what a declared marketplace's own
 * `.claude-plugin/marketplace.json` lists (plan 13, B-47) — read live, never cached: a marketplace's
 * catalogue is somebody else's git repository, and this screen is the one place this product reads
 * it fresh on every visit, the same way a `GET` of the project's `.mcp.json` always re-reads the file.
 */
export class ListMarketplacePluginsUseCase {
  constructor(private readonly deps: PluginDependencies) {}

  /** @throws {PluginMarketplaceNotAllowedError} @throws {PluginSourceUnavailableError} */
  async execute(marketplaceName: string): Promise<MarketplaceManifest> {
    const marketplace = declaredMarketplaceOf(this.deps, marketplaceName);
    const listed = await this.deps.source.listPlugins(marketplace.source);

    if ('kind' in listed) {
      throw errorOfSourceFailure(listed, marketplaceName);
    }

    return { name: marketplaceName, plugins: listed };
  }
}

/**
 * `POST /engines/claude/plugins/marketplace` — installing a plugin from a declared marketplace
 * (plan 13, B-47; S-200, S-201, S-203, S-204, S-207, S-208, S-209, S-210).
 *
 * The destination is deterministic — {@link marketplacePluginDestination} of (user, marketplace,
 * plugin) always names the same directory — so a plain pre-check against the store answers S-207
 * (installing the same plugin again) without ever cloning anything. The one race that check cannot
 * close by itself — two first-time installs at once (S-208) — is closed by
 * {@link import('./ports/plugin-repository.port').PluginRepository.insertIfAbsent}: whichever of the
 * two call sites wins that single round trip is the only one that ever moves its staged content into
 * place; the other discards what it cloned and answers with the winner's row, never a second
 * directory and never a second `engine.pluginAdded`.
 */
export class AddMarketplacePluginUseCase {
  constructor(private readonly deps: PluginDependencies) {}

  /**
   * @throws {PluginMarketplaceNotAllowedError} @throws {PluginPathInvalidError}
   * @throws {PluginSourceUnavailableError} @throws {PluginNotFoundError} the marketplace does not
   *   list a plugin of that name
   */
  async execute(userId: UserId, marketplaceName: string, pluginName: string): Promise<PluginView> {
    const marketplace = declaredMarketplaceOf(this.deps, marketplaceName);

    if (!isSafePathSegment(pluginName)) {
      throw new PluginPathInvalidError('plugin name is not a safe directory name');
    }

    const destination = marketplacePluginDestination(
      this.deps.pluginDownloadDir,
      userId,
      marketplaceName,
      pluginName,
    );

    // S-207: the same (user, marketplace, plugin) always resolves to the same directory, so an
    // already-installed plugin is found here, with no network reached at all.
    const alreadyInstalled = await this.deps.plugins.findByPath(userId, destination);
    if (alreadyInstalled !== null) {
      return viewOf(this.deps, alreadyInstalled);
    }

    const prepared = await this.deps.source.prepare(marketplace.source, pluginName);
    if ('kind' in prepared) {
      throw errorOfSourceFailure(prepared, pluginName);
    }

    const id = this.deps.ids.next();
    const at = this.deps.clock.now();
    const write: PluginWrite = {
      userId,
      identity: {
        origin: 'marketplace',
        path: destination,
        marketplace: marketplaceName,
        commit: prepared.commit,
      },
      name: prepared.manifest.name,
      approvedDigest: prepared.digest,
    };

    const { plugin, created } = await this.deps.plugins.insertIfAbsent(id, write, at);
    if (!created) {
      // S-208: lost the race (or someone finished installing it between the check above and here).
      await this.deps.source.discard(prepared.stagedAt);
      return viewOf(this.deps, plugin);
    }

    try {
      await this.deps.source.commit(prepared.stagedAt, destination);
    } catch (error) {
      await this.deps.plugins.delete(id);
      await this.deps.source.discard(prepared.stagedAt);
      throw error;
    }

    try {
      await this.deps.trail.execute(
        pluginEvent(
          'engine.pluginAdded',
          this.deps.engine,
          userId,
          id,
          write.name,
          describePlugin(write.identity, prepared.manifest),
          at,
        ),
      );
    } catch (error) {
      await this.deps.plugins.delete(id);
      await this.deps.source.discard(destination);
      throw error;
    }

    // Just written at this digest and commit — current by construction, no second read needed.
    return { ...plugin, state: 'current', manifest: prepared.manifest };
  }
}

/** What checking for an update answers (plan 13, B-47; S-205) — never changes anything. */
export interface MarketplacePluginUpdateCheck {
  readonly available: boolean;
  readonly newCommit: string | null;
  readonly diff: PluginManifestDiff | null;
}

/**
 * `GET /engines/claude/plugins/:id/update` — whether a marketplace plugin's source now resolves to
 * a different commit, and what that commit's manifest would change, without installing anything
 * (plan 13, B-47; S-205). A plugin that is not from a marketplace, or whose marketplace left the
 * allowlist file, simply never has an update available — both are reported the same as "no update",
 * never an error, because this route only ever reads.
 */
export class CheckMarketplacePluginUpdateUseCase {
  constructor(private readonly deps: PluginDependencies) {}

  /** @throws the same as {@link ownedPlugin} */
  async execute(userId: UserId, pluginId: string): Promise<MarketplacePluginUpdateCheck> {
    const NONE: MarketplacePluginUpdateCheck = { available: false, newCommit: null, diff: null };
    const plugin = await ownedPlugin(this.deps.plugins, userId, pluginId);

    if (plugin.origin !== 'marketplace' || plugin.marketplace === null || plugin.commit === null) {
      return NONE;
    }

    const marketplace = this.deps.marketplaces.find(plugin.marketplace);
    if (marketplace === null) {
      return NONE;
    }

    const latest = await this.deps.source.resolveCommit(marketplace.source);
    if (typeof latest !== 'string' || latest === plugin.commit) {
      return typeof latest === 'string' ? { ...NONE, newCommit: latest } : NONE;
    }

    const prepared = await this.deps.source.prepare(marketplace.source, plugin.name);
    if ('kind' in prepared) {
      // The commit moved, but the new content cannot be fetched right now — still "available", with
      // nothing further to say about what it brings until it can be.
      return { available: true, newCommit: latest, diff: null };
    }

    await this.deps.source.discard(prepared.stagedAt);
    const currentRead = await this.deps.manifests.read(plugin.path);
    const diff =
      typeof currentRead === 'string'
        ? null
        : diffPluginManifests(currentRead.manifest, prepared.manifest);

    return { available: true, newCommit: prepared.commit, diff };
  }
}

/**
 * `POST /engines/claude/plugins/:id/update` — applying a marketplace plugin's update (plan 13,
 * B-47; S-205, S-209).
 *
 * The audit write happens **before** the directory is touched: a trail that cannot take
 * `engine.pluginUpdated` leaves the plugin exactly as it was running — the old content, the old
 * commit — rather than a filesystem already swapped and a store update that might also fail. Only
 * once the trail has it does {@link import('./ports/marketplace-plugin-source.port').MarketplacePluginSource.swap}
 * replace what is on disk, and only then is the store told the new commit and digest.
 */
export class ApplyMarketplacePluginUpdateUseCase {
  constructor(private readonly deps: PluginDependencies) {}

  /**
   * @throws the same as {@link ownedPlugin} @throws {PluginMarketplaceNotAllowedError}
   * @throws {PluginPathInvalidError} not a marketplace plugin
   * @throws {PluginSourceUnavailableError} @throws {PluginNotFoundError}
   */
  async execute(userId: UserId, pluginId: string): Promise<PluginView> {
    const plugin = await ownedPlugin(this.deps.plugins, userId, pluginId);
    if (plugin.origin !== 'marketplace' || plugin.marketplace === null) {
      throw new PluginPathInvalidError('not a marketplace plugin');
    }

    const marketplace = declaredMarketplaceOf(this.deps, plugin.marketplace);
    const prepared = await this.deps.source.prepare(marketplace.source, plugin.name);
    if ('kind' in prepared) {
      throw errorOfSourceFailure(prepared, plugin.name);
    }

    const currentRead = await this.deps.manifests.read(plugin.path);
    const currentManifest =
      typeof currentRead === 'string' ? prepared.manifest : currentRead.manifest;
    const diff = diffPluginManifests(currentManifest, prepared.manifest);
    const at = this.deps.clock.now();
    const description = describePluginUpdate(
      { marketplace: plugin.marketplace },
      plugin.name,
      plugin.commit ?? '',
      prepared.commit,
      diff,
    );

    try {
      await this.deps.trail.execute(
        pluginEvent(
          'engine.pluginUpdated',
          this.deps.engine,
          userId,
          pluginId,
          plugin.name,
          description,
          at,
        ),
      );
    } catch (error) {
      await this.deps.source.discard(prepared.stagedAt);
      throw error;
    }

    await this.deps.source.swap(prepared.stagedAt, plugin.path);
    const updated = await this.deps.plugins.updateInstalled(
      pluginId,
      { commit: prepared.commit, approvedDigest: prepared.digest },
      at,
    );

    return { ...updated, state: 'current', manifest: prepared.manifest };
  }
}

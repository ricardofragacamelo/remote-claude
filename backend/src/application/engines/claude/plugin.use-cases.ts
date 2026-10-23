import type { RecordAuditEventUseCase } from '@application/audit';
import type { FolderAccess } from '@application/agent-settings';
import {
  describePlugin,
  PluginForbiddenError,
  PluginNotFoundError,
  PluginPathInvalidError,
  pluginStateOf,
} from '@domain/engines/claude';
import type {
  PluginDescription,
  PluginIdentity,
  PluginManifest,
  PluginState,
} from '@domain/engines/claude';
import type { UserId } from '@domain/auth';
import type { Clock, IdGenerator } from '@domain/shared';
import type { PluginManifestReader } from './ports/plugin-manifest-reader.port';
import type { PluginRepository, StoredPlugin } from './ports/plugin-repository.port';

/** What every plugin use case of this file shares. */
export interface PluginDependencies {
  readonly engine: string;
  readonly plugins: PluginRepository;
  readonly manifests: PluginManifestReader;
  readonly folders: FolderAccess;
  readonly trail: RecordAuditEventUseCase;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** A plugin with its manifest read fresh — `manifest` is `null` only when it could no longer be read. */
export interface PluginView extends StoredPlugin {
  readonly state: PluginState;
  readonly manifest: PluginManifest | null;
}

/** The result of previewing a local directory before adding it (plan 13, B-27, S-125). */
export interface LocalPluginPreview {
  readonly manifest: PluginManifest;
  readonly description: PluginDescription;
}

function identityOf(path: string): PluginIdentity {
  return { origin: 'local', path, marketplace: null, commit: null };
}

/** The plugin with that id, provided it is the caller's (S-129). */
async function ownedPlugin(
  plugins: PluginRepository,
  userId: UserId,
  pluginId: string,
): Promise<StoredPlugin> {
  const plugin = await plugins.findById(pluginId);

  if (plugin === null) {
    throw new PluginNotFoundError(pluginId);
  }
  if (!plugin.userId.equals(userId)) {
    throw new PluginForbiddenError();
  }

  return plugin;
}

/** [plugin], with its manifest read fresh — the same view {@link ListPluginsUseCase} builds per row. */
async function viewOf(manifests: PluginManifestReader, plugin: StoredPlugin): Promise<PluginView> {
  const read = await manifests.read(plugin.path);
  if (typeof read === 'string') {
    return { ...plugin, state: 'unreadable', manifest: null };
  }
  return { ...plugin, state: pluginStateOf(plugin.approvedDigest, read), manifest: read.manifest };
}

/** Reads a local directory's manifest, or turns a read failure into the domain's own error. */
async function readLocalManifest(
  manifests: PluginManifestReader,
  path: string,
): Promise<{ readonly manifest: PluginManifest; readonly digest: string }> {
  const read = await manifests.read(path);
  if (typeof read === 'string') {
    throw new PluginPathInvalidError(
      read === 'notFound' ? 'no plugin manifest found at that path' : 'the manifest does not parse',
    );
  }
  return read;
}

/** The audit record of a plugin write — the por-extenso description, when there is one to show. */
function pluginEvent(
  kind: 'engine.pluginAdded' | 'engine.pluginToggled' | 'engine.pluginRemoved',
  engine: string,
  userId: UserId,
  pluginId: string,
  name: string,
  description: PluginDescription | null,
  at: Date,
): Parameters<RecordAuditEventUseCase['execute']>[0] {
  return {
    userId,
    kind,
    subjectId: pluginId,
    subjectLabel: name,
    details: { engine, ...(description === null ? {} : description) },
    at,
  };
}

/** `GET /engines/claude/plugins` — every plugin of this user, with its manifest read fresh (B-27). */
export class ListPluginsUseCase {
  constructor(private readonly deps: PluginDependencies) {}

  async execute(userId: UserId): Promise<readonly PluginView[]> {
    const stored = await this.deps.plugins.listFor(userId);
    return Promise.all(stored.map((plugin) => viewOf(this.deps.manifests, plugin)));
  }
}

/**
 * `POST /engines/claude/plugins/preview` — what a local directory would bring, before the second
 * step (plan 13, B-27, S-125). Path validation reuses the same allowlist every folder of this
 * product clears (`WORKSPACE_NOT_ALLOWED`, `FORBIDDEN`, `WORKSPACE_NOT_FOUND`).
 */
export class PreviewLocalPluginUseCase {
  constructor(private readonly deps: PluginDependencies) {}

  /** @throws {import('@domain/engines/claude').PluginPathInvalidError} no manifest, or it does not parse */
  async execute(userId: UserId, rawPath: string): Promise<LocalPluginPreview> {
    const resolved = await this.deps.folders.resolve(rawPath, userId);
    const { manifest } = await readLocalManifest(this.deps.manifests, resolved.value);
    const identity = identityOf(resolved.value);
    return { manifest, description: describePlugin(identity, manifest) };
  }
}

/**
 * `POST /engines/claude/plugins` — adding a local plugin (plan 13, B-27).
 *
 * Adding the same directory twice answers the existing row rather than a second one (S-130): a
 * plugin is identified by where it loads from, and a caller that already added it gets back what it
 * already has, not a conflict. A genuinely new plugin is widening what runs with this user's
 * credentials, so — the same shape {@link import('@application/mcp').CreateMcpServerUseCase} already
 * uses — the row is written first and the audit write follows; a trail that could not take it
 * reverts the row.
 */
export class AddLocalPluginUseCase {
  constructor(private readonly deps: PluginDependencies) {}

  /**
   * @throws whatever {@link import('@application/agent-settings').FolderAccess.resolve} throws
   * @throws {import('@domain/engines/claude').PluginPathInvalidError} no manifest, or it does not parse
   */
  async execute(userId: UserId, rawPath: string): Promise<PluginView> {
    const resolved = await this.deps.folders.resolve(rawPath, userId);
    const existing = await this.deps.plugins.findByPath(userId, resolved.value);
    if (existing !== null) {
      return viewOf(this.deps.manifests, existing);
    }

    const { manifest, digest } = await readLocalManifest(this.deps.manifests, resolved.value);
    const identity = identityOf(resolved.value);
    const id = this.deps.ids.next();
    const at = this.deps.clock.now();

    const stored = await this.deps.plugins.insert(
      id,
      { userId, identity, name: manifest.name, approvedDigest: digest },
      at,
    );

    try {
      await this.deps.trail.execute(
        pluginEvent(
          'engine.pluginAdded',
          this.deps.engine,
          userId,
          id,
          stored.name,
          describePlugin(identity, manifest),
          at,
        ),
      );
    } catch (error) {
      await this.deps.plugins.delete(id);
      throw error;
    }

    // Just written at this digest — current by construction, no second read needed.
    return { ...stored, state: 'current', manifest };
  }
}

/**
 * `PATCH /engines/claude/plugins/:id` — turning a plugin on or off (plan 13, B-27).
 *
 * The same asymmetry {@link import('@application/mcp').SetMcpServerEnabledUseCase} already has:
 * disabling narrows what can run, so the store write stands even if the audit that follows fails;
 * enabling widens it, so a failed audit reverts it.
 */
export class SetPluginEnabledUseCase {
  constructor(private readonly deps: PluginDependencies) {}

  /** @throws {import('@domain/engines/claude').PluginNotFoundError} and {@link PluginForbiddenError} */
  async execute(userId: UserId, pluginId: string, enabled: boolean): Promise<PluginView> {
    const before = await ownedPlugin(this.deps.plugins, userId, pluginId);
    if (before.enabled === enabled) {
      return viewOf(this.deps.manifests, before);
    }

    const at = this.deps.clock.now();
    const stored = await this.deps.plugins.setEnabled(pluginId, enabled, at);
    const event = pluginEvent(
      'engine.pluginToggled',
      this.deps.engine,
      userId,
      pluginId,
      before.name,
      null,
      at,
    );

    try {
      await this.deps.trail.execute(event);
    } catch (error) {
      // Narrowing (disabling) stands either way; widening (enabling) reverts — the same asymmetry
      // the class doc above describes, written as one guard rather than two mirrored branches.
      if (enabled) {
        await this.deps.plugins.setEnabled(pluginId, false, at);
      }
      throw error;
    }

    return viewOf(this.deps.manifests, stored);
  }
}

/**
 * `DELETE /engines/claude/plugins/:id` — removing a plugin for good (plan 13, B-27).
 *
 * Narrowing, so it is safe by default — the row is gone whether or not the trail could keep up, the
 * same choice {@link import('@application/mcp').DeleteMcpServerUseCase} makes for the same reason.
 */
export class RemovePluginUseCase {
  constructor(private readonly deps: PluginDependencies) {}

  /** @throws the same as {@link ownedPlugin} */
  async execute(userId: UserId, pluginId: string): Promise<void> {
    const plugin = await ownedPlugin(this.deps.plugins, userId, pluginId);
    const at = this.deps.clock.now();

    await this.deps.plugins.delete(pluginId);
    await this.deps.trail.execute(
      pluginEvent(
        'engine.pluginRemoved',
        this.deps.engine,
        userId,
        pluginId,
        plugin.name,
        null,
        at,
      ),
    );
  }
}

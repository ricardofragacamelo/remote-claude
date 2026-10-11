import type { UserId } from '@domain/auth';
import type { IdGenerator } from '@domain/shared';
import { menuOf, SessionId } from '@domain/session';
import type { InstallationModel, MenuCommand, SlashCommand } from '@domain/session';
import type { WorkspacePath } from '@domain/workspace';
import type { EngineRegistry } from './engine-registry';
import { controlOf } from './ports/agent-engine.port';
import type { AgentSessionHandle } from './ports/agent-engine.port';
import type { FolderLocator } from './ports/folder-locator.port';
import type { CommandCatalog, ModelCatalog } from './command-catalog';
import type { SessionRegistry } from './session-registry';

/** What the composer may take, said before it takes it (plan 08, D-02, D-23). */
export interface ComposerLimits {
  /** The largest attachment, in bytes, and the images the prompt carries. */
  readonly attachmentMaxBytes: number;
  readonly attachmentImageTypes: readonly string[];

  /** Past this share of the free context window, the set of context warns — it never blocks. */
  readonly contextWarnFraction: number;

  /** The window a draft estimates against: no session yet, so no `getContextUsage()`. */
  readonly draftWindowTokens: number;

  /** What the set of context may add up to, in bytes, before it refuses to send. */
  readonly contextMaxBytes: number;
}

/** What a folder's installation offers the composer before a session exists. */
export interface InstallationCatalog {
  readonly cliVersion: string | null;
  readonly commands: readonly MenuCommand[];
  readonly models: readonly InstallationModel[];
  readonly limits: ComposerLimits;
}

/** What the query of the catalogue needs to be opened like a session — and closed at once. */
export interface CatalogProbing {
  /** The engines; the draft of a new session asks the default one. */
  readonly engines: EngineRegistry;
  readonly sessionIds: IdGenerator;
}

/** What the probe was told. */
interface Probed {
  readonly cliVersion: string | null;
  readonly commands: readonly SlashCommand[];
  readonly models: readonly InstallationModel[];
}

/**
 * The slash commands, the skills and the models of a folder's installation **before** a session
 * exists — the draft of plan 08 (D-07, D-13, B-50).
 *
 * From the catalogues the sessions fill, by the version of the CLI and the folder. When they hold
 * nothing for the folder, one query is opened that only asks — it never takes a prompt and costs no
 * quota —, counts against the ceiling of sessions while it lives, and is closed as soon as it
 * answered. Two drafts asking together make one query (S-245).
 *
 * The folder is located the way the list of live sessions locates it: the same refusals, without
 * recording that it was used.
 */
export class ReadCatalogUseCase {
  private readonly asking = new Map<string, Promise<Probed>>();

  constructor(
    private readonly folders: FolderLocator,
    private readonly registry: SessionRegistry,
    private readonly catalogs: { readonly commands: CommandCatalog; readonly models: ModelCatalog },
    private readonly probing: CatalogProbing,
    private readonly limits: ComposerLimits,
  ) {}

  /**
   * @throws whatever the folder is refused with — `WORKSPACE_NOT_ALLOWED`, `WORKSPACE_NOT_FOUND`…
   * @throws {import('@domain/session').SessionLimitReachedError} no slot for the query
   * @throws {import('@domain/engine').AgentUnavailableError} the CLI failed to answer
   * @throws {import('@domain/engine').AgentTimeoutError} the CLI did not answer in time
   */
  async execute(rawPath: string, userId: UserId): Promise<InstallationCatalog> {
    const workspace = await this.folders.locate(rawPath, userId);
    const commands = this.catalogs.commands.latestFor(workspace.value);
    const models = this.catalogs.models.latestFor(workspace.value);

    const known =
      commands !== null && models !== null
        ? { cliVersion: (await this.probing.engines.default.describe()).version, commands, models }
        : await this.probeOnce(workspace);

    return {
      cliVersion: known.cliVersion,
      commands: menuOf(known.commands, this.probing.engines.default.commandMenu),
      models: known.models,
      limits: this.limits,
    };
  }

  /** One query per folder at a time: the second asks the first's answer. */
  private probeOnce(workspace: WorkspacePath): Promise<Probed> {
    const pending = this.asking.get(workspace.value);
    if (pending !== undefined) {
      return pending;
    }

    const asked = this.probe(workspace).finally(() => {
      this.asking.delete(workspace.value);
    });
    this.asking.set(workspace.value, asked);

    return asked;
  }

  private async probe(workspace: WorkspacePath): Promise<Probed> {
    // A slot, as any session takes, before anything is spawned — and given back in the `finally`.
    this.registry.reserve();
    const engine = this.probing.engines.default;
    let handle: AgentSessionHandle | null = null;

    try {
      handle = await engine.start({
        sessionId: SessionId.create(this.probing.sessionIds.next()),
        workspace,
        model: null,
        permissionMode: 'ask',
        // A conversation nobody will ever write: no prompt goes, so no transcript is made.
        conversation: { ref: engine.newConversation(), resumedFrom: null },
        onEvent: () => undefined,
        onClosed: () => undefined,
      });

      const opened = handle;
      const [commands, models] = await Promise.all([
        controlOf(engine.engine, opened, 'supportedCommands')(),
        controlOf(engine.engine, opened, 'supportedModels')(),
      ]);
      // The version the engine said at boot, until the session reported its own: the key the
      // answers are kept by.
      const version = opened.cliVersion ?? (await engine.describe()).version;

      this.catalogs.commands.put(version, workspace.value, commands);
      this.catalogs.models.put(version, workspace.value, models);

      return { cliVersion: version, commands, models };
    } finally {
      try {
        await handle?.close();
      } finally {
        this.registry.release();
      }
    }
  }
}

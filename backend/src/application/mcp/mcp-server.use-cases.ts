import type { RecordAuditEventUseCase } from '@application/audit';
import { createMcpServerConfig, describeMcpServer, McpServerNameTakenError } from '@domain/mcp';
import type { McpEngineDialect, McpServerConfig, McpServerDescription } from '@domain/mcp';
import type { UserId } from '@domain/auth';
import type { Clock, IdGenerator } from '@domain/shared';
import type { McpServerFieldsInput } from './commands/mcp-server-fields.command';
import { configFromRevealed } from './config-from-revealed';
import { mergeSecretFields } from './merge-secret-fields';
import type { McpEngineCapabilities } from './mcp-engine-capabilities';
import type { McpEngineDialects } from './mcp-engine-dialects';
import { ownedServer } from './owned-server';
import type { LiveSessionMcpRevocation } from './ports/live-session-mcp-revocation.port';
import {
  DuplicateMcpServerNameError,
  type McpSecretField,
  type McpServerRepository,
  type RevealedMcpServer,
  type StoredMcpServer,
} from './ports/mcp-server-repository.port';

/** What every use case of this file shares. */
export interface McpServerDependencies {
  readonly servers: McpServerRepository;
  readonly capabilities: McpEngineCapabilities;
  readonly dialects: McpEngineDialects;
  readonly trail: RecordAuditEventUseCase;
  readonly ids: IdGenerator;
  readonly clock: Clock;

  /** Reaches every live session when a server is disabled or removed (plan 13, B-23). */
  readonly liveSessions: LiveSessionMcpRevocation;
}

const NO_SECRETS: readonly McpSecretField[] = [];

/** Builds the validated config a write would store — the S-71 merge, then the B-18 domain rule. */
function configOf(
  fields: McpServerFieldsInput,
  dialect: McpEngineDialect,
  existingEnv: readonly McpSecretField[],
  existingHeaders: readonly McpSecretField[],
): McpServerConfig {
  return createMcpServerConfig(
    {
      name: fields.name,
      scope: fields.scope,
      folderPath: fields.folderPath,
      transport: fields.transport,
      command: fields.command ?? null,
      args: fields.args ?? [],
      env: mergeSecretFields(existingEnv, fields.env),
      url: fields.url ?? null,
      headers: mergeSecretFields(existingHeaders, fields.headers),
    },
    dialect,
  );
}

/**
 * Runs [write] and turns the repository's name-conflict signal into the domain's own error — shared
 * by create and update, the only two writes a name can conflict on.
 */
async function savingServer<T>(name: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof DuplicateMcpServerNameError) {
      throw new McpServerNameTakenError(name);
    }
    throw error;
  }
}

/** The audit record of a server write — the por-extenso description, never a secret value. */
function serverEvent(
  kind: 'mcp.serverAdded' | 'mcp.serverChanged' | 'mcp.serverRemoved' | 'mcp.serverToggled',
  userId: UserId,
  engine: string,
  serverId: string,
  config: Pick<McpServerConfig, 'name'>,
  description: McpServerDescription | null,
  at: Date,
): Parameters<RecordAuditEventUseCase['execute']>[0] {
  return {
    userId,
    kind,
    subjectId: serverId,
    subjectLabel: config.name,
    details: { engine, ...(description === null ? {} : description) },
    at,
  };
}

/** `GET /engines/:engine/mcp-servers` — every server of this user, in this engine (B-19). */
export class ListMcpServersUseCase {
  constructor(private readonly deps: McpServerDependencies) {}

  /** @throws {import('@domain/mcp').McpEngineNotSupportedError} */
  async execute(userId: UserId, engine: string): Promise<readonly StoredMcpServer[]> {
    this.deps.capabilities.assertSupports(engine);
    return this.deps.servers.listFor(userId, engine);
  }
}

/**
 * `POST /engines/:engine/mcp-servers/preview` — the exact description a save would record (plan 13,
 * B-18, S-68): the second step shows this, word for word, before anything is written.
 */
export class PreviewMcpServerUseCase {
  constructor(private readonly deps: McpServerDependencies) {}

  /**
   * @throws {import('@domain/mcp').McpEngineNotSupportedError}
   * @throws {import('@domain/mcp').McpServerConfigInvalidError}
   */
  execute(engine: string, fields: McpServerFieldsInput): McpServerDescription {
    this.deps.capabilities.assertSupports(engine);
    return describeMcpServer(configOf(fields, this.deps.dialects.for(engine), [], []));
  }
}

/**
 * `POST /engines/:engine/mcp-servers` — adding a server (plan 13, B-19).
 *
 * Adding is widening what can run with this user's credentials, so a creation that the trail could
 * not record does not stand: the row is written first — its own unique index is what actually
 * settles a name race atomically — and the audit write follows; if the audit fails, the row just
 * created is taken back before the failure goes up (the same shape {@link
 * import('@application/permission').GrantPermissionRuleUseCase} uses for the same reason).
 */
export class CreateMcpServerUseCase {
  constructor(private readonly deps: McpServerDependencies) {}

  /**
   * @throws {import('@domain/mcp').McpEngineNotSupportedError}
   * @throws {import('@domain/mcp').McpServerConfigInvalidError}
   * @throws {import('@domain/mcp').McpServerNameTakenError}
   * @throws {import('@domain/mcp').SecretStoreUnavailableError} the config carries a secret and the
   *   key file is unusable — nothing is written
   */
  async execute(
    userId: UserId,
    engine: string,
    fields: McpServerFieldsInput,
  ): Promise<StoredMcpServer> {
    this.deps.capabilities.assertSupports(engine);
    const config = configOf(fields, this.deps.dialects.for(engine), NO_SECRETS, NO_SECRETS);
    const id = this.deps.ids.next();
    const at = this.deps.clock.now();

    const stored = await savingServer(config.name, () =>
      this.deps.servers.insert(id, { userId, engine, config }, at),
    );

    try {
      await this.deps.trail.execute(
        serverEvent('mcp.serverAdded', userId, engine, id, config, describeMcpServer(config), at),
      );
    } catch (error) {
      await this.deps.servers.delete(id);
      throw error;
    }

    return stored;
  }
}

/**
 * `PUT /engines/:engine/mcp-servers/:id` — changing a server (plan 13, B-19): the same
 * audit-then-keep-or-revert shape as {@link CreateMcpServerUseCase}, since a change can point the
 * server at a different program just as a creation can.
 */
export class UpdateMcpServerUseCase {
  constructor(private readonly deps: McpServerDependencies) {}

  /** @throws the same as {@link CreateMcpServerUseCase.execute}, plus ownership's */
  async execute(
    userId: UserId,
    engine: string,
    serverId: string,
    fields: McpServerFieldsInput,
  ): Promise<StoredMcpServer> {
    this.deps.capabilities.assertSupports(engine);
    const before = await ownedServer(this.deps.servers, userId, serverId);
    const revealedBefore = await this.deps.servers.reveal(serverId);
    const config = configOf(
      fields,
      this.deps.dialects.for(engine),
      revealedBefore?.env ?? NO_SECRETS,
      revealedBefore?.headers ?? NO_SECRETS,
    );
    const at = this.deps.clock.now();

    const stored = await savingServer(config.name, () =>
      this.deps.servers.update(serverId, { userId, engine, config }, at),
    );

    try {
      await this.deps.trail.execute(
        serverEvent(
          'mcp.serverChanged',
          userId,
          engine,
          serverId,
          config,
          describeMcpServer(config),
          at,
        ),
      );
    } catch (error) {
      await this.revert(before, revealedBefore, at);
      throw error;
    }

    return stored;
  }

  private async revert(
    before: StoredMcpServer,
    revealedBefore: RevealedMcpServer | null,
    at: Date,
  ): Promise<void> {
    if (revealedBefore === null) {
      return;
    }
    await this.deps.servers.update(
      before.id,
      { userId: before.userId, engine: before.engine, config: configFromRevealed(revealedBefore) },
      at,
    );
  }
}

/**
 * `PATCH /engines/:engine/mcp-servers/:id` — turning a server on or off within the store (plan 13,
 * B-19).
 *
 * Disabling narrows what can run, so it is safe by default: the store write happens first and
 * stands even if the audit write that follows fails — the same shape {@link
 * import('@application/permission').RevokePermissionRuleUseCase} uses for revoking a rule. Enabling
 * widens it back, so an audit failure reverts it, like {@link CreateMcpServerUseCase}.
 *
 * Disabling also reaches every live session that has the server, turning it off there too, right
 * away — never waiting for the audit, which can fail without undoing either effect (plan 13, B-23,
 * D-10). Enabling reaches no live session: the asymmetry is the same one revoking and granting a
 * permission rule already have.
 */
export class SetMcpServerEnabledUseCase {
  constructor(private readonly deps: McpServerDependencies) {}

  /** @throws {import('@domain/mcp').McpEngineNotSupportedError} and ownership's */
  async execute(
    userId: UserId,
    engine: string,
    serverId: string,
    enabled: boolean,
  ): Promise<StoredMcpServer> {
    this.deps.capabilities.assertSupports(engine);
    const before = await ownedServer(this.deps.servers, userId, serverId);
    const at = this.deps.clock.now();

    if (before.enabled === enabled) {
      return before;
    }

    const stored = await this.deps.servers.setEnabled(serverId, enabled, at);

    if (!enabled) {
      await this.deps.liveSessions.disableEverywhere(userId, engine, before.name);
    }

    const event = serverEvent('mcp.serverToggled', userId, engine, serverId, before, null, at);

    if (enabled) {
      try {
        await this.deps.trail.execute(event);
      } catch (error) {
        await this.deps.servers.setEnabled(serverId, false, at);
        throw error;
      }
    } else {
      await this.deps.trail.execute(event);
    }

    return stored;
  }
}

/**
 * `DELETE /engines/:engine/mcp-servers/:id` — removing a server for good (plan 13, B-19).
 *
 * Narrowing, so it is safe by default — the row is gone whether or not the trail could keep up, the
 * same choice {@link import('@application/permission').RevokePermissionRuleUseCase} makes for a
 * revocation. Reaches every live session that has the server too, the same as disabling it does
 * (plan 13, B-23, D-10).
 */
export class DeleteMcpServerUseCase {
  constructor(private readonly deps: McpServerDependencies) {}

  /**
   * Deleting twice is `MCP_SERVER_NOT_FOUND` the second time (S-78): there is no state left to make
   * idempotent, unlike a revoked rule that keeps its row.
   *
   * @throws the same as {@link ownedServer}
   */
  async execute(userId: UserId, engine: string, serverId: string): Promise<void> {
    this.deps.capabilities.assertSupports(engine);
    const server = await ownedServer(this.deps.servers, userId, serverId);
    const at = this.deps.clock.now();

    await this.deps.servers.delete(serverId);
    await this.deps.liveSessions.disableEverywhere(userId, engine, server.name);
    await this.deps.trail.execute(
      serverEvent('mcp.serverRemoved', userId, engine, serverId, server, null, at),
    );
  }
}

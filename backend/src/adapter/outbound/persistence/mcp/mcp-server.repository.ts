import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';

import { SecretStoreUnavailableError } from '@domain/mcp';
import type { McpServerConfig } from '@domain/mcp';
import { UserId } from '@domain/auth';
import {
  DuplicateMcpServerNameError,
  type McpSecretField,
  type McpServerRepository,
  type McpServerWrite,
  type RevealedMcpServer,
  type StoredMcpServer,
} from '@application/mcp';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import type { Database, Transaction } from '@infra/database/connection';
import { mcpServerSecrets, mcpServers } from '@infra/database/schema';
import { decryptValue, encryptValue } from '@shared/crypto/aes-gcm-cipher';
import { readMcpSecretKey } from './mcp-secret-key';
import { describedBy, runLogged } from '../query-logging';

/** Where this repository finds the key that encrypts a server's secrets, as the composition gives it. */
export const MCP_SECRET_KEY_FILE = Symbol('McpSecretKeyFile');

type ServerRow = typeof mcpServers.$inferSelect;
type SecretRow = typeof mcpServerSecrets.$inferSelect;
type Queryable = Database | Transaction;

function storedOf(row: ServerRow, secretRows: readonly SecretRow[]): StoredMcpServer {
  return {
    id: row.id,
    userId: UserId.create(row.userId),
    engine: row.engine,
    name: row.name,
    scope: row.scope as StoredMcpServer['scope'],
    folderPath: row.folderPath,
    transport: row.transport as StoredMcpServer['transport'],
    command: row.command,
    args: row.args,
    envNames: secretRows.filter((entry) => entry.kind === 'env').map((entry) => entry.name),
    url: row.url,
    headerNames: secretRows.filter((entry) => entry.kind === 'header').map((entry) => entry.name),
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The columns every write sets from the config, whether this is the first write or not. */
function identityColumnsOf(config: McpServerConfig) {
  return {
    name: config.name,
    scope: config.scope,
    folderPath: config.folderPath,
    transport: config.transport,
    command: config.command,
    args: [...config.args],
    url: config.url,
  };
}

function insertRowOf(id: string, write: McpServerWrite, now: Date): typeof mcpServers.$inferInsert {
  return {
    id,
    userId: write.userId.value,
    engine: write.engine,
    ...identityColumnsOf(write.config),
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function updateFieldsOf(write: McpServerWrite, now: Date) {
  return { ...identityColumnsOf(write.config), updatedAt: now };
}

/**
 * One row of `mcp_server_secrets` for [field], of [kind], belonging to [serverId].
 *
 * An empty value needs no key and no ciphertext — the three encrypted columns are `NULL`
 * together, read back as `''`. Anything else needs [key]: whoever calls this for a non-empty value
 * must already have it, because {@link DrizzleMcpServerRepository}'s own `keyIfNeeded` reads it
 * whenever any field of the write is non-empty — the same condition this function checks per
 * field, so the two can never disagree. A caller that gets this wrong is this module's own bug,
 * not a configuration problem, which is exactly what makes this worth asserting and exporting:
 * pure, and testable without a database.
 *
 * @throws {Error} [field] has a value but [key] is `null`
 */
export function encryptedRowOf(
  serverId: string,
  kind: 'env' | 'header',
  field: McpSecretField,
  key: Buffer | null,
  position: number,
): typeof mcpServerSecrets.$inferInsert {
  if (field.value === '') {
    return { serverId, kind, name: field.name, ciphertext: null, iv: null, tag: null, position };
  }
  if (key === null) {
    throw new Error('a non-empty secret value reached encryptedRowOf without a key');
  }
  const encrypted = encryptValue(key, field.value);
  return {
    serverId,
    kind,
    name: field.name,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    position,
  };
}

/** The columns {@link decryptedFieldOf} reads — a `SecretRow` satisfies it structurally. */
export interface EncryptedSecretColumns {
  readonly name: string;
  readonly ciphertext: Buffer | null;
  readonly iv: Buffer | null;
  readonly tag: Buffer | null;
}

/**
 * [row] decrypted with [key] — the inverse of {@link encryptedRowOf}. A row with no ciphertext
 * decrypts to `''`, needing no key; otherwise [key] must be the one that row was encrypted with,
 * for the same reason {@link encryptedRowOf} documents.
 *
 * @throws {Error} [row] carries ciphertext but [key] is `null`
 */
export function decryptedFieldOf(row: EncryptedSecretColumns, key: Buffer | null): McpSecretField {
  if (row.ciphertext === null || row.iv === null || row.tag === null) {
    return { name: row.name, value: '' };
  }
  if (key === null) {
    throw new Error('an encrypted secret reached decryptedFieldOf without a key');
  }
  return {
    name: row.name,
    value: decryptValue(key, { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag }),
  };
}

/**
 * `mcp_servers` and `mcp_server_secrets`, in PostgreSQL (plan 13, B-19): one port over two tables,
 * because a write touches both and a caller must never update one without the other.
 *
 * The encryption key is read fresh from disk on every write or reveal that needs it — never
 * cached — so a key file that appears after boot is picked up on the very next write, the same
 * forgiveness the push credential has (plan 02, D-20).
 */
@Injectable()
export class DrizzleMcpServerRepository implements McpServerRepository {
  constructor(
    @Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext,
    @Inject(MCP_SECRET_KEY_FILE) private readonly secretKeyFile: string,
  ) {}

  async listFor(userId: UserId, engine: string): Promise<readonly StoredMcpServer[]> {
    const rows = await runLogged(
      this.context.logger,
      'mcpServer.listFor',
      this.context.db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.userId, userId.value), eq(mcpServers.engine, engine))),
    );

    return Promise.all(rows.map((row) => this.withSecretNames(this.context.db, row)));
  }

  async findById(id: string): Promise<StoredMcpServer | null> {
    const row = await this.row(this.context.db, id);
    return row === null ? null : this.withSecretNames(this.context.db, row);
  }

  async reveal(id: string): Promise<RevealedMcpServer | null> {
    const row = await this.row(this.context.db, id);
    if (row === null) {
      return null;
    }

    const secretRows = await this.secretRows(this.context.db, id);
    const needsKey = secretRows.some((secretRow) => secretRow.ciphertext !== null);
    const key = needsKey ? await this.keyOrUnavailable() : null;

    return {
      ...storedOf(row, secretRows),
      env: secretRows.filter((r) => r.kind === 'env').map((r) => decryptedFieldOf(r, key)),
      headers: secretRows.filter((r) => r.kind === 'header').map((r) => decryptedFieldOf(r, key)),
    };
  }

  async insert(id: string, write: McpServerWrite, now: Date): Promise<StoredMcpServer> {
    return this.writeTransaction(id, write, null, (tx) =>
      runLogged(
        this.context.logger,
        'mcpServer.insert',
        tx
          .insert(mcpServers)
          .values(insertRowOf(id, write, now))
          .returning(),
      ).then(([row]) => row as ServerRow),
    );
  }

  async update(id: string, write: McpServerWrite, now: Date): Promise<StoredMcpServer> {
    return this.writeTransaction(id, write, id, async (tx) => {
      const [row] = await runLogged(
        this.context.logger,
        'mcpServer.update',
        tx
          .update(mcpServers)
          .set(updateFieldsOf(write, now))
          .where(eq(mcpServers.id, id))
          .returning(),
      );
      await runLogged(
        this.context.logger,
        'mcpServer.secrets.clear',
        tx.delete(mcpServerSecrets).where(eq(mcpServerSecrets.serverId, id)),
      );
      return row as ServerRow;
    });
  }

  async setEnabled(id: string, enabled: boolean, now: Date): Promise<StoredMcpServer> {
    const [row] = await runLogged(
      this.context.logger,
      'mcpServer.setEnabled',
      this.context.db
        .update(mcpServers)
        .set({ enabled, updatedAt: now })
        .where(eq(mcpServers.id, id))
        .returning(),
    );
    return this.withSecretNames(this.context.db, row as ServerRow);
  }

  async delete(id: string): Promise<void> {
    await runLogged(
      this.context.logger,
      'mcpServer.delete',
      this.context.db.delete(mcpServers).where(eq(mcpServers.id, id)),
    );
  }

  /**
   * The shape {@link insert} and {@link update} share: lock the identity, refuse a name already
   * taken by another row, let [persist] write the structural columns — handing back the row its
   * own `RETURNING` produced, never a second `SELECT` — then replace the secrets and answer the
   * row as it now stands. [excludingId] is `null` for an insert — nothing to exclude — and the
   * row's own id for an update, so it does not conflict with itself.
   */
  private async writeTransaction(
    id: string,
    write: McpServerWrite,
    excludingId: string | null,
    persist: (tx: Transaction) => Promise<ServerRow>,
  ): Promise<StoredMcpServer> {
    const key = await this.keyIfNeeded(write.config);

    return this.context.db.transaction(async (tx) => {
      await this.lock(tx, write);

      if (await this.identityTaken(tx, write, excludingId)) {
        throw new DuplicateMcpServerNameError(write.config.name);
      }

      const row = await persist(tx);
      await this.writeSecrets(tx, id, write.config, key);

      return storedOf(row, await this.secretRows(tx, id));
    });
  }

  // --- internals -----------------------------------------------------------------------------

  private async row(db: Queryable, id: string): Promise<ServerRow | null> {
    const [row] = await runLogged(
      this.context.logger,
      'mcpServer.findById',
      db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1),
    );
    return row ?? null;
  }

  private async secretRows(db: Queryable, serverId: string): Promise<SecretRow[]> {
    return runLogged(
      this.context.logger,
      'mcpServer.secrets.listFor',
      db
        .select()
        .from(mcpServerSecrets)
        .where(eq(mcpServerSecrets.serverId, serverId))
        .orderBy(asc(mcpServerSecrets.position)),
    );
  }

  private async withSecretNames(db: Queryable, row: ServerRow): Promise<StoredMcpServer> {
    return storedOf(row, await this.secretRows(db, row.id));
  }

  /** The advisory lock key: the identity a name conflict is checked under. */
  private async lock(tx: Transaction, write: McpServerWrite): Promise<void> {
    const key = JSON.stringify([
      write.userId.value,
      write.engine,
      write.config.scope,
      write.config.folderPath,
      write.config.name,
    ]);
    await runLogged(
      this.context.logger,
      'mcpServer.lock',
      describedBy(tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`)),
    );
  }

  private async identityTaken(
    tx: Transaction,
    write: McpServerWrite,
    excludingId: string | null,
  ): Promise<boolean> {
    const rows = await runLogged(
      this.context.logger,
      'mcpServer.findEquivalent',
      tx
        .select({ id: mcpServers.id })
        .from(mcpServers)
        .where(
          and(
            eq(mcpServers.userId, write.userId.value),
            eq(mcpServers.engine, write.engine),
            eq(mcpServers.scope, write.config.scope),
            write.config.folderPath === null
              ? isNull(mcpServers.folderPath)
              : eq(mcpServers.folderPath, write.config.folderPath),
            eq(mcpServers.name, write.config.name),
            excludingId === null ? sql`true` : ne(mcpServers.id, excludingId),
          ),
        )
        .limit(1),
    );
    return rows.length > 0;
  }

  /** Reads the key only when this write actually carries a secret — never otherwise (S-73). */
  private async keyIfNeeded(config: McpServerConfig): Promise<Buffer | null> {
    const hasSecret =
      config.env.some((e) => e.value !== '') || config.headers.some((h) => h.value !== '');
    return hasSecret ? this.keyOrUnavailable() : null;
  }

  /** @throws {SecretStoreUnavailableError} the key file is missing or unusable */
  private async keyOrUnavailable(): Promise<Buffer> {
    try {
      return await readMcpSecretKey(this.secretKeyFile);
    } catch {
      throw new SecretStoreUnavailableError();
    }
  }

  private async writeSecrets(
    tx: Transaction,
    serverId: string,
    config: McpServerConfig,
    key: Buffer | null,
  ): Promise<void> {
    const fields: { readonly kind: 'env' | 'header'; readonly field: McpSecretField }[] = [
      ...config.env.map((field) => ({ kind: 'env' as const, field })),
      ...config.headers.map((field) => ({ kind: 'header' as const, field })),
    ];

    if (fields.length === 0) {
      return;
    }

    await runLogged(
      this.context.logger,
      'mcpServer.secrets.insert',
      tx
        .insert(mcpServerSecrets)
        .values(
          fields.map(({ kind, field }, position) =>
            encryptedRowOf(serverId, kind, field, key, position),
          ),
        ),
    );
  }
}

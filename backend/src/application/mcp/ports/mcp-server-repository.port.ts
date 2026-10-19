import type { UserId } from '@domain/auth';
import type { McpServerConfig, McpServerIdentity } from '@domain/mcp';

/** One env var or header, decrypted — only ever held for as long as composing a session takes. */
export interface McpSecretField {
  readonly name: string;
  readonly value: string;
}

/** One server as a generic read answers it — structural fields only, never a secret value (S-70). */
export interface StoredMcpServer extends McpServerIdentity {
  readonly id: string;
  readonly userId: UserId;
  readonly engine: string;
  readonly command: string | null;
  readonly args: readonly string[];
  readonly envNames: readonly string[];
  readonly url: string | null;
  readonly headerNames: readonly string[];
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** [StoredMcpServer], with every secret value decrypted — only for composing a session or a test. */
export interface RevealedMcpServer extends StoredMcpServer {
  readonly env: readonly McpSecretField[];
  readonly headers: readonly McpSecretField[];
}

/** What a server write proposes — the validated config, with real secret values. */
export interface McpServerWrite {
  readonly userId: UserId;
  readonly engine: string;
  readonly config: McpServerConfig;
}

/** Another row of this user, engine, scope and folder already has the name (S-69). */
export class DuplicateMcpServerNameError extends Error {
  constructor(name: string) {
    super(`a server named ${name} already exists in that scope`);
    this.name = 'DuplicateMcpServerNameError';
  }
}

/**
 * The store of MCP servers, for one engine at a time (plan 13, B-19): the structural columns of
 * `mcp_servers` and the encrypted values of `mcp_server_secrets` behind one port, because a write
 * touches both atomically and a caller should never be able to update one without the other.
 *
 * A read never carries a secret value — only {@link reveal} does, and only for composing a session
 * (B-21) or testing a connection (B-25).
 */
export interface McpServerRepository {
  listFor(userId: UserId, engine: string): Promise<readonly StoredMcpServer[]>;

  /** The server, whoever owns it — ownership is the use case's to check (S-76). */
  findById(id: string): Promise<StoredMcpServer | null>;

  /** [findById], with every secret decrypted. */
  reveal(id: string): Promise<RevealedMcpServer | null>;

  /**
   * @throws {DuplicateMcpServerNameError} the same (userId, engine, scope, folderPath, name) exists
   * @throws {import('@domain/mcp').SecretStoreUnavailableError} the config carries a secret and the
   *   key file is unusable — nothing is written, not even the structural row (S-73)
   */
  insert(id: string, write: McpServerWrite, now: Date): Promise<StoredMcpServer>;

  /** @throws the same as {@link insert} */
  update(id: string, write: McpServerWrite, now: Date): Promise<StoredMcpServer>;

  setEnabled(id: string, enabled: boolean, now: Date): Promise<StoredMcpServer>;

  /** Idempotent in effect — the use case turns a second call into `MCP_SERVER_NOT_FOUND` (S-78). */
  delete(id: string): Promise<void>;
}

export const MCP_SERVER_REPOSITORY = Symbol('McpServerRepository');

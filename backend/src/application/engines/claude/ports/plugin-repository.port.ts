import type { UserId } from '@domain/auth';
import type { PluginIdentity } from '@domain/engines/claude';

/** One plugin as a generic read answers it (plan 13, B-27). */
export interface StoredPlugin extends PluginIdentity {
  readonly id: string;
  readonly userId: UserId;
  readonly name: string;
  readonly approvedDigest: string;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** What adding a plugin writes. */
export interface PluginWrite {
  readonly userId: UserId;
  readonly identity: PluginIdentity;
  readonly name: string;
  readonly approvedDigest: string;
}

/**
 * The store of plugins, per user (plan 13, B-27; `claude_plugins`, written by migration `0020`).
 * Unlike an MCP server, a plugin has no scope or folder — it is the user's, everywhere, the same
 * shape the account and the installation already are.
 */
export interface PluginRepository {
  listFor(userId: UserId): Promise<readonly StoredPlugin[]>;

  /** The plugin, whoever owns it — ownership is the use case's to check (S-129). */
  findById(id: string): Promise<StoredPlugin | null>;

  /** The user's own plugin at that exact directory, or `null` — what makes adding idempotent (S-130). */
  findByPath(userId: UserId, path: string): Promise<StoredPlugin | null>;

  insert(id: string, write: PluginWrite, now: Date): Promise<StoredPlugin>;

  setEnabled(id: string, enabled: boolean, now: Date): Promise<StoredPlugin>;

  /** Idempotent in effect — the use case turns a second call into `PLUGIN_NOT_FOUND`. */
  delete(id: string): Promise<void>;
}

export const PLUGIN_REPOSITORY = Symbol('PluginRepository');

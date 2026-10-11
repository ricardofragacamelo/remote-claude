import type { AgentDefaults, FolderDefaults } from '@domain/agent-settings';
import type { UserId } from '@domain/auth';

/** What one user set for the sessions of one engine: their own default and each folder's. */
export interface StoredDefaults {
  readonly user: AgentDefaults | null;
  readonly overrides: readonly FolderDefaults[];
}

/** Where the defaults of every user live, by engine (plan 13, B-14; plan 28, B-36). */
export interface AgentDefaultsRepository {
  /** The user's own default and every folder override they set, for [engine]. */
  read(userId: UserId, engine: string): Promise<StoredDefaults>;

  /**
   * Writes the whole row — never field by field, so two saves at once leave one of them, entire
   * (S-45). `folder` `null` is the user's own default.
   */
  save(userId: UserId, engine: string, folder: string | null, values: AgentDefaults): Promise<void>;

  /** Removes a folder's override for [engine]. @returns whether there was one */
  remove(userId: UserId, engine: string, folder: string): Promise<boolean>;
}

export const AGENT_DEFAULTS_REPOSITORY = Symbol('AgentDefaultsRepository');

import type { UserId } from '@domain/auth';
import type { ClaudeDefaults, FolderDefaults } from '@domain/claude-config';

/** Where the defaults of every user live (plan 13, B-14). */
export interface ClaudeDefaultsRepository {
  /** The user's own default and every folder override they set. */
  read(userId: UserId): Promise<{
    readonly user: ClaudeDefaults | null;
    readonly overrides: readonly FolderDefaults[];
  }>;

  /**
   * Writes the whole row — never field by field, so two saves at once leave one of them, entire
   * (S-45). `folder` `null` is the user's own default.
   */
  save(userId: UserId, folder: string | null, values: ClaudeDefaults): Promise<void>;

  /** Removes a folder's override. @returns whether there was one */
  remove(userId: UserId, folder: string): Promise<boolean>;
}

export const CLAUDE_DEFAULTS_REPOSITORY = Symbol('ClaudeDefaultsRepository');

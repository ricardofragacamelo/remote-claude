import type { UserId } from '@domain/auth';
import type { OutputStyleDefaults } from '@domain/engines/claude';

/** Where the output style each user set for Claude's sessions lives — theirs, and each folder's. */
export interface OutputStyleDefaultsRepository {
  read(userId: UserId): Promise<OutputStyleDefaults>;

  /** Sets the style of the user (`folder` `null`) or of a folder — the last save wins, whole. */
  save(userId: UserId, folder: string | null, style: string): Promise<void>;

  /** Unsets it. @returns whether one was set */
  remove(userId: UserId, folder: string | null): Promise<boolean>;
}

export const OUTPUT_STYLE_DEFAULTS_REPOSITORY = Symbol('OutputStyleDefaultsRepository');

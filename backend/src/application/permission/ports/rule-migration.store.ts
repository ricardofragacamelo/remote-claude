/** A rule still in an engine's grammar — written before the canonical one (plan 28, B-33). */
export interface NativeRule {
  readonly id: string;

  /** The pattern as it was written, in the engine's grammar. */
  readonly pattern: string;

  /** The engine it was written for, or `null` — then the default engine's. */
  readonly engine: string | null;

  /** Whether it was answering anything at the moment it was read: neither expired nor revoked. */
  readonly active: boolean;
}

/**
 * Where the rules written in an engine's grammar are found and rewritten, once (plan 28, B-33).
 *
 * Each write touches a rule only while it is still in the engine's grammar, so a rule another
 * process already rewrote is left alone and reported as not changed — what makes running the
 * migration twice change nothing (S-134).
 */
export interface RuleMigrationStore {
  /** Every rule still in an engine's grammar — revoked and expired ones too — oldest first. */
  nativeRules(now: Date): Promise<NativeRule[]>;

  /**
   * Rewrites a rule in the canonical grammar, keeping the old pattern beside it.
   *
   * @returns whether it was still in the engine's grammar, and is now converted
   */
  convert(ruleId: string, pattern: string): Promise<boolean>;

  /**
   * Switches a rule off, keeping its pattern as written and saying why. It is never deleted: the
   * list shows it, for the person to write it again.
   *
   * @returns whether it was still in the engine's grammar, and is now disabled
   */
  disable(ruleId: string, reason: string): Promise<boolean>;
}

export const RULE_MIGRATION_STORE = Symbol('RuleMigrationStore');

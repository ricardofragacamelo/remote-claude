import type { RuleDialect, RuleTranslation } from './ports/rule-dialect.port';

/** Why a pattern of an engine with no dialect cannot be translated. */
export const NO_DIALECT = 'noDialect';

/**
 * The dialects of the engines enabled, by engine — what the migration of the rules asks, for a rule
 * that says which engine it was written for, or the default one when it does not (plan 28, B-33).
 */
export class RuleDialects {
  private readonly byEngine: ReadonlyMap<string, RuleDialect>;

  constructor(
    dialects: readonly RuleDialect[],
    private readonly defaultEngine: string,
  ) {
    this.byEngine = new Map(dialects.map((dialect) => [dialect.engine, dialect]));
  }

  /** [nativePattern] of [engine] — the default when `null` — in the canonical grammar, or why not. */
  translate(engine: string | null, nativePattern: string): RuleTranslation {
    const dialect = this.byEngine.get(engine ?? this.defaultEngine);

    return dialect === undefined
      ? { untranslatable: NO_DIALECT }
      : dialect.translate(nativePattern);
  }
}

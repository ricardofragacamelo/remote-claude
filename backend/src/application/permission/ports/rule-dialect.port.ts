/**
 * What an engine's dialect says of a pattern written in its own grammar: the canonical pattern it
 * means, or why there is none — a code, logged, never a sentence (plan 28, B-31, D-18).
 */
export type RuleTranslation = { readonly pattern: string } | { readonly untranslatable: string };

/**
 * The rule grammar of one engine, as its extension registers it (plan 28, B-31).
 *
 * It only **translates the past**: a rule written in the engine's own grammar, before the canonical
 * one, into the canonical pattern that covers exactly the same calls — or nothing, when no
 * translation is unambiguous. Nothing goes to the engine (no rule is ever answered back to it, plan
 * 03 · D-09), and the engine's own suggestions were never read, so there is no other direction.
 */
export interface RuleDialect {
  readonly engine: string;

  /** [nativePattern] in the canonical grammar, or why it cannot be. Pure. */
  translate(nativePattern: string): RuleTranslation;
}

/** The dialects of the engines enabled, as the composition hands them over. */
export const ENGINE_RULE_DIALECTS = Symbol('EngineRuleDialects');

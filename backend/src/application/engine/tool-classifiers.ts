import type { CanonicalTool } from '@domain/engine';

/**
 * How one engine reads a call of its own: its name for the tool and the input, as the core reads it
 * (ADR-025). The adapter of the engine has it, pure — no session, no process.
 *
 * @param folder the folder the call ran in, which the label's paths are relative to — `''` unknown
 */
export type ToolClassify = (
  native: string,
  rawInput: Readonly<Record<string, unknown>>,
  folder: string,
) => CanonicalTool;

/** The classifier of one engine, as its extension registers it. */
export interface EngineToolClassifier {
  readonly engine: string;
  readonly classify: ToolClassify;
}

/** The classifiers of the engines enabled, as the composition hands them over. */
export const ENGINE_TOOL_CLASSIFIERS = Symbol('EngineToolClassifiers');

/**
 * Where the core reads a call it kept in the engine's own words — a line of the trail, a rule
 * written before the canonical grammar (plan 28, D-31). Live, the adapter classifies as the call
 * happens; this is for what was written before the core knew the kind.
 */
export class ToolClassifiers {
  private readonly byEngine: ReadonlyMap<string, ToolClassify>;

  constructor(
    classifiers: readonly EngineToolClassifier[],
    private readonly defaultEngine: string,
  ) {
    this.byEngine = new Map(classifiers.map(({ engine, classify }) => [engine, classify]));
  }

  /**
   * [native] and [rawInput] of [engine] — the default one when the record does not say — as the core
   * reads them. An engine with no classifier gives the generic line, which asks and discloses all.
   */
  classify(
    engine: string | null,
    native: string,
    rawInput: Readonly<Record<string, unknown>>,
    folder = '',
  ): CanonicalTool {
    const of = engine ?? this.defaultEngine;
    const classify = this.byEngine.get(of);

    return classify === undefined
      ? {
          kind: 'other',
          label: { messageKey: 'sessions.tool.other', params: { name: native } },
          subject: {},
          changes: [],
          origin: { engine: of, native },
        }
      : classify(native, rawInput, folder);
  }
}

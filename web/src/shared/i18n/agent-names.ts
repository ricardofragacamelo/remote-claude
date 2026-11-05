/** One engine as a screen names it: the id the contract carries, and the name a person reads. */
export interface NamedAgent {
  readonly id: string;
  readonly displayName: string;
}

/** The engines this installation drives, as `GET /engines` lists them — what an `{{agent}}` reads. */
export interface AgentDirectory {
  readonly defaultEngine: string | null;
  readonly engines: readonly NamedAgent[];
}

/**
 * The name of an engine, in the order a person is best served by: its `displayName`, then its id —
 * a name nobody translated beats a blank —, and, when the text names no engine at all, the default
 * engine's `displayName`. `null` when not even that is known.
 */
export function agentNameIn(directory: AgentDirectory | null, engine: unknown): string | null {
  const named = (id: unknown): string | null =>
    directory?.engines.find((each) => each.id === id)?.displayName ?? null;

  if (typeof engine === 'string' && engine.length > 0) {
    return named(engine) ?? engine;
  }

  return named(directory?.defaultEngine);
}

/** The directory the translations read, kept by whoever reads `GET /engines` (plan 28, B-13). */
let known: AgentDirectory | null = null;

/**
 * Told every time [known] changes, so a mounted text whose `{{agent}}` nobody passed — the implicit
 * substitution {@link nameAgents} feeds — is not stuck at "the agent" until some other prop or state
 * change happens to re-render it. `createI18n` is the one caller: it reads `known` itself, through
 * `missingInterpolationHandler`, which is never reactive on its own — nothing in React subscribes to
 * a plain module variable. Unset in a caller that builds no `i18n` instance (a unit test of
 * {@link agentNameIn} alone, say), where there is nobody to tell.
 */
let watcher: (() => void) | null = null;

/**
 * Registers what {@link nameAgents} calls on every change — `createI18n`'s own, which re-emits the
 * event `useTranslation` already re-renders every mounted text on, so a text that only ever reads
 * `{{agent}}` through the implicit substitution updates the moment the directory arrives, the same
 * as one built through {@link agentNameIn} directly.
 */
export function watchAgentNames(onChanged: (() => void) | null): void {
  watcher = onChanged;
}

/**
 * Keeps the engines a translation names: what fills the `{{agent}}` of every text that has one.
 *
 * A no-op when `directory` is the one already kept. One caller (`AgentSettingsRoute`, plan 13 ·
 * B-30) calls this straight from its render body, on every render, so the directory is correct on
 * the very render that first has it — without this guard, the watcher's own re-render would call
 * this again with the same directory, forever: an infinite render loop, never a visible error,
 * the screen just never finishes (found while closing plan 27, F8 — the agent settings e2e specs).
 */
export function nameAgents(directory: AgentDirectory | null): void {
  if (directory === known) {
    return;
  }

  known = directory;
  watcher?.();
}

/** The name of `engine` by the directory kept — see {@link agentNameIn}. */
export function agentNameOf(engine: unknown): string | null {
  return agentNameIn(known, engine);
}

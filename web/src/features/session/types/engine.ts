import type {
  EngineCapabilities,
  EngineListPayloadEnginesItem,
  SessionStartedPayload,
} from '@remote-claude/contracts';

export type { EngineCapabilities };

/**
 * A mode a conversation can run in, by its canonical name — Permitir tudo (`allowAll`) is a mode of
 * ours (ADR-022). Which of them a conversation offers is what its engine announces in
 * `capabilities.permissionModes`, never a list of ours (plan 28, B-27).
 */
export type PermissionMode = EngineCapabilities['permissionModes'][number];

/**
 * A level of effort, by its canonical name — which of them a conversation can start with is what its
 * engine announces in `capabilities.effortLevels`, never a list of ours (plan 28, B-28).
 */
export type EffortLevel = NonNullable<SessionStartedPayload['effort']>;

/** One coding agent this installation drives, as `GET /engines` lists it (plan 28, B-12). */
export type EngineSummary = EngineListPayloadEnginesItem;

/**
 * The coding agents this installation drives, the default first: what names an engine on screen —
 * its `displayName`, the `{{agent}}` of a text — and what each one can do before a session exists.
 */
export interface EngineDirectory {
  /** The engine a session opens on when the client names none — `null` from an answer without it. */
  readonly defaultEngine: string | null;
  readonly engines: readonly EngineSummary[];
}

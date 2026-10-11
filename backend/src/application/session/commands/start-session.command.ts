import type { UserId } from '@domain/auth';
import type { EffortLevel, PermissionMode, SessionClient } from '@domain/session';

/**
 * Input of `StartSessionUseCase`.
 *
 * Every optional choice is `null` rather than absent: with `exactOptionalPropertyTypes` an omitted
 * property and an explicit `undefined` are different types, and "use the installation's default"
 * deserves to be a value the caller states rather than a field they forgot.
 */
export interface StartSessionCommand {
  readonly workspacePath: string;
  readonly model: string | null;
  readonly permissionMode: PermissionMode | null;

  /**
   * The engine to open on, or `null` for the installation's default (ADR-025). A resume opens on
   * the engine of the conversation it continues, and this is ignored.
   */
  readonly engine?: string | null;

  /**
   * The conversation to continue, `{ engine, id }`, or `null` for a fresh one. Checked by the
   * engine's own rule before anything is spawned.
   */
  readonly resumeFrom: { readonly engine: string; readonly id: string } | null;

  /**
   * The prompt of `resumeSessionId` to send again, edited: the conversation forks from **before** it,
   * always under a new id (plan 08, D-19) — or `null` (or absent, as before plan 08) for a plain
   * resume.
   */
  readonly forkAt?: string | null;

  /** How hard the model thinks — chosen in the draft, for the life of the session (D-16). */
  readonly effort?: EffortLevel | null;

  readonly userId: UserId;

  /** The client that asked: a browser, or the app — said in the list of live sessions. */
  readonly openedFrom: SessionClient;
}

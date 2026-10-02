import type { UserId } from '@domain/auth';
import type { PermissionMode, SessionClient } from '@domain/session';

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
   * The conversation of Claude to continue — an id from the history — or `null` for a new one.
   *
   * Looked up **inside** `workspacePath`: the conversation has to have run there, which is what the
   * history lists it under and what the SDK finds its file by.
   */
  readonly resumeSessionId: string | null;

  readonly userId: UserId;

  /** The client that asked: a browser, or the app — said in the list of live sessions. */
  readonly openedFrom: SessionClient;
}

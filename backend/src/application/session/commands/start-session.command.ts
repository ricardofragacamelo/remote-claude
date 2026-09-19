import type { UserId } from '@domain/auth';
import type { PermissionMode } from '@domain/session';

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
  readonly resumeSessionId: string | null;
  readonly userId: UserId;
}

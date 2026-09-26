import type { UserId } from '@domain/auth';
import type { PermissionMode, SessionId } from '@domain/session';

/** One invocation the SDK is holding its loop open for. */
export interface RequestPermissionCommand {
  /** The SDK's key for the question. Idempotency is by this, never by `toolUseId`. */
  readonly requestId: string;

  readonly sessionId: SessionId;

  /** The owner of the session — who the question is for, and whose rules may answer it. */
  readonly userId: UserId;

  /** The workspace root the session runs in — what a `project` rule is granted for. */
  readonly projectPath: string | null;

  /** The mode the session is in **now**. In `plan`, no `allow` rule answers (D-11). */
  readonly permissionMode: PermissionMode;

  readonly toolUseId: string | null;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
}

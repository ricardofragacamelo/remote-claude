import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';

/** One invocation the SDK is holding its loop open for. */
export interface RequestPermissionCommand {
  /** The SDK's key for the question. Idempotency is by this, never by `toolUseId`. */
  readonly requestId: string;

  readonly sessionId: SessionId;

  /** The owner of the session — who the question is for, and whose rules may answer it. */
  readonly userId: UserId;

  readonly toolUseId: string | null;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
}

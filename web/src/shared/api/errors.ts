/** One invalid field, as the backend reported it. */
export interface AppErrorDetail {
  readonly field: string;
  readonly rule: string;
}

/**
 * A failure, in the shape the UI reacts to.
 *
 * The component branches on `code` and renders `t(messageKey, params)`. It never switches on an
 * HTTP status — that is transport, and it stops existing at this line.
 * See docs/architecture/shared/04-errors-and-http.md.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly messageKey: string,
    readonly traceId: string,
    readonly params: Readonly<Record<string, unknown>> = {},
    readonly details: readonly AppErrorDetail[] = [],
  ) {
    super(`${code} (${traceId})`);
    this.name = 'AppError';
  }
}

/** What the backend sends when something fails. */
interface WireError {
  error?: {
    code?: unknown;
    messageKey?: unknown;
    traceId?: unknown;
    params?: unknown;
    details?: unknown;
  };
}

/**
 * The backend's error envelope as an `AppError`.
 *
 * Anything that does not look like the envelope — a proxy's HTML error page, a truncated body —
 * still has to become something the UI can show, so it becomes the unexpected error with whatever
 * trace we do have.
 */
export function toAppError(body: unknown, fallbackTraceId: string): AppError {
  const wire = (body as WireError | null)?.error;

  if (wire === undefined || typeof wire.code !== 'string' || typeof wire.messageKey !== 'string') {
    return new AppError('INTERNAL_ERROR', 'common.error.unexpected', fallbackTraceId);
  }

  return new AppError(
    wire.code,
    wire.messageKey,
    typeof wire.traceId === 'string' ? wire.traceId : fallbackTraceId,
    isRecord(wire.params) ? wire.params : {},
    Array.isArray(wire.details) ? (wire.details as AppErrorDetail[]) : [],
  );
}

/** A failure with no response at all: the network, or a timeout. */
export function toTransportError(traceId: string): AppError {
  return new AppError('NETWORK_UNREACHABLE', 'common.error.offline', traceId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

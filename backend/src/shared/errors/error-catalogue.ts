import { DomainError } from '@domain/shared';

/**
 * The one place a domain error becomes a status.
 *
 * The domain does not know what HTTP is — a `SessionNotFoundError` has never heard of `404`. The
 * mapping lives here, once, and it is the same table the WebSocket error frame quotes in
 * `httpEquivalent`. Source of truth: docs/architecture/shared/04-errors-and-http.md.
 */
const HTTP_STATUS_BY_CODE: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  DEVICE_NOT_REGISTERED: 403,
  DEVICE_REVOKED: 403,
  INSUFFICIENT_SCOPE: 403,
  WORKSPACE_NOT_ALLOWED: 403,
  WORKSPACE_NOT_FOUND: 404,
  WORKSPACE_NOT_A_DIRECTORY: 422,
  SESSION_NOT_FOUND: 404,
  SESSION_LOCKED: 423,
  SESSION_LIMIT_REACHED: 429,
  PERMISSION_REQUEST_NOT_FOUND: 404,
  PERMISSION_REQUEST_EXPIRED: 410,
  PERMISSION_NOT_OWNED: 403,
  PERMISSION_RULE_PATTERN_INVALID: 400,
  PERMISSION_RULE_EXPIRY_TOO_LONG: 422,
  CLAUDE_UNAVAILABLE: 502,
  CLAUDE_TIMEOUT: 504,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  INVALID_INPUT: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

/** What an unmapped failure becomes. Never the message of the original — that is for the log. */
export const INTERNAL_ERROR = {
  code: 'INTERNAL_ERROR',
  messageKey: 'common.error.unexpected',
} as const;

/**
 * The status a code carries.
 *
 * An unknown code is a bug of ours, never of the caller's, so it reads as `500`: answering `400`
 * for something we failed to catalogue would blame the client for our omission.
 */
export function httpStatusFor(code: string): number {
  return HTTP_STATUS_BY_CODE[code] ?? 500;
}

/** One invalid field. Validation reports every one of them, not only the first. */
export interface ErrorDetail {
  readonly field: string;
  readonly rule: string;
}

/** The body of an error response, and the payload of an error frame. Same shape on both. */
export interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly messageKey: string;
    readonly params?: Readonly<Record<string, unknown>>;
    readonly traceId: string;
    readonly httpEquivalent: number;
    readonly details?: readonly ErrorDetail[];
  };
}

/** Details a domain error carries, when it carries any. */
export interface DetailedError {
  readonly details: readonly ErrorDetail[];
}

/** Whether `error` came with a list of invalid fields. */
export function hasDetails(error: unknown): error is DetailedError {
  return (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as { details?: unknown }).details)
  );
}

/**
 * The envelope for an error, on either transport.
 *
 * Nothing internal crosses this function: no stack, no server path, no database message. What
 * goes out is a code to branch on, a key to translate, and a trace to quote.
 */
export function toErrorEnvelope(error: unknown, traceId: string): ErrorEnvelope {
  const known = error instanceof DomainError;
  const code = known ? error.code : INTERNAL_ERROR.code;
  const messageKey = known ? error.messageKey : INTERNAL_ERROR.messageKey;

  return {
    error: {
      code,
      messageKey,
      ...(known && Object.keys(error.params).length > 0 ? { params: error.params } : {}),
      traceId,
      httpEquivalent: httpStatusFor(code),
      ...(hasDetails(error) ? { details: error.details } : {}),
    },
  };
}

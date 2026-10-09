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
  WORKSPACE_DIRECTORY_UNREADABLE: 422,
  OPEN_FOLDERS_LIMIT_REACHED: 409,
  CONFLICT: 409,
  SESSION_NOT_FOUND: 404,
  SESSION_LOCKED: 423,
  SESSION_LIMIT_REACHED: 429,
  SESSION_CHANGE_STALE: 409,
  SESSION_FORK_REJECTED: 409,
  QUEUED_PROMPT_NOT_FOUND: 404,
  TOOL_USE_NOT_FOUND: 404,
  DIFF_NOT_APPLICABLE: 422,
  ATTACHMENT_NOT_FOUND: 404,
  ATTACHMENT_TYPE_UNSUPPORTED: 415,
  PERMISSION_REQUEST_NOT_FOUND: 404,
  PERMISSION_REQUEST_EXPIRED: 410,
  PERMISSION_NOT_OWNED: 403,
  PERMISSION_RULE_PATTERN_INVALID: 400,
  PERMISSION_RULE_EXPIRY_TOO_LONG: 422,
  PERMISSION_RULE_NOT_FOUND: 404,
  PERMISSION_ANSWERS_INVALID: 422,
  PERMISSION_RULE_TOOL_INTERACTIVE: 422,
  FILE_NOT_FOUND: 404,
  FILE_EXISTS: 409,
  DIRECTORY_NOT_EMPTY: 409,
  FILE_CHANGED: 412,
  PRECONDITION_REQUIRED: 428,
  FILE_TOO_LARGE: 413,
  FILE_NOT_TEXT: 415,
  FILE_NOT_A_FILE: 422,
  FILE_OPERATION_INVALID: 422,
  FILE_NOT_ENCODABLE: 422,
  FILE_ACCESS_DENIED: 422,
  STORAGE_FULL: 507,
  RANGE_NOT_SATISFIABLE: 416,
  WATCH_LIMIT_REACHED: 429,
  WATCH_UNAVAILABLE: 503,
  HISTORY_ENTRY_NOT_FOUND: 404,
  TRANSCRIPT_FOLLOW_LIMIT: 429,
  TRANSCRIPT_FOLLOW_LIVE_HERE: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  MCP_SERVER_NOT_FOUND: 404,
  MCP_SERVER_NAME_TAKEN: 409,
  MCP_SERVER_CONFIG_INVALID: 422,
  MCP_APPROVAL_STALE: 409,
  MODEL_NOT_AVAILABLE: 422,
  DEFAULT_MODE_NOT_ALLOWED: 422,
  PLUGIN_NOT_FOUND: 404,
  PLUGIN_PATH_INVALID: 422,
  PLUGIN_MARKETPLACE_NOT_ALLOWED: 403,
  PLUGIN_SOURCE_UNAVAILABLE: 502,
  CLAUDE_UNAVAILABLE: 502,
  CLAUDE_TIMEOUT: 504,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
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

/** Statuses that promise the caller a time to come back at. */
const RETRYABLE_STATUSES = new Set([429, 503]);

/**
 * The `Retry-After` a response carries, in seconds, when its status is one that must carry it.
 *
 * `429` and `503` **always** answer one — without it the client hammers (S-12). The error says how
 * long when it knows (`params.retryAfterSeconds`); a refusal raised by the framework, which knows
 * nothing, gets a second, which is short and still not "at once".
 *
 * @returns the seconds, or `null` for a status that carries no such promise
 */
export function retryAfterFor(status: number, envelope: ErrorEnvelope): number | null {
  if (!RETRYABLE_STATUSES.has(status)) {
    return null;
  }

  const declared = envelope.error.params?.['retryAfterSeconds'];

  return typeof declared === 'number' && declared > 0
    ? Math.ceil(declared)
    : DEFAULT_RETRY_AFTER_SECONDS;
}

/** What a `429` or a `503` says when the error that caused it did not know better. */
export const DEFAULT_RETRY_AFTER_SECONDS = 1;

/**
 * The version of the resource a refusal names, as an `ETag` header, or `null`.
 *
 * A `412` says which version is on disk now and a `409` which file is already there
 * (`params.currentEtag`); the header carries it too, because that is where an HTTP client looks
 * for the current version ([07 · D-03](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-03--a-semântica-de-concorrência)).
 */
export function etagFor(envelope: ErrorEnvelope): string | null {
  const current = envelope.error.params?.['currentEtag'];

  return typeof current === 'string' ? current : null;
}

/**
 * The `Content-Range` a refusal of a `Range` carries, or `null`.
 *
 * RFC 9110 has a `416` say how long the representation is — `bytes`, a `*`, a slash, the size — so a client paging
 * through a file that shrank learns where it ends now, without a second request (plan 07, B-47).
 */
export function contentRangeFor(envelope: ErrorEnvelope): string | null {
  const size = envelope.error.params?.['size'];

  return envelope.error.code === 'RANGE_NOT_SATISFIABLE' && typeof size === 'number'
    ? `bytes */${String(size)}`
    : null;
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

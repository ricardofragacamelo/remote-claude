import type {
  SearchLocatePayload,
  SearchReplaceApplyResultPayload,
  SearchReplacePreviewFramePayload,
  SearchTextFramePayload,
} from '@remote-claude/contracts';

import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import type {
  LocateQuery,
  LocateResult,
  ReplaceApplyFileRequest,
  ReplaceApplyReport,
  ReplacePreviewFileResult,
  ReplacePreviewMatch,
  ReplaceQuery,
  SearchContextLine,
  SearchFileResult,
  SearchMatch,
  SearchQuery,
  SearchTruncation,
} from '../types/search';

/**
 * The search routes of `/search/*` (plan 11, B-09…B-11).
 *
 * Every call names the **folder of the tab**, never one path on its own — the server resolves it
 * the same way `files` does. The locator is a single JSON body; the text search and the replace
 * preview are a stream of NDJSON lines (D-02), one per file, closed by exactly one `end` or
 * `error` line — read by `api.ndjson`, never buffered whole. The I/O itself is logged by
 * `api.ts`, at both edges.
 */

function query(fields: Readonly<Record<string, string | readonly string[] | undefined>>): string {
  const search = new URLSearchParams();

  for (const [name, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const one of value) {
        search.append(name, one);
      }
    } else if (value !== undefined) {
      search.set(name, value as string);
    }
  }

  return search.toString();
}

/** The locator behind Quick Open and the `@` of the composer (plan 08) — a single JSON reply. */
export async function locateFiles(
  folder: string,
  request: LocateQuery,
  signal?: AbortSignal,
): Promise<LocateResult> {
  const search = query({
    folder,
    query: request.query,
    kinds: request.kinds.join(','),
    prefer: request.prefer,
    limit: request.limit === undefined ? undefined : String(request.limit),
    includeIgnored: request.includeIgnored === true ? 'true' : undefined,
  });
  const payload = await api.get<SearchLocatePayload>(`/search/files?${search}`, {
    ...(signal === undefined ? {} : { signal }),
  });

  return { entries: payload.entries, truncated: payload.truncated };
}

/** One line of the `/search/text` stream, in this feature's own vocabulary. */
export type SearchTextFrame =
  | { readonly type: 'file'; readonly file: SearchFileResult }
  | { readonly type: 'end'; readonly truncated: SearchTruncation; readonly skipped: number }
  | { readonly type: 'error'; readonly error: AppError };

// The wire shape of one match already has exactly `SearchMatch`'s fields (and, for a replace
// preview, `ReplacePreviewMatch`'s) — nothing to rename, so the "mapping" is the identity.
function toSearchMatch(match: SearchMatch): SearchMatch {
  return { ...match };
}

function toContextLine(line: { readonly line: number; readonly text: string }): SearchContextLine {
  return { line: line.line, text: line.text };
}

function frameErrorOf(frame: {
  readonly code?: string;
  readonly messageKey?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}): AppError {
  return new AppError(
    frame.code ?? 'INTERNAL_ERROR',
    frame.messageKey ?? 'common.error.unexpected',
    'stream',
    frame.params ?? {},
  );
}

/** The `end`/`error` tail every frame type shares — only the `file` branch differs between them. */
function toTerminalFrame(frame: {
  readonly type: 'file' | 'end' | 'error';
  readonly truncated?: SearchTruncation | null;
  readonly skipped?: number;
  readonly code?: string;
  readonly messageKey?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}):
  | { readonly type: 'end'; readonly truncated: SearchTruncation; readonly skipped: number }
  | { readonly type: 'error'; readonly error: AppError } {
  if (frame.type === 'end') {
    return { type: 'end', truncated: frame.truncated ?? null, skipped: frame.skipped ?? 0 };
  }
  return { type: 'error', error: frameErrorOf(frame) };
}

function toSearchTextFrame(frame: SearchTextFramePayload): SearchTextFrame {
  if (frame.type === 'file') {
    return {
      type: 'file',
      file: {
        path: frame.path ?? '',
        matches: (frame.matches ?? []).map(toSearchMatch),
        contextLines: (frame.contextLines ?? []).map(toContextLine),
      },
    };
  }
  return toTerminalFrame(frame);
}

/**
 * Remaps a mid-stream transport failure to this feature's own `SEARCH_ENGINE_FAILED` (S-170,
 * S-171) — `api.ts` throws the same `NETWORK_UNREACHABLE` for a connection cut and for a
 * malformed NDJSON line, since past the first byte that is what either one looks like from the
 * transport's side; a refusal **before** the first byte (a real `code` from the backend's
 * envelope) is never this, and passes through as itself.
 */
async function* remapStreamFailure<T>(frames: AsyncIterable<T>): AsyncGenerator<T> {
  try {
    yield* frames;
  } catch (error) {
    if (error instanceof AppError && error.code === 'NETWORK_UNREACHABLE') {
      throw streamCutError();
    }
    throw error;
  }
}

/** A text search (plan 11, B-10) — one frame at a time, never the whole result buffered. */
export async function* searchText(
  folder: string,
  request: SearchQuery,
  signal: AbortSignal,
): AsyncIterable<SearchTextFrame> {
  for await (const frame of remapStreamFailure(
    api.ndjson<SearchTextFramePayload>('/search/text', { folder, ...request }, { signal }),
  )) {
    yield toSearchTextFrame(frame);
  }
}

/** One line of the `/search/replace/preview` stream. */
export type ReplacePreviewFrame =
  | { readonly type: 'file'; readonly file: ReplacePreviewFileResult }
  | { readonly type: 'end'; readonly truncated: SearchTruncation; readonly skipped: number }
  | { readonly type: 'error'; readonly error: AppError };

// Same identity as `toSearchMatch` — the wire shape already matches `ReplacePreviewMatch`.
function toReplacePreviewMatch(match: ReplacePreviewMatch): ReplacePreviewMatch {
  return { ...match };
}

function toReplacePreviewFrame(frame: SearchReplacePreviewFramePayload): ReplacePreviewFrame {
  if (frame.type === 'file') {
    return {
      type: 'file',
      file: {
        path: frame.path ?? '',
        etag: frame.etag ?? '',
        matches: (frame.matches ?? []).map(toReplacePreviewMatch),
      },
    };
  }
  return toTerminalFrame(frame);
}

/** The replace preview (plan 11, B-11) — the same search, with the ETag and resolved text. */
export async function* previewReplace(
  folder: string,
  request: ReplaceQuery,
  signal: AbortSignal,
): AsyncIterable<ReplacePreviewFrame> {
  for await (const frame of remapStreamFailure(
    api.ndjson<SearchReplacePreviewFramePayload>(
      '/search/replace/preview',
      { folder, ...request },
      { signal },
    ),
  )) {
    yield toReplacePreviewFrame(frame);
  }
}

/** Applying the replace (plan 11, B-11, D-05) — a single report, never a stream. */
export async function applyReplace(
  folder: string,
  request: ReplaceQuery,
  files: readonly ReplaceApplyFileRequest[],
  signal?: AbortSignal,
): Promise<ReplaceApplyReport> {
  const payload = await api.post<SearchReplaceApplyResultPayload>(
    '/search/replace',
    { folder, ...request, files },
    { ...(signal === undefined ? {} : { signal }) },
  );

  return {
    applied: payload.report.applied,
    changed: payload.report.changed,
    missing: payload.report.missing,
    skipped: payload.report.skipped,
  };
}

/**
 * `SEARCH_ENGINE_FAILED` thrown by this feature, never the backend's own — for a stream that
 * ended with no final line at all (connection cut), which is this client's own classification,
 * never a wire frame (D-02).
 */
export function streamCutError(): AppError {
  return new AppError('SEARCH_ENGINE_FAILED', 'search.error.engineFailed', 'stream', {});
}

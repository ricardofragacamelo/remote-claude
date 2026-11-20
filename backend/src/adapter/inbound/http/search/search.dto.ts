import { z } from 'zod';

import type {
  SearchLocatePayload,
  SearchReplaceApplyResultPayload,
  SearchReplacePreviewFramePayload,
  SearchTextFramePayload,
} from '@remote-claude/contracts';

import type {
  LocateEntry,
  LocateResult,
  SearchContextLineResult,
  SearchFileResult,
  SearchMatchResult,
  SearchReplaceApplyReport,
  SearchReplacePreviewFileResult,
  SearchReplacePreviewMatchResult,
  SearchTruncation,
} from '@application/search';
import { MAX_GLOB_ITEMS } from '@domain/search';
import type { UserId } from '@domain/auth';
import { DomainError } from '@domain/shared';
import { flag, folderPath } from '../workspace/workspace.dto';

const path = z.string().max(4096);

/** `kinds=file,dir` as the query string carries it — comma-separated, never repeated. */
const kinds = z
  .string()
  .default('file')
  .transform((value) => value.split(',').filter((entry) => entry.length > 0))
  .pipe(z.array(z.enum(['file', 'dir'])).min(1));

/** `prefer` once, or repeated — teto de 50, conferido pelo caso de uso (S-60). */
const prefer = z
  .union([path, z.array(path)])
  .optional()
  .transform((value) => (value === undefined ? [] : typeof value === 'string' ? [value] : value));

export const locateQuerySchema = z.object({
  folder: folderPath,
  query: z.string().max(4_096).default(''),
  kinds,
  prefer,
  limit: z.coerce.number().int().optional(),
  includeIgnored: flag,
});

export type LocateQueryDto = z.infer<typeof locateQuerySchema>;

export function toLocateDto(result: LocateResult): SearchLocatePayload {
  return {
    entries: result.entries.map(toLocateEntryDto),
    truncated: result.truncated,
    skipped: result.skipped,
  };
}

function toLocateEntryDto(entry: LocateEntry): SearchLocatePayload['entries'][number] {
  return { path: entry.path, kind: entry.kind, positions: entry.positions };
}

/** Not a domain rule — just this edge's own sanity bound against an absurdly large body. */
const MAX_ONLY_PATHS_ITEMS = 500;
/** Not a domain rule — context lines are for the B-17 results editor, never a huge window. */
const MAX_CONTEXT_LINES = 100;
/** Not the real ceiling — see `searchReplaceApplyBodySchema`'s own `files` field. */
const MAX_REPLACE_APPLY_FILES_SANITY_BOUND = 10_000;

const globs = z.array(z.string().max(4096)).max(MAX_GLOB_ITEMS).optional();
const onlyPaths = z.array(z.string().max(4096)).max(MAX_ONLY_PATHS_ITEMS).optional();

/** What every search query body shares — `/search/text`, `/search/replace/preview` and `/search/replace`. */
const searchQueryShape = {
  folder: folderPath,
  pattern: z.string(),
  isRegex: z.boolean(),
  caseSensitive: z.boolean(),
  wholeWord: z.boolean(),
  include: globs,
  exclude: globs,
  useIgnoreFiles: z.boolean(),
};

interface SearchQueryBodyFields {
  readonly folder: string;
  readonly pattern: string;
  readonly isRegex: boolean;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly useIgnoreFiles: boolean;
  readonly include?: readonly string[] | undefined;
  readonly exclude?: readonly string[] | undefined;
}

/** What every use case of this controller takes, from the part of the body `searchQueryShape` validates. */
export function toSearchQueryFields(body: SearchQueryBodyFields, userId: UserId) {
  return {
    folder: body.folder,
    userId,
    pattern: body.pattern,
    isRegex: body.isRegex,
    caseSensitive: body.caseSensitive,
    wholeWord: body.wholeWord,
    useIgnoreFiles: body.useIgnoreFiles,
    ...(body.include === undefined ? {} : { include: body.include }),
    ...(body.exclude === undefined ? {} : { exclude: body.exclude }),
  };
}

interface OnlyPathsAndContextLinesFields {
  readonly onlyPaths?: readonly string[] | undefined;
  readonly contextLines?: number | undefined;
}

/** The two fields `/search/text` and `/search/replace/preview` share beyond the query itself. */
export function toOnlyPathsAndContextLines(body: OnlyPathsAndContextLinesFields) {
  return {
    ...(body.onlyPaths === undefined ? {} : { onlyPaths: body.onlyPaths }),
    ...(body.contextLines === undefined ? {} : { contextLines: body.contextLines }),
  };
}

/**
 * `POST /search/text`'s body (B-10). Shape only — the ceilings and refusals that make a query
 * well-formed (pattern length, glob count, boundary of `include`/`exclude`/`onlyPaths`) are
 * `SearchQuery.create`'s own job, in the domain, so there is exactly one place that enforces them.
 */
export const searchTextBodySchema = z.object({
  ...searchQueryShape,
  onlyPaths,
  contextLines: z.number().int().min(0).max(MAX_CONTEXT_LINES).optional(),
});

export type SearchTextBodyDto = z.infer<typeof searchTextBodySchema>;

type SearchTextMatchFrame = NonNullable<SearchTextFramePayload['matches']>[number];
type SearchTextContextLineFrame = NonNullable<SearchTextFramePayload['contextLines']>[number];

/** The fields every match frame shares, text search or replace preview alike. */
function baseMatchFrameOf(match: SearchMatchResult): SearchTextMatchFrame {
  return {
    line: match.line,
    column: match.column,
    endColumn: match.endColumn,
    preview: match.preview,
    previewMatchStart: match.previewMatchStart,
    previewMatchEnd: match.previewMatchEnd,
  };
}

function toContextLineFrame(context: SearchContextLineResult): SearchTextContextLineFrame {
  return { line: context.line, text: context.text };
}

/** One NDJSON `file` line (D-02) — never the whole response, one per file as the engine closes it. */
export function toSearchTextFileFrame(file: SearchFileResult): SearchTextFramePayload {
  return {
    type: 'file',
    path: file.path,
    matches: file.matches.map(baseMatchFrameOf),
    contextLines: file.contextLines.map(toContextLineFrame),
  };
}

/** The stream's closing `end` line — always exactly one, success or not (D-02). */
export function toSearchTextEndFrame(
  truncated: SearchTruncation,
  skipped: number,
): SearchTextFramePayload {
  return { type: 'end', truncated, skipped };
}

/** The stream's closing `error` line — the same envelope a `502` would carry before the first byte. */
export function toSearchTextErrorFrame(error: DomainError): SearchTextFramePayload {
  return { type: 'error', code: error.code, messageKey: error.messageKey, params: error.params };
}

/**
 * `POST /search/replace/preview`'s body (B-11). The same shape as `/search/text`, plus
 * `replacement` and `preserveCase` — shape only, same reasoning as `searchTextBodySchema`.
 */
export const searchReplacePreviewBodySchema = searchTextBodySchema.extend({
  replacement: z.string(),
  preserveCase: z.boolean(),
});

export type SearchReplacePreviewBodyDto = z.infer<typeof searchReplacePreviewBodySchema>;

type SearchReplacePreviewMatchFrame = NonNullable<
  SearchReplacePreviewFramePayload['matches']
>[number];

function toReplacePreviewMatchFrame(
  match: SearchReplacePreviewMatchResult,
): SearchReplacePreviewMatchFrame {
  return { ...baseMatchFrameOf(match), replacement: match.replacement };
}

/** One NDJSON `file` line of the replace preview (D-02) — the ETag alongside its matches. */
export function toSearchReplacePreviewFileFrame(
  file: SearchReplacePreviewFileResult,
): SearchReplacePreviewFramePayload {
  return {
    type: 'file',
    path: file.path,
    etag: file.etag,
    matches: file.matches.map(toReplacePreviewMatchFrame),
  };
}

/** The stream's closing `end` line — always exactly one, success or not (D-02). */
export function toSearchReplacePreviewEndFrame(
  truncated: SearchTruncation,
  skipped: number,
): SearchReplacePreviewFramePayload {
  return { type: 'end', truncated, skipped };
}

/** The stream's closing `error` line — the same envelope a `502` would carry before the first byte. */
export function toSearchReplacePreviewErrorFrame(
  error: DomainError,
): SearchReplacePreviewFramePayload {
  return { type: 'error', code: error.code, messageKey: error.messageKey, params: error.params };
}

/**
 * `POST /search/replace`'s body (B-11). `files` carries only what D-05 needs per file: the path
 * and the ETag the preview read it at — never match positions, which the server re-derives
 * itself against the current disk (`SearchReplaceApplyUseCase`'s own docstring explains why).
 */
export const searchReplaceApplyBodySchema = z.object({
  ...searchQueryShape,
  replacement: z.string(),
  preserveCase: z.boolean(),
  // Generous and deliberately above the real ceiling (`config.search.replaceMaxFiles`, S-94):
  // this is only a sanity bound against an absurd body, never the business rule itself, so the
  // domain's own `SearchReplaceTooManyFilesError` is always what a too-large batch is refused by.
  files: z
    .array(z.object({ path: z.string().max(4096), etag: z.string().max(256) }))
    .max(MAX_REPLACE_APPLY_FILES_SANITY_BOUND),
});

export type SearchReplaceApplyBodyDto = z.infer<typeof searchReplaceApplyBodySchema>;

export function toSearchReplaceApplyResultDto(
  report: SearchReplaceApplyReport,
): SearchReplaceApplyResultPayload {
  return {
    report: {
      applied: [...report.applied],
      changed: [...report.changed],
      missing: [...report.missing],
      skipped: report.skipped.map((entry) => ({ path: entry.path, reason: entry.reason })),
    },
  };
}

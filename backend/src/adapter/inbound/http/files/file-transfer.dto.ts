import { z } from 'zod';

import type {
  ClientLimits,
  PreflightCommand,
  PreflightItem,
  UploadCommand,
  UploadOutcome,
} from '@application/files';
import type { EntryKind } from '@domain/files';
import { toErrorEnvelope } from '@shared/errors/error-catalogue';
import { flag, folderPath } from '../workspace/workspace.dto';
import { toKeepingDto } from './file-history.dto';
import type { HistoryOutcomeDto } from './file-history.dto';

/**
 * A path inside the open folder, as the transfer routes take it — format only; every rule about
 * what it may name is the domain's (`FilePath`), with every reason at once.
 */
const insidePath = z.string().max(4096);

/** How many items one selection, or one manifest, may list before the parser stops reading it. */
const MAX_LISTED_ITEMS = 10_000;

/** A file's size as a manifest declares it. Its ceiling is the domain's `413`, not the parser's. */
const declaredSize = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** What `GET /files/raw` is asked. `download=true` saves rather than shows — and is in the trail. */
export const rawQuerySchema = z.object({
  folder: folderPath,
  path: insidePath.min(1),
  download: flag,
});

export type RawQueryDto = z.infer<typeof rawQuerySchema>;

/** What `GET /files/archive` is asked: `path` once, or repeated — the selection. */
export const archiveQuerySchema = z.object({
  folder: folderPath,
  path: z
    .union([insidePath, z.array(insidePath).min(1).max(MAX_LISTED_ITEMS)])
    .transform((path) => (typeof path === 'string' ? [path] : path)),
});

export type ArchiveQueryDto = z.infer<typeof archiveQuerySchema>;

/** What `POST /files/upload/preflight` is sent: the items an upload is about to send. */
export const preflightBodySchema = z.object({
  folder: folderPath,
  directory: insidePath.default(''),
  items: z
    .array(z.object({ path: insidePath.min(1), size: declaredSize }))
    .min(1)
    .max(MAX_LISTED_ITEMS),
});

export type PreflightBodyDto = z.infer<typeof preflightBodySchema>;

/** One item of an upload's manifest, in the order its part comes. */
const manifestItem = z.object({
  path: insidePath.min(1),
  size: declaredSize,
  onConflict: z.enum(['fail', 'replace', 'keepBoth']).default('fail'),
  ifMatch: z.string().min(1).max(512).optional(),
});

/**
 * The fields of `POST /files/upload`, which come **before** the first part: the manifest is JSON
 * in a field of its own, so the whole of it is checked before a byte is written.
 */
export const uploadFieldsSchema = z.object({
  folder: folderPath,
  directory: insidePath.default(''),
  manifest: z
    .string()
    .transform((text, context) => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        context.addIssue({ code: 'custom', message: 'json' });
        return z.NEVER;
      }
    })
    .pipe(z.array(manifestItem).min(1).max(MAX_LISTED_ITEMS)),
  confirmSensitive: flag,
});

export type UploadFieldsDto = z.infer<typeof uploadFieldsSchema>;

/** The ceilings, by the names of the contract. */
export type LimitsDto = ClientLimits;

/** What is already where an item of an upload would go. */
export interface PreflightItemDto {
  /** Relative to the open folder. */
  readonly path: string;
  readonly existing: { readonly kind: EntryKind; readonly etag: string | null } | null;
}

export interface PreflightDto {
  readonly items: readonly PreflightItemDto[];
}

/** The envelope of an error, without the parts that belong to a whole response. */
export interface ItemErrorDto {
  readonly code: string;
  readonly messageKey: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/** How one item of an upload ended. Paths are relative to the open folder, as on every route. */
export type UploadItemDto =
  | {
      readonly path: string;
      readonly status: 'created' | 'renamed';
      readonly etag: string;
    }
  | {
      readonly path: string;
      readonly status: 'replaced';
      readonly etag: string;
      /** How keeping the version it replaced in the local history ended (F8). */
      readonly history: HistoryOutcomeDto;
    }
  | { readonly path: string; readonly status: 'failed'; readonly error: ItemErrorDto };

export interface UploadDto {
  readonly items: readonly UploadItemDto[];
}

export function toPreflightCommand(body: PreflightBodyDto): PreflightCommand {
  return { folder: body.folder, directory: body.directory, items: body.items };
}

export function toUploadCommand(fields: UploadFieldsDto): UploadCommand {
  return {
    folder: fields.folder,
    directory: fields.directory,
    items: fields.manifest.map((item) => ({ ...item, ifMatch: item.ifMatch ?? null })),
    confirmSensitive: fields.confirmSensitive,
  };
}

export function toPreflightDto(items: readonly PreflightItem[]): PreflightDto {
  return {
    items: items.map((item) => ({
      path: item.path.relative,
      existing:
        item.existing === null
          ? null
          : { kind: item.existing.kind, etag: item.existing.etag?.value ?? null },
    })),
  };
}

/**
 * The answer of an upload. A failed item carries the error envelope of the catalogue — `code`,
 * `messageKey`, `params` — exactly as a whole response would, so the client translates it the same
 * way ([doc 04](../../../../../../docs/architecture/shared/04-errors-and-http.md), `207`).
 */
export function toUploadDto(outcomes: readonly UploadOutcome[]): UploadDto {
  return {
    items: outcomes.map((outcome) => {
      if (outcome.status === 'replaced') {
        return {
          path: outcome.path.relative,
          status: outcome.status,
          etag: outcome.etag.value,
          history: toKeepingDto(outcome.history),
        };
      }

      if (outcome.status !== 'failed') {
        return { path: outcome.path.relative, status: outcome.status, etag: outcome.etag.value };
      }

      // The trace is the whole response's — in its log lines — never repeated in an item.
      const { code, messageKey, params } = toErrorEnvelope(outcome.error, '').error;

      return {
        path: outcome.path.relative,
        status: 'failed',
        error: params === undefined ? { code, messageKey } : { code, messageKey, params },
      };
    }),
  };
}

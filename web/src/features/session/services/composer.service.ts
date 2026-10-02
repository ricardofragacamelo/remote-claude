import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { isRecord, readText } from '@/shared/lib/json';
import { asAppError } from '../lib/app-errors';
import { heldUpload, releaseUpload } from '../lib/pending-uploads';
import type { ComposerLimits, ContextItem, FileFacts } from '../types/context';
import type { InstallationModel } from '../types/insight';
import type { SlashCommand } from '../types/command';
import { toSlashCommand } from './command.service';
import { modelOf } from './insight.service';

/**
 * What the composer asks the backend — plan 08, F5: the catalogue of a folder before a session
 * (B-50), an attachment dropped from the desktop (B-45), the entries an `@` completes (B-48) and the
 * facts of a file of the context (B-47). The I/O is logged by `api.ts`, at both edges.
 */

/** What a folder's installation offers before a session exists. */
export interface InstallationCatalog {
  readonly cliVersion: string | null;
  readonly commands: readonly SlashCommand[];
  readonly models: readonly InstallationModel[];
  readonly limits: ComposerLimits;
}

/** The ceilings when the backend said nothing readable — the defaults the backend ships with. */
export const DEFAULT_LIMITS: ComposerLimits = {
  attachmentMaxBytes: 5 * 1024 * 1024,
  attachmentImageTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  contextWarnFraction: 0.25,
  draftWindowTokens: 200_000,
  contextMaxBytes: 8 * 1024 * 1024,
};

const numberIn = (record: Readonly<Record<string, unknown>>, key: string, fallback: number) => {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
};

function limitsOf(value: unknown): ComposerLimits {
  const record = isRecord(value) ? value : {};
  const types = record['attachmentImageTypes'];

  return {
    attachmentMaxBytes: numberIn(record, 'attachmentMaxBytes', DEFAULT_LIMITS.attachmentMaxBytes),
    attachmentImageTypes: Array.isArray(types)
      ? types.filter((type): type is string => typeof type === 'string')
      : DEFAULT_LIMITS.attachmentImageTypes,
    contextWarnFraction: numberIn(
      record,
      'contextWarnFraction',
      DEFAULT_LIMITS.contextWarnFraction,
    ),
    draftWindowTokens: numberIn(record, 'draftWindowTokens', DEFAULT_LIMITS.draftWindowTokens),
    contextMaxBytes: numberIn(record, 'contextMaxBytes', DEFAULT_LIMITS.contextMaxBytes),
  };
}

/**
 * The catalogue of a folder — `GET /catalog?workspacePath=` (D-13).
 *
 * @throws {AppError} the folder refused; `SESSION_LIMIT_REACHED`; `CLAUDE_UNAVAILABLE` or
 *   `CLAUDE_TIMEOUT` — none of which stops the composer: the menu is discovery (S-246)
 */
export async function fetchCatalog(folder: string): Promise<InstallationCatalog> {
  const body = await api.get<unknown>(
    `/catalog?${new URLSearchParams({ workspacePath: folder }).toString()}`,
  );
  const record = isRecord(body) ? body : {};
  const commands = Array.isArray(record['commands']) ? record['commands'] : [];
  const models = Array.isArray(record['models']) ? record['models'] : [];

  return {
    cliVersion: readText(record, 'cliVersion'),
    commands: commands.flatMap(toSlashCommand),
    models: models.filter(isRecord).flatMap(modelOf),
    limits: limitsOf(record['limits']),
  };
}

/** What an upload answered. */
export interface HeldAttachment {
  readonly attachmentId: string;
  readonly kind: 'image' | 'text';
  readonly mediaType: string;
  readonly size: number;
}

/**
 * Sends a file dropped from the desktop as an attachment of the session (B-45) — never into the
 * folder (D-22).
 *
 * @throws {AppError} `PAYLOAD_TOO_LARGE`, `ATTACHMENT_TYPE_UNSUPPORTED`, `SESSION_NOT_FOUND`
 */
export async function uploadAttachment(sessionId: string, file: File): Promise<HeldAttachment> {
  const form = new FormData();
  form.append('name', file.name);
  form.append('file', file, file.name);

  const { body } = await api.upload<unknown>(
    `/sessions/${encodeURIComponent(sessionId)}/attachments`,
    form,
  );
  const record = isRecord(body) ? body : {};

  return {
    attachmentId: readText(record, 'attachmentId') ?? '',
    kind: record['kind'] === 'image' ? 'image' : 'text',
    mediaType: readText(record, 'mediaType') ?? file.type,
    size: typeof record['size'] === 'number' ? record['size'] : file.size,
  };
}

/**
 * The items of a draft, with every file of the desktop it held in this page uploaded to the session
 * it opened — or marked with why it was refused (plan 08, B-45). The rest goes as it was.
 */
export function uploadHeld(
  items: readonly ContextItem[],
  sessionId: string,
): Promise<readonly ContextItem[]> {
  return Promise.all(
    items.map(async (item): Promise<ContextItem> => {
      const file = item.kind === 'upload' ? heldUpload(item.id) : undefined;

      if (item.kind !== 'upload' || file === undefined) {
        return item;
      }

      try {
        const held = await uploadAttachment(sessionId, file);
        releaseUpload(item.id);
        return { ...item, attachmentId: held.attachmentId };
      } catch (error) {
        return { ...item, error: asAppError(error, 'composer-draft-upload') };
      }
    }),
  );
}

/** One entry an `@` may complete with. */
export interface MentionEntry {
  /** Relative to the folder of the tab, POSIX. */
  readonly path: string;
  readonly name: string;
  readonly kind: 'file' | 'folder';
}

/** A level of the folder, as an `@` completes from it. */
export interface MentionLevel {
  readonly entries: readonly MentionEntry[];

  /** More than the ceiling of a level: what is shown is not all (S-229). */
  readonly truncated: boolean;
}

/**
 * The entries of one level of the folder — `GET /files/tree` of plan 07, the provisional source of
 * the `@` until the finder of plan 11 exists (D-12). A link that leads out and a name that is not
 * text are never offered (S-230).
 *
 * @throws {AppError} as the tree answers — `FILE_NOT_FOUND`, `WORKSPACE_NOT_A_DIRECTORY`, …
 */
export async function listMentionLevel(folder: string, directory: string): Promise<MentionLevel> {
  const body = await api.get<unknown>(
    `/files/tree?${new URLSearchParams({ folder, path: directory }).toString()}`,
  );
  const record = isRecord(body) ? body : {};
  const entries = Array.isArray(record['entries']) ? record['entries'] : [];

  return {
    entries: entries.filter(isRecord).flatMap((entry): MentionEntry[] => {
      const path = readText(entry, 'path');
      const name = readText(entry, 'name');
      const kind = entry['kind'] === 'directory' ? 'folder' : 'file';

      return path === null ||
        name === null ||
        entry['outside'] === true ||
        entry['unreadableName'] === true ||
        (entry['kind'] !== 'file' && entry['kind'] !== 'directory')
        ? []
        : [{ path, name, kind }];
    }),
    truncated: record['truncated'] === true,
  };
}

/** The type of the bytes that Claude reads: text, and images. */
const READ_AS_IS = /^(text\/|image\/(png|jpeg|gif|webp|bmp|svg\+xml|x-icon))/;

/**
 * What a file of the context is now — its size, whether it is text, whether it is still there
 * (S-223, S-224). The first byte of it, by `Range`: the type is what the server reads off the file's
 * own first bytes, and the size is in `Content-Range`.
 */
export async function probeFile(folder: string, path: string): Promise<FileFacts> {
  try {
    const response = await api.bytes(
      `/files/raw?${new URLSearchParams({ folder, path }).toString()}`,
      { headers: { range: 'bytes=0-0' } },
    );
    const total = Number(response.header('content-range')?.split('/')[1]);

    return {
      size: Number.isInteger(total) ? total : response.blob.size,
      binary: !READ_AS_IS.test(response.header('content-type') ?? ''),
      missing: false,
    };
  } catch (error) {
    if (error instanceof AppError && error.code === 'RANGE_NOT_SATISFIABLE') {
      return { size: 0, binary: false, missing: false };
    }

    if (error instanceof AppError && error.code === 'FILE_NOT_FOUND') {
      return { size: null, binary: false, missing: true };
    }

    throw error;
  }
}

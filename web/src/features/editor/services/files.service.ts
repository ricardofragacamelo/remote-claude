import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { newTraceId } from '@/shared/lib/trace';

/**
 * A file as `GET /files/content` answers it — the model's fields with its format flattened, and the
 * `mtime` nothing here reads. Its version travels in `ETag` **and** here.
 */
interface FileContentDto extends Omit<FileText, 'format'>, TextFormat {
  readonly mtime: string;
}

/** What a save or a create left on disk. */
interface WrittenDto {
  readonly path: string;
  readonly etag: string | null;
}

/** What a save says of the version it replaced (07 · B-57): kept, not kept and why, or nothing written. */
type HistoryDto =
  | { readonly kept: true; readonly entryId: string }
  | { readonly kept: false; readonly reason: 'tooLarge' | 'unavailable' }
  | null;

interface SavedDto extends WrittenDto {
  readonly history?: HistoryDto;
}

/** One entry of a level of the tree, as `GET /files/tree` answers it. */
interface TreeEntryDto {
  readonly name: string;
  readonly path: string;
  readonly kind: 'file' | 'directory' | 'symlink' | 'other';
  readonly hidden: boolean;
  readonly unreadableName: boolean;
  readonly outside: boolean;
  readonly targetKind: 'file' | 'directory' | 'other' | 'missing' | null;
}

interface TreeDto {
  readonly entries: readonly TreeEntryDto[];
  readonly truncated: boolean;
}

/** How a file's text is written on disk: read in it, and saved back in it (07 · D-04). */
export interface TextFormat {
  readonly encoding: string;
  readonly bom: boolean;
  readonly eol: 'lf' | 'crlf' | 'mixed';
}

/** A file's text, opened for the editor. */
export interface FileText {
  /** Relative to the folder. */
  readonly path: string;
  readonly content: string;
  readonly etag: string;
  readonly format: TextFormat;
  readonly size: number;

  /** Past the large-file threshold: the editor opens it in its light mode (07 · D-04). */
  readonly largeFile: boolean;
}

/** A read: the file, or — asked with the version on screen — "that is still the one" (`304`). */
export type ReadResult =
  { readonly kind: 'read'; readonly file: FileText } | { readonly kind: 'notModified' };

/** What reading a file can be told. */
export interface ReadOptions {
  /** "Reopen with encoding" — the server decodes with this one instead of detecting (S-249). */
  readonly encoding?: string;

  /** The version on screen: the server answers `304` when it is still the one on disk. */
  readonly ifNoneMatch?: string;
}

/** A file written: where, and its version now. */
export interface WrittenFile {
  readonly path: string;
  readonly etag: string;
}

/** A file saved — and whether the version it replaced stayed out of the local history, and why. */
export interface SavedFile extends WrittenFile {
  readonly historyNotKept: 'tooLarge' | 'unavailable' | null;
}

/** How a text is written. */
export interface TextWrite {
  readonly folder: string;
  readonly path: string;
  readonly content: string;
  readonly encoding: string;
  readonly bom: boolean;

  /** The second step of a file that changes what Claude may do was answered (07 · D-15). */
  readonly confirmSensitive: boolean;
}

/** A save: a text written over the version it was edited against. */
export interface SaveRequest extends TextWrite {
  /** The version the buffer was read as — sent as `If-Match`, always (07 · D-03). */
  readonly etag: string;
}

/** One entry of a directory of the folder, for the trail above the editor. */
export interface DirectoryEntry {
  readonly name: string;

  /** Relative to the folder. */
  readonly path: string;
  readonly kind: 'file' | 'directory';
}

function query(params: Readonly<Record<string, string>>): string {
  return new URLSearchParams(params).toString();
}

/**
 * Reads a file of a folder.
 *
 * @throws {AppError} `FILE_NOT_FOUND`, `FILE_TOO_LARGE`, `FILE_NOT_TEXT`, `FILE_ACCESS_DENIED`… as
 *   the server answered them — the editor shows each where the text would be (B-38)
 */
export async function readFile(
  folder: string,
  path: string,
  options: ReadOptions = {},
): Promise<ReadResult> {
  const params: Record<string, string> = { folder, path };

  if (options.encoding !== undefined) {
    params['encoding'] = options.encoding;
  }

  const dto = await api.get<FileContentDto | undefined>(
    `/files/content?${query(params)}`,
    options.ifNoneMatch === undefined ? {} : { headers: { 'if-none-match': options.ifNoneMatch } },
  );

  if (dto === undefined) {
    return { kind: 'notModified' };
  }

  return {
    kind: 'read',
    file: {
      path: dto.path,
      content: dto.content,
      etag: dto.etag,
      format: { encoding: dto.encoding, bom: dto.bom, eol: dto.eol },
      size: dto.size,
      largeFile: dto.largeFile,
    },
  };
}

/**
 * Saves a file over the version it was edited against.
 *
 * **Never** without `If-Match` (S-231): a save that does not name the version it overwrites is the
 * silent overwrite of Claude's work this plan exists to prevent. Without a version, nothing is sent.
 *
 * @throws {AppError} `PRECONDITION_REQUIRED` without a version, before any request; and as the
 *   server answered — `412` `FILE_CHANGED` with `params.currentEtag`, `428` for a sensitive file,
 *   `403`/`413`/`422`/`507`
 */
export async function saveFile(request: SaveRequest): Promise<SavedFile> {
  if (request.etag.trim() === '' || request.etag.trim() === '*') {
    throw new AppError('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', newTraceId(), {
      path: request.path,
      reason: 'ifMatchMissing',
    });
  }

  const written = await api.put<SavedDto>(
    '/files/content',
    {
      folder: request.folder,
      path: request.path,
      content: request.content,
      encoding: request.encoding,
      bom: request.bom,
      confirmSensitive: request.confirmSensitive,
    },
    { headers: { 'if-match': request.etag } },
  );

  const history = written.history ?? null;

  return {
    path: written.path,
    etag: written.etag ?? request.etag,
    historyNotKept: history === null || history.kept ? null : history.reason,
  };
}

/**
 * A version the local history kept, as `GET /files/content` would have read it — one side of a
 * diff tab (07 · B-59).
 *
 * @throws {AppError} `HISTORY_ENTRY_NOT_FOUND`, `FILE_NOT_TEXT`, `FILE_NOT_A_FILE`
 */
export async function readVersion(folder: string, entryId: string): Promise<string> {
  const dto = await api.get<FileContentDto>(
    `/files/history/${encodeURIComponent(entryId)}/content?${query({ folder })}`,
  );

  return dto.content;
}

/**
 * Creates a file with a text — "Save as", and recreating a file deleted under its tab. Never over
 * anything: a path that is taken answers `409` `FILE_EXISTS` with the version that is there.
 */
export async function createFile(request: TextWrite): Promise<WrittenFile> {
  const written = await api.post<WrittenDto>('/files', {
    folder: request.folder,
    path: request.path,
    kind: 'file',
    content: request.content,
    encoding: request.encoding,
    bom: request.bom,
    confirmSensitive: request.confirmSensitive,
  });

  return { path: written.path, etag: written.etag ?? '' };
}

/**
 * One level of a directory of the folder: the directories and the files a person can open — a name
 * that is not text, a link out of the folder and anything that is neither are left out.
 */
export async function listDirectory(folder: string, path: string): Promise<DirectoryEntry[]> {
  const tree = await api.get<TreeDto>(`/files/tree?${query({ folder, path })}`);

  return tree.entries.flatMap((entry): DirectoryEntry[] => {
    const kind = entry.kind === 'symlink' ? entry.targetKind : entry.kind;

    if (entry.unreadableName || entry.outside || (kind !== 'file' && kind !== 'directory')) {
      return [];
    }

    return [{ name: entry.name, path: entry.path, kind }];
  });
}

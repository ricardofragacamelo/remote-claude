import type { AppError } from '@/shared/api/errors';

/**
 * The ceilings of the files routes, as `GET /files/limits` says them — known **before** a transfer
 * starts (07 · D-16), so a download or an upload past one is refused saying it, not cut half-way.
 */
export interface FileLimits {
  readonly maxEditBytes: number;
  readonly largeFileBytes: number;
  readonly downloadMaxBytes: number;
  readonly archiveMaxEntries: number;
  readonly uploadMaxBytes: number;
  readonly uploadMaxEntries: number;
  readonly uploadMaxTotalBytes: number;
  readonly historyMaxFileBytes: number;
}

/** A file to upload, and where it goes under the destination — its folders kept (B-52). */
export interface UploadCandidate {
  readonly file: File;

  /** Relative to the destination, POSIX: `logo.png`, or `assets/img/logo.png` for a folder sent. */
  readonly path: string;
}

/** What a path of the destination already holds, as the preflight answers it. */
export interface ExistingEntry {
  readonly kind: 'file' | 'directory' | 'symlink' | 'other';
  readonly etag: string | null;
}

/** What the person chose for a file whose path is taken (S-319). */
export type ConflictChoice = 'replace' | 'keepBoth' | 'skip';

/** One item of the manifest of an upload — what the server checks before the first byte. */
export interface ManifestItem {
  readonly path: string;
  readonly size: number;
  readonly onConflict: 'fail' | 'replace' | 'keepBoth';

  /** The version replaced — `replace` overwrites only the version the person saw. */
  readonly ifMatch?: string;
}

/**
 * What became of the version an upload replaced — kept in the local history (07 · F8), or not, and
 * why: the replace happens either way.
 */
export type HistoryKeeping =
  | { readonly kept: true; readonly entryId: string }
  | { readonly kept: false; readonly reason: 'tooLarge' | 'unavailable' };

/** How one file of an upload went. Its path is relative to the open folder, as on every route. */
export type UploadedItem =
  | { readonly path: string; readonly status: 'created' | 'renamed'; readonly etag: string }
  | {
      readonly path: string;
      readonly status: 'replaced';
      readonly etag: string;
      readonly history: HistoryKeeping;
    }
  | { readonly path: string; readonly status: 'failed'; readonly error: AppError };

/** A download, ready to be saved: its bytes and the name the server gave it. */
export interface DownloadedFile {
  readonly blob: Blob;
  readonly name: string;
}

import type { AppError } from '@/shared/api/errors';

/**
 * One item of the context of the next prompt — a chip above the composer (plan 08, B-47).
 *
 * A file, a folder or a range is a **reference**, by its path relative to the folder of the tab:
 * Claude reads it through `Read`, under the hook (D-01), and its content never leaves the browser.
 * An upload is a file dropped from the desktop, sent over HTTP and named by the id the upload
 * answered (D-22); a text is what a provider of the client holds — the terminal.
 */
export type ContextItem = FileItem | FolderItem | RangeItem | UploadItem | TextItem;

/** What every item has: an id of its own, to remove it by. */
interface ItemBase {
  readonly id: string;
}

/** What was found of a file when it was checked — its size, and whether it reads as text. */
export interface FileFacts {
  /** In bytes, or `null` until it was checked. */
  readonly size: number | null;

  /** Neither text nor an image: Claude will not read it (S-224). */
  readonly binary: boolean;

  /** Gone since it was chosen: the send is refused with its path (S-223). */
  readonly missing: boolean;
}

export interface FileItem extends ItemBase, FileFacts {
  readonly kind: 'file';
  readonly path: string;
}

export interface FolderItem extends ItemBase {
  readonly kind: 'folder';
  readonly path: string;
}

/** Lines of a file, inclusive and from 1 — a selection of the editor, or `@selection`. */
export interface RangeItem extends ItemBase, FileFacts {
  readonly kind: 'range';
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
}

/** A file from the desktop: an image or a text, never written to the folder (D-22). */
export interface UploadItem extends ItemBase {
  readonly kind: 'upload';
  readonly name: string;
  readonly mediaType: string;
  readonly size: number;
  readonly uploadKind: 'image' | 'text';

  /** What the upload answered — `null` while it is on its way, or in a draft with no session yet. */
  readonly attachmentId: string | null;

  /** Why it could not be sent: past the ceiling, of a type the prompt does not carry. */
  readonly error: AppError | null;
}

/** Text a provider of the client holds — the output of the terminal (plan 12). */
export interface TextItem extends ItemBase {
  readonly kind: 'text';
  readonly source: 'terminal';
  readonly label: string;
  readonly content: string;
}

/** What the composer may take — from the catalogue of the installation (D-02, D-23). */
export interface ComposerLimits {
  readonly attachmentMaxBytes: number;
  readonly attachmentImageTypes: readonly string[];
  readonly contextWarnFraction: number;
  readonly draftWindowTokens: number;
  readonly contextMaxBytes: number;
}

/** How big the set is, said as an estimate (D-23). */
export interface ContextTotals {
  /** What the files and the uploads weigh; a folder counts as items, never as bytes. */
  readonly bytes: number;

  /** ≈ 4 bytes a token — said to be an estimate wherever it is shown. */
  readonly tokens: number;
  readonly items: number;
  readonly folders: number;

  /** `warn` past the share of the free window; `over` past a ceiling — it does not send. */
  readonly level: 'ok' | 'warn' | 'over';

  /** What is over, when `level` is `over`. */
  readonly over: 'items' | 'bytes' | null;
}

/** Something the set says once — what an add left out, what a drop refused. Translated. */
export interface ContextNotice {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
}

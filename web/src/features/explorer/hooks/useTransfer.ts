import { useCallback, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppError } from '@/shared/api/errors';
import { folderName } from '@/shared/lib/folder-name';
import { logger } from '@/shared/logging/logger';
import { asExplorerError } from '../lib/batch';
import type { ItemResult } from '../lib/batch';
import { readDrop, readPicked } from '../lib/dropped-files';
import { nameOf } from '../lib/paths';
import { chooseSaveTarget, saveByLink } from '../lib/save-blob';
import { isOperable } from '../lib/sort';
import { refusalError, transferError } from '../lib/transfer-errors';
import type { EntryRow } from '../lib/tree-rows';
import { conflictsOf, levelsOf, planOf, progressOf, uploadRefusal } from '../lib/upload-plan';
import type { CeilingRefusal, Conflict, FileProgress, UploadPlan } from '../lib/upload-plan';
import {
  downloadArchive,
  downloadFile,
  preflightUpload,
  uploadFiles,
} from '../services/transfer.service';
import { explorerStore } from '../store/explorer.store';
import type {
  ConflictChoice,
  DownloadedFile,
  FileLimits,
  UploadCandidate,
  UploadedItem,
} from '../types/transfer';
import { reread } from './file-operations';
import type { FolderContext } from './file-operations';
import { useFileLimits } from './useFileLimits';
import { needsSensitiveStep } from './useOutcome';
import type { OperationRunner } from './useOutcome';

/** Where an upload is: nothing, the conflicts asked before sending, or the files on their way. */
export type UploadStep =
  | { readonly step: 'idle' }
  | {
      readonly step: 'conflicts';
      readonly destination: string;
      readonly candidates: readonly UploadCandidate[];
      readonly conflicts: readonly Conflict[];
    }
  | {
      readonly step: 'sending';
      readonly destination: string;

      /** Each file, in the order it is sent, and how far it went. */
      readonly files: readonly FileProgress[];
    };

/** The browser's own file dialogs, as the inputs that open them are handed in. */
export interface Pickers {
  /** The input of "Upload files here…" — handed by its `ref`. */
  filesInput(element: HTMLInputElement | null): void;

  /** The input of "Upload folder here…" — a directory picker. */
  folderInput(element: HTMLInputElement | null): void;
  picked(files: FileList | null): void;
}

/** Files in and out of the folder of the tab (B-52). */
export interface Transfer {
  readonly limits: FileLimits | null;
  readonly upload: UploadStep;
  readonly downloading: boolean;
  readonly pickers: Pickers;

  /** "Upload files here…" / "Upload folder here…": the browser's dialog, into `destination`. */
  pick(destination: string, kind: 'files' | 'folder'): void;

  /** Files dropped from the desktop on a folder of the tree (S-318). */
  drop(destination: string, transfer: DataTransfer): void;
  start(destination: string, candidates: readonly UploadCandidate[]): Promise<void>;
  choose(path: string, choice: ConflictChoice): void;

  /** Sends what the conflicts were answered with. */
  send(): void;

  /** Closes the question of the conflicts; aborts an upload on its way (S-322). */
  cancel(): void;

  /** Downloads a file, or the entries as one zip — a folder, the selection (S-320, S-359). */
  download(targets: readonly EntryRow[]): Promise<void>;
}

const IDLE: UploadStep = { step: 'idle' };

/** Why the version a file replaced is not in the local history — named in full. */
const NOT_KEPT = {
  tooLarge: 'explorer.outcome.notKeptTooLarge',
  unavailable: 'explorer.outcome.notKeptUnavailable',
} as const;

/**
 * How one item of an upload went, as the outcome screen of B-27 lists it: a refusal in the words of a
 * transfer, and a replace whose old version the local history did not keep said so.
 */
function resultOf(item: UploadedItem, locale: string): ItemResult {
  if (item.status === 'failed') {
    return { path: item.path, ok: false, error: transferError(item.error, 'upload', locale) };
  }

  return item.status === 'replaced' && !item.history.kept
    ? { path: item.path, ok: true, noteKey: NOT_KEPT[item.history.reason] }
    : { path: item.path, ok: true };
}

/** A refusal of the whole of a transfer, as the one line of the outcome screen. */
function refusedWhole(path: string, error: AppError): ItemResult[] {
  return [{ path, ok: false, error }];
}

/** What a download is saved as before the server names it: the file, or the zip of what is in it. */
function suggestedName(folder: string, rows: readonly EntryRow[], single: EntryRow | null): string {
  if (single !== null) {
    return nameOf(single.path);
  }

  const [first] = rows;
  return `${rows.length === 1 && first !== undefined ? nameOf(first.path) : folderName(folder)}.zip`;
}

/** The one file of a download, when it is one file — a folder or many go as a zip. */
function singleFile(rows: readonly EntryRow[]): EntryRow | null {
  const [first] = rows;
  return rows.length === 1 && first !== undefined && !first.expandable ? first : null;
}

/** A file past the download ceiling, known from its size before anything is asked (S-321). */
function downloadRefusal(
  single: EntryRow | null,
  limits: FileLimits | null,
): CeilingRefusal | null {
  if (single === null || limits === null || single.entry.size <= limits.downloadMaxBytes) {
    return null;
  }

  return {
    messageKey: 'explorer.transfer.downloadTooLarge',
    measure: 'bytes',
    limit: limits.downloadMaxBytes,
    actual: single.entry.size,
    path: single.path,
  };
}

/** The bytes of a download: the file by `raw`, anything else as one zip by `archive`. */
function fetchDownload(
  folder: string,
  rows: readonly EntryRow[],
  single: EntryRow | null,
  name: string,
): Promise<DownloadedFile> {
  return single === null
    ? downloadArchive(
        folder,
        rows.map((row) => row.path),
        name,
      )
    : downloadFile(folder, single.path, name);
}

/** What sending an upload needs of the hook that holds it. */
interface Sender {
  readonly context: FolderContext;
  readonly runner: OperationRunner;
  readonly active: MutableRefObject<boolean>;
  readonly aborter: MutableRefObject<AbortController | null>;
  readonly setUpload: Dispatch<SetStateAction<UploadStep>>;
  readonly locale: string;
  announce(key: string, params?: Readonly<Record<string, string | number>>): void;
  failed(path: string, error: AppError): void;
}

/** What an upload that went told: the levels read again, and the outcome of each file. */
function landed(
  sender: Sender,
  destination: string,
  plan: UploadPlan,
  items: readonly UploadedItem[],
) {
  reread(
    sender.context,
    levelsOf(
      destination,
      plan.manifest.map((item) => item.path),
    ),
  );

  const results = items.map((item) => resultOf(item, sender.locale));
  const failed = results.some((result) => !result.ok);

  // Said on the screen when something did not go — or went without its old version kept (F8).
  if (failed || results.some((result) => result.ok && result.noteKey !== undefined)) {
    sender.runner.show({
      titleKey: failed ? 'explorer.outcome.uploadFailed' : 'explorer.outcome.uploadNotKept',
      results,
      context: 'operation',
    });
  } else {
    sender.announce('explorer.done.uploaded', { count: items.length });
  }
}

/** Why an upload did not go: cancelled, the second step of a sensitive path, or refused. */
function notSent(
  sender: Sender,
  destination: string,
  plan: UploadPlan,
  error: AppError,
  cancelled: boolean,
): void {
  const first = plan.manifest[0]?.path ?? destination;

  if (cancelled) {
    reread(sender.context, [destination]);
    sender.announce('explorer.done.uploadCancelled');
  } else if (needsSensitiveStep(error)) {
    sender.runner.askSensitive({
      paths: [typeof error.params['path'] === 'string' ? error.params['path'] : first],
      run: () => {
        sender.active.current = true;
        return sendUpload(sender, destination, plan, true);
      },
    });
  } else {
    sender.failed(first, error);
  }
}

/**
 * Sends an upload, with the progress of each file, until it lands, is refused, or is cancelled —
 * and then the upload is over, whatever happened.
 */
async function sendUpload(
  sender: Sender,
  destination: string,
  plan: UploadPlan,
  confirmSensitive: boolean,
): Promise<void> {
  const controller = new AbortController();
  sender.aborter.current = controller;
  sender.setUpload({ step: 'sending', destination, files: progressOf(plan.manifest, 0, 0) });

  try {
    const items = await uploadFiles({
      folder: sender.context.folder,
      directory: destination,
      manifest: plan.manifest,
      files: plan.files,
      confirmSensitive,
      signal: controller.signal,
      onProgress: (loaded, total) => {
        sender.setUpload((now) =>
          now.step === 'sending'
            ? { ...now, files: progressOf(plan.manifest, loaded, total) }
            : now,
        );
      },
    });
    landed(sender, destination, plan, items);
  } catch (thrown) {
    notSent(sender, destination, plan, asExplorerError(thrown), controller.signal.aborted);
  } finally {
    sender.active.current = false;
    sender.aborter.current = null;
    sender.setUpload(IDLE);
  }
}

/**
 * Files in and out of the machine, for the Explorer of one folder tab (B-52):
 *
 * - **upload** — files and folders dropped from the desktop on a folder of the tree, or picked in the
 *   browser's dialog (the way without a mouse): checked against the ceilings first, then asked about
 *   **before** sending — every path that is taken, with Replace / Keep both / Skip (S-319) — and
 *   sent with the progress of each file and a way to cancel (S-318, S-322). What did not go is told
 *   by the outcome screen of B-27;
 * - **download** — a file, a folder or the selection as one zip, fetched with the credential in the
 *   header into a blob, saved where the browser's save dialog says, or by a link to the blob — never
 *   a URL with a token (S-320). A file past the ceiling is refused before it starts, saying the
 *   ceiling (S-321).
 */
export function useTransfer(context: FolderContext, runner: OperationRunner): Transfer {
  const { folder } = context;
  const { i18n } = useTranslation();
  const limits = useFileLimits();
  const [upload, setUpload] = useState<UploadStep>(IDLE);
  const [downloading, setDownloading] = useState(false);
  const active = useRef(false);
  const fetching = useRef(false);
  const aborter = useRef<AbortController | null>(null);
  const destinationOfPick = useRef('');
  const inputs = useRef<{ files: HTMLInputElement | null; folder: HTMLInputElement | null }>({
    files: null,
    folder: null,
  });
  const locale = i18n.language;

  const show = useCallback(
    (titleKey: string, path: string, error: AppError) => {
      runner.show({ titleKey, results: refusedWhole(path, error), context: 'operation' });
    },
    [runner],
  );

  const sender = useMemo<Sender>(
    () => ({
      context,
      runner,
      active,
      aborter,
      setUpload,
      locale,
      announce: (key, params = {}) => {
        explorerStore(folder).getState().announce(key, params);
      },
      failed: (path, error) => {
        show('explorer.outcome.uploadFailed', path, transferError(error, 'upload', locale));
      },
    }),
    [context, folder, locale, runner, show],
  );

  const finish = useCallback(() => {
    active.current = false;
    setUpload(IDLE);
  }, []);

  const start = useCallback(
    async (destination: string, candidates: readonly UploadCandidate[]): Promise<void> => {
      const refusal = uploadRefusal(candidates, limits);
      const first = candidates[0]?.path ?? destination;

      if (active.current || candidates.length === 0) {
        return;
      }

      if (refusal !== null) {
        show('explorer.outcome.uploadFailed', refusal.path ?? first, refusalError(refusal, locale));
        return;
      }

      active.current = true;
      logger.debug({ op: 'explorer.upload', folder, count: candidates.length }, 'upload asked');

      try {
        const existing = await preflightUpload(
          folder,
          destination,
          candidates.map((candidate) => ({ path: candidate.path, size: candidate.file.size })),
        );
        const conflicts = conflictsOf(candidates, existing);

        if (conflicts.length === 0) {
          await sendUpload(sender, destination, planOf(candidates, []), false);
        } else {
          setUpload({ step: 'conflicts', destination, candidates, conflicts });
        }
      } catch (thrown) {
        finish();
        sender.failed(first, asExplorerError(thrown));
      }
    },
    [finish, folder, limits, locale, sender, show],
  );

  const download = useCallback(
    async (targets: readonly EntryRow[]): Promise<void> => {
      const rows = targets.filter((row) => isOperable(row.entry));
      const single = singleFile(rows);
      const name = suggestedName(folder, rows, single);
      const refusal = downloadRefusal(single, limits);

      if (rows.length === 0 || fetching.current) {
        return;
      }

      if (refusal !== null) {
        show(
          'explorer.outcome.downloadFailed',
          refusal.path ?? name,
          refusalError(refusal, locale),
        );
        return;
      }

      // Taken before the save dialog: a second press while it is open downloads nothing more.
      fetching.current = true;
      setDownloading(true);

      try {
        const target = await chooseSaveTarget(name);

        if (target === 'cancelled') {
          return;
        }

        const file = await fetchDownload(folder, rows, single, name);
        if (target === null) {
          saveByLink(file.blob, file.name);
        } else {
          await target.write(file.blob);
        }

        sender.announce('explorer.done.downloaded', { name: file.name });
      } catch (thrown) {
        const error = transferError(asExplorerError(thrown), 'download', locale);
        show('explorer.outcome.downloadFailed', single?.path ?? name, error);
      } finally {
        fetching.current = false;
        setDownloading(false);
      }
    },
    [folder, limits, locale, sender, show],
  );

  const pickers = useMemo<Pickers>(
    () => ({
      filesInput: (element) => {
        inputs.current.files = element;
      },
      folderInput: (element) => {
        inputs.current.folder = element;
      },
      picked: (list) => {
        if (list !== null && list.length > 0) {
          void start(destinationOfPick.current, readPicked(list));
        }
      },
    }),
    [start],
  );

  return {
    limits,
    upload,
    downloading,
    pickers,
    pick: (destination, kind) => {
      destinationOfPick.current = destination;
      inputs.current[kind]?.click();
    },
    drop: (destination, transfer) => {
      readDrop(transfer).then(
        (candidates) => start(destination, candidates),
        (thrown: unknown) => {
          sender.failed(destination, asExplorerError(thrown));
        },
      );
    },
    start,
    choose: (path, choice) => {
      setUpload((now) =>
        now.step === 'conflicts'
          ? {
              ...now,
              conflicts: now.conflicts.map((conflict) =>
                conflict.path === path ? { ...conflict, choice } : conflict,
              ),
            }
          : now,
      );
    },
    send: () => {
      if (upload.step !== 'conflicts') {
        return;
      }

      const plan = planOf(upload.candidates, upload.conflicts);

      if (plan.files.length === 0) {
        finish();
        sender.announce('explorer.done.uploadSkipped');
      } else {
        void sendUpload(sender, upload.destination, plan, false);
      }
    },
    cancel: () => {
      if (upload.step === 'sending') {
        aborter.current?.abort();
      } else {
        finish();
      }
    },
    download,
  };
}

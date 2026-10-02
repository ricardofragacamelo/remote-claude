import { logger } from '@/shared/logging/logger';

/** Where a download goes once its bytes arrived. */
export interface SaveTarget {
  write(blob: Blob): Promise<void>;
}

/** The part of the File System Access API a save uses — Chromium on the desktop has it. */
interface SavePicker {
  showSaveFilePicker(options: { suggestedName: string }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

function hasPicker(scope: unknown): scope is SavePicker {
  return typeof (scope as Partial<SavePicker>).showSaveFilePicker === 'function';
}

/** Whether a failure is the person closing the dialog. */
function isCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Asks where to save a download, where the browser can ask (`showSaveFilePicker`, 07 · D-16) — asked
 * **before** the bytes are fetched, while the press that started it still counts as the person's.
 *
 * @returns the place, `'cancelled'` when the person closed the dialog, or `null` where the browser
 *   has no such dialog — the download is then saved by a link to its blob
 */
export async function chooseSaveTarget(
  suggestedName: string,
  scope: unknown = window,
): Promise<SaveTarget | 'cancelled' | null> {
  if (!hasPicker(scope)) {
    return null;
  }

  try {
    const handle = await scope.showSaveFilePicker({ suggestedName });

    return {
      write: async (blob) => {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      },
    };
  } catch (error) {
    if (isCancel(error)) {
      return 'cancelled';
    }

    logger.warn({ op: 'explorer.download', err: String(error) }, 'save dialog failed');
    return null;
  }
}

/**
 * Saves a blob by a link to it, as every browser can: a `blob:` URL the page made itself — never a
 * URL of the API, which would need the credential in it (07 · D-16) — clicked, and revoked.
 */
export function saveByLink(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked after the click has been handed to the browser's download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

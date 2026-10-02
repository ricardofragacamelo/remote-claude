import { useCallback, useEffect, useRef, useState } from 'react';

import { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';
import { pageBytesOf, pageCountOf, requestBytesOf } from '../lib/paged';
import type { PagedMode } from '../lib/paged';
import { readPage } from '../services/raw.service';
import type { RawPage } from '../services/raw.service';
import { asAppError } from './documents';

/** A page as the view draws it: its bytes, where it starts, the size of the whole file. */
export type PageData = RawPage;

/** A paged file on screen: the page, how many there are, and what happened to the version. */
export interface PagedFile {
  /** From 0. */
  readonly page: number;
  readonly pages: number;

  /** The page on screen — `null` while it is read, or when it could not be. */
  readonly data: PageData | null;
  readonly error: AppError | null;

  /** The file changed on disk between two pages: the view started over on the new version (S-317). */
  readonly changed: boolean;
  goTo(page: number): void;
  retry(): void;
  dismissChanged(): void;
}

/** A page read, and which request it answered — an answer to an older one is not on screen. */
interface Loaded {
  readonly key: string;
  readonly data: PageData | null;
  readonly error: AppError | null;
}

/** Whether a refusal is the server saying the file is another version than the pages read before. */
function changedUnder(error: unknown): boolean {
  return error instanceof AppError && error.code === 'FILE_CHANGED';
}

/** Whether a refusal is the server saying the page starts past the end of the file. */
function pastTheEnd(error: unknown): boolean {
  return error instanceof AppError && error.code === 'RANGE_NOT_SATISFIABLE';
}

/**
 * A file read a page at a time by `Range` (B-51) — read-only, never whole. The first page names the
 * version; every page after it is asked with `If-Match` on that version, and a `412` means the file
 * changed between two pages: the pages read are dropped, the view says so, and the page is read
 * again on the new version — never pages of two versions on screen (S-317).
 */
export function usePagedFile(folder: string, path: string, mode: PagedMode): PagedFile {
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [changed, setChanged] = useState(false);
  const [size, setSize] = useState<number | null>(null);
  const version = useRef<string | null>(null);
  const key = [folder, path, mode, page, attempt].join('\n');

  useEffect(() => {
    const controller = new AbortController();
    const live = () => !controller.signal.aborted;

    readPage({
      folder,
      path,
      start: page * pageBytesOf(mode),
      length: requestBytesOf(mode),
      ifMatch: version.current,
      signal: controller.signal,
    }).then(
      (data) => {
        if (live()) {
          version.current ??= data.etag;
          setSize(data.size);
          setLoaded({ key, data, error: null });
        }
      },
      (error: unknown) => {
        if (!live()) {
          return;
        }

        if (changedUnder(error) && version.current !== null) {
          logger.info({ op: 'editor.paged', folder, page }, 'file changed between pages');
          version.current = null;
          setChanged(true);
          setAttempt((count) => count + 1);
        } else if (pastTheEnd(error) && page > 0) {
          // The new version is shorter than the page that was on screen: its first page instead.
          setPage(0);
        } else {
          setLoaded({ key, data: null, error: asAppError(error) });
        }
      },
    );

    return () => {
      controller.abort();
    };
  }, [folder, path, mode, page, attempt, key]);

  const pages = size === null ? 1 : pageCountOf(size, mode);
  const current = loaded?.key === key ? loaded : null;

  const goTo = useCallback(
    (next: number) => {
      setPage(Math.min(Math.max(next, 0), pages - 1));
    },
    [pages],
  );

  return {
    page,
    pages,
    data: current?.data ?? null,
    error: current?.error ?? null,
    changed,
    goTo,
    retry: () => {
      setAttempt((count) => count + 1);
    },
    dismissChanged: () => {
      setChanged(false);
    },
  };
}

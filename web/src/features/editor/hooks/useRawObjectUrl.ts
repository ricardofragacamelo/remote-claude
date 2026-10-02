import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppError } from '@/shared/api/errors';
import { readRaw } from '../services/raw.service';
import { previewError } from '../lib/preview-errors';
import { asAppError } from './documents';
import { useAttempt } from './useAttempt';

/** A file of the folder as a `blob:` URL the page made itself — or why there is none. */
export interface RawObjectUrl {
  readonly url: string | null;
  readonly error: AppError | null;
  retry(): void;
}

/** What a read gave, and which read it was — the answer to an older one is not on screen. */
interface Made {
  readonly key: string;
  readonly url: string | null;
  readonly error: AppError | null;
}

/**
 * A file's bytes, fetched with the credential in the header and turned into a `blob:` URL (07 ·
 * D-16, D-18) — what an `<img>` of a preview shows: no token in any URL (S-309), and an SVG drawn
 * through an `<img>` runs none of its scripts (S-310). The URL is revoked when the view goes, and a
 * read still on its way is aborted.
 */
export function useRawObjectUrl(folder: string, path: string | null): RawObjectUrl {
  const [made, setMade] = useState<Made | null>(null);
  const { key, retry } = useAttempt(folder, path ?? '');
  const locale = useTranslation().i18n.language;

  useEffect(() => {
    if (path === null) {
      return undefined;
    }

    const controller = new AbortController();
    let url: string | null = null;

    readRaw(folder, path, controller.signal).then(
      (file) => {
        if (!controller.signal.aborted) {
          url = URL.createObjectURL(file.blob);
          setMade({ key, url, error: null });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setMade({ key, url: null, error: previewError(asAppError(error), path, locale) });
        }
      },
    );

    return () => {
      controller.abort();

      if (url !== null) {
        URL.revokeObjectURL(url);
      }
    };
  }, [folder, path, key, locale]);

  const current = made?.key === key ? made : null;

  return { url: current?.url ?? null, error: current?.error ?? null, retry };
}

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useObjectUrl } from '@/shared/hooks/useObjectUrl';
import type { ObjectUrl } from '@/shared/hooks/useObjectUrl';
import { readRaw } from '../services/raw.service';
import { previewError } from '../lib/preview-errors';
import { asAppError } from './documents';

/** A file of the folder as a `blob:` URL the page made itself — or why there is none. */
export type RawObjectUrl = ObjectUrl;

/**
 * A file's bytes, fetched with the credential in the header and turned into a `blob:` URL (07 ·
 * D-16, D-18) — what an `<img>` of a preview shows: no token in any URL (S-309), and an SVG drawn
 * through an `<img>` runs none of its scripts (S-310). The URL is revoked when the view goes, and a
 * read still on its way is aborted.
 */
export function useRawObjectUrl(folder: string, path: string | null): RawObjectUrl {
  const locale = useTranslation().i18n.language;
  const source = useMemo(
    () =>
      path === null
        ? null
        : {
            read: (signal: AbortSignal) => readRaw(folder, path, signal).then((file) => file.blob),
            failure: (error: unknown) => previewError(asAppError(error), path, locale),
          },
    [folder, path, locale],
  );

  return useObjectUrl([folder, path ?? ''], source);
}

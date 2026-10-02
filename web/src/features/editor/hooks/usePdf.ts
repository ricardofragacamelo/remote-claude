import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';
import { loadPdfEngine } from '../lib/pdf-loader';
import { readRaw } from '../services/raw.service';
import type { PdfDocument } from '../types/pdf';
import { previewError } from '../lib/preview-errors';
import { asAppError } from './documents';
import { useAttempt } from './useAttempt';

/** A PDF of the folder, opened — or why it is not. */
export interface PdfState {
  readonly doc: PdfDocument | null;

  /** The file did not arrive, or the engine did not load. */
  readonly error: AppError | null;

  /** It arrived and it is not a PDF that can be read. */
  readonly corrupt: boolean;
  retry(): void;
}

/** What an opening gave, and which one it was — the answer to an older one is not on screen. */
interface Opened {
  readonly key: string;
  readonly doc: PdfDocument | null;
  readonly error: AppError | null;
  readonly corrupt: boolean;
}

/** The bytes of a PDF opened by the engine — `null` for bytes it cannot read. */
async function opened(
  folder: string,
  path: string,
  signal: AbortSignal,
): Promise<PdfDocument | null> {
  const [file, engine] = await Promise.all([readRaw(folder, path, signal), loadPdfEngine()]);
  const data = new Uint8Array(await file.blob.arrayBuffer());

  try {
    return await engine.open(data);
  } catch (error) {
    logger.debug({ op: 'editor.pdf.open', folder, err: String(error) }, 'pdf not readable');
    return null;
  }
}

/**
 * A PDF of the folder, read with the credential in the header and opened by the pdf.js of our build
 * (B-50, S-311) — never handed to the browser's own viewer. The document is let go when the view
 * goes; a read still on its way is aborted.
 */
export function usePdf(folder: string, path: string): PdfState {
  const [state, setState] = useState<Opened | null>(null);
  const { key, retry } = useAttempt(folder, path);
  const locale = useTranslation().i18n.language;

  useEffect(() => {
    const controller = new AbortController();
    let doc: PdfDocument | null = null;

    opened(folder, path, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) {
          result?.destroy();
          return;
        }

        doc = result;
        setState({ key, doc: result, error: null, corrupt: result === null });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            key,
            doc: null,
            error: previewError(asAppError(error), path, locale),
            corrupt: false,
          });
        }
      },
    );

    return () => {
      controller.abort();
      doc?.destroy();
    };
  }, [folder, path, key, locale]);

  const current = state?.key === key ? state : null;

  return {
    doc: current?.doc ?? null,
    error: current?.error ?? null,
    corrupt: current?.corrupt ?? false,
    retry,
  };
}

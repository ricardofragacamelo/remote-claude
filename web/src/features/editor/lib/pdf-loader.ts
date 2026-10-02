import { AppError } from '@/shared/api/errors';
import { newTraceId } from '@/shared/lib/trace';
import { logger } from '@/shared/logging/logger';
import type { PdfEngine } from '../types/pdf';

/** How the PDF engine is reached. */
export type PdfLoader = () => Promise<PdfEngine>;

/**
 * pdf.js is a chunk of its own, with its worker from our build, loaded by the first PDF previewed —
 * never part of the first page, never from a CDN, never the browser's own viewer (07 · D-18).
 */
const DEFAULT_LOADER: PdfLoader = () =>
  import('./pdfjs-engine').then((module) => module.createPdfjsEngine());

let loader: PdfLoader = DEFAULT_LOADER;
let loading: Promise<PdfEngine> | null = null;

/**
 * The PDF engine — loaded once per page, however many previews ask. A load that fails is forgotten,
 * so "try again" really tries again.
 *
 * @throws {AppError} `NETWORK_UNREACHABLE` — the chunk did not arrive — with the preview's message
 */
export function loadPdfEngine(): Promise<PdfEngine> {
  if (loading !== null) {
    return loading;
  }

  logger.debug({ op: 'editor.pdf.load' }, 'pdf engine loading');
  const started = loader().then(
    (engine) => {
      logger.debug({ op: 'editor.pdf.load', outcome: 'loaded' }, 'pdf engine loaded');
      return engine;
    },
    (error: unknown) => {
      loading = null;
      logger.warn(
        { op: 'editor.pdf.load', outcome: 'failed', err: String(error) },
        'pdf engine failed to load',
      );
      throw new AppError('NETWORK_UNREACHABLE', 'editor.preview.pdfLoadFailed', newTraceId());
    },
  );

  loading = started;
  return started;
}

/**
 * Stands another engine in — what jsdom tests do, where pdf.js cannot draw — or, with none, puts the
 * default back. Whatever was loaded is forgotten.
 */
export function setPdfLoader(next?: PdfLoader): void {
  loader = next ?? DEFAULT_LOADER;
  loading = null;
}

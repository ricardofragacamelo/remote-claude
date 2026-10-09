import { AppError } from '@/shared/api/errors';
import { lazyEngine } from '@/shared/lib/lazy-engine';
import { newTraceId } from '@/shared/lib/trace';
import type { PdfEngine } from '../types/pdf';

/** How the PDF engine is reached. */
export type PdfLoader = () => Promise<PdfEngine>;

/**
 * pdf.js is a chunk of its own, with its worker from our build, loaded by the first PDF previewed —
 * never part of the first page, never from a CDN, never the browser's own viewer (07 · D-18). A load
 * that fails is forgotten, so "try again" really tries again.
 */
const engine = lazyEngine<PdfEngine>(
  'editor.pdf.load',
  () => import('./pdfjs-engine').then((module) => module.createPdfjsEngine()),
  () => new AppError('NETWORK_UNREACHABLE', 'editor.preview.pdfLoadFailed', newTraceId()),
);

/**
 * The PDF engine — loaded once per page, however many previews ask.
 *
 * @throws {AppError} `NETWORK_UNREACHABLE` — the chunk did not arrive — with the preview's message
 */
export function loadPdfEngine(): Promise<PdfEngine> {
  return engine.load();
}

/**
 * Stands another engine in — what jsdom tests do, where pdf.js cannot draw — or, with none, puts the
 * default back. Whatever was loaded is forgotten.
 */
export function setPdfLoader(next?: PdfLoader): void {
  engine.replace(next);
}

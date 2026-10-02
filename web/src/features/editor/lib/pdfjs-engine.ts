import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import type { PdfDocument, PdfEngine } from '../types/pdf';

/** A document of pdf.js, behind the port — let go of through the task that loaded it. */
function documentOf(proxy: PDFDocumentProxy, task: PDFDocumentLoadingTask): PdfDocument {
  return {
    pageCount: proxy.numPages,
    renderPage: async (number, canvas, scale) => {
      const page = await proxy.getPage(number);
      const viewport = page.getViewport({ scale });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
    },
    destroy: () => {
      void task.destroy();
    },
  };
}

/**
 * The PDF engine of the app: pdf.js, with its worker **from our own build** — the URL Vite gives the
 * worker file it emits, never a CDN (07 · D-18). XFA forms are off: a preview draws pages, and runs
 * nothing a document carries.
 */
export function createPdfjsEngine(): PdfEngine {
  GlobalWorkerOptions.workerSrc = workerUrl;

  return {
    open: async (data) => {
      const task = getDocument({ data, enableXfa: false });
      return documentOf(await task.promise, task);
    },
  };
}

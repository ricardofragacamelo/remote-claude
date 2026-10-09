import { GlobalWorkerOptions, PasswordResponses, getDocument } from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import type {
  PdfDestination,
  PdfDocument,
  PdfEngine,
  PdfOutlineItem,
  PdfPasswordPrompt,
} from '../types/pdf';
import { mountViewer } from './pdfjs-viewer';

/** An entry of the outline as pdf.js gives it — only what the reader reads. */
interface RawOutlineItem {
  readonly title: string;
  readonly dest: string | unknown[] | null;
  readonly items: readonly RawOutlineItem[];
}

/** An outline of pdf.js, as the port says it. */
function outlineOf(items: readonly RawOutlineItem[]): PdfOutlineItem[] {
  return items.map((item) => ({
    title: item.title,
    dest: (item.dest ?? null) as PdfDestination | null,
    items: outlineOf(item.items),
  }));
}

/** A document of pdf.js, behind the port — let go of through the task that loaded it. */
function documentOf(proxy: PDFDocumentProxy, task: PDFDocumentLoadingTask): PdfDocument {
  return {
    pageCount: proxy.numPages,
    renderPage: async (number, canvas, scale, signal) => {
      const page = await proxy.getPage(number);
      // Given up on while the page was fetched: the canvas may already be another drawing's.
      if (signal.aborted) {
        return;
      }
      const viewport = page.getViewport({ scale });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      // pdf.js refuses a second drawing on a canvas still in use — cancelling frees it at once.
      const task = page.render({ canvas, viewport });
      const cancel = (): void => {
        task.cancel();
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        await task.promise;
      } catch (error: unknown) {
        if (!signal.aborted) {
          throw error;
        }
      } finally {
        signal.removeEventListener('abort', cancel);
      }
    },
    outline: async () => outlineOf(((await proxy.getOutline()) ?? []) as RawOutlineItem[]),
    mount: (container, host) => mountViewer(proxy, container, host),
    destroy: () => {
      void task.destroy();
    },
  };
}

/**
 * Hands the password pdf.js asks for to the person, and the answer back — straight to pdf.js, never
 * kept (21 · D-07). Giving up lets go of the task, which ends the opening.
 */
function askedFor(task: PDFDocumentLoadingTask, password: PdfPasswordPrompt): () => boolean {
  let refused = false;

  task.onPassword = (answer: (password: string) => void, reason: number) => {
    password(reason === PasswordResponses.INCORRECT_PASSWORD ? 'incorrect' : 'needed').then(
      (typed) => {
        if (typed === null) {
          refused = true;
          void task.destroy();
        } else {
          answer(typed);
        }
      },
      () => {
        refused = true;
        void task.destroy();
      },
    );
  };

  return () => refused;
}

/**
 * The PDF engine of the app: pdf.js, with its worker **from our own build** — the URL Vite gives the
 * worker file it emits, never a CDN (07 · D-18). XFA forms are off: a preview draws pages, and runs
 * nothing a document carries.
 */
export function createPdfjsEngine(): PdfEngine {
  GlobalWorkerOptions.workerSrc = workerUrl;

  return {
    open: async (data, password) => {
      const task = getDocument({ data, enableXfa: false });
      const refused = askedFor(task, password);

      try {
        return documentOf(await task.promise, task);
      } catch (error) {
        if (refused()) {
          return 'locked';
        }
        throw error;
      }
    },
  };
}

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { logger } from '@/shared/logging/logger';
import { usePdf } from '../hooks/usePdf';
import { baseName } from '../lib/paths';
import type { PdfDocument } from '../types/pdf';
import { PaneError } from './PaneError';
import { PaneLoading } from './PaneLoading';

export interface PdfPreviewProps {
  readonly folder: string;
  readonly path: string;
}

/** How much larger than its size a page is drawn: sharp on a dense screen, scaled down by CSS. */
function scaleOf(): number {
  return 1.5 * Math.max(window.devicePixelRatio, 1);
}

/** One page of the document on a canvas, with the way to the others. */
function Pages({ doc, name }: { readonly doc: PdfDocument; readonly name: string }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  // The page that could not be drawn — said only while it is the one on screen.
  const [failed, setFailed] = useState<number | null>(null);

  useEffect(() => {
    // The canvas is on screen by the time an effect runs: it is drawn with the pages, always.
    const target = canvas.current as HTMLCanvasElement;
    // One drawing on the canvas at a time: the one of a page left behind is given up on.
    const drawing = new AbortController();

    doc.renderPage(page, target, scaleOf(), drawing.signal).catch((error: unknown) => {
      logger.warn({ op: 'editor.pdf.render', page, err: String(error) }, 'pdf page not drawn');
      if (!drawing.signal.aborted) {
        setFailed(page);
      }
    });

    return () => {
      drawing.abort();
    };
  }, [doc, page]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav
        aria-label={t('editor.preview.pdfPages', { name })}
        className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1 text-ui-sm"
      >
        <IconButton
          icon={ChevronLeft}
          label={t('editor.preview.pdfPrevious')}
          disabled={page <= 1}
          onClick={() => {
            setPage(page - 1);
          }}
        />
        <p aria-live="polite">{t('editor.preview.pdfPage', { page, pages: doc.pageCount })}</p>
        <IconButton
          icon={ChevronRight}
          label={t('editor.preview.pdfNext')}
          disabled={page >= doc.pageCount}
          onClick={() => {
            setPage(page + 1);
          }}
        />
      </nav>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {failed === page && (
          <p role="alert" className="text-ui-sm text-destructive">
            {t('editor.preview.pdfPageFailed', { page })}
          </p>
        )}
        <canvas
          ref={canvas}
          role="img"
          aria-label={t('editor.preview.pdfCanvas', { name, page })}
          className="mx-auto h-auto w-full max-w-3xl bg-background shadow-sm"
        />
      </div>
    </div>
  );
}

/**
 * The preview of a PDF (B-50, S-311): drawn page by page by the pdf.js of our own build — never the
 * browser's own viewer, which would open the file in an origin of its own (07 · D-18).
 */
export function PdfPreview({ folder, path }: PdfPreviewProps): React.JSX.Element {
  const { t } = useTranslation();
  const { doc, error, corrupt, retry } = usePdf(folder, path);
  const name = baseName(path);

  if (error !== null) {
    return <PaneError error={error} onRetry={retry} />;
  }

  if (corrupt) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 p-6 text-center text-ui-sm">
        <FileWarning className="size-8 text-muted-foreground" aria-hidden />
        <p>{t('editor.preview.pdfBroken', { name })}</p>
      </div>
    );
  }

  return doc === null ? <PaneLoading /> : <Pages doc={doc} name={name} />;
}

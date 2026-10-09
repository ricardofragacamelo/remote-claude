import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { logger } from '@/shared/logging/logger';
import type { PdfDocument, PdfOutlineItem } from '../types/pdf';

/**
 * The outline of a document — `null` while it is read. One that cannot be read is no outline: the
 * reader goes on, the thumbnails take you anywhere (S-36).
 */
export function usePdfOutline(doc: PdfDocument): readonly PdfOutlineItem[] | null {
  const [read, setRead] = useState<{
    readonly doc: PdfDocument;
    readonly items: readonly PdfOutlineItem[];
  } | null>(null);

  useEffect(() => {
    let live = true;

    doc.outline().then(
      (items) => {
        if (live) setRead({ doc, items });
      },
      (error: unknown) => {
        logger.warn({ op: 'editor.pdf.outline', err: String(error) }, 'pdf outline not read');
        if (live) setRead({ doc, items: [] });
      },
    );

    return () => {
      live = false;
    };
  }, [doc]);

  return read?.doc === doc ? read.items : null;
}

/** Below this width of the preview, the side panel opens over the pages (21 · D-11). */
export const NARROW_PREVIEW = 480;

/**
 * Whether an element is narrower than {@link NARROW_PREVIEW} — followed as it is resized. A width
 * not measured yet (`0`) is not narrow.
 */
export function useNarrow(element: RefObject<HTMLElement | null>): boolean {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const target = element.current as HTMLElement;
    const observer = new ResizeObserver((entries) => {
      const last = entries.at(-1);
      if (last !== undefined) setWidth(last.contentRect.width);
    });
    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [element]);

  return width > 0 && width < NARROW_PREVIEW;
}

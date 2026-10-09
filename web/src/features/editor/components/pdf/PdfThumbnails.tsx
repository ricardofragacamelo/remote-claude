import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { logger } from '@/shared/logging/logger';
import { createDrawQueue } from '../../lib/draw-queue';
import type { DrawQueue } from '../../lib/draw-queue';
import type { PdfDocument } from '../../types/pdf';

/** How many thumbnails draw at the same time (21 · D-11, S-42). */
const DRAWING_AT_ONCE = 2;

/** How large a thumbnail is drawn: a letter page is about 150 px wide. */
const THUMBNAIL_SCALE = 0.25;

/** How far from the view a thumbnail starts drawing — a little before it comes into sight. */
const NEAR = '200px';

/**
 * Draws a thumbnail while it is near the view (S-38): a drawing that leaves before it is done is
 * given up on, and one done stays. A failure is told, with the reason in the log (S-41).
 */
function useThumbnailDrawing(
  doc: PdfDocument,
  page: number,
  queue: DrawQueue,
  root: RefObject<HTMLElement | null>,
  item: RefObject<HTMLElement | null>,
  canvas: RefObject<HTMLCanvasElement | null>,
): 'waiting' | 'drawn' | 'failed' {
  const [state, setState] = useState<'waiting' | 'drawn' | 'failed'>('waiting');

  useEffect(() => {
    // Drawn with the list: both are on screen by the time an effect runs.
    const target = item.current as HTMLElement;
    let cancel: (() => void) | null = null;
    let done = false;

    const observer = new IntersectionObserver(
      (entries) => {
        const near = entries.some((entry) => entry.isIntersecting);

        if (near && cancel === null && !done) {
          cancel = queue.draw(
            async (signal) => {
              await doc.renderPage(
                page,
                canvas.current as HTMLCanvasElement,
                THUMBNAIL_SCALE,
                signal,
              );
              if (!signal.aborted) {
                done = true;
                setState('drawn');
              }
            },
            (error) => {
              done = true;
              logger.warn(
                { op: 'editor.pdf.thumbnail', page, err: String(error) },
                'pdf thumbnail not drawn',
              );
              setState('failed');
            },
          );
        } else if (!near && cancel !== null && !done) {
          cancel();
          cancel = null;
        }
      },
      { root: root.current, rootMargin: NEAR },
    );
    observer.observe(target);

    return () => {
      observer.disconnect();
      cancel?.();
    };
  }, [doc, page, queue, root, item, canvas]);

  return state;
}

/** One thumbnail: the page drawn small, with its number — or the number alone, when it failed. */
function Thumbnail({
  doc,
  page,
  current,
  queue,
  root,
  pick,
}: {
  readonly doc: PdfDocument;
  readonly page: number;
  readonly current: boolean;
  readonly queue: DrawQueue;
  readonly root: RefObject<HTMLElement | null>;
  pick(page: number): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const item = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useThumbnailDrawing(doc, page, queue, root, item, canvas);

  // The page being read stays in sight in the list (S-39).
  useEffect(() => {
    if (current) item.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  return (
    <li>
      <button
        ref={item}
        type="button"
        aria-current={current ? 'page' : undefined}
        aria-label={t('editor.pdf.thumbnail', { page })}
        onClick={() => {
          pick(page);
        }}
        className={cn(
          'flex w-full flex-col items-center gap-1 rounded-md p-2 text-ui-xs',
          'hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
          current && 'bg-accent ring-2 ring-primary',
        )}
      >
        <canvas
          ref={canvas}
          aria-hidden
          className={cn('h-auto w-28 bg-background shadow-sm', state !== 'drawn' && 'hidden')}
        />
        {state !== 'drawn' && (
          <span
            aria-hidden
            className="flex h-36 w-28 items-center justify-center border border-border bg-background text-ui"
          >
            {page}
          </span>
        )}
        <span aria-hidden>{page}</span>
      </button>
    </li>
  );
}

export interface PdfThumbnailsProps {
  readonly doc: PdfDocument;
  readonly name: string;
  readonly page: number;

  /** Goes to a page. */
  pick(page: number): void;
}

/**
 * The thumbnails of a PDF (21 · B-13), drawn by the port's `renderPage` with the signal of the B-03:
 * only near the view, at most two at a time, the page being read marked and kept in sight.
 */
export function PdfThumbnails({ doc, name, page, pick }: PdfThumbnailsProps): React.JSX.Element {
  const { t } = useTranslation();
  const [queue] = useState(() => createDrawQueue(DRAWING_AT_ONCE));
  // The list scrolls in its own box: "near the view" is near what it shows.
  const scroller = useRef<HTMLDivElement>(null);
  const pages = Array.from({ length: doc.pageCount }, (_, index) => index + 1);

  return (
    <div ref={scroller} className="size-full overflow-auto">
      <ul aria-label={t('editor.pdf.thumbnailList', { name })} className="flex flex-col gap-1 p-2">
        {pages.map((number) => (
          <Thumbnail
            key={number}
            doc={doc}
            page={number}
            current={number === page}
            queue={queue}
            root={scroller}
            pick={pick}
          />
        ))}
      </ul>
    </div>
  );
}

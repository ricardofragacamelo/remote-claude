import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import type { PdfReader } from '../../hooks/usePdfReader';
import {
  ZOOM_STEPS,
  atLargest,
  atSmallest,
  percentOf,
  scaleOfOption,
  zoomOption,
} from '../../lib/pdf-zoom';

/** The words of each fit in the list of the zoom, named in full. */
const FIT_LABELS = {
  auto: 'editor.pdf.zoomAuto',
  'page-width': 'editor.pdf.zoomPageWidth',
  'page-fit': 'editor.pdf.zoomPageFit',
} as const;

/** The page field: "n of m", typed and sent with Enter — a page the PDF lacks is not gone to (S-09). */
function PageField({ reader }: { readonly reader: PdfReader }): React.JSX.Element {
  const { t } = useTranslation();
  // What is being typed — `null` shows the page on screen.
  const [typed, setTyped] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-1">
      <input
        type="text"
        aria-label={t('editor.pdf.pageField')}
        inputMode="numeric"
        disabled={!reader.ready}
        value={typed ?? String(reader.page)}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            const text = (typed ?? '').trim();
            if (/^\d+$/.test(text)) reader.goToPage(Number(text));
            setTyped(null);
          } else if (event.key === 'Escape') {
            setTyped(null);
          }
        }}
        onBlur={() => {
          setTyped(null);
        }}
        className="h-7 w-12 rounded border border-input bg-background px-1 text-center"
      />
      <span className="whitespace-nowrap">
        {t('editor.pdf.pageCount', { pages: reader.pageCount })}
      </span>
    </span>
  );
}

/** The list of the zoom: the fits, the steps, and the factor on screen when it is none of them. */
function ZoomList({ reader }: { readonly reader: PdfReader }): React.JSX.Element {
  const { t } = useTranslation();
  const { scale, value } = reader.zoom;
  const custom = typeof scale === 'number' && !ZOOM_STEPS.some((step) => step === scale);

  return (
    <select
      aria-label={t('editor.pdf.zoom')}
      disabled={!reader.ready}
      value={zoomOption(scale)}
      onChange={(event) => {
        reader.setScale(scaleOfOption(event.target.value));
      }}
      className="h-7 rounded border border-input bg-background px-1"
    >
      {Object.entries(FIT_LABELS).map(([fit, key]) => (
        <option key={fit} value={fit}>
          {t(key)}
        </option>
      ))}
      {custom && (
        <option value={zoomOption(scale)}>
          {t('editor.pdf.zoomPercent', { value: percentOf(value) })}
        </option>
      )}
      {ZOOM_STEPS.map((step) => (
        <option key={step} value={zoomOption(step)}>
          {t('editor.pdf.zoomPercent', { value: percentOf(step) })}
        </option>
      ))}
    </select>
  );
}

export interface PdfToolbarProps {
  readonly reader: PdfReader;
  readonly name: string;

  /** What goes before the pages — the side panel's button (B-11). */
  readonly start?: ReactNode;

  /** What goes after the zoom — the search's button (B-14). */
  readonly end?: ReactNode;
}

/**
 * The bar of the reader (B-06, B-07): the page — previous, the field, next — and the zoom — smaller,
 * the list of fits and steps, larger — each button off where it can go no further (S-10…S-12).
 */
export function PdfToolbar({ reader, name, start, end }: PdfToolbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const { ready, page, pageCount, zoom } = reader;

  return (
    <div
      role="toolbar"
      aria-label={t('editor.pdf.toolbar', { name })}
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1 text-ui-sm"
    >
      {start}
      <IconButton
        icon={ChevronUp}
        label={t('editor.pdf.previous')}
        disabled={!ready || page <= 1}
        onClick={() => {
          reader.goToPage(page - 1);
        }}
      />
      <PageField reader={reader} />
      <IconButton
        icon={ChevronDown}
        label={t('editor.pdf.next')}
        disabled={!ready || page >= pageCount}
        onClick={() => {
          reader.goToPage(page + 1);
        }}
      />
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <IconButton
        icon={ZoomOut}
        label={t('editor.pdf.zoomOut')}
        disabled={!ready || atSmallest(zoom.value)}
        onClick={reader.zoomOut}
      />
      <ZoomList reader={reader} />
      <IconButton
        icon={ZoomIn}
        label={t('editor.pdf.zoomIn')}
        disabled={!ready || atLargest(zoom.value)}
        onClick={reader.zoomIn}
      />
      {end}
    </div>
  );
}

import { useRef, useState } from 'react';
import { PanelLeft, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useKeyContext } from '@/features/commands';
import type { Keybinding } from '@/features/commands';
import { IconButton } from '@/shared/components/IconButton';
import { useNarrow, usePdfOutline } from '../../hooks/usePdfOutline';
import { usePdfReader } from '../../hooks/usePdfReader';
import type { PdfReader as Reader } from '../../hooks/usePdfReader';
import { reachPdfReader } from '../../store/pdf-readers';
import type { PdfDocument } from '../../types/pdf';
import type { PdfOutlineItem, PdfSidebarTab } from '../../types/pdf';
import { PdfFindBar } from './PdfFindBar';
import { PdfSidebar } from './PdfSidebar';
import { PdfToolbar } from './PdfToolbar';

/** Makes the reader's shortcuts live while the focus — or the pointer — is in it. */
function ReaderKeys({ context }: { readonly context: Keybinding['context'] }): null {
  useKeyContext(context);
  return null;
}

/**
 * The tab the side panel opens on: the one it was on, else the outline when the PDF has one and the
 * thumbnails when it has none (S-31).
 */
function sidebarTab(reader: Reader, outline: readonly PdfOutlineItem[] | null): PdfSidebarTab {
  return reader.sidebar.tab ?? (outline !== null && outline.length > 0 ? 'outline' : 'thumbnails');
}

export interface PdfReaderProps {
  readonly folder: string;

  /** The editor tab it is in — what it remembers is this tab's (21 · D-06). */
  readonly tab: string;
  readonly doc: PdfDocument;
  readonly name: string;
}

/**
 * The reader of a PDF (21 · F1): its bar, and every page in one scroll, laid out by the pdf.js of
 * our build. With the focus in it, its shortcuts are live — `Ctrl+F` among them (21 · D-10); with
 * the focus or the pointer, the zoom's (S-14).
 */
export function PdfReader({ folder, tab, doc, name }: PdfReaderProps): React.JSX.Element {
  const { t } = useTranslation();
  const { container, reader } = usePdfReader(folder, tab, doc);
  const [focused, setFocused] = useState(false);
  const [pointed, setPointed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const narrow = useNarrow(root);
  const outline = usePdfOutline(doc);
  const tabShown = sidebarTab(reader, outline);
  const { sidebar, find } = reader;

  return (
    <div
      ref={root}
      role="group"
      aria-label={t('editor.pdf.reader', { name })}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onFocus={() => {
        setFocused(true);
        reachPdfReader(reader.handle);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onPointerEnter={() => {
        setPointed(true);
        reachPdfReader(reader.handle);
      }}
      onPointerLeave={() => {
        setPointed(false);
      }}
    >
      {focused && <ReaderKeys context="pdfReader" />}
      {pointed && <ReaderKeys context="pdfPointer" />}
      <PdfToolbar
        reader={reader}
        name={name}
        start={
          <IconButton
            icon={PanelLeft}
            label={t(sidebar.open ? 'editor.pdf.sidebarHide' : 'editor.pdf.sidebarShow')}
            aria-pressed={sidebar.open}
            onClick={() => {
              reader.setSidebar({ open: !sidebar.open, tab: tabShown });
            }}
          />
        }
        end={
          <IconButton
            icon={Search}
            label={t('editor.pdf.findOpen')}
            aria-pressed={find.open}
            disabled={!reader.ready}
            onClick={find.show}
          />
        }
      />
      {find.open && (
        <PdfFindBar
          // Closed, the focus goes back to the pages it was searching.
          find={{
            ...find,
            close: () => {
              find.close();
              container.current?.focus();
            },
          }}
          name={name}
        />
      )}
      <div className="relative flex min-h-0 min-w-0 flex-1 bg-muted">
        {sidebar.open && (
          <PdfSidebar
            doc={doc}
            name={name}
            reader={reader}
            outline={outline}
            tab={tabShown}
            over={narrow}
            choose={(chosen) => {
              reader.setSidebar({ open: true, tab: chosen });
            }}
            close={() => {
              reader.setSidebar({ open: false, tab: tabShown });
            }}
          />
        )}
        <div className="relative min-h-0 min-w-0 flex-1">
          <div
            ref={container}
            role="region"
            aria-label={t('editor.pdf.pages', { name })}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the pages scroll here, and a region that scrolls must be reachable by keyboard: its arrows scroll it, Home and End go to the ends (WCAG 2.1.1, axe scrollable-region-focusable; plan 21, S-11)
            tabIndex={0}
            className="absolute inset-0 overflow-auto focus-visible:outline-2 focus-visible:outline-ring"
          >
            <div className="pdfViewer" />
          </div>
        </div>
      </div>
      <p role="status" className="sr-only">
        {reader.ready
          ? t('editor.pdf.pageStatus', { page: reader.page, pages: reader.pageCount })
          : ''}
      </p>
    </div>
  );
}

import { useTranslation } from 'react-i18next';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { cn } from '@/shared/lib/utils';
import type { PdfReader } from '../../hooks/usePdfReader';
import type { PdfDocument, PdfOutlineItem, PdfSidebarTab } from '../../types/pdf';
import { PaneLoading } from '../PaneLoading';
import { PdfOutline } from './PdfOutline';
import { PdfThumbnails } from './PdfThumbnails';

export interface PdfSidebarProps {
  readonly doc: PdfDocument;
  readonly name: string;
  readonly reader: PdfReader;

  /** The outline of the PDF — `null` while it is read. */
  readonly outline: readonly PdfOutlineItem[] | null;

  /** The tab it shows. */
  readonly tab: PdfSidebarTab;

  /** A narrow preview: the panel lies over the pages, and closes once it took you somewhere (S-32). */
  readonly over: boolean;
  choose(tab: PdfSidebarTab): void;
  close(): void;
}

/**
 * The side panel of the reader (21 · B-11): the outline of the PDF and its thumbnails, in two tabs.
 * Beside the pages — or, in a preview narrower than 480 px, over them (21 · D-11).
 */
export function PdfSidebar({
  doc,
  name,
  reader,
  outline,
  tab,
  over,
  choose,
  close,
}: PdfSidebarProps): React.JSX.Element {
  const { t } = useTranslation();
  const went = (moved: boolean): void => {
    if (moved && over) close();
  };

  return (
    <aside
      aria-label={t('editor.pdf.sidebar', { name })}
      className={cn(
        'flex min-h-0 flex-col border-r border-border bg-background',
        over ? 'absolute inset-y-0 left-0 z-10 w-64 max-w-[85%] shadow-lg' : 'w-56 shrink-0',
      )}
    >
      <Tabs
        value={tab}
        onValueChange={(value) => {
          choose(value === 'outline' ? 'outline' : 'thumbnails');
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="px-1">
          <TabsTrigger value="outline">{t('editor.pdf.outline')}</TabsTrigger>
          <TabsTrigger value="thumbnails">{t('editor.pdf.thumbnails')}</TabsTrigger>
        </TabsList>
        <TabsContent value="outline" className="overflow-auto">
          {outline === null && <PaneLoading />}
          {outline !== null && outline.length === 0 && (
            <p className="p-3 text-ui-sm text-muted-foreground">{t('editor.pdf.noOutline')}</p>
          )}
          {outline !== null && outline.length > 0 && (
            <PdfOutline
              items={outline}
              name={name}
              open={(item) => {
                if (item.dest !== null) void reader.goToDestination(item.dest).then(went);
              }}
            />
          )}
        </TabsContent>
        <TabsContent value="thumbnails" className="flex min-h-0 flex-col">
          <PdfThumbnails
            doc={doc}
            name={name}
            page={reader.page}
            pick={(page) => {
              went(reader.goToPage(page));
            }}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

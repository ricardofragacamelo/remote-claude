import {
  Binary,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Info,
  Scale,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { Button } from '@/shared/components/ui/button';
import { usePagedFile } from '../hooks/usePagedFile';
import type { PageData, PagedFile as Paged } from '../hooks/usePagedFile';
import { HEX_ROW_BYTES, hexRowsOf, pageBytesOf, textOfPage } from '../lib/paged';
import type { PagedMode } from '../lib/paged';
import { formatBytes } from '../lib/text';
import type { FileDocument } from '../types/editor';
import { PaneError } from './PaneError';
import { PaneLoading } from './PaneLoading';

export interface PagedFileProps {
  readonly folder: string;
  readonly path: string;
  readonly mode: PagedMode;

  /** Why the editor did not open it — the size and the ceiling of a file past it. */
  readonly failure: FileDocument['failure'];
}

function numberParam(failure: FileDocument['failure'], key: string): number {
  const value = failure?.params[key];
  return typeof value === 'number' ? value : 0;
}

/** What the view says it is, above the pages: read-only, and why. */
function Why({ path, mode, failure }: Omit<PagedFileProps, 'folder'>): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const Icon = mode === 'hex' ? Binary : Scale;
  const params = {
    path,
    size: formatBytes(numberParam(failure, 'size'), i18n.language),
    limit: formatBytes(numberParam(failure, 'limit'), i18n.language),
  };

  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2 text-ui-sm">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-col">
        <p className="font-ui-strong">
          {t(mode === 'hex' ? 'editor.paged.hexTitle' : 'editor.paged.textTitle', params)}
        </p>
        <p className="text-muted-foreground">
          {t(mode === 'hex' ? 'editor.paged.hex' : 'editor.paged.text', params)}
        </p>
      </div>
    </div>
  );
}

/** First, previous, where, next, last — buttons, so the keyboard walks the pages too. */
function PageControls({ path, paged }: { readonly path: string; readonly paged: Paged }) {
  const { t } = useTranslation();
  const { page, pages } = paged;

  return (
    <nav
      aria-label={t('editor.paged.controls', { path })}
      className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1 text-ui-sm"
    >
      <IconButton
        icon={ChevronFirst}
        label={t('editor.paged.first')}
        disabled={page === 0}
        onClick={() => {
          paged.goTo(0);
        }}
      />
      <IconButton
        icon={ChevronLeft}
        label={t('editor.paged.previous')}
        disabled={page === 0}
        onClick={() => {
          paged.goTo(page - 1);
        }}
      />
      <p aria-live="polite">{t('editor.paged.page', { page: page + 1, pages })}</p>
      <IconButton
        icon={ChevronRight}
        label={t('editor.paged.next')}
        disabled={page >= pages - 1}
        onClick={() => {
          paged.goTo(page + 1);
        }}
      />
      <IconButton
        icon={ChevronLast}
        label={t('editor.paged.last')}
        disabled={page >= pages - 1}
        onClick={() => {
          paged.goTo(pages - 1);
        }}
      />
    </nav>
  );
}

/** A page of bytes: offset, the bytes in hexadecimal, and what of them is printable. */
function HexPage({ path, data }: { readonly path: string; readonly data: PageData }) {
  const { t } = useTranslation();
  const rows = hexRowsOf(data.bytes, data.start);
  const last = data.start + data.bytes.length - 1;

  return (
    <table
      aria-label={t('editor.paged.tableLabel', { path, from: data.start, to: last })}
      className="font-code text-ui-sm"
    >
      <thead className="text-muted-foreground">
        <tr>
          <th scope="col" className="px-3 text-left font-normal">
            {t('editor.paged.offset')}
          </th>
          <th scope="col" className="px-3 text-left font-normal">
            {t('editor.paged.bytes', { bytes: HEX_ROW_BYTES })}
          </th>
          <th scope="col" className="px-3 text-left font-normal">
            {t('editor.paged.ascii')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.offset}>
            <td className="px-3 text-muted-foreground">{row.offset}</td>
            <td className="px-3 whitespace-pre">{row.hex}</td>
            <td className="px-3 whitespace-pre">{row.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A page of the text, whole characters only. */
function TextPage({ path, paged }: { readonly path: string; readonly paged: Paged }) {
  const { t } = useTranslation();
  const data = paged.data as PageData;

  return (
    <pre
      aria-label={t('editor.paged.textLabel', { path, page: paged.page + 1 })}
      className="min-h-full p-3 font-code text-ui-sm whitespace-pre-wrap"
    >
      {textOfPage(data.bytes, pageBytesOf('text'), paged.page === 0)}
    </pre>
  );
}

/** The page on screen, in its four states. */
function PageBody({
  path,
  mode,
  paged,
}: {
  readonly path: string;
  readonly mode: PagedMode;
  readonly paged: Paged;
}) {
  const { t } = useTranslation();

  if (paged.error !== null) {
    return <PaneError error={paged.error} onRetry={paged.retry} />;
  }

  if (paged.data === null) {
    return <PaneLoading />;
  }

  if (paged.data.size === 0) {
    return (
      <p className="p-6 text-ui-sm text-muted-foreground">{t('editor.paged.empty', { path })}</p>
    );
  }

  return mode === 'hex' ? (
    <HexPage path={path} data={paged.data} />
  ) : (
    <TextPage path={path} paged={paged} />
  );
}

/**
 * A file the editor does not open, read anyway — read-only, a page at a time, by `Range` (B-51): a
 * binary file in hexadecimal (S-314), a text past the editing ceiling as pages of text, saying why
 * (S-316). An empty file and a short last page are pages like any other (S-315); a file that changes
 * between pages is said, and read again on its new version (S-317).
 */
export function PagedFile({ folder, path, mode, failure }: PagedFileProps): React.JSX.Element {
  const { t } = useTranslation();
  const paged = usePagedFile(folder, path, mode);

  return (
    <div className="flex size-full min-h-0 min-w-0 flex-col">
      <Why path={path} mode={mode} failure={failure} />
      {paged.changed && (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-accent px-3 py-1 text-ui-sm text-accent-foreground"
        >
          <Info className="size-4 shrink-0" aria-hidden />
          <p>{t('editor.paged.changed', { path })}</p>
          <Button variant="outline" className="h-touch px-3 md:h-6" onClick={paged.dismissChanged}>
            {t('editor.paged.dismiss')}
          </Button>
        </div>
      )}
      <PageControls path={path} paged={paged} />
      <div className="min-h-0 flex-1 overflow-auto">
        <PageBody path={path} mode={mode} paged={paged} />
      </div>
    </div>
  );
}

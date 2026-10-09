import { useEffect, useRef } from 'react';
import { CaseSensitive, ChevronDown, ChevronUp, WholeWord, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import type { PdfFind } from '../../hooks/usePdfFind';

/** What the bar says of the search: "n of m", "no results" — or nothing yet. */
function CountText({ find }: { readonly find: PdfFind }): React.JSX.Element {
  const { t } = useTranslation();
  const { count } = find;
  const text =
    count.kind === 'found'
      ? t('editor.pdf.findCount', { current: count.current, total: count.total })
      : count.kind === 'empty'
        ? t('editor.pdf.findNone')
        : '';

  return (
    <p role="status" className="min-w-16 text-center whitespace-nowrap text-muted-foreground">
      {text}
    </p>
  );
}

export interface PdfFindBarProps {
  readonly find: PdfFind;
  readonly name: string;
}

/**
 * The search of the PDF (21 · B-14): the field focused and its text selected when it opens — the
 * last search, reopened (S-47) —; Enter to the next match and Shift+Enter to the previous, round the
 * ends; "match case" and "whole word"; Esc closes it and takes the highlight away.
 */
export function PdfFindBar({ find, name }: PdfFindBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const field = useRef<HTMLInputElement>(null);

  // Opened — or asked for again while open — the field takes the focus, its text selected.
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, [find.shown]);

  return (
    <div
      role="search"
      aria-label={t('editor.pdf.find', { name })}
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1 text-ui-sm"
    >
      <input
        ref={field}
        type="text"
        aria-label={t('editor.pdf.find', { name })}
        value={find.query}
        onChange={(event) => {
          find.setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (event.shiftKey) find.previous();
            else find.next();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            find.close();
          }
        }}
        className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2"
      />
      <CountText find={find} />
      <IconButton
        icon={ChevronUp}
        label={t('editor.pdf.findPrevious')}
        disabled={find.count.kind !== 'found'}
        onClick={find.previous}
      />
      <IconButton
        icon={ChevronDown}
        label={t('editor.pdf.findNext')}
        disabled={find.count.kind !== 'found'}
        onClick={find.next}
      />
      <IconButton
        icon={CaseSensitive}
        label={t('editor.pdf.matchCase')}
        aria-pressed={find.caseSensitive}
        onClick={find.toggleCase}
      />
      <IconButton
        icon={WholeWord}
        label={t('editor.pdf.wholeWord')}
        aria-pressed={find.entireWord}
        onClick={find.toggleWord}
      />
      <IconButton icon={X} label={t('editor.pdf.findClose')} onClick={find.close} />
    </div>
  );
}

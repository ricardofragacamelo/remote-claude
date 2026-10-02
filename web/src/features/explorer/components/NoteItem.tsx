import type { CSSProperties } from 'react';
import { AlertTriangle, LoaderCircle, Scissors } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import type { NoteRow } from '../lib/tree-rows';

/** How far a note is indented: its level, past where the chevron of an entry is. */
function indentOf(level: number): number {
  return (level - 1) * 12 + 18;
}

const NOTE = 'absolute right-0 left-0 flex items-center gap-1 pr-2 text-ui-sm outline-none';

export interface NoteItemProps {
  readonly row: Extract<NoteRow, { readonly type: 'loading' | 'truncated' }>;
  readonly style: CSSProperties;
}

/**
 * A row of the tree that is read, never stopped on: a level loading, or a level cut by the ceiling of
 * entries, which says so and how to find the rest (S-163).
 */
export function NoteItem({ row, style }: NoteItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const loading = row.type === 'loading';

  return (
    <div
      role="treeitem"
      data-key={row.key}
      aria-level={row.level}
      aria-busy={loading || undefined}
      aria-selected={false}
      tabIndex={-1}
      style={{ ...style, paddingLeft: indentOf(row.level) }}
      className={cn(NOTE, 'text-muted-foreground')}
    >
      {loading ? (
        <LoaderCircle className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <Scissors className="size-3.5 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 truncate">
        {loading ? t('explorer.tree.loading') : t('explorer.tree.truncated')}
      </span>
    </div>
  );
}

export interface FailedLevelItemProps {
  readonly row: Extract<NoteRow, { readonly type: 'error' }>;
  readonly focused: boolean;
  readonly style: CSSProperties;

  /** Reads the level again — a click, or `Enter` on it. */
  onRetry(): void;
}

/** A level that could not be read: why, and — a click or `Enter` — the way to read it again. */
export function FailedLevelItem({
  row,
  focused,
  style,
  onRetry,
}: FailedLevelItemProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div
      role="treeitem"
      data-key={row.key}
      aria-level={row.level}
      aria-selected={false}
      tabIndex={focused ? 0 : -1}
      style={{ ...style, paddingLeft: indentOf(row.level) }}
      className={cn(
        NOTE,
        'cursor-pointer text-destructive focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
      )}
      onClick={onRetry}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onRetry();
        }
      }}
    >
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">
        {t('explorer.tree.levelFailed', {
          reason: t(row.error.messageKey, { ...row.error.params }),
        })}
      </span>
    </div>
  );
}

import { File, FileText, Folder, Image, SquareTerminal, TextSelect, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { formatBytes, useFileDirty } from '@/features/editor';
import { IconButton } from '@/shared/components/IconButton';
import type { ContextItem, ContextNotice, ContextTotals } from '../../types/context';

export interface ContextChipsProps {
  readonly folder: string;
  readonly items: readonly ContextItem[];
  readonly totals: ContextTotals;
  readonly notice: ContextNotice | null;
  onRemove(id: string): void;
}

/** The name of a chip — the path relative to the folder, with the lines of a range. */
export function chipLabel(item: ContextItem): string {
  switch (item.kind) {
    case 'range':
      return `${item.path}:${String(item.startLine)}-${String(item.endLine)}`;
    case 'upload':
      return item.name;
    case 'text':
      return item.label;
    default:
      return item.path === '' ? '.' : item.path;
  }
}

/** The icon of a chip, by what it is — an image upload has its own. */
function ChipIcon({ item }: { readonly item: ContextItem }): React.JSX.Element {
  const props = { className: 'size-3.5 shrink-0', 'aria-hidden': true } as const;

  switch (item.kind) {
    case 'folder':
      return <Folder {...props} />;
    case 'range':
      return <TextSelect {...props} />;
    case 'upload':
      return item.uploadKind === 'image' ? <Image {...props} /> : <FileText {...props} />;
    case 'text':
      return <SquareTerminal {...props} />;
    default:
      return <File {...props} />;
  }
}

/**
 * The context of the next prompt, above the composer (plan 08, B-47): a chip per item — an icon, its
 * name relative to the folder, what is wrong with it, and a way to remove it by click and by
 * keyboard — and what the whole set may cost, said as an estimate (D-23).
 */
export function ContextChips({
  folder,
  items,
  totals,
  notice,
  onRemove,
}: ContextChipsProps): React.JSX.Element | null {
  const { t } = useTranslation();

  if (items.length === 0 && notice === null) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={t('composer.set.label')}>
          {items.map((item) => (
            <Chip key={item.id} folder={folder} item={item} onRemove={onRemove} />
          ))}
        </ul>
      )}
      {items.length > 0 && <SetTotals totals={totals} />}
      {notice !== null && (
        <p role="status" className="text-ui-xs text-muted-foreground">
          {t(notice.key, notice.params)}
        </p>
      )}
    </div>
  );
}

/** One chip, and what is wrong with it. */
function Chip({
  folder,
  item,
  onRemove,
}: {
  readonly folder: string;
  readonly item: ContextItem;
  onRemove(id: string): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const label = chipLabel(item);
  const dirty = useFileDirty(
    folder,
    item.kind === 'file' || item.kind === 'range' ? item.path : '',
  );
  const warning = warningOf(item, dirty);

  return (
    <li
      className={
        'flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-ui-xs ' +
        (warning?.severe === true ? 'border-destructive' : 'border-border')
      }
    >
      <ChipIcon item={item} />
      <span className="truncate font-mono" title={label}>
        {label}
      </span>
      {warning !== null && (
        <span className={warning.severe ? 'text-destructive' : 'text-muted-foreground'}>
          {t(warning.key, warning.params)}
        </span>
      )}
      <IconButton
        icon={X}
        label={t('composer.chip.remove', { name: label })}
        className="size-5 md:size-5"
        onClick={() => {
          onRemove(item.id);
        }}
      />
    </li>
  );
}

/** What a chip warns of: gone, not text, still on its way, refused — or a buffer not saved. */
function warningOf(
  item: ContextItem,
  dirty: boolean,
): { key: string; params: Readonly<Record<string, unknown>>; severe: boolean } | null {
  if (item.kind === 'file' || item.kind === 'range') {
    if (item.missing) return { key: 'composer.chip.missing', params: {}, severe: true };
    if (item.binary) return { key: 'composer.chip.binary', params: {}, severe: true };
    if (dirty) return { key: 'composer.chip.dirty', params: {}, severe: false };
    return null;
  }

  if (item.kind === 'upload') {
    if (item.error !== null)
      return { key: item.error.messageKey, params: item.error.params, severe: true };
    if (item.attachmentId === null)
      return { key: 'composer.chip.pending', params: {}, severe: false };
  }

  return null;
}

/** The size of the set, its estimated tokens, and the warning or the refusal it earns. */
function SetTotals({ totals }: { readonly totals: ContextTotals }): React.JSX.Element {
  const { t, i18n } = useTranslation();

  return (
    <p
      className={
        'text-ui-xs ' +
        (totals.level === 'over'
          ? 'text-destructive'
          : totals.level === 'warn'
            ? 'text-warning'
            : 'text-muted-foreground')
      }
    >
      {t('composer.set.totals', {
        count: totals.items,
        size: formatBytes(totals.bytes, i18n.language),
        tokens: totals.tokens.toLocaleString(i18n.language),
      })}
      {totals.folders > 0 && ` ${t('composer.set.folders', { count: totals.folders })}`}
      {totals.level === 'warn' && ` ${t('composer.set.warn')}`}
      {totals.over === 'items' && ` ${t('composer.set.overItems')}`}
      {totals.over === 'bytes' && ` ${t('composer.set.overBytes')}`}
    </p>
  );
}

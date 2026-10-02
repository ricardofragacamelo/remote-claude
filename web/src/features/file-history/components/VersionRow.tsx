import { FileDiff, GitCompare, History, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { useEntryWords } from '../hooks/useEntryWords';
import { REASON_KEYS } from '../lib/entries';
import type { HistoryEntry } from '../types/history';

export interface VersionRowProps {
  readonly entry: HistoryEntry;

  /** The file no longer exists: nothing to compare with, and a restore recreates it. */
  readonly gone: boolean;

  /** The version picked to be compared with another — `null` for none. */
  readonly selected: HistoryEntry | null;
  readonly busy: boolean;
  onCompareWithCurrent(entry: HistoryEntry): void;
  onSelect(entry: HistoryEntry | null): void;
  onCompareWithSelected(entry: HistoryEntry): void;
  onRestore(entry: HistoryEntry): void;
}

/**
 * One version of the Timeline: why it was kept, who wrote it and when — and what can be done with it.
 * A version too large to keep says so, and offers nothing: there is no content to compare or restore.
 */
export function VersionRow(props: VersionRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const { entry } = props;
  const { who, when } = useEntryWords(entry);

  return (
    <li className="flex flex-col gap-0.5 border-b border-border px-2 py-1 text-ui-sm last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="font-ui-strong">{t(REASON_KEYS[entry.reason])}</span>
          <span className="text-muted-foreground">
            {t('fileHistory.version.byAt', { who, when })}
          </span>
        </span>
        {entry.kept === 'yes' && <VersionActions {...props} when={when} />}
      </div>
      {entry.kept === 'tooLarge' && (
        <p className="text-muted-foreground">{t('fileHistory.version.tooLarge')}</p>
      )}
    </li>
  );
}

/** What can be done with a version that was kept. */
function VersionActions({
  entry,
  gone,
  selected,
  busy,
  when,
  onCompareWithCurrent,
  onSelect,
  onCompareWithSelected,
  onRestore,
}: VersionRowProps & { readonly when: string }): React.JSX.Element {
  const { t } = useTranslation();
  const isSelected = selected?.id === entry.id;
  const canCompare = entry.entryKind === 'file';

  return (
    <span className="flex shrink-0 items-center">
      {canCompare && !gone && (
        <IconButton
          icon={FileDiff}
          label={t('fileHistory.action.compareWithCurrent', { when })}
          onClick={() => {
            onCompareWithCurrent(entry);
          }}
        />
      )}
      {canCompare && selected !== null && !isSelected ? (
        <IconButton
          icon={GitCompare}
          label={t('fileHistory.action.compareWithSelected', { when })}
          onClick={() => {
            onCompareWithSelected(entry);
          }}
        />
      ) : (
        canCompare && (
          <IconButton
            icon={ListChecks}
            label={t('fileHistory.action.selectForCompare', { when })}
            aria-pressed={isSelected}
            onClick={() => {
              onSelect(isSelected ? null : entry);
            }}
          />
        )
      )}
      <IconButton
        icon={History}
        label={t('fileHistory.action.restore', { when })}
        disabled={busy}
        onClick={() => {
          onRestore(entry);
        }}
      />
    </span>
  );
}

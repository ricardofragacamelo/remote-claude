import { useTranslation } from 'react-i18next';

import { ListStatus } from '@/shared/components/ListStatus';
import type { ListStatusProps } from '@/shared/components/ListStatus';

export interface RuleListStatusProps {
  readonly isLoading: boolean;
  readonly error: ListStatusProps['error'];
  readonly isEmpty: boolean;
  onRetry(): void;
  readonly emptyTitleKey: string;
  readonly emptyDescriptionKey: string;

  /** How many rows the skeleton holds the place of — the table's and the card list's shapes differ. */
  readonly rows: number;
}

/**
 * The three states a rules view is before it is its rows — loading, failed or empty — the table
 * and the card list both read the same way (S-159), only the skeleton's own row count differs.
 */
export function RuleListStatus({
  isLoading,
  error,
  isEmpty,
  onRetry,
  emptyTitleKey,
  emptyDescriptionKey,
  rows,
}: RuleListStatusProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ListStatus
      isLoading={isLoading}
      loadingLabel={t('rules.table.loading')}
      error={error}
      onRetry={onRetry}
      isEmpty={isEmpty}
      emptyTitle={t(emptyTitleKey)}
      emptyDescription={t(emptyDescriptionKey)}
      rows={rows}
    />
  );
}

export interface RuleListFrameProps extends RuleListStatusProps {
  /** The rows themselves — the table or the card list, shown only once there are some (S-159). */
  readonly children: React.ReactNode;
}

/**
 * The frame every rules view shares: the three states above, and the rows below them once there
 * are rows to show — the table and the card list each bring only their own markup for those rows.
 */
export function RuleListFrame({ children, ...status }: RuleListFrameProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <RuleListStatus {...status} />
      {!status.isLoading && status.error === null && !status.isEmpty && children}
    </div>
  );
}

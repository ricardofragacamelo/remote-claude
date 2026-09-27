import { useTranslation } from 'react-i18next';

import type { RewindOutcome } from '../types/checkpoint';
import { FileGroups } from './FileGroups';

/** What the undo did to each file, in the order the report says it — what failed last. */
const OUTCOME_TITLES = {
  restored: 'undo.outcome.restored',
  deleted: 'undo.outcome.deleted',
  preserved: 'undo.outcome.preserved',
  unchanged: 'undo.outcome.unchanged',
  failed: 'undo.outcome.failed',
} as const;

export interface RewindReportProps {
  readonly outcome: RewindOutcome;
}

/**
 * What the last undo did to the disk, file by file — never "done".
 *
 * Put back, deleted, left as they were with the reason, already there, and what could not be put
 * back. The last group is the one that matters most when it is not empty: each of those files is
 * exactly as it was before the undo, and the person has to know which (S-44, S-62).
 */
export function RewindReport({ outcome }: RewindReportProps): React.JSX.Element {
  const { t } = useTranslation();
  const touched = (Object.keys(OUTCOME_TITLES) as (keyof typeof OUTCOME_TITLES)[]).some(
    (group) => outcome[group].length > 0,
  );

  return (
    <section
      aria-label={t('undo.outcome.title')}
      className="flex flex-col gap-2 rounded bg-muted p-3"
    >
      <p className="text-sm font-semibold">{t('undo.outcome.title')}</p>

      <FileGroups titles={OUTCOME_TITLES} files={outcome} />

      {!touched && <p className="text-sm">{t('undo.outcome.nothing')}</p>}
    </section>
  );
}

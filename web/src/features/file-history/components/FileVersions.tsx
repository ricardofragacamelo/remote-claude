import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { compareVersions, compareWithCurrent } from '../hooks/compare';
import type { Restorer } from '../hooks/useRestore';
import { useTimelineState, useVersions } from '../hooks/useTimeline';
import { FILTER_KEYS } from '../lib/entries';
import { timelineStore } from '../store/timeline.store';
import type { TimelineSubject } from '../store/timeline.store';
import { HISTORY_REASONS } from '../types/history';
import type { HistoryReason } from '../types/history';
import { PagedList } from './PagedList';
import { VersionRow } from './VersionRow';

export interface FileVersionsProps {
  readonly folder: string;
  readonly restorer: Restorer;
}

/**
 * The versions of the file the Timeline follows — the editor's active one — newest first, a page at
 * a time, filtered by why they were kept (S-345, S-347). Before any file was opened, it says how to
 * get one; a file with no version yet says when its history starts (S-348).
 */
export function FileVersions({ folder, restorer }: FileVersionsProps): React.JSX.Element {
  const { t } = useTranslation();
  const subject = useTimelineState(folder, (state) => state.subject);

  if (subject === null) {
    return (
      <p className="p-2 text-ui-sm text-muted-foreground">{t('fileHistory.timeline.noFile')}</p>
    );
  }

  return <SubjectVersions folder={folder} subject={subject} restorer={restorer} />;
}

function SubjectVersions({
  folder,
  subject,
  restorer,
}: FileVersionsProps & { readonly subject: TimelineSubject }): React.JSX.Element {
  const { t } = useTranslation();
  const reason = useTimelineState(folder, (state) => state.reason);
  const selected = useTimelineState(folder, (state) => state.selected);
  const versions = useVersions(folder, subject.path, reason);
  const store = timelineStore(folder).getState();

  return (
    <div className="flex flex-col gap-1 p-2">
      <p className="font-code text-ui-sm break-all">
        {t(subject.gone ? 'fileHistory.timeline.ofGone' : 'fileHistory.timeline.of', {
          path: subject.path,
        })}
      </p>
      <ReasonFilter folder={folder} reason={reason} />
      <PagedList
        list={versions}
        label={t('fileHistory.timeline.listLabel', { path: subject.path })}
        loadingLabel={t('fileHistory.timeline.loading')}
        emptyTitle={t(reason === null ? 'fileHistory.empty.title' : 'fileHistory.empty.filtered')}
        emptyDescription={t('fileHistory.empty.description')}
      >
        {versions.entries.map((entry) => (
          <VersionRow
            key={entry.id}
            entry={entry}
            gone={subject.gone}
            selected={selected}
            busy={restorer.pending}
            onCompareWithCurrent={(each) => {
              compareWithCurrent(folder, each);
            }}
            onSelect={store.select}
            onCompareWithSelected={(each) => {
              if (selected !== null) {
                compareVersions(folder, selected, each);
              }
            }}
            onRestore={(each) => {
              restorer.request(each, subject.gone);
            }}
          />
        ))}
      </PagedList>
    </div>
  );
}

/** Which versions are listed: all, or those of one reason — a toggle each, one pressed at a time. */
function ReasonFilter({
  folder,
  reason,
}: {
  readonly folder: string;
  readonly reason: HistoryReason | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const setReason = timelineStore(folder).getState().setReason;
  const choices: readonly (HistoryReason | null)[] = [null, ...HISTORY_REASONS];

  return (
    <div role="group" aria-label={t('fileHistory.filter.label')} className="flex flex-wrap gap-1">
      {choices.map((choice) => (
        <Button
          key={choice ?? 'all'}
          variant="outline"
          className="h-touch px-2 text-ui-sm md:h-6"
          aria-pressed={reason === choice}
          onClick={() => {
            setReason(choice);
          }}
        >
          {t(choice === null ? 'fileHistory.filter.all' : FILTER_KEYS[choice])}
        </Button>
      ))}
    </div>
  );
}

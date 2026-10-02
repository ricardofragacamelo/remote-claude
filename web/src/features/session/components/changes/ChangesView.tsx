import { useState } from 'react';
import { CheckCheck, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { ErrorState } from '@/shared/components/ErrorState';
import { LoadStatus } from '@/shared/components/LoadStatus';
import { Button } from '@/shared/components/ui/button';
import { useDiffTabs } from '../../hooks/useDiffTabs';
import { useRejections } from '../../hooks/useRejections';
import { useSessionChanges } from '../../hooks/useSessionChanges';
import type { ChangesFilter } from '../../types/changes';
import { UndoPanel } from '../UndoPanel';
import { ChangeRow } from './ChangeRow';
import { RejectAllDialog } from './RejectAllDialog';

export interface ChangesViewProps {
  readonly folder: string;
  readonly sessionId: string;
}

/** The filters, in order — named in full so the i18n check sees each key. */
const FILTERS: readonly { readonly id: ChangesFilter; readonly key: string }[] = [
  { id: 'pending', key: 'sessions.changesFilter.pending' },
  { id: 'reviewed', key: 'sessions.changesFilter.reviewed' },
  { id: 'all', key: 'sessions.changesFilter.all' },
];

/**
 * "Changes": everything a live session changed on disk, against before the session (plan 08,
 * B-28) — what it did to each file, how much, and whether somebody changed it after; the diff in the
 * editor of the same tab; **accept** (a mark of review — writes nothing, D-18) and **reject** (puts
 * the file, or one hunk, back — undone from the toast, D-08). The undo by turn of plan 04 stays
 * below, beside it.
 */
export function ChangesView({ folder, sessionId }: ChangesViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const changes = useSessionChanges(folder, sessionId);
  const rejections = useRejections(sessionId);
  const tabs = useDiffTabs(folder, sessionId);
  const [confirming, setConfirming] = useState(false);

  return (
    <section aria-label={t('sessions.changes.title')} className="flex flex-col gap-3">
      <header className="flex flex-col gap-2">
        <p className="text-ui-sm" role="status">
          {t('sessions.changes.summary', { pending: changes.pending, count: changes.all.length })}
        </p>
        <div
          role="radiogroup"
          aria-label={t('sessions.changesFilter.label')}
          className="flex gap-1"
        >
          {FILTERS.map((filter) => (
            <Button
              key={filter.id}
              role="radio"
              aria-checked={changes.filter === filter.id}
              variant={changes.filter === filter.id ? 'primary' : 'outline'}
              onClick={() => {
                changes.setFilter(filter.id);
              }}
            >
              {t(filter.key)}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" disabled={changes.pending === 0} onClick={changes.acceptAll}>
            <CheckCheck className="size-3.5" aria-hidden />
            {t('sessions.changes.acceptAll')}
          </Button>
          <Button
            variant="outline"
            disabled={
              changes.all.length === 0 || changes.firstPromptId === null || rejections.isRejecting
            }
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Undo2 className="size-3.5" aria-hidden />
            {t('sessions.changes.rejectAll')}
          </Button>
        </div>
      </header>

      {rejections.refusal !== null && <ErrorState error={rejections.refusal} />}

      <Body
        changes={changes}
        folder={folder}
        sessionId={sessionId}
        busy={rejections.isRejecting}
        onOpenDiff={tabs.openChangeDiff}
        onReject={rejections.rejectFile}
        onRejectHunk={rejections.rejectHunk}
      />

      <UndoPanel sessionId={sessionId} />

      <RejectAllDialog
        open={confirming}
        files={changes.all}
        folder={folder}
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          setConfirming(false);
          if (changes.firstPromptId !== null) {
            rejections.rejectAll(changes.firstPromptId);
          }
        }}
      />
    </section>
  );
}

interface BodyProps {
  readonly changes: ReturnType<typeof useSessionChanges>;
  readonly folder: string;
  readonly sessionId: string;
  readonly busy: boolean;
  onOpenDiff(path: string): void;
  onReject: ReturnType<typeof useRejections>['rejectFile'];
  onRejectHunk(path: string, hunkId: string, revision: string): void;
}

/** The list, in its four states — and the filter that left nothing says so, with the way back. */
function Body({
  changes,
  folder,
  sessionId,
  busy,
  onOpenDiff,
  onReject,
  onRejectHunk,
}: BodyProps): React.JSX.Element {
  const { t } = useTranslation();

  if (changes.isLoading || changes.error !== null) {
    return (
      <LoadStatus
        isLoading={changes.isLoading}
        loadingLabel={t('sessions.changes.loading')}
        error={changes.error}
        onRetry={changes.reload}
        rows={2}
      />
    );
  }

  if (changes.all.length === 0) {
    return (
      <EmptyState
        title={t('sessions.changes.emptyTitle')}
        description={t('sessions.changes.emptyDescription')}
      />
    );
  }

  if (changes.files.length === 0) {
    return (
      <EmptyState
        title={t('sessions.changes.filteredTitle')}
        description={t('sessions.changes.filteredDescription')}
        action={
          <Button
            variant="outline"
            onClick={() => {
              changes.setFilter('all');
            }}
          >
            {t('sessions.changes.showAll')}
          </Button>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-1" aria-label={t('sessions.changes.listLabel')}>
      {changes.files.map((file) => (
        <ChangeRow
          key={file.path}
          file={file}
          folder={folder}
          sessionId={sessionId}
          busy={busy}
          onOpenDiff={onOpenDiff}
          onAccept={changes.accept}
          onUnaccept={changes.unaccept}
          onReject={onReject}
          onRejectHunk={onRejectHunk}
        />
      ))}
    </ul>
  );
}

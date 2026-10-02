import { useEffect, useId, useRef } from 'react';
import { ChevronDown, ChevronRight, CircleHelp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { useRestore } from '../hooks/useRestore';
import type { RestoreFailure, Restorer } from '../hooks/useRestore';
import { useFollowActiveFile, useTimelineState } from '../hooks/useTimeline';
import { whenOf } from '../lib/entries';
import { timelineStore } from '../store/timeline.store';
import type { TimelineMode } from '../store/timeline.store';
import { DeletedFiles } from './DeletedFiles';
import { FileVersions } from './FileVersions';
import { RestoreDialog } from './RestoreDialog';
import { TimelineHelp } from './TimelineHelp';

export interface TimelineProps {
  /** The real path of the folder of the tab. */
  readonly folder: string;
}

/** Why a restore was refused, in the words of a restore — the server's sentence otherwise. */
const REFUSALS: Readonly<Record<string, string>> = {
  FILE_CHANGED: 'fileHistory.restore.changed',
  FILE_EXISTS: 'fileHistory.restore.taken',
};

/**
 * The Timeline of the Explorer (plan 07, B-59) — the local history, and only it (no git): the
 * versions of the editor's active file that a save, a delete, a restore or an upload would have lost,
 * with why, who and when; compared with the file now or with each other, and restored; and the files
 * deleted from the folder recently, which no longer exist and can come back.
 *
 * Closed, it reads nothing. Its commands reach it from the palette (`fileHistory.*`).
 */
export function Timeline({ folder }: TimelineProps): React.JSX.Element {
  const { t } = useTranslation();
  const open = useTimelineState(folder, (state) => state.open);
  const focusRequest = useTimelineState(folder, (state) => state.focusRequest);
  const restorer = useRestore(folder);
  const toggle = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  const store = timelineStore(folder).getState();

  useFollowActiveFile(folder);

  useEffect(() => {
    if (focusRequest > 0) {
      toggle.current?.focus();
    }
  }, [focusRequest]);

  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <section
      aria-label={t('fileHistory.timeline.title')}
      className="flex max-h-[45%] shrink-0 flex-col border-t border-border"
    >
      <div className="flex items-center justify-between gap-1 px-1">
        <button
          ref={toggle}
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-h-touch flex-1 items-center gap-1 text-left text-ui-sm font-ui-strong tracking-wide uppercase md:min-h-7"
          onClick={() => {
            store.setOpen(!open);
          }}
        >
          <Chevron className="size-4" aria-hidden />
          {t('fileHistory.timeline.title')}
        </button>
        <IconButton
          icon={CircleHelp}
          label={t('fileHistory.action.help')}
          onClick={() => {
            store.setHelpOpen(true);
          }}
        />
      </div>
      {open && (
        <div id={bodyId} className="min-h-0 overflow-auto">
          <TimelineBody folder={folder} restorer={restorer} />
        </div>
      )}
      <RestoreDialog folder={folder} restorer={restorer} />
      <TimelineHelp folder={folder} />
    </section>
  );
}

function TimelineBody({
  folder,
  restorer,
}: {
  readonly folder: string;
  readonly restorer: Restorer;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const mode = useTimelineState(folder, (state) => state.mode);
  const restored = restorer.restored;

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {restored === null
          ? ''
          : t('fileHistory.restore.done', {
              path: restored.path,
              when: whenOf(restored.at, i18n.language),
            })}
      </p>
      {restorer.failure !== null && (
        <Refusal failure={restorer.failure} onDismiss={restorer.dismiss} />
      )}
      <Tabs
        value={mode}
        onValueChange={(value) => {
          timelineStore(folder)
            .getState()
            .setMode(value as TimelineMode);
        }}
      >
        <TabsList aria-label={t('fileHistory.timeline.modes')} className="px-1">
          <TabsTrigger value="file">{t('fileHistory.timeline.thisFile')}</TabsTrigger>
          <TabsTrigger value="deleted">{t('fileHistory.timeline.recentlyDeleted')}</TabsTrigger>
        </TabsList>
        <TabsContent value="file">
          <FileVersions folder={folder} restorer={restorer} />
        </TabsContent>
        <TabsContent value="deleted">
          <DeletedFiles folder={folder} restorer={restorer} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** A restore that did not go: why, in a restore's words, with its trace. */
function Refusal({
  failure,
  onDismiss,
}: {
  readonly failure: RestoreFailure;
  onDismiss(): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { error, path } = failure;

  return (
    <div role="alert" className="flex items-start gap-2 px-2 py-1 text-ui-sm text-destructive">
      <div className="flex min-w-0 flex-1 flex-col">
        <p>{t(REFUSALS[error.code] ?? error.messageKey, { ...error.params, path })}</p>
        <p className="font-code">{t('common.error.traceLabel', { traceId: error.traceId })}</p>
      </div>
      <IconButton icon={X} label={t('fileHistory.restore.dismiss')} onClick={onDismiss} />
    </div>
  );
}

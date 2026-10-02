import { useTranslation } from 'react-i18next';

import { useScreenShortcuts } from '@/features/commands';
import { HelpSheet } from '@/shared/components/HelpSheet';
import { TIMELINE_COMMANDS } from '../hooks/useFileHistoryCommands';
import { useHistoryCeiling, useTimelineState } from '../hooks/useTimeline';
import { timelineStore } from '../store/timeline.store';

/** The parts of the Timeline's help — every one in `en` and `pt-BR` (S-351). */
export const TIMELINE_HELP_PARTS = [
  'fileHistory.help.what',
  'fileHistory.help.states',
  'fileHistory.help.notRecorded',
  'fileHistory.help.limits',
] as const;

/** A size in megabytes, as the help says the ceiling. */
function megabytes(bytes: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / 1_048_576);
}

/**
 * The help of the Timeline, for somebody who has never seen it (B-60): what is kept and what is not
 * — Claude's writes are not, they are undone from its session —, the ceiling of a version (read from
 * the installation's limits) and how long versions last, and that this is neither git nor Claude's
 * undo; with its shortcuts, from the registry.
 */
export function TimelineHelp({ folder }: { readonly folder: string }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const open = useTimelineState(folder, (state) => state.helpOpen);
  const shortcuts = useScreenShortcuts(TIMELINE_COMMANDS);
  const ceiling = useHistoryCeiling();
  const size =
    ceiling === null
      ? t('fileHistory.help.sizeUnknown')
      : t('fileHistory.help.size', { megabytes: megabytes(ceiling, i18n.language) });

  return (
    <HelpSheet
      title={t('fileHistory.screen.title')}
      purpose={t('fileHistory.screen.purpose')}
      help="fileHistory.help"
      shortcuts={shortcuts}
      own={{ open, onOpenChange: timelineStore(folder).getState().setHelpOpen }}
      extra={[
        {
          id: 'limits',
          heading: t('fileHistory.help.limitsHeading'),
          body: <p>{t('fileHistory.help.limits', { size })}</p>,
        },
      ]}
    />
  );
}

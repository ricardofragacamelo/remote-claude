import { useTranslation } from 'react-i18next';

import { useScreenShortcuts } from '@/features/commands';
import { HelpSheet } from '@/shared/components/HelpSheet';

/** The commands the help lists — read from the registry, never written twice. */
const HELP_SHORTCUTS = [
  'workbench.toggleSecondarySideBar',
  'claude.newConversation',
  'claude.focusComposer',
  'claude.interrupt',
  'claude.nextConversation',
  'claude.previousConversation',
  'session.showChanges',
] as const;

/**
 * The help of the panel of Claude and of its changes (plan 08, B-43), for somebody who has never seen
 * the product: what each mode stops asking, the queue, editing and sending again — and that the files
 * do not go back on their own —, accepting against rejecting and what rejecting keeps, the meter and
 * `/compact`, and what is never recorded. Since F5, the composer too (B-52): what `@` and `/` do, what
 * dragging from each place does, the set of context and its estimate, what Claude reads and what goes
 * to the trail, what a file of the desktop becomes, and where the skills come from.
 */
export function PanelHelp({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  onOpenChange(open: boolean): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const shortcuts = useScreenShortcuts(HELP_SHORTCUTS);
  const topics = [
    'modes',
    'queue',
    'composer',
    'mention',
    'commands',
    'drag',
    'contextSet',
    'reads',
    'desktop',
    'skills',
    'resend',
    'review',
    'context',
    'notices',
  ] as const;

  return (
    <HelpSheet
      title={t('claudePanel.screen.title')}
      purpose={t('claudePanel.screen.purpose')}
      help="claudePanel.help"
      shortcuts={shortcuts}
      own={{ open, onOpenChange }}
      extra={topics.map((topic) => ({
        id: topic,
        heading: t(`claudePanel.help.${topic}Heading`),
        body: t(`claudePanel.help.${topic}`),
      }))}
    />
  );
}

import { useTranslation } from 'react-i18next';

import { useScreenShortcuts } from '@/features/commands';
import { HelpSheet } from '@/shared/components/HelpSheet';
import type { SessionsView } from '../../hooks/useSessionsView';

/** The commands the help lists — read from the registry, never written twice. */
const HELP_SHORTCUTS = [
  'sessions.refresh',
  'sessions.toggleSubfolders',
  'sessions.openSelected',
  'sessions.continueSelected',
  'sessions.copySelectedId',
  'sessions.endSelected',
] as const;

/**
 * The help of the view, for somebody who has never seen the product (S-55): what the three groups
 * are, what "ours" and "begun elsewhere" mean and where the origin comes from, why continuing one
 * begun elsewhere makes a new id, why "active elsewhere" is an estimate, and why the ceiling of
 * sessions is the installation's.
 */
export function SessionsHelp({ view }: { readonly view: SessionsView }): React.JSX.Element {
  const { t } = useTranslation();
  const shortcuts = useScreenShortcuts(HELP_SHORTCUTS);

  return (
    <HelpSheet
      title={t('sessions.screen.title')}
      purpose={t('sessions.screen.purpose')}
      help="sessions.help"
      shortcuts={shortcuts}
      own={{ open: view.state.helpOpen, onOpenChange: view.state.setHelpOpen }}
      extra={[
        {
          id: 'groups',
          heading: t('sessions.help.groupsHeading'),
          body: t('sessions.help.groups'),
        },
        {
          id: 'origin',
          heading: t('sessions.help.originHeading'),
          body: t('sessions.help.origin'),
        },
        { id: 'fork', heading: t('sessions.help.forkHeading'), body: t('sessions.help.fork') },
        {
          id: 'elsewhere',
          heading: t('sessions.help.elsewhereHeading'),
          body: t('sessions.help.elsewhere'),
        },
        { id: 'limit', heading: t('sessions.help.limitHeading'), body: t('sessions.help.limit') },
      ]}
    />
  );
}

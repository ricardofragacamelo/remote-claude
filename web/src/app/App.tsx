import { Navigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useWorkbenchTarget } from '@/features/workbench';
import { useOpenFolders, WelcomeScreen } from '@/features/workspace';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useOpenFolder } from './navigation';
import { ScreenLoading } from './ScreenLoading';
import { useShellShortcuts } from './screen-shortcuts';

/**
 * `/` — the active folder tab, when one is open; the welcome screen otherwise
 * ([06 · D-07](../../../docs/plans/06-workbench/decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas)),
 * as the editor people know opens the last folder or its welcome page.
 *
 * The home holds nothing else any more: the ping went to Logs and diagnostics, the devices to a
 * screen of their own, and a session is born in the workbench, in the folder it names (plan 06,
 * B-33). It waits for the set of tabs before deciding — a glimpse of the welcome screen on the way to
 * a tab would be a screen that lied for a moment — and **replaces** the address, so going back does
 * not bounce between `/` and the tab. A set of tabs that could not be read is not a reason to keep
 * anybody out: the welcome screen opens.
 */
export function App(): React.JSX.Element {
  const { t } = useTranslation();
  const { isLoading } = useOpenFolders();
  const target = useWorkbenchTarget(true);
  const openFolder = useOpenFolder();
  const shortcuts = useShellShortcuts(['workspace.openFolder']);

  if (isLoading) {
    return <ScreenLoading label={t('workspace.welcome.loading')} />;
  }

  if (target !== null) {
    return <Navigate to="/workbench" search={{ folder: target }} replace />;
  }

  return (
    <ScreenFrame
      title={t('workspace.welcome.title')}
      purpose={t('workspace.welcome.purpose')}
      help="workspace.welcomeHelp"
      shortcuts={shortcuts}
    >
      <WelcomeScreen onOpen={openFolder} />
    </ScreenFrame>
  );
}

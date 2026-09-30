import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { CircleHelp, PanelBottom, PanelLeft, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useScreenShortcuts, useShortcut } from '@/features/commands';
import { useFolderDialog } from '@/features/workspace';
import { useCopy } from '@/shared/hooks/useCopy';
import type { CopyState } from '@/shared/hooks/useCopy';
import { HelpSheet } from '@/shared/components/HelpSheet';
import { IconButton } from '@/shared/components/IconButton';
import { LearnMore } from '@/shared/components/LearnMore';
import { useHelpPanel } from '@/shared/hooks/useHelpPanel';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { useFolderTab } from '../hooks/useFolderTab';
import { useFolderTabs } from '../hooks/useFolderTabs';
import type { FolderTabs, FolderTabsRoutes } from '../hooks/useFolderTabs';
import { useWorkbenchCommands } from '../hooks/useWorkbenchCommands';
import { CloseFoldersDialog } from './CloseFoldersDialog';
import { FolderTabSelector } from './FolderTabSelector';
import { FolderTabStrip } from './FolderTabStrip';
import { StatusBar } from './StatusBar';

export interface WorkbenchProps extends FolderTabsRoutes {
  /**
   * What a folder tab shows — the host's to compose, since resolving a folder and chatting with
   * Claude belong to other features. Called for the active tab only: a tab that is not on screen has
   * no tree (plan 06, S-108).
   */
  renderFolder(path: string): ReactNode;
}

/** The shortcuts the help of the workbench lists — read from the registry, never written twice. */
const SHORTCUTS = [
  'palette.show',
  'help.show',
  'workspace.openFolder',
  'workbench.nextFolderTab',
  'workbench.previousFolderTab',
  'workbench.toggleSideBar',
  'workbench.togglePanel',
] as const;

/**
 * The workbench: the folder tabs, the one on screen, and the status bar.
 *
 * Each tab is a whole workbench of one folder, several open at once. The set and the order are the
 * server's; the active one is the URL's; everything inside a tab is the tab's own
 * (docs/architecture/web/03-ui-system.md#abas-de-pasta). While it is on screen, the commands of the
 * tabs are in the palette, the File menu and on their shortcuts — and its help is a sheet over the
 * tab, from its button or `Shift+F1`, since the tab has no screen frame to hold one (plan 06, B-34).
 */
export function Workbench({ renderFolder, ...routes }: WorkbenchProps): React.JSX.Element {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const control = useFolderTabs(routes);
  const copier = useCopy();
  const showFolderDialog = useFolderDialog((state) => state.show);
  const notice = noticeOf(control, copier.state);
  const shortcuts = useScreenShortcuts(SHORTCUTS);
  const showHelp = useHelpPanel((state) => state.show);

  useWorkbenchCommands(control);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="flex h-header shrink-0 items-stretch border-b border-border bg-sidebar">
        {desktop ? (
          <FolderTabStrip control={control} copyPath={copier.copy} />
        ) : (
          <FolderTabSelector control={control} copyPath={copier.copy} />
        )}
        <div className="flex items-center gap-0.5 px-1">
          <IconButton
            icon={Plus}
            label={t('workbench.tabs.open')}
            onClick={() => {
              showFolderDialog();
            }}
          />
          {desktop && <LayoutToggles folder={control.active} />}
          <IconButton
            icon={CircleHelp}
            label={t('help.panel.open')}
            onClick={() => {
              showHelp();
            }}
          />
        </div>
      </header>

      {notice !== null && (
        <div
          role="status"
          className="flex shrink-0 flex-wrap items-center gap-x-3 border-b border-border px-3 py-1 text-ui-sm"
        >
          <p>{t(notice.key, notice.params)}</p>
          {notice.aboutTabs && <LearnMore section="states" topic={t('help.topic.tabLimit')} />}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <Fragment key={control.active}>{renderFolder(control.active)}</Fragment>
      </div>

      <StatusBar tab={control.current} />

      <CloseFoldersDialog control={control} />
      <HelpSheet
        title={t('workbench.screen.title')}
        purpose={t('workbench.screen.purpose')}
        help="workbench.help"
        shortcuts={shortcuts}
      />
    </div>
  );
}

/** A line said above the tab on screen: a refused move of the tabs, or how a copy went. */
interface Notice {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;

  /** It is about the ceiling of tabs — where the help has more to say. */
  readonly aboutTabs: boolean;
}

/** The outcome of a copy, named in full so the i18n check sees each key. */
const COPY_RESULTS: Readonly<Record<Exclude<CopyState, 'idle'>, string>> = {
  copied: 'workbench.tabCopy.copied',
  failed: 'workbench.tabCopy.failed',
};

/**
 * What to say above the tab on screen — a refusal the tabs had that no dialog is showing, or the
 * outcome of copying a path. Nothing, otherwise.
 */
function noticeOf(control: FolderTabs, copied: CopyState): Notice | null {
  if (control.failure !== null && control.closing === null) {
    return {
      key: control.failure.messageKey,
      params: control.failure.params,
      aboutTabs: control.failure.code === 'OPEN_FOLDERS_LIMIT_REACHED',
    };
  }

  return copied === 'idle' ? null : { key: COPY_RESULTS[copied], params: {}, aboutTabs: false };
}

/** Opens and closes the side bar and the bottom panel of the tab on screen. */
function LayoutToggles({ folder }: { readonly folder: string }): React.JSX.Element {
  const { t } = useTranslation();
  const tab = useFolderTab(folder);
  const sideBarKeys = useShortcut('workbench.toggleSideBar');
  const panelKeys = useShortcut('workbench.togglePanel');

  return (
    <>
      <IconButton
        icon={PanelLeft}
        label={t('workbench.layout.sideBar')}
        aria-pressed={tab.sideBarOpen}
        aria-keyshortcuts={sideBarKeys?.aria}
        onClick={tab.toggleSideBar}
      />
      <IconButton
        icon={PanelBottom}
        label={t('workbench.layout.panel')}
        aria-pressed={tab.panelOpen}
        aria-keyshortcuts={panelKeys?.aria}
        onClick={tab.togglePanel}
      />
    </>
  );
}

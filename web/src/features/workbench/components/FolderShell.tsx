import type { ReactNode } from 'react';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/shared/components/ui/resizable';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/lib/utils';
import { useActiveView } from '../hooks/useActiveView';
import { useFolderTab } from '../hooks/useFolderTab';
import { useWorkbenchLayout } from '../hooks/useWorkbenchLayout';
import { columnsOf, EDITOR_MIN, LAYOUT_LIMITS, rowsOf } from '../hooks/workbench-layout';
import type { SizeLimit } from '../hooks/workbench-layout';
import type { MobileView } from '../types/workbench';
import { ActivityBar } from './ActivityBar';
import { BottomPanel } from './BottomPanel';
import { EditorArea } from './EditorArea';
import { MobileViewBar } from './MobileViewBar';
import { SecondarySideBar } from './SecondarySideBar';
import { SideBar } from './SideBar';

export interface FolderShellProps {
  /** The real path of the folder of the tab. */
  readonly folder: string;

  /** The chat with Claude for this folder — the host's to compose. */
  readonly claude: ReactNode;
}

/** A size limit as the panel library reads it: a string with no unit is a percentage. */
function bounds(limit: Pick<SizeLimit, 'min' | 'max'>): { minSize: string; maxSize: string } {
  return { minSize: String(limit.min), maxSize: String(limit.max) };
}

/**
 * The workbench of one folder, in the anatomy of the editor people know.
 *
 * From `md` up, **everything at the same time**: the activity bar, the side bar with its view, the
 * editor over the bottom panel, and the chat with Claude beside them — the files and the
 * conversation about them in the same tab (plan 06, S-116). Every part resizes within its limits,
 * and the sizes are this browser's, per folder (S-113).
 *
 * Below `md`, one view at a time, switched by a bar at the bottom — still the same tab and the same
 * store, so changing the width of the window loses nothing (S-117, S-118).
 */
export function FolderShell({ folder, claude }: FolderShellProps): React.JSX.Element {
  const desktop = useIsDesktop();

  return desktop ? (
    <DesktopShell folder={folder} claude={claude} />
  ) : (
    <PhoneShell folder={folder} claude={claude} />
  );
}

/** The panels side by side. */
function DesktopShell({ folder, claude }: FolderShellProps): React.JSX.Element {
  const tab = useFolderTab(folder);
  const view = useActiveView(tab.view);
  const { layout, columnsChanged, rowsChanged } = useWorkbenchLayout(folder);

  return (
    <div className="flex min-h-0 flex-1">
      <ActivityBar
        folder={folder}
        view={view.id}
        sideBarOpen={tab.sideBarOpen}
        onPick={tab.pickView}
      />

      {/* Keyed by which panels there are: the library lays a group out once, from its default. */}
      <ResizablePanelGroup
        key={`${String(tab.sideBarOpen)}:${String(tab.secondaryOpen)}`}
        orientation="horizontal"
        defaultLayout={columnsOf(layout, tab.sideBarOpen, tab.secondaryOpen)}
        onLayoutChanged={columnsChanged}
      >
        {tab.sideBarOpen && (
          <>
            <ResizablePanel id="sideBar" {...bounds(LAYOUT_LIMITS.sideBar)}>
              <SideBar folder={folder} view={view} />
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}

        <ResizablePanel id="center" minSize={String(EDITOR_MIN)}>
          {tab.panelOpen ? (
            <ResizablePanelGroup
              orientation="vertical"
              defaultLayout={rowsOf(layout)}
              onLayoutChanged={rowsChanged}
            >
              <ResizablePanel id="editor" minSize="20">
                <EditorArea folder={folder} />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="panel" {...bounds(LAYOUT_LIMITS.panel)}>
                <BottomPanel folder={folder} />
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <EditorArea folder={folder} />
          )}
        </ResizablePanel>

        {/* Hidden, the chat keeps everything: its state is the tab's, never the panel's (B-32). */}
        {tab.secondaryOpen && (
          <>
            <ResizableHandle />
            <ResizablePanel id="secondary" {...bounds(LAYOUT_LIMITS.secondary)}>
              <SecondarySideBar>{claude}</SecondarySideBar>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}

/** One view at a time, and the bar that switches it. */
function PhoneShell({ folder, claude }: FolderShellProps): React.JSX.Element {
  const tab = useFolderTab(folder);
  const view = useActiveView(tab.view);

  const screens: Readonly<Record<MobileView, ReactNode>> = {
    explorer: (
      <div className="flex min-h-0 flex-1 flex-col">
        <ActivityBar
          folder={folder}
          view={view.id}
          sideBarOpen
          onPick={tab.showView}
          orientation="horizontal"
        />
        <SideBar folder={folder} view={view} />
      </div>
    ),
    editor: <EditorArea folder={folder} />,
    claude: <SecondarySideBar>{claude}</SecondarySideBar>,
    panel: <BottomPanel folder={folder} />,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The chat scrolls its own conversation, and its box stays above the bar (plan 09, B-04). */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          tab.mobileView === 'claude' ? 'overflow-hidden' : 'overflow-y-auto',
        )}
      >
        {screens[tab.mobileView]}
      </div>
      <MobileViewBar view={tab.mobileView} onPick={tab.showMobile} />
    </div>
  );
}

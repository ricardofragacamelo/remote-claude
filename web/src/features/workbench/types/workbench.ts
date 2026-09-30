import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

import type { RegistryEntry } from '@/shared/lib/registry';

/** Whether a folder tab can still be used, as the server revalidated it. */
export type FolderTabState = 'available' | 'notAllowed' | 'missing';

/** One folder tab — a whole workbench of one folder. */
export interface FolderTab {
  /** The real path, as the server keeps it. */
  readonly path: string;

  /** The last segment of the path — what a person calls the folder. */
  readonly name: string;

  /** The label of the root it lives under, or `null` once it lives under none. */
  readonly rootLabel: string | null;
  readonly state: FolderTabState;

  /**
   * Whether the server keeps it among the tabs. A folder the address opened is on screen before the
   * server has it — and stays unkept when the server refused it, past the ceiling of tabs.
   */
  readonly kept: boolean;
}

/** The views under `md`: one at a time, all inside the same folder tab (06 · D-08). */
export const MOBILE_VIEWS = ['explorer', 'editor', 'claude', 'panel'] as const;

export type MobileView = (typeof MOBILE_VIEWS)[number];

/** What a component placed in the workbench of one folder is given. */
export interface FolderViewProps {
  /** The real path of the folder of the tab. */
  readonly folder: string;
}

/**
 * A view of the activity bar — Explorer, Search, Claude's sessions.
 *
 * Plan 06 holds the places with placeholders; the plan that fills one registers the same id with
 * its component (plans 07, 09 and 08).
 */
export interface ViewEntry extends RegistryEntry {
  /** A translation key, named in full where the entry is declared. */
  readonly labelKey: string;
  readonly icon: LucideIcon;

  /** Absent while the place is only held: the side bar then says what will live there. */
  readonly component?: ComponentType<FolderViewProps>;

  /** The key of what the side bar says while there is no component — named in full. */
  readonly placeholderKey: string;
}

/** A tab of the bottom panel — plans 08 and 10 register theirs. */
export interface PanelTabEntry extends RegistryEntry {
  readonly labelKey: string;
  readonly component: ComponentType<FolderViewProps>;
}

/** What an item of the status bar is shown with. */
export interface StatusItemProps {
  /** The tab on screen. */
  readonly tab: FolderTab;
}

/**
 * An item of the status bar: the folder's at the left, the app's at the right. The shell draws its
 * own (the folder, the connection, the language, the theme); anybody else registers theirs.
 */
export interface StatusItemEntry extends RegistryEntry {
  readonly side: 'left' | 'right';
  readonly component: ComponentType<StatusItemProps>;
}

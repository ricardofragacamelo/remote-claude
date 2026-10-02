import { Files, MessagesSquare, Search } from 'lucide-react';

import { createRegistry } from '@/shared/lib/registry';
import type {
  EditorAreaEntry,
  FolderTabBadgeEntry,
  FolderTabKeeper,
  PanelTabEntry,
  StatusItemEntry,
  ViewEntry,
} from '../types/workbench';

/**
 * The places of the activity bar, held by plan 06 until the plan that fills each registers it:
 * Explorer (plan 07), Search (plan 09) and Claude's sessions (plan 08). A held place is on screen
 * with a placeholder that says what will live there — never an empty side bar
 * (docs/architecture/web/03-ui-system.md#os-registros--onde-os-planos-seguintes-encaixam).
 */
export const HELD_VIEWS: readonly [ViewEntry, ...ViewEntry[]] = [
  {
    id: 'explorer',
    position: 100,
    labelKey: 'workbench.explorer.label',
    icon: Files,
    placeholder: true,
    placeholderKey: 'workbench.explorer.placeholder',
  },
  {
    id: 'search',
    position: 200,
    labelKey: 'workbench.search.label',
    icon: Search,
    placeholder: true,
    placeholderKey: 'workbench.search.placeholder',
  },
  {
    id: 'sessions',
    position: 300,
    labelKey: 'workbench.sessions.label',
    icon: MessagesSquare,
    placeholder: true,
    placeholderKey: 'workbench.sessions.placeholder',
  },
];

/** The views of the activity bar. */
export const workbenchViews = createRegistry<ViewEntry>('workbench views', HELD_VIEWS);

/** The tabs of the bottom panel — none until plans 08 and 10 register theirs. */
export const panelTabs = createRegistry<PanelTabEntry>('panel tabs');

/** The items of the status bar besides the shell's own. */
export const statusBarItems = createRegistry<StatusItemEntry>('status bar items');

/** What fills the editor area — the editor of plan 07 registers itself at load. */
export const editorAreas = createRegistry<EditorAreaEntry>('editor areas');

/** What features keep per folder tab that closing it would lose — asked before a tab closes. */
export const folderTabKeepers = createRegistry<FolderTabKeeper>('folder tab keepers');

/** What a folder tab says beside its name — Claude's questions waiting there (plan 08, B-42). */
export const folderTabBadges = createRegistry<FolderTabBadgeEntry>('folder tab badges');

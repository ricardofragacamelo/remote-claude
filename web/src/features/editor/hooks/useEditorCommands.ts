import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  BookOpen,
  CaseSensitive,
  Columns2,
  FileDiff,
  FileInput,
  History,
  ListOrdered,
  MessageSquarePlus,
  PanelLeftClose,
  Redo2,
  Replace,
  RotateCcw,
  Save,
  SaveAll,
  Search,
  Undo2,
  WrapText,
  X,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import type { ComponentType } from 'react';
import type { ChoiceOption } from '../store/choice.store';
import type { CodeView, ViewCapabilities } from '../types/code-editor';

import { commandRegistry, executeCommand, useCommands, usePalette } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';
import { claudeContextTargets } from '@/shared/lib/files-drag';
import { activeGroupOf, activeTabOf } from '../lib/layout';
import { editorStoreOf, isDirty } from '../store/editor.store';
import { useEditorUi } from '../store/ui.store';
import {
  encodingChoices,
  eolChoices,
  indentationChoices,
  languageChoices,
  offerChoice,
} from './choices';
import { reloadFromDisk } from './documents';
import { previewCommands } from './preview-commands';
import { save, saveAll } from './saving';
import {
  activeFileOf,
  closeTabs,
  focusGroup,
  openDiff,
  openFile,
  reopenClosed,
  tabsToClose,
} from './tabs';
import { addFileToClaude } from './text-actions';
import { activeView, focusEditor } from './views';

/** The palette's mode for the files opened last in the folder tab. */
export const RECENT_FILES_MODE = 'recentFiles';

/** The command "Reveal in explorer" runs — the explorer registers it; the editor never imports it. */
export const REVEAL_IN_EXPLORER = 'explorer.revealActiveFile';

/** The shortcuts the help of the editor lists — read from the registry, never written twice. */
export const EDITOR_SHORTCUTS = [
  'editor.save',
  'editor.saveAs',
  'editor.saveAll',
  'editor.reopenClosed',
  'editor.openToSide',
  'editor.openPreview',
  'editor.openPreviewToSide',
  'editor.focusNextGroup',
  'editor.focusPreviousGroup',
  'editor.find',
  'editor.replace',
  'editor.goToLine',
  'editor.addToClaude',
] as const;

/** What the commands read of the editor of a folder, now. */
function reader(folder: string) {
  const state = () => editorStoreOf(folder).getState();
  const path = () => activeFileOf(state());
  const doc = () => {
    const active = path();
    return active === null ? undefined : state().docs[active];
  };
  const ready = () => doc()?.status === 'ready' && doc()?.model !== null;
  const tab = () => {
    const group = activeGroupOf(state());
    const active = activeTabOf(group);
    return active === undefined ? null : { group: group.id, id: active.id };
  };

  /** Runs on the file on screen — nothing while there is none. */
  const withPath = (run: (active: string) => void) => () => {
    const active = path();
    if (active !== null) run(active);
  };

  return { state, path, doc, ready, tab, withPath };
}

type Reader = ReturnType<typeof reader>;

function fileCommands(
  folder: string,
  read: Reader,
  recentMenu: ComponentType,
): CommandDeclaration[] {
  const { withPath } = read;

  return [
    {
      id: 'editor.save',
      labelKey: 'command.editor.save',
      category: 'file',
      icon: Save,
      fileMenu: { group: 'save', order: 100 },
      when: () => read.ready(),
      run: withPath((path) => void save(folder, path)),
      keys: [{ key: 'Mod+S', context: 'workbench', allowInInput: true }],
    },
    {
      id: 'editor.saveAs',
      labelKey: 'command.editor.saveAs',
      category: 'file',
      icon: FileInput,
      fileMenu: { group: 'save', order: 200 },
      when: () => read.ready(),
      run: withPath((path) => {
        editorStoreOf(folder).setState({ saveAs: { path, taken: null, failure: null } });
      }),
      keys: [{ key: 'Mod+Shift+S', context: 'workbench', allowInInput: true }],
    },
    {
      id: 'editor.saveAll',
      labelKey: 'command.editor.saveAll',
      category: 'file',
      icon: SaveAll,
      fileMenu: { group: 'save', order: 300 },
      when: () => Object.values(read.state().docs).some(isDirty),
      run: () => saveAll(folder).then(() => undefined),
      keys: [{ key: 'Mod+K S', context: 'workbench', allowInInput: true }],
    },
    {
      id: 'editor.revert',
      labelKey: 'command.editor.revert',
      category: 'file',
      icon: RotateCcw,
      fileMenu: { group: 'save', order: 400 },
      when: () => read.ready() && isDirty(read.doc()),
      run: withPath((path) => void reloadFromDisk(folder, path)),
    },
    {
      id: 'editor.compareWithSaved',
      labelKey: 'command.editor.compareWithSaved',
      category: 'file',
      icon: FileDiff,
      when: () => read.ready() && isDirty(read.doc()),
      run: withPath((path) => {
        openDiff(folder, { path, source: 'disk' }, { path, source: 'buffer' });
      }),
    },
    {
      id: 'editor.openRecentFile',
      labelKey: 'command.editor.openRecentFile',
      category: 'file',
      icon: History,
      fileMenu: { group: 'open', order: 300, submenu: recentMenu },
      when: () => read.state().recent.length > 0,
      run: () => {
        usePalette.getState().show(RECENT_FILES_MODE);
      },
    },
  ];
}

function tabCommands(folder: string, read: Reader): CommandDeclaration[] {
  const close = (which: 'others' | 'saved' | 'all') => () => {
    const tab = read.tab();
    if (tab !== null)
      closeTabs(folder, tab.group, tabsToClose(read.state(), tab.group, tab.id, which));
  };

  return [
    {
      id: 'editor.closeTab',
      labelKey: 'command.editor.closeTab',
      category: 'file',
      icon: X,
      fileMenu: { group: 'close', order: 100 },
      when: () => read.tab() !== null,
      run: () => {
        const tab = read.tab();
        if (tab !== null) closeTabs(folder, tab.group, [tab.id]);
      },
    },
    {
      id: 'editor.closeOthers',
      labelKey: 'command.editor.closeOthers',
      category: 'file',
      icon: PanelLeftClose,
      when: () => read.tab() !== null,
      run: close('others'),
    },
    {
      id: 'editor.closeSaved',
      labelKey: 'command.editor.closeSaved',
      category: 'file',
      icon: PanelLeftClose,
      when: () => read.tab() !== null,
      run: close('saved'),
    },
    {
      id: 'editor.closeAll',
      labelKey: 'command.editor.closeAll',
      category: 'file',
      icon: PanelLeftClose,
      fileMenu: { group: 'close', order: 150 },
      when: () => read.tab() !== null,
      run: close('all'),
    },
    {
      id: 'editor.reopenClosed',
      labelKey: 'command.editor.reopenClosed',
      category: 'file',
      icon: History,
      when: () => read.state().closed.length > 0,
      run: () => {
        reopenClosed(folder);
      },
      keys: [{ key: 'Mod+Shift+T', context: 'workbench', allowInInput: true }],
    },
    {
      id: 'editor.openToSide',
      labelKey: 'command.editor.openToSide',
      category: 'view',
      icon: Columns2,
      when: () => read.path() !== null,
      run: () => {
        const path = read.path();
        if (path !== null) openFile(folder, path, { toSide: true });
      },
      keys: [{ key: 'Mod+\\', context: 'workbench', allowInInput: true }],
    },
    focusCommand(folder, 'editor.focusNextGroup', 'command.editor.focusNextGroup', 1, read),
    focusCommand(
      folder,
      'editor.focusPreviousGroup',
      'command.editor.focusPreviousGroup',
      -1,
      read,
    ),
  ];
}

/** The focus to the group beside, by the keyboard (S-268) — `Ctrl+K Ctrl+→` or `←`. */
function focusCommand(
  folder: string,
  id: string,
  labelKey: string,
  by: -1 | 1,
  read: Reader,
): CommandDeclaration {
  return {
    id,
    labelKey,
    category: 'view',
    icon: ArrowLeftRight,
    when: () => read.state().groups.length > 1,
    run: () => {
      focusGroup(folder, by);
      focusEditor(folder);
    },
    keys: [
      {
        key: by === 1 ? 'Mod+K Mod+ArrowRight' : 'Mod+K Mod+ArrowLeft',
        context: 'workbench',
        allowInInput: true,
      },
    ],
  };
}

/** A command the editor of the screen does itself — find, replace, go to line (B-36). */
function viewCommand(
  folder: string,
  declaration: Omit<CommandDeclaration, 'category' | 'when' | 'run'>,
  capability: keyof ViewCapabilities,
  act: (view: CodeView) => void,
  read: Reader,
): CommandDeclaration {
  return {
    ...declaration,
    category: 'go',
    when: () => read.ready() && activeView(folder)?.capabilities[capability] === true,
    run: () => {
      const view = activeView(folder);
      if (view !== null) act(view);
    },
  };
}

/** A command that offers a choice in the palette — the status bar item's (B-37). */
function choiceCommand(
  declaration: Omit<CommandDeclaration, 'when' | 'run'>,
  titleKey: string,
  options: (path: string) => readonly ChoiceOption[],
  read: Reader,
): CommandDeclaration {
  return {
    ...declaration,
    when: () => read.ready(),
    run: read.withPath((path) => {
      offerChoice(titleKey, options(path));
    }),
  };
}

function textCommands(folder: string, read: Reader, t: TFunction): CommandDeclaration[] {
  const model = () => read.doc()?.model;

  return [
    viewCommand(
      folder,
      {
        id: 'editor.find',
        labelKey: 'command.editor.find',
        icon: Search,
        keys: [{ key: 'Mod+F', context: 'workbench' }],
      },
      'find',
      (view) => {
        view.find(false);
      },
      read,
    ),
    viewCommand(
      folder,
      {
        id: 'editor.replace',
        labelKey: 'command.editor.replace',
        icon: Replace,
        keys: [{ key: 'Mod+H', context: 'workbench' }],
      },
      'find',
      (view) => {
        view.find(true);
      },
      read,
    ),
    viewCommand(
      folder,
      {
        id: 'editor.goToLine',
        labelKey: 'command.editor.goToLine',
        icon: ListOrdered,
        keys: [{ key: 'Ctrl+G', mac: 'Ctrl+G', context: 'workbench' }],
      },
      'goToLine',
      (view) => {
        view.goToLine();
      },
      read,
    ),
    {
      id: 'editor.undo',
      labelKey: 'command.editor.undo',
      category: 'go',
      icon: Undo2,
      when: () => model()?.canUndo() === true,
      run: () => model()?.undo(),
    },
    {
      id: 'editor.redo',
      labelKey: 'command.editor.redo',
      category: 'go',
      icon: Redo2,
      when: () => model()?.canRedo() === true,
      run: () => model()?.redo(),
    },
    choiceCommand(
      {
        id: 'editor.changeEol',
        labelKey: 'command.editor.changeEol',
        category: 'preferences',
        icon: WrapText,
      },
      'editor.choice.eol',
      (path) => eolChoices(folder, path),
      read,
    ),
    choiceCommand(
      {
        id: 'editor.changeLanguage',
        labelKey: 'command.editor.changeLanguage',
        category: 'preferences',
        icon: CaseSensitive,
      },
      'editor.choice.language',
      (path) => languageChoices(folder, path, t),
      read,
    ),
    choiceCommand(
      {
        id: 'editor.convertIndentation',
        labelKey: 'command.editor.convertIndentation',
        category: 'preferences',
        icon: WrapText,
      },
      'editor.choice.indentation',
      (path) => indentationChoices(folder, path, t),
      read,
    ),
    choiceCommand(
      {
        id: 'editor.reopenWithEncoding',
        labelKey: 'command.editor.reopenWithEncoding',
        category: 'file',
        icon: FileInput,
      },
      'editor.choice.reopenEncoding',
      (path) => encodingChoices(folder, path, 'reopen'),
      read,
    ),
    choiceCommand(
      {
        id: 'editor.saveWithEncoding',
        labelKey: 'command.editor.saveWithEncoding',
        category: 'file',
        icon: Save,
      },
      'editor.choice.saveEncoding',
      (path) => encodingChoices(folder, path, 'save'),
      read,
    ),
  ];
}

function linkCommands(folder: string, read: Reader, t: TFunction): CommandDeclaration[] {
  return [
    {
      id: 'editor.addToClaude',
      labelKey: 'command.editor.addToClaude',
      category: 'file',
      icon: MessageSquarePlus,
      // Only while somebody takes it: without Claude's panel, the action does not exist (S-276).
      when: () => read.ready() && claudeContextTargets.entries().length > 0,
      run: () => {
        const path = read.path();
        if (path !== null) addFileToClaude(folder, path, activeView(folder)?.selections() ?? []);
      },
      keys: [{ key: 'Mod+K A', context: 'workbench', allowInInput: true }],
    },
    {
      id: 'editor.revealInExplorer',
      labelKey: 'command.editor.revealInExplorer',
      category: 'view',
      icon: Search,
      when: () => read.path() !== null && commandRegistry.command(REVEAL_IN_EXPLORER) !== undefined,
      run: () => executeCommand(REVEAL_IN_EXPLORER, t).then(() => undefined),
    },
    {
      id: 'editor.showHelp',
      labelKey: 'command.editor.showHelp',
      category: 'help',
      icon: BookOpen,
      run: () => {
        useEditorUi.getState().setHelpOpen(true);
      },
    },
  ];
}

/**
 * The commands of the editor of a folder tab, while it is on screen: in the palette with their
 * keys, in the File menu where the editor people know puts them, and on their shortcuts (S-265).
 *
 * The keys that have to work inside the editor — save, save all, the groups — are allowed in it;
 * `Ctrl+W` is the browser's, so closing a tab has no shortcut (06 · D-16).
 *
 * @param recentMenu what File › "Open recent file" opens — declared once, outside the render
 */
export function useEditorCommands(folder: string, recentMenu: ComponentType): void {
  const { t } = useTranslation();
  const read = reader(folder);

  useCommands([
    ...fileCommands(folder, read, recentMenu),
    ...tabCommands(folder, read),
    ...textCommands(folder, read, t),
    ...linkCommands(folder, read, t),
    ...previewCommands(folder),
  ]);
}

import type { TFunction } from 'i18next';
import type { DragEvent, KeyboardEvent } from 'react';
import { Circle, Eye, FileDiff, FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { ContextMenu, ContextMenuTrigger } from '@/shared/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { writeFilesDrag } from '@/shared/lib/files-drag';
import { cn } from '@/shared/lib/utils';
import { activateTab, closeTabs, keepPreview, moveTab } from '../hooks/tabs';
import { useTabState } from '../hooks/useEditor';
import { baseName } from '../lib/paths';
import type { EditorTab as Tab } from '../types/editor';
import { EditorTabMenu } from './EditorTabMenu';

/** The type of an editor tab being dragged — to another place of its strip, or to another group. */
export const EDITOR_TAB_DRAG = 'application/x-remote-claude-editor-tab+json';

/** What a dragged tab carries between the strips of one folder tab. */
export interface DraggedTab {
  readonly folder: string;
  readonly group: string;
  readonly id: string;
}

export interface EditorTabProps {
  readonly folder: string;
  readonly group: string;
  readonly tab: Tab;
  readonly active: boolean;
  onDropped(event: DragEvent<HTMLElement>): void;
}

/** What a tab is called on screen. */
export function tabName(tab: Tab, t: TFunction): string {
  if (tab.kind === 'preview') {
    return t('editor.tab.previewName', { name: baseName(tab.path) });
  }

  return tab.kind === 'file'
    ? baseName(tab.path)
    : t('editor.tab.diffName', { left: baseName(tab.left.path), right: baseName(tab.right.path) });
}

/** The icon of a tab, by what it shows. */
const ICONS = { file: FileText, diff: FileDiff, preview: Eye } as const;

/** How far `Alt+Shift+←/→` moves the tab the keyboard is on (S-213). */
const STEPS: Readonly<Record<string, -1 | 1>> = { ArrowLeft: -1, ArrowRight: 1 };

/** The place a key press moves a tab by — `null` for any other press. */
function stepOf(event: KeyboardEvent<HTMLElement>): -1 | 1 | null {
  return event.altKey && event.shiftKey ? (STEPS[event.key] ?? null) : null;
}

/** The frame of a tab: the line on top of the one on screen. */
function frameOf(active: boolean): string {
  return cn(
    'flex shrink-0 items-center border-r border-t-2 border-border border-t-transparent',
    active && 'border-t-primary bg-tab-active',
  );
}

/** The look of a tab, on screen or not, the way the folder tabs look. */
function lookOf(tab: Tab, active: boolean, deleted: boolean): string {
  return cn(
    'flex h-touch max-w-56 items-center gap-1.5 pr-1 pl-3 text-ui md:h-header',
    active ? 'text-foreground' : 'text-muted-foreground',
    tab.preview && 'italic',
    deleted && 'line-through',
  );
}

/**
 * A drag of a tab carries the tab — for the strips — and, for a file, the file itself as the typed
 * payload towards Claude and as text (S-272, 07 · D-20).
 */
function startDrag(event: DragEvent<HTMLElement>, folder: string, group: string, tab: Tab): void {
  event.dataTransfer.effectAllowed = 'copyMove';
  const dragged: DraggedTab = { folder, group, id: tab.id };
  event.dataTransfer.setData(EDITOR_TAB_DRAG, JSON.stringify(dragged));

  if (tab.kind === 'file') {
    writeFilesDrag(event.dataTransfer, { folder, entries: [{ path: tab.path, kind: 'file' }] });
  }
}

/** What is true of a tab besides its name — said to a screen reader, and in its tooltip. */
function marksOf(tab: Tab, state: ReturnType<typeof useTabState>, t: TFunction): readonly string[] {
  const marks: readonly [boolean, string][] = [
    [tab.preview, 'editor.tab.preview'],
    [tab.pinned, 'editor.tab.pinned'],
    [state.dirty, 'editor.tab.dirty'],
    [state.deleted, 'editor.tab.deleted'],
    [state.light, 'editor.tab.light'],
  ];

  return marks.filter(([on]) => on).map(([, key]) => t(key));
}

/** What a tab does when it is pressed, double-pressed, moved by a key, or dragged. */
function handlersOf(folder: string, group: string, tab: Tab) {
  return {
    onClick: () => {
      activateTab(folder, group, tab.id);
    },
    onDoubleClick: () => {
      keepPreview(folder, group, tab.id);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const by = stepOf(event);

      if (by !== null) {
        event.preventDefault();
        moveTab(folder, group, tab.id, { by });
      }
    },
    onDragStart: (event: DragEvent<HTMLElement>) => {
      startDrag(event, folder, group, tab);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
    },
  };
}

/**
 * One editor tab, as the editor people know draws it: italic while it is the preview (S-209), a dot
 * in the place of the close while dirty (S-210), struck through when the file was deleted on disk,
 * and saying so to a screen reader. It is reordered by dragging **and** from the keyboard, carried
 * to another group by dragging, and dragged towards Claude as the file it shows (S-272).
 */
export function EditorTab({
  folder,
  group,
  tab,
  active,
  onDropped,
}: EditorTabProps): React.JSX.Element {
  const { t } = useTranslation();
  const state = useTabState(folder, tab);
  const name = tabName(tab, t);
  const Icon = ICONS[tab.kind];
  const marks = marksOf(tab, state, t);

  return (
    <li className={frameOf(active)}>
      <ContextMenu>
        <Tooltip>
          <ContextMenuTrigger asChild>
            <TooltipTrigger asChild>
              <button
                aria-label={[name, ...marks].join(', ')}
                aria-current={active ? 'page' : undefined}
                type="button"
                draggable
                className={lookOf(tab, active, state.deleted)}
                {...handlersOf(folder, group, tab)}
                onDrop={onDropped}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{name}</span>
              </button>
            </TooltipTrigger>
          </ContextMenuTrigger>
          <TooltipContent className="flex-col items-start">
            <span className="font-code">{tab.kind === 'diff' ? name : tab.path}</span>
            {marks.map((mark) => (
              <span key={mark}>{mark}</span>
            ))}
          </TooltipContent>
        </Tooltip>
        <EditorTabMenu folder={folder} group={group} tab={tab} dirty={state.dirty} />
      </ContextMenu>
      <TabClose folder={folder} group={group} id={tab.id} name={name} dirty={state.dirty} />
    </li>
  );
}

interface TabCloseProps {
  readonly folder: string;
  readonly group: string;
  readonly id: string;
  readonly name: string;
  readonly dirty: boolean;
}

/** The close of a tab — the dot of unsaved changes in its place, as the editor people know draws it. */
function TabClose({ folder, group, id, name, dirty }: TabCloseProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <IconButton
      icon={dirty ? Circle : X}
      label={dirty ? t('editor.tab.closeDirty', { name }) : t('editor.tab.close', { name })}
      className={cn('mr-1', dirty && '[&_svg]:fill-current')}
      onClick={() => {
        closeTabs(folder, group, [id]);
      }}
    />
  );
}

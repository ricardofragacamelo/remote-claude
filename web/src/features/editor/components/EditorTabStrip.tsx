import type { DragEvent } from 'react';
import { ChevronDown, CircleHelp, Columns2, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import {
  activateTab,
  moveTab,
  moveTabAcross,
  openFile,
  openPreview,
  togglePreview,
} from '../hooks/tabs';
import { canPreview } from '../lib/preview-kinds';
import { useEditorUiState } from '../hooks/useEditorUiState';
import { isDirty } from '../store/editor.store';
import type { EditorGroup } from '../types/editor';
import { useEditorState } from '../hooks/useEditor';
import { EDITOR_TAB_DRAG, EditorTab, tabName } from './EditorTab';
import type { DraggedTab } from './EditorTab';

export interface EditorTabStripProps {
  readonly folder: string;
  readonly group: EditorGroup;

  /** What the group is called — "Group 2" — translated. */
  readonly label: string;
}

/** The tab a drag carries, when it is one of this folder's. */
function draggedFrom(event: DragEvent<HTMLElement>, folder: string): DraggedTab | null {
  try {
    const dragged = JSON.parse(event.dataTransfer.getData(EDITOR_TAB_DRAG)) as DraggedTab;
    return dragged.folder === folder ? dragged : null;
  } catch {
    // Something else was dropped — a file from the desktop, a text: not a tab of this strip.
    return null;
  }
}

/**
 * The tabs of a group, and what is done to them from the strip: a drop puts a dragged tab at the
 * place it landed on — of this group, or carried from another (S-213, S-221). The strip scrolls by
 * itself, never the page, and the list at its end reaches every tab however many there are (S-215).
 */
export function EditorTabStrip({ folder, group, label }: EditorTabStripProps): React.JSX.Element {
  const { t } = useTranslation();
  const docs = useEditorState(folder, (state) => state.docs);
  const { showHelp } = useEditorUiState();
  const activePath = group.tabs.find((tab) => tab.id === group.active);

  const dropAt = (index: number) => (event: DragEvent<HTMLElement>) => {
    const dragged = draggedFrom(event, folder);

    if (dragged === null) {
      return;
    }

    event.preventDefault();

    if (dragged.group === group.id) {
      moveTab(folder, group.id, dragged.id, { index });
    } else {
      moveTabAcross(folder, dragged.group, dragged.id, group.id, index);
    }
  };

  return (
    <div className="flex h-touch shrink-0 items-stretch border-b border-border bg-sidebar md:h-header">
      <nav aria-label={label} className="flex min-w-0 flex-1">
        <ul
          className="flex min-w-0 flex-1 overflow-x-auto"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={dropAt(group.tabs.length)}
        >
          {group.tabs.map((tab, index) => (
            <EditorTab
              key={tab.id}
              folder={folder}
              group={group.id}
              tab={tab}
              active={tab.id === group.active}
              onDropped={(event) => {
                event.stopPropagation();
                dropAt(index)(event);
              }}
            />
          ))}
        </ul>
      </nav>
      <div className="flex items-center gap-0.5 px-1">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('editor.strip.list', { count: group.tabs.length })}
                  className="inline-flex size-touch items-center justify-center rounded-md hover:bg-accent md:size-7"
                >
                  <ChevronDown className="size-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('editor.strip.list', { count: group.tabs.length })}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto">
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            {group.tabs.map((tab) => (
              <DropdownMenuItem
                key={tab.id}
                onSelect={() => {
                  activateTab(folder, group.id, tab.id);
                }}
              >
                {tabName(tab, t)}
                {tab.kind !== 'diff' && isDirty(docs[tab.path]) && (
                  <span className="text-muted-foreground">{t('editor.tab.dirty')}</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {activePath !== undefined && activePath.kind !== 'diff' && canPreview(activePath.path) && (
          <IconButton
            icon={Eye}
            label={t('editor.strip.togglePreview')}
            aria-pressed={activePath.kind === 'preview'}
            onClick={() => {
              togglePreview(folder, group.id, activePath.id);
            }}
          />
        )}
        <IconButton
          icon={Columns2}
          label={t('editor.strip.openToSide')}
          disabled={activePath === undefined || activePath.kind === 'diff'}
          onClick={() => {
            if (activePath?.kind === 'file') {
              openFile(folder, activePath.path, { toSide: true });
            } else if (activePath?.kind === 'preview') {
              openPreview(folder, activePath.path, { toSide: true });
            }
          }}
        />
        <IconButton icon={CircleHelp} label={t('editor.help.open')} onClick={showHelp} />
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';

import type { FolderViewProps } from '@/features/workbench';
import { Button } from '@/shared/components/ui/button';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/lib/utils';
import { focusGroup } from '../hooks/tabs';
import { useDiskChanges, useEditorState } from '../hooks/useEditor';
import { useEditorCommands } from '../hooks/useEditorCommands';
import { useMountedEditor } from '../hooks/useEditorUiState';
import { activeGroupOf } from '../lib/layout';
import { CloseTabsDialog } from './CloseTabsDialog';
import { EditorGroupView } from './EditorGroupView';
import { EditorHelp } from './EditorHelp';
import { EditorNotices } from './EditorNotices';
import { EmptyEditor } from './EmptyEditor';
import { FileQuestions } from './FileQuestions';
import { RecentFilesMenu } from './RecentFilesMenu';
import { SaveAsDialog } from './SaveAsDialog';

/**
 * The editor of a folder tab, in the editor area of the workbench (plan 07, F5): the groups side by
 * side from `md` up (B-33) — one at a time below it, with a selector (S-224) — the questions it asks,
 * and its commands while it is on screen.
 *
 * Everything in it is the folder tab's: switching tabs and coming back finds the same tabs, groups,
 * cursors and unsaved changes (S-263), and coming back revalidates what the disk did meanwhile.
 */
export function EditorWorkspace({ folder }: FolderViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const groups = useEditorState(folder, (state) => state.groups);
  const focused = useEditorState(folder, (state) => activeGroupOf(state).id);

  useMountedEditor(folder);
  useEditorCommands(folder, RecentFilesMenu);
  useDiskChanges(folder);

  const empty = groups.every((group) => group.tabs.length === 0);
  const shown = desktop ? groups : groups.filter((group) => group.id === focused);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <EditorNotices folder={folder} />
      {!desktop && groups.length > 1 && (
        <div
          role="group"
          aria-label={t('editor.group.selector')}
          className="flex shrink-0 gap-1 border-b border-border p-1"
        >
          {groups.map((group, index) => (
            <Button
              key={group.id}
              variant="outline"
              size="touch"
              aria-pressed={group.id === focused}
              className={cn(group.id === focused && 'bg-accent text-accent-foreground')}
              onClick={() => {
                focusGroup(folder, group.id);
              }}
            >
              {t('editor.group.label', { place: index + 1 })}
            </Button>
          ))}
        </div>
      )}
      {empty ? (
        <EmptyEditor folder={folder} />
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1">
          {shown.map((group) => (
            <EditorGroupView
              key={group.id}
              folder={folder}
              group={group}
              place={groups.indexOf(group) + 1}
              focused={group.id === focused}
            />
          ))}
        </div>
      )}
      <CloseTabsDialog folder={folder} />
      <FileQuestions folder={folder} />
      <SaveAsDialog folder={folder} />
      <EditorHelp />
    </div>
  );
}

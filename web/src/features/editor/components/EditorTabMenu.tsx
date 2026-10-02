import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import { commandRegistry, executeCommand } from '@/features/commands';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/shared/components/ui/context-menu';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { claudeContextTargets } from '@/shared/lib/files-drag';
import { tabMenuOf } from '../hooks/tab-menu';
import type { EditorTabAction } from '../hooks/tab-menu';
import { REVEAL_IN_EXPLORER } from '../hooks/useEditorCommands';
import type { EditorTab } from '../types/editor';

export interface EditorTabMenuProps {
  readonly folder: string;
  readonly group: string;
  readonly tab: EditorTab;
  readonly dirty: boolean;
}

/** The menu of an editor tab — its actions in sections, each translated. */
export function EditorTabMenu({
  folder,
  group,
  tab,
  dirty,
}: EditorTabMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const claude = useRegistry(claudeContextTargets).length > 0;
  const reveal =
    commandRegistry.command(REVEAL_IN_EXPLORER) === undefined
      ? null
      : () => {
          void executeCommand(REVEAL_IN_EXPLORER, t);
        };
  const sections = tabMenuOf(tab, { folder, group, dirty, claude, reveal });

  return (
    <ContextMenuContent>
      {sections.map((section, index) => (
        <Fragment key={section[0]?.id}>
          {index > 0 && <ContextMenuSeparator />}
          {section.map((action) => (
            <ActionItem key={action.id} action={action} />
          ))}
        </Fragment>
      ))}
    </ContextMenuContent>
  );
}

/** One action of the menu: its icon and what it does, said in words. */
function ActionItem({ action }: { readonly action: EditorTabAction }): React.JSX.Element {
  const { t } = useTranslation();
  const Icon = action.icon;

  return (
    <ContextMenuItem onSelect={action.run} disabled={action.disabled}>
      <Icon aria-hidden className="size-4" />
      {t(action.labelKey)}
    </ContextMenuItem>
  );
}

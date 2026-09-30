import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Menubar,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/shared/components/ui/menubar';
import { cn } from '@/shared/lib/utils';
import { commandLabel } from '../hooks/command-label';
import { afterClose, executeCommand } from '../hooks/execute-command';
import { fileMenuOf } from '../hooks/file-menu';
import { useRegisteredCommands, useShortcutLabels } from '../hooks/useShortcut';
import type { Command, ShortcutLabel } from '../types/command';

export interface FileMenuProps {
  readonly className?: string;

  /** Told when an item is picked — the sheet the menu lives in under `md` closes then. */
  onPick?(): void;
}

/**
 * The File menu — the only menu: the parity with the editor people know is the one of files
 * (docs/architecture/web/03-ui-system.md#a-moldura-do-app).
 *
 * It comes out of the registry: the label, the shortcut and whether it can run now are the ones
 * the palette shows (plan 06, S-127). An item that cannot run now is disabled; one nobody
 * registered is not there. It is a menubar to a screen reader, and walked with the arrows.
 */
export function FileMenu({ className, onPick }: FileMenuProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const commands = useRegisteredCommands();
  const shortcuts = useShortcutLabels();
  const sections = useMemo(() => fileMenuOf(commands), [commands]);

  if (sections.length === 0) {
    return null;
  }

  return (
    <Menubar aria-label={t('fileMenu.bar.label')} className={cn('h-full', className)}>
      <MenubarMenu>
        <MenubarTrigger>{t('fileMenu.file.title')}</MenubarTrigger>
        <MenubarContent>
          {sections.map((section, index) => (
            <Fragment key={section.group}>
              {index > 0 && <MenubarSeparator />}
              <MenubarGroup>
                {section.items.map((command) => (
                  <FileMenuItem
                    key={command.id}
                    command={command}
                    shortcut={shortcuts.get(command.id) ?? null}
                    onPick={onPick}
                  />
                ))}
              </MenubarGroup>
            </Fragment>
          ))}
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}

interface FileMenuItemProps {
  readonly command: Command;
  readonly shortcut: ShortcutLabel | null;
  readonly onPick: (() => void) | undefined;
}

/** One item — or, for a command with a submenu, the item that opens it ("Open recent ›"). */
function FileMenuItem({ command, shortcut, onPick }: FileMenuItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const available = command.when?.() !== false;
  const label = commandLabel(command, t);
  const Submenu = command.fileMenu?.submenu;
  const icon = command.icon !== undefined && <command.icon className="size-4" aria-hidden />;

  if (Submenu !== undefined) {
    return (
      <MenubarSub>
        <MenubarSubTrigger disabled={!available}>
          {icon}
          {label}
        </MenubarSubTrigger>
        <MenubarSubContent>
          <Submenu />
        </MenubarSubContent>
      </MenubarSub>
    );
  }

  return (
    <MenubarItem
      disabled={!available}
      aria-keyshortcuts={shortcut?.aria}
      onSelect={() => {
        onPick?.();
        afterClose(() => {
          void executeCommand(command.id, t);
        });
      }}
    >
      {icon}
      {label}
      {shortcut !== null && <MenubarShortcut>{shortcut.label}</MenubarShortcut>}
    </MenubarItem>
  );
}

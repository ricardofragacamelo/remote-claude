import { FILE_MENU_GROUPS } from '../types/command';
import type { Command, FileMenuGroup } from '../types/command';

/** One group of the File menu, with the commands registered into it, in order. */
export interface FileMenuSection {
  readonly group: FileMenuGroup;
  readonly items: readonly Command[];
}

/**
 * The File menu, out of the registry: the groups in the order of the editor people know — New,
 * Open, Save, Close — each with the commands that placed themselves in it.
 *
 * A command nobody registered is not an item, and a group with no item is not a group: nothing
 * waits disabled for ever for another plan (plan 06, S-128).
 */
export function fileMenuOf(commands: readonly Command[]): readonly FileMenuSection[] {
  return FILE_MENU_GROUPS.flatMap((group) => {
    const placed = commands.flatMap((command) =>
      command.fileMenu?.group === group ? [{ command, order: command.fileMenu.order }] : [],
    );
    const items = placed
      .sort(
        (left, right) =>
          left.order - right.order || left.command.id.localeCompare(right.command.id),
      )
      .map((each) => each.command);

    return items.length === 0 ? [] : [{ group, items }];
  });
}

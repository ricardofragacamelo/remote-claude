import { usePanelCommands } from '../../hooks/usePanelCommands';
import { usePanelTabs } from '../../hooks/usePanelTabs';

/**
 * The commands of the panel of Claude for the folder tab on screen — live whether the panel is open
 * or not, for "focus the prompt" and "new conversation" are how a closed panel opens (plan 08, B-40,
 * S-185). Renders nothing; the host keeps it up beside the shell of the tab.
 */
export function PanelCommands({ folder }: { readonly folder: string }): null {
  usePanelCommands(folder, usePanelTabs(folder));
  return null;
}

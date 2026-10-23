import { useTranslation } from 'react-i18next';

import type { AgentSettingsLocation } from '@/features/agent-settings';
import { FolderSelect } from '@/shared/components/FolderSelect';

export interface McpFolderPickerProps {
  readonly location: AgentSettingsLocation;
  onLocation(next: AgentSettingsLocation): void;
  readonly folderChoices: readonly string[];
}

/**
 * Which folder this screen is about: none — only the store's own `user`-scope servers — or one of
 * the open tabs and the recent folders of the workbench (plan 13, B-28; the same choice
 * `agentSettings.FolderPicker` offers, through the same shared `FolderSelect` — `agentSettings`
 * registers this feature's section, and importing its *component* back from here, rather than the
 * presentational piece both share, would close a module cycle between the two, D-83). The folder
 * picked here is what the project's own `.mcp.json` group climbs from, and what a new folder-scoped
 * server defaults to.
 */
export function McpFolderPicker({
  location,
  onLocation,
  folderChoices,
}: McpFolderPickerProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <FolderSelect
      label={t('agentSettings.mcp.folderLabel')}
      noneLabel={t('agentSettings.mcp.folderNone')}
      value={location.folder}
      choices={folderChoices}
      onChange={(folder) => {
        if (folder === undefined) {
          onLocation({ section: location.section });
          return;
        }
        onLocation({ ...location, folder });
      }}
    />
  );
}

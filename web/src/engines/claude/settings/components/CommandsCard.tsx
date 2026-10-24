import { useTranslation } from 'react-i18next';

import { commandTemplate } from '../lib/artifact-templates';
import { projectConfigKeys } from '../hooks/project-config-keys';
import type { ProjectCommandView } from '../types/project-config';
import { ArtifactListCard } from './ArtifactListCard';
import { ArtifactNameCell } from './ArtifactNameCell';

export interface CommandsCardProps {
  readonly folder: string;
  readonly commands: readonly ProjectCommandView[];
}

/**
 * The project's own slash commands (plan 13, B-33): name, description, argument hint, and whether a
 * user or system command of the same name hides it from `/` (`shadowed` — the project's own always
 * wins, the same precedent as a skill's own name collision, B-34's D-20).
 */
export function CommandsCard({ folder, commands }: CommandsCardProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ArtifactListCard
      headingId="project-commands-heading"
      folder={folder}
      items={commands}
      nameOf={(command) => command.name}
      pathFor={(name) => `.claude/commands/${name}.md`}
      contentFor={commandTemplate}
      invalidateKey={projectConfigKeys.of(folder)}
      strings={{
        title: t('engines.claude.project.commandsTitle'),
        newLabel: t('engines.claude.project.newCommand'),
        emptyTitle: t('engines.claude.project.commandsEmptyTitle'),
        emptyBody: t('engines.claude.project.commandsEmptyBody'),
        searchLabel: t('engines.claude.project.commandsSearchLabel'),
        tableCaption: t('engines.claude.project.commandsTableCaption'),
        columns: [
          t('engines.claude.project.commandsColumnName'),
          t('engines.claude.project.commandsColumnDescription'),
          t('engines.claude.project.commandsColumnState'),
        ],
        newTitle: t('engines.claude.project.newCommandTitle'),
        newDescription: t('engines.claude.project.newCommandDescription'),
        newNameLabel: t('engines.claude.project.newCommandNameLabel'),
      }}
      renderRow={(command) => (
        <tr key={command.name} className="border-b border-border last:border-b-0">
          <td className="p-2 font-code">
            <ArtifactNameCell
              folder={folder}
              sourceFile={command.sourceFile}
              label={`/${command.name}`}
            />
          </td>
          <td className="p-2">{command.description}</td>
          <td className="p-2">
            {command.shadowed && t('engines.claude.project.commandsShadowed')}
          </td>
        </tr>
      )}
    />
  );
}

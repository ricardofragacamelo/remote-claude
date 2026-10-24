import { useTranslation } from 'react-i18next';

import { agentTemplate } from '../lib/artifact-templates';
import { projectConfigKeys } from '../hooks/project-config-keys';
import { AGENT_RISK_KEYS } from '../lib/project-status-words';
import type { ProjectAgentView } from '../types/project-config';
import { ArtifactListCard } from './ArtifactListCard';
import { ArtifactNameCell } from './ArtifactNameCell';

export interface SubagentsCardProps {
  readonly folder: string;
  readonly agents: readonly ProjectAgentView[];
}

/**
 * The project's own subagents (plan 13, B-36): name, description, model, and a flag for whatever
 * frontmatter widens what the subagent may do (`permissionMode`, broad `tools`, `mcpServers` — S-175).
 * A subagent file with no `name:` never appears here at all, by the CLI's own silent rule (D-102).
 */
export function SubagentsCard({ folder, agents }: SubagentsCardProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ArtifactListCard
      headingId="project-subagents-heading"
      folder={folder}
      items={agents}
      nameOf={(agent) => agent.name}
      pathFor={(name) => `.claude/agents/${name}.md`}
      contentFor={agentTemplate}
      invalidateKey={projectConfigKeys.of(folder)}
      strings={{
        title: t('engines.claude.project.subagentsTitle'),
        newLabel: t('engines.claude.project.newSubagent'),
        emptyTitle: t('engines.claude.project.subagentsEmptyTitle'),
        emptyBody: t('engines.claude.project.subagentsEmptyBody'),
        searchLabel: t('engines.claude.project.subagentsSearchLabel'),
        tableCaption: t('engines.claude.project.subagentsTableCaption'),
        columns: [
          t('engines.claude.project.subagentsColumnName'),
          t('engines.claude.project.subagentsColumnDescription'),
          t('engines.claude.project.subagentsColumnModel'),
          t('engines.claude.project.subagentsColumnRisks'),
        ],
        newTitle: t('engines.claude.project.newSubagentTitle'),
        newDescription: t('engines.claude.project.newSubagentDescription'),
        newNameLabel: t('engines.claude.project.newSubagentNameLabel'),
      }}
      renderRow={(agent) => (
        <tr key={agent.name} className="border-b border-border last:border-b-0">
          <td className="p-2 font-code">
            <ArtifactNameCell folder={folder} sourceFile={agent.sourceFile} label={agent.name} />
          </td>
          <td className="p-2">{agent.description}</td>
          <td className="p-2">{agent.model ?? '—'}</td>
          <td className="p-2">{agent.risks.map((risk) => t(AGENT_RISK_KEYS[risk])).join(', ')}</td>
        </tr>
      )}
    />
  );
}

import { useTranslation } from 'react-i18next';

import type { SectionBodyProps } from '@/features/agent-settings';
import { useProjectConfig } from '../hooks/useProjectConfig';
import { PROJECT_ISSUE_KEYS } from '../lib/project-status-words';
import { CommandsCard } from './CommandsCard';
import { DeclaredPluginsCard } from './DeclaredPluginsCard';
import { FolderGatedSection } from './FolderGatedSection';
import { HooksCard } from './HooksCard';
import { McpJsonCard } from './McpJsonCard';
import { MemoryCard } from './MemoryCard';
import { OutputStylesCard } from './OutputStylesCard';
import { PermissionsCard } from './PermissionsCard';
import { SubagentsCard } from './SubagentsCard';

/**
 * "Project": everything a repository injects into Claude in one folder — memory, slash commands,
 * subagents, output styles, hooks, permissions, plugins, and a way into `.mcp.json`'s own section
 * (plan 13, B-31…B-39). One read (`GET /engines/claude/project-config`) feeds every card; writing a
 * new file of any kind goes through the plan 07 file endpoint, never a route of its own (D-18).
 */
export function ProjectSection({
  engine,
  location,
  onLocation,
}: SectionBodyProps): React.JSX.Element {
  const { t } = useTranslation();
  const folder = location.folder;
  const data = useProjectConfig(folder);

  return (
    <div className="flex flex-col gap-6">
      <FolderGatedSection
        engine={engine}
        location={location}
        onLocation={onLocation}
        folder={folder}
        chooseFolderTitle={t('engines.claude.project.chooseFolderTitle')}
        chooseFolderBody={t('engines.claude.project.chooseFolderBody')}
        isLoading={data.isLoading}
        loadingLabel={t('engines.claude.project.loading')}
        error={data.error}
        onRetry={data.retry}
        ready={!data.isLoading && data.error === null}
      >
        {data.config.issues.length > 0 && (
          <ul className="flex flex-col gap-1">
            {data.config.issues.map((issue) => (
              <li key={issue.path} role="alert" className="text-ui-xs text-destructive">
                {t('engines.claude.project.issueLine', {
                  path: issue.path,
                  reason: t(PROJECT_ISSUE_KEYS[issue.reason]),
                })}
              </li>
            ))}
          </ul>
        )}

        {folder !== undefined && (
          <>
            <MemoryCard folder={folder} files={data.config.memory} onCreated={data.retry} />
            <CommandsCard folder={folder} commands={data.config.commands} />
            <SubagentsCard folder={folder} agents={data.config.agents} />
            <OutputStylesCard folder={folder} outputStyles={data.config.outputStyles} />
            <HooksCard hooks={data.config.hooks} />
            <PermissionsCard permissions={data.config.permissions} />
            <DeclaredPluginsCard plugins={data.config.plugins} />
            <McpJsonCard onOpenMcpSection={() => onLocation({ ...location, section: 'mcp' })} />
          </>
        )}
      </FolderGatedSection>
    </div>
  );
}

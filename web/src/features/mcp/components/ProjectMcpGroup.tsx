import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { ErrorState } from '@/shared/components/ErrorState';
import { ListStatus } from '@/shared/components/ListStatus';
import { Button } from '@/shared/components/ui/button';
import { useProjectMcpMutations } from '../hooks/useProjectMcpMutations';
import { useProjectMcpServers } from '../hooks/useProjectMcpServers';
import { TRANSPORT_KEYS } from '../lib/status-words';
import type { ProjectMcpApprovalState, ProjectMcpServerView } from '../types/mcp';
import { ProjectEntryDiff } from './ProjectEntryDiff';

export interface ProjectMcpGroupProps {
  readonly engine: string;
  readonly folder: string | undefined;
}

/** The chip words of each state — named in full so the i18n check sees every key. */
const STATE_KEYS: Readonly<Record<ProjectMcpApprovalState, string>> = {
  pending: 'agentSettings.mcp.projectStatePending',
  approved: 'agentSettings.mcp.projectStateApproved',
  rejected: 'agentSettings.mcp.projectStateRejected',
  changed: 'agentSettings.mcp.projectStateChanged',
};

function EntryRow({
  entry,
  engine,
  folder,
}: {
  readonly entry: ProjectMcpServerView;
  readonly engine: string;
  readonly folder: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const mutations = useProjectMcpMutations(engine, folder);

  return (
    <li className="flex flex-col gap-2 border-b border-border py-2 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="font-ui-strong">{entry.name}</span>
          <span className="text-ui-sm text-muted-foreground">
            {t('agentSettings.mcp.projectEntrySummary', {
              transport: t(TRANSPORT_KEYS[entry.transport]),
              folder: entry.folderPath,
            })}
          </span>
        </div>
        <span className="text-ui-sm">{t(STATE_KEYS[entry.state])}</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={mutations.saving || entry.state === 'approved'}
            onClick={() => {
              // The failure is already read reactively, from `mutations.saveError` — caught here
              // only so a stale approval (S-102) is never an unhandled rejection in the console.
              mutations.approve(entry.name, entry.digest).catch(() => undefined);
            }}
          >
            {t('agentSettings.mcp.projectApprove')}
          </Button>
          <Button
            variant="outline"
            disabled={mutations.saving || entry.state === 'rejected'}
            onClick={() => {
              mutations.reject(entry.name).catch(() => undefined);
            }}
          >
            {t('agentSettings.mcp.projectReject')}
          </Button>
        </div>
      </div>
      {mutations.saveError !== null && <ErrorState error={mutations.saveError} />}
      {entry.state === 'changed' && <ProjectEntryDiff entry={entry} />}
    </li>
  );
}

/**
 * The servers a project's own MCP file declares, in their own group (plan 13, B-24, B-28): approve,
 * reject, and — for one that changed since it was approved — the difference between what was
 * approved and what is there now (S-136).
 */
export function ProjectMcpGroup({ engine, folder }: ProjectMcpGroupProps): React.JSX.Element {
  const { t } = useTranslation();
  const data = useProjectMcpServers(engine, folder);

  if (folder === undefined) {
    return (
      <EmptyState
        title={t('agentSettings.mcp.projectNeedsFolderTitle')}
        description={t('agentSettings.mcp.projectNeedsFolderBody')}
      />
    );
  }

  return (
    <section aria-labelledby="mcp-project-heading" className="flex flex-col gap-2">
      <h3 id="mcp-project-heading" className="text-ui font-ui-strong">
        {t('agentSettings.mcp.projectGroupTitle')}
      </h3>
      <ListStatus
        isLoading={data.isLoading}
        loadingLabel={t('agentSettings.mcp.projectLoading')}
        error={data.error}
        onRetry={data.retry}
        isEmpty={data.servers.length === 0}
        emptyTitle={t('agentSettings.mcp.projectEmptyTitle')}
        emptyDescription={t('agentSettings.mcp.projectEmptyBody')}
        rows={3}
      />
      {data.servers.length > 0 && (
        <ul>
          {data.servers.map((entry) => (
            <EntryRow
              key={`${entry.folderPath}:${entry.name}`}
              entry={entry}
              engine={engine}
              folder={folder}
            />
          ))}
        </ul>
      )}
      {data.errors.length > 0 && (
        <ul
          aria-label={t('agentSettings.mcp.projectFileIssuesLabel')}
          className="text-ui-sm text-destructive"
        >
          {data.errors.map((issue) => (
            <li key={issue.folderPath}>
              {t('agentSettings.mcp.projectFileIssue', {
                folder: issue.folderPath,
                reason: issue.reason,
              })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

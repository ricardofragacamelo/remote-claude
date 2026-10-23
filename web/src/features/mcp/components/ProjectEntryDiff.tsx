import { useTranslation } from 'react-i18next';

import { DiffHunks } from '@/shared/components/DiffHunks';
import { projectEntryDiffHunks } from '../lib/project-entry-diff';
import type { ProjectMcpServerView } from '../types/mcp';

export interface ProjectEntryDiffProps {
  readonly entry: ProjectMcpServerView;
}

/**
 * The difference between what was approved and what the file has now (S-136) — a line diff of a
 * small, deterministic rendering of each side (plan 13, B-28; see `lib/project-entry-diff.ts` for
 * why a line diff of this text, not of the por-extenso description). `null` for `approvedSnapshot`
 * means the approval predates D-80: there is nothing recorded to diff against, so this says only
 * that the entry changed.
 */
export function ProjectEntryDiff({ entry }: ProjectEntryDiffProps): React.JSX.Element {
  const { t } = useTranslation();
  const hunks = projectEntryDiffHunks(entry.approvedSnapshot, entry);

  if (hunks.length === 0) {
    return (
      <p className="text-ui-sm text-muted-foreground">{t('agentSettings.mcp.diffUnavailable')}</p>
    );
  }

  return <DiffHunks hunks={hunks} label={t('agentSettings.mcp.diffLabel', { name: entry.name })} />;
}

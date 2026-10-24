import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { readStateOf, type ReadState } from '@/features/agent-settings';
import { fetchProjectConfig } from '../services/project-config.service';
import type { ProjectConfigView } from '../types/project-config';
import { projectConfigKeys } from './project-config-keys';

const EMPTY_CONFIG: ProjectConfigView = {
  folderPath: '',
  memory: [],
  commands: [],
  agents: [],
  outputStyles: [],
  hooks: [],
  permissions: [],
  plugins: { enabled: [], disabled: [], enableAllProjectMcpServers: false },
  issues: [],
};

export interface ProjectConfig extends ReadState {
  readonly config: ProjectConfigView;
}

/** `GET /engines/claude/project-config?folder=` — nothing is read before a folder is chosen (plan 13, B-31). */
export function useProjectConfig(folder: string | undefined): ProjectConfig {
  const query = useQuery<ProjectConfigView, AppError>({
    queryKey: projectConfigKeys.of(folder ?? ''),
    queryFn: () => fetchProjectConfig(folder as string),
    enabled: folder !== undefined,
    retry: false,
  });

  return { config: query.data ?? EMPTY_CONFIG, ...readStateOf(query) };
}

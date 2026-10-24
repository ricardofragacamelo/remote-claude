import { api } from '@/shared/api';
import type { ProjectConfigView } from '../types/project-config';

/** `GET /engines/claude/project-config?folder=` (plan 13, B-31). */
export function fetchProjectConfig(folder: string): Promise<ProjectConfigView> {
  return api.get<ProjectConfigView>(
    `/engines/claude/project-config?folder=${encodeURIComponent(folder)}`,
  );
}

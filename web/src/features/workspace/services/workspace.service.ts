import { api } from '@/shared/api/api';
import type { Workspace } from '../types/workspace';

/** The shape the backend answers with. It stops existing at the end of this file. */
interface WorkspaceListResponse {
  readonly workspaces: readonly Workspace[];
}

/**
 * The roots this user may open.
 *
 * A service knows the endpoint, its shape and how to read the answer — and nothing about React or
 * about when it should be called. That is the hook's decision.
 *
 * @throws {import('@/shared/api/errors').AppError} never a raw `Response`: `api.ts` has already
 *   turned the backend's envelope into something with a code and a translation key
 */
export async function fetchWorkspaces(): Promise<readonly Workspace[]> {
  return (await api.get<WorkspaceListResponse>('/workspaces')).workspaces;
}

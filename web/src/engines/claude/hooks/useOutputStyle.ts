import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import type { DefaultsExtraFieldState } from '@/features/agent-settings';
import { fetchOutputStyle, saveOutputStyle } from '../services/claude-engine.service';
import type { OutputStyleView } from '../types/output-style';
import { claudeEngineKeys } from './claude-engine-keys';

/**
 * The output style of the user, or of a folder — the one field Claude's defaults form has besides
 * the core's (plan 28, D-06). Read and saved on its own, alongside the core's defaults the moment
 * the shared "Save" is clicked (`DefaultsForm` calls this the same render it calls the core's own).
 */
export function useOutputStyle(folder: string | undefined): DefaultsExtraFieldState {
  const queryClient = useQueryClient();
  const query = useQuery<OutputStyleView, AppError>({
    queryKey: claudeEngineKeys.outputStyle(folder),
    queryFn: () => fetchOutputStyle(folder),
    retry: false,
  });
  const mutation = useMutation<OutputStyleView, AppError, string | null>({
    mutationFn: (value) => saveOutputStyle(folder, value),
    onSuccess: (view) => {
      queryClient.setQueryData(claudeEngineKeys.outputStyle(folder), view);
      return queryClient.invalidateQueries({ queryKey: [...claudeEngineKeys.all, 'output-style'] });
    },
  });

  return {
    value: folder === undefined ? (query.data?.user ?? null) : (query.data?.folder?.value ?? null),
    effective: query.data?.effective ?? null,
    saving: mutation.isPending,
    error: mutation.error,
    save: (value) => {
      mutation.mutate(value);
    },
  };
}

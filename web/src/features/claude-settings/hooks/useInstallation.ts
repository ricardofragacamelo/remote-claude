import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { checkModel, fetchInstallation } from '../services/claude-config.service';
import type { ClaudeInstallation, ModelCheckOutcome } from '../types/installation';
import { claudeConfigKeys } from './claude-config-keys';
import { readStateOf } from './read-state';
import type { ReadState } from './read-state';

/** The diagnostic of the installation, and the test of the connection beside it. */
export interface Installation extends ReadState {
  readonly installation: ClaudeInstallation | null;

  /** Runs the test — one turn of the model, which spends quota (D-08). */
  check(): void;
  readonly checking: boolean;

  /** What the test found, or why it could not run — `CLAUDE_UNAVAILABLE`, `CLAUDE_TIMEOUT`… */
  readonly outcome: ModelCheckOutcome | null;
  readonly checkError: AppError | null;
}

export function useInstallation(): Installation {
  const queryClient = useQueryClient();
  const query = useQuery<ClaudeInstallation, AppError>({
    queryKey: claudeConfigKeys.installation(),
    queryFn: fetchInstallation,
    retry: false,
  });
  const mutation = useMutation<ModelCheckOutcome, AppError, void>({
    mutationFn: () => checkModel(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: claudeConfigKeys.installation() }),
  });

  return {
    installation: query.data ?? null,
    ...readStateOf(query),
    check: () => {
      mutation.mutate();
    },
    checking: mutation.isPending,
    outcome: mutation.data ?? query.data?.lastModelCheck ?? null,
    checkError: mutation.error,
  };
}

import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { fetchAccount } from '../services/claude-config.service';
import type { ClaudeAccount } from '../types/installation';
import { claudeConfigKeys } from './claude-config-keys';
import { readStateOf } from './read-state';
import type { ReadState } from './read-state';

/** The account of the CLI, the four states of reading it, and how to read it again. */
export interface Account extends ReadState {
  readonly account: ClaudeAccount | null;

  /** Reads the account again, past the minute the server keeps it — "I just ran /login" (S-26). */
  refresh(): void;
}

export function useAccount(): Account {
  const queryClient = useQueryClient();
  const query = useQuery<ClaudeAccount, AppError>({
    queryKey: claudeConfigKeys.account(),
    queryFn: () => fetchAccount(),
    retry: false,
  });

  return {
    account: query.data ?? null,
    ...readStateOf(query),
    refresh: () => {
      void queryClient.fetchQuery({
        queryKey: claudeConfigKeys.account(),
        queryFn: () => fetchAccount(true),
        staleTime: 0,
      });
    },
  };
}

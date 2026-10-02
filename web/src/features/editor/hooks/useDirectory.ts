import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { listDirectory } from '../services/files.service';
import type { DirectoryEntry } from '../services/files.service';

/** The keys of what the editor reads from the server, in one place. */
export const editorKeys = {
  all: ['editor'] as const,
  directory: (folder: string, path: string) =>
    [...editorKeys.all, 'directory', folder, path] as const,
};

/** One level of a directory of the folder, while `enabled` — the trail above the editor (S-220). */
export function useDirectory(
  folder: string,
  path: string,
  enabled: boolean,
): {
  readonly entries: readonly DirectoryEntry[];
  readonly isLoading: boolean;
  readonly error: AppError | null;
} {
  const query = useQuery({
    queryKey: editorKeys.directory(folder, path),
    queryFn: () => listDirectory(folder, path),
    enabled,
    staleTime: 0,
  });

  return {
    entries: query.data ?? [],
    isLoading: enabled && query.isPending,
    error: (query.error as AppError | null) ?? null,
  };
}

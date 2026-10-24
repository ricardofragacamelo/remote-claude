import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import type { AppError } from '@/shared/api/errors';
import { writeAndOpen } from '../lib/write-and-open';

export interface CreateFixedFileOptions {
  readonly folder: string;
  /** Relative to `folder` — fixed, unlike {@link useCreateArtifactFlow}'s, because the file this
   * writes has no name a person picks (`CLAUDE.md`, always at the project's own root — B-32). */
  readonly path: string;
  readonly content: string;
  onCreated(): void;
}

export interface CreateFixedFileFlow {
  create(): void;
  readonly creating: boolean;
  readonly error: AppError | null;
}

/** Writing `CLAUDE.md` from its template, then opening it — no name to ask, unlike a slash command,
 * a subagent, an output style or a skill (plan 13, B-32, D-18). */
export function useCreateFixedFileFlow(options: CreateFixedFileOptions): CreateFixedFileFlow {
  const navigate = useNavigate();
  const mutation = useMutation<void, AppError, void>({
    mutationFn: () =>
      writeAndOpen(
        { folder: options.folder, path: options.path, content: options.content },
        navigate,
        options.onCreated,
      ),
  });

  return {
    create: () => {
      mutation.mutate();
    },
    creating: mutation.isPending,
    error: mutation.error,
  };
}

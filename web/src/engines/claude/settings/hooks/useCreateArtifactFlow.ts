import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import type { AppError } from '@/shared/api/errors';
import { isValidArtifactName } from '../lib/artifact-name';
import { writeAndOpen } from '../lib/write-and-open';

export interface CreateArtifactOptions {
  readonly folder: string;
  /** The path to write, relative to `folder` — e.g. `.claude/commands/<name>.md`. */
  pathFor(name: string): string;
  /** The initial content of the new file, in English, with the kind's own frontmatter. */
  contentFor(name: string): string;
  /** Called once the file is written — invalidates whatever list this kind's card reads from. */
  onCreated(): void;
}

/** One "new <kind>" dialog's own state and actions — shared by every kind this screen creates. */
export interface CreateArtifactFlow {
  readonly open: boolean;
  readonly name: string;
  /** `true` when `name` fails the format this product checks before ever asking the server. */
  readonly nameInvalid: boolean;
  readonly saving: boolean;
  /** `true` once the server itself refused the current name as already taken (`FILE_EXISTS`). */
  readonly nameTaken: boolean;
  /** Any other failure of the write — never `FILE_EXISTS`, which `nameTaken` already carries. */
  readonly error: AppError | null;
  openDialog(): void;
  cancel(): void;
  setName(name: string): void;
  confirm(): void;
}

/**
 * Writing a new slash command, subagent, output style or skill is the same shape everywhere (plan
 * 13, D-18): a name validated here first, written whole by the plan 07 file endpoint, never over
 * anything (`FILE_EXISTS` is the server's own validation, not a race this screen handles specially —
 * S-153), then opened in the editor. The list this kind's card reads from is invalidated once, by
 * the caller, never assumed to refresh itself.
 */
export function useCreateArtifactFlow(options: CreateArtifactOptions): CreateArtifactFlow {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameTaken, setNameTaken] = useState(false);

  const mutation = useMutation<void, AppError, string>({
    mutationFn: (candidate) =>
      writeAndOpen(
        {
          folder: options.folder,
          path: options.pathFor(candidate),
          content: options.contentFor(candidate),
        },
        navigate,
        options.onCreated,
      ),
    onSuccess: () => {
      setOpen(false);
      setName('');
      setNameTaken(false);
    },
    onError: (failure) => {
      setNameTaken(failure.code === 'FILE_EXISTS');
    },
  });

  return {
    open,
    name,
    nameInvalid: name.length > 0 && !isValidArtifactName(name),
    saving: mutation.isPending,
    nameTaken,
    error: mutation.error !== null && mutation.error.code !== 'FILE_EXISTS' ? mutation.error : null,
    openDialog: () => {
      setOpen(true);
      setName('');
      setNameTaken(false);
      mutation.reset();
    },
    cancel: () => {
      setOpen(false);
    },
    setName: (candidate) => {
      setName(candidate);
      setNameTaken(false);
    },
    confirm: () => {
      if (isValidArtifactName(name)) {
        mutation.mutate(name);
      }
    },
  };
}

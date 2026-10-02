import type { ComponentType } from 'react';

import { useAsking } from '../hooks/useAsking';

/** A question of one file, asked in a dialog. */
export interface FileQuestionProps {
  readonly folder: string;
  readonly path: string;
}

export interface AskedDialogProps {
  readonly folder: string;
  readonly kind: Parameters<typeof useAsking>[1];
  readonly question: ComponentType<FileQuestionProps>;
}

/** The question of `kind` for the first open file that has it waiting — one dialog at a time. */
export function AskedDialog({
  folder,
  kind,
  question: Question,
}: AskedDialogProps): React.JSX.Element | null {
  const path = useAsking(folder, kind);

  return path === null ? null : <Question folder={folder} path={path} />;
}

import type { ExplorerError } from '../types/explorer';

/** Where a failure is told — an undo explains its refusals its own way. */
export type ReasonContext = 'operation' | 'undo';

/**
 * Why an undo was refused, in the words of an undo: the file changed after the operation — Claude
 * wrote to it —, the folder made has something in it now, or what was made is gone (S-185).
 */
const UNDO_REASONS: Readonly<Record<string, string>> = {
  FILE_CHANGED: 'explorer.undo.changed',
  DIRECTORY_NOT_EMPTY: 'explorer.undo.notEmpty',
  FILE_NOT_FOUND: 'explorer.undo.gone',
  FILE_EXISTS: 'explorer.undo.taken',
};

/** Why an operation is impossible as asked, by reason — the generic sentence otherwise. */
const INVALID_REASONS: Readonly<Record<string, string>> = {
  intoItself: 'explorer.invalid.intoItself',
  openFolder: 'explorer.invalid.openFolder',
  crossDevice: 'explorer.invalid.crossDevice',
  symlinkLoop: 'explorer.invalid.symlinkLoop',
};

/** The sentence an error is told with, here. */
export function reasonKeyOf(error: ExplorerError, context: ReasonContext): string {
  const undo = context === 'undo' ? UNDO_REASONS[error.code] : undefined;
  const invalid =
    error.code === 'FILE_OPERATION_INVALID'
      ? INVALID_REASONS[String(error.params['reason'])]
      : undefined;

  return undo ?? invalid ?? error.messageKey;
}

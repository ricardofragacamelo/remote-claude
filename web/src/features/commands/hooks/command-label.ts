import type { TFunction } from 'i18next';

import type { Command } from '../types/command';

/** A command's label, translated — the same words in the palette, the menu, the help and a notice. */
export function commandLabel(
  command: Pick<Command, 'labelKey' | 'labelParams'>,
  t: TFunction,
): string {
  return t(command.labelKey, { ...command.labelParams });
}

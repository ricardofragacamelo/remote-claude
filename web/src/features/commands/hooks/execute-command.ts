import type { TFunction } from 'i18next';

import { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';
import { notify } from '@/shared/lib/notify';
import { commandRegistry } from '../store/command-registry';
import type { CommandRegistry } from '../store/command-registry';
import { commandLabel } from './command-label';

/** The code a failure is reported with: the backend's, or the one for "nobody knows". */
function codeOf(error: unknown): string {
  return error instanceof AppError ? error.code : 'INTERNAL_ERROR';
}

/**
 * Runs a command by id, the way the palette, the File menu and a shortcut all do.
 *
 * A command that is not there, or not available now, does not run. One that throws — or whose
 * promise rejects — becomes a translated notification: a command has no place on the screen to say
 * it failed (06 · D-17, S-126). Nothing is thrown back: whoever pressed the key or picked the item
 * carries on.
 *
 * @param t the caller's, so the label in the notice is in the language on screen
 * @returns whether it ran to the end
 */
export async function executeCommand(
  id: string,
  t: TFunction,
  registry: CommandRegistry = commandRegistry,
): Promise<boolean> {
  const command = registry.command(id);

  if (command === undefined || command.when?.() === false) {
    logger.debug(
      {
        op: 'command.run',
        command: id,
        outcome: command === undefined ? 'unknown' : 'unavailable',
      },
      'command not run',
    );
    return false;
  }

  logger.debug({ op: 'command.run', command: id }, 'command started');

  try {
    await command.run();
    logger.debug({ op: 'command.run', command: id, outcome: 'done' }, 'command done');
    return true;
  } catch (error) {
    const code = codeOf(error);

    logger.warn({ op: 'command.run', command: id, outcome: 'failed', code }, 'command failed');
    notify({
      severity: 'error',
      messageKey: 'notification.command.failed',
      params: { command: commandLabel(command, t), code },
    });
    return false;
  }
}

/**
 * Runs something once the menu or the palette that asked for it is gone and the focus is back
 * where it was — so a dialog the command opens remembers the right place to give the focus back to.
 */
export function afterClose(action: () => void): void {
  setTimeout(action, 0);
}

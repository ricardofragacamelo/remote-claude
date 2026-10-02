import { api } from '@/shared/api/api';
import { isRecord, readText } from '@/shared/lib/json';
import type { CommandGroups, CommandMenu, CommandOrigin, SlashCommand } from '../types/command';

const ORIGINS: readonly string[] = ['builtin', 'project', 'user', 'system'];

/** The shape the backend answers with. It stops existing at the end of this file. */
interface CommandMenuResponse {
  readonly cliVersion?: unknown;
  readonly commands?: unknown;
}

/**
 * The slash commands the installation of a live session offers.
 *
 * Already filtered by the backend — no internal command, no dead one — and already ordered, so the
 * order is kept exactly as it came. An entry this build cannot read is dropped rather than thrown
 * over: one malformed row should cost the person that row, not the menu.
 *
 * @throws {import('@/shared/api/errors').AppError} `SESSION_NOT_FOUND` for a session that is not
 *   live, `CLAUDE_UNAVAILABLE` / `CLAUDE_TIMEOUT` when the SDK failed or did not answer in time —
 *   none of which stops the prompt from being sent
 */
export async function fetchCommands(sessionId: string): Promise<CommandMenu> {
  const body = await api.get<CommandMenuResponse>(
    `/sessions/${encodeURIComponent(sessionId)}/commands`,
  );

  return {
    cliVersion:
      typeof body.cliVersion === 'string' && body.cliVersion !== '' ? body.cliVersion : null,
    commands: Array.isArray(body.commands) ? body.commands.flatMap(toSlashCommand) : [],
  };
}

/** One row of a menu the backend answered — or nothing, for one this build cannot read. */
export function toSlashCommand(value: unknown): SlashCommand[] {
  if (!isRecord(value)) {
    return [];
  }

  const name = readText(value, 'name');

  if (name === null) {
    return [];
  }

  const aliases = Array.isArray(value['aliases']) ? value['aliases'] : [];

  return [
    {
      name,
      invocation: `/${name}`,
      description: readText(value, 'description') ?? '',
      argumentHint: readText(value, 'argumentHint') ?? '',
      aliases: aliases.filter((alias): alias is string => typeof alias === 'string'),
      suggested: value['suggested'] === true,
      // A backend older than plan 08 says neither: a row with no origin is the project's, named as
      // it is.
      origin: ORIGINS.includes(value['origin'] as string)
        ? (value['origin'] as CommandOrigin)
        : 'project',
      label: readText(value, 'label') ?? name,
      shadowed: value['shadowed'] === true,
    },
  ];
}

/**
 * The commands a search leaves, in the two groups of the menu.
 *
 * By name, alias and description, ignoring case and a leading slash — somebody typing `/ini` is
 * looking for `/init`. The order is the backend's in both groups; a search filters, it never
 * re-ranks.
 */
export function searchCommands(commands: readonly SlashCommand[], search: string): CommandGroups {
  const wanted = search.trim().replace(/^\//, '').toLowerCase();
  const found =
    wanted === ''
      ? commands
      : commands.filter((command) =>
          [command.name, command.label, command.description, ...command.aliases].some((text) =>
            text.toLowerCase().includes(wanted),
          ),
        );

  return {
    suggested: found.filter((command) => command.suggested),
    others: found.filter((command) => !command.suggested),
  };
}

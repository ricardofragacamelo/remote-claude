import type { SlashCommand as SdkSlashCommand } from '@anthropic-ai/claude-agent-sdk';

import type { SlashCommand } from '@domain/session';

/**
 * A command as the SDK describes it → ours. An absent list of aliases is an empty one, and an absent
 * marker is a command that is not Claude Code's own (plan 08, B-50).
 */
export function toSlashCommand(command: SdkSlashCommand): SlashCommand {
  return {
    name: command.name,
    description: command.description,
    argumentHint: command.argumentHint,
    aliases: command.aliases ?? [],
    builtin: command.builtin === true,
  };
}

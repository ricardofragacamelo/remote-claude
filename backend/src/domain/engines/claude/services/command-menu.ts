import type { CommandMenu } from '@domain/session';

/**
 * The names of the local plugins plan 13 builds with the skills of the user and of the system,
 * fixed by plan 08 ([progress](../../../../../../docs/plans/08-claude-panel/progress.md)) so the two
 * plans agree on them: a skill of theirs arrives qualified, `remote-claude-user:<skill>`, and the
 * name of the plugin is what says its origin. Any other plugin comes in by the project's settings,
 * and is the project's.
 */
export const USER_SKILLS_PLUGIN = 'remote-claude-user';
export const SYSTEM_SKILLS_PLUGIN = 'remote-claude-system';

/**
 * The names Claude's menu puts first, in this order — chosen for somebody who is not at the
 * terminal: generating the project's instructions, reviewing what changed, and keeping an eye on
 * context and cost. A ranking of names: one the installation does not offer is not shown
 * ([04 · D-05](../../../../../../docs/plans/04-transcript-and-resume/decisions.md#d-05--o-menu-é-descoberta-não-fronteira)).
 */
export const SUGGESTED_COMMANDS: readonly string[] = [
  'init',
  'code-review',
  'security-review',
  'compact',
  'context',
  'usage',
];

/** How Claude's menu is ordered and badged (plan 28, B-37). */
export const CLAUDE_COMMAND_MENU: CommandMenu = {
  suggested: SUGGESTED_COMMANDS,
  pluginOrigins: { [USER_SKILLS_PLUGIN]: 'user', [SYSTEM_SKILLS_PLUGIN]: 'system' },
};

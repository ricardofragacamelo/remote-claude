/**
 * One slash command the local installation offers.
 *
 * It comes from the installation, never from a list of ours: the count varies by installation, by
 * version and by the skills installed, and a fixed list offers a command that no longer exists the
 * first time the CLI is updated ([D-05](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
 */
export interface SlashCommand {
  readonly name: string;

  /** What the prompt carries to run it: the name, with its slash. */
  readonly invocation: string;

  readonly description: string;

  /** What it takes after the name, as the installation describes it. Empty when nothing. */
  readonly argumentHint: string;

  /** Other names it answers to. Searched, as the name is. */
  readonly aliases: readonly string[];

  /** Whether it belongs to the group on top. A ranking of names, not a list of commands. */
  readonly suggested: boolean;

  /** Where it comes from — the badge of the menu (plan 08, B-50). */
  readonly origin: CommandOrigin;

  /** The name a person reads, without the namespace of a plugin; `name` is what is inserted. */
  readonly label: string;

  /** Another row of the same name is what `/name` runs: listed, and said to be covered (S-243). */
  readonly shadowed: boolean;
}

/** Where a command or a skill comes from: Claude Code, the project, the user, the system. */
export type CommandOrigin = 'builtin' | 'project' | 'user' | 'system';

/** What the installation of a live session offers. */
export interface CommandMenu {
  /** The version of the CLI the SDK spawned, or `null` before the first turn told it. */
  readonly cliVersion: string | null;

  /** Filtered and ordered by the backend: the suggested first, in ranking order, then by name. */
  readonly commands: readonly SlashCommand[];
}

/** The menu, as a search leaves it: the suggested group on top, and every other command below. */
export interface CommandGroups {
  readonly suggested: readonly SlashCommand[];
  readonly others: readonly SlashCommand[];
}

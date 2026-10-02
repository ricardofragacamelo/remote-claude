/**
 * A slash command the installation offers, as `supportedCommands()` describes it.
 *
 * Our shape and not the SDK's: the adapter translates, and nothing inside `domain/` learns the
 * package exists.
 */
export interface SlashCommand {
  /** Without the leading slash. */
  readonly name: string;
  readonly description: string;

  /** What the command takes after its name — `<file>`, `[on|off]` — or empty. */
  readonly argumentHint: string;

  /** Other names that run the same command: `/cost` and `/stats` both run `/usage`. */
  readonly aliases: readonly string[];

  /**
   * Whether it is Claude Code's own — the SDK's marker. Absent or `false` for a command or a skill of
   * the project, of a plugin or of an MCP server.
   */
  readonly builtin?: boolean;
}

/**
 * Where a command or a skill comes from — the badge of the menu (plan 08, B-50): Claude Code's own,
 * the project's `.claude/`, or the skills of the user and of the system, which plan 13 brings in
 * through a local plugin of ours.
 */
export type CommandOrigin = 'builtin' | 'project' | 'user' | 'system';

/**
 * The names of the local plugins plan 13 builds with the skills of the user and of the system,
 * fixed by plan 08 ([progress](../../../../../docs/plans/08-claude-panel/progress.md)) so the two plans
 * agree on them before 11 exists: a skill of theirs arrives
 * qualified, `remote-claude-user:<skill>`, and the name of the plugin is what says its origin. Any
 * other plugin comes in by the project's settings, and is the project's.
 */
export const USER_SKILLS_PLUGIN = 'remote-claude-user';
export const SYSTEM_SKILLS_PLUGIN = 'remote-claude-system';

/** A command as the menu shows it. */
export interface MenuCommand extends SlashCommand {
  /** Whether it belongs to the group shown first. */
  readonly suggested: boolean;
  readonly origin: CommandOrigin;

  /** The name a person reads — without the namespace of a plugin. What is inserted is `name`. */
  readonly label: string;

  /**
   * `/name` runs another row: an unmarked row whose name a Claude Code command also has. Listed, so
   * nothing vanishes in silence, and said to be covered (S-243).
   */
  readonly shadowed: boolean;
}

/** The order of the origins when two rows share a name — the one `/name` runs first. */
const ORIGIN_ORDER: readonly CommandOrigin[] = ['builtin', 'project', 'user', 'system'];

/** Where a row comes from: the marker, then the namespace of the plugin of a qualified name. */
export function originOf(command: SlashCommand): CommandOrigin {
  if (command.builtin === true) {
    return 'builtin';
  }

  const separator = command.name.lastIndexOf(':');
  const plugin = separator === -1 ? null : command.name.slice(0, separator);

  if (plugin === USER_SKILLS_PLUGIN) {
    return 'user';
  }

  return plugin === SYSTEM_SKILLS_PLUGIN ? 'system' : 'project';
}

/** The name without the namespace of a plugin. */
function labelOf(name: string): string {
  return name.slice(name.lastIndexOf(':') + 1);
}

/**
 * The names the menu puts first, in this order.
 *
 * A **ranking of names, not a list of commands**: a name the installation does not offer is simply
 * not shown, which is what keeps this from becoming the hardcoded menu B-14 forbids — the day a
 * command is removed from the CLI, it disappears from here without anybody editing this line
 * ([D-05](../../../../../docs/plans/04-transcript-and-resume/decisions.md#d-05--o-menu-é-descoberta-não-fronteira)).
 *
 * Chosen for somebody who is not at the terminal: generating the project's instructions, reviewing
 * what changed, and keeping an eye on context and cost.
 */
export const SUGGESTED_COMMANDS: readonly string[] = [
  'init',
  'code-review',
  'security-review',
  'compact',
  'context',
  'usage',
];

/** The prefix Claude Code gives a command that is not meant for a person. */
const INTERNAL_PREFIX = '__';

/**
 * How the CLI marks a command that no longer does anything: `(removed) …` or `Renamed to /…`.
 *
 * Read off the description because that is the only metadata that says so — measured on the real
 * list, where `agents` and `extra-usage` carry exactly these two forms.
 */
const RETIRED = /^\s*(?:\(removed\)|renamed to\b)/i;

/**
 * Whether a command is one the menu leaves out.
 *
 * By **metadata**, never by name: a list of names to hide is the hardcoded list back again, and it
 * ages with the next release of the CLI. A command marked by neither rule stays, even an odd one —
 * the menu is discovery, not a boundary, and hiding a command does not stop it being typed.
 */
export function isHidden(command: SlashCommand): boolean {
  return command.name.startsWith(INTERNAL_PREFIX) || RETIRED.test(command.description);
}

/**
 * The menu: what the installation offers, without the internal and the dead, suggested first.
 *
 * The suggested group follows {@link SUGGESTED_COMMANDS}; everything else is sorted by name, so two
 * installations that offer the same commands show them in the same order whatever order the CLI
 * listed them in.
 *
 * Two rows may share a name (plan 08, B-50, S-243): both are listed, told apart by their origin.
 * Between a Claude Code row and an unmarked one, `/name` runs Claude Code's **whatever the order**
 * — the SDK says so of its marker — and the unmarked one is listed as covered. A row listed twice
 * with the same marker is one row.
 */
export function menuOf(commands: readonly SlashCommand[]): MenuCommand[] {
  const seen = new Set<string>();
  const visible: SlashCommand[] = [];

  for (const command of commands) {
    const key = `${command.name}\n${String(command.builtin === true)}`;

    if (!isHidden(command) && !seen.has(key)) {
      seen.add(key);
      visible.push(command);
    }
  }

  const builtinNames = new Set(
    visible.filter((command) => command.builtin === true).map((command) => command.name),
  );

  const rank = (command: SlashCommand): number => {
    const position = SUGGESTED_COMMANDS.indexOf(command.name);
    return position === -1 ? SUGGESTED_COMMANDS.length : position;
  };

  return visible
    .map((command) => ({
      ...command,
      suggested: rank(command) < SUGGESTED_COMMANDS.length,
      origin: originOf(command),
      label: labelOf(command.name),
      shadowed: command.builtin !== true && builtinNames.has(command.name),
    }))
    .sort(
      (left, right) =>
        rank(left) - rank(right) ||
        left.label.localeCompare(right.label) ||
        ORIGIN_ORDER.indexOf(left.origin) - ORIGIN_ORDER.indexOf(right.origin),
    );
}

/**
 * `/name` at the very start of a prompt, followed by the end of the text or by whitespace.
 *
 * The name takes what Claude Code names take — letters, digits, `-`, `_`, `.` and the `:` of a
 * plugin's namespace — and nothing else, so an absolute path is not a command: `/tmp/x is empty`
 * stops at the second `/` and never matches.
 */
const COMMAND_AT_START = /^\/([A-Za-z0-9][A-Za-z0-9_.:-]*)(?=\s|$)/;

/** The command a prompt invokes, without its slash, or `null` when the prompt is not one. */
export function commandIn(text: string): string | null {
  return COMMAND_AT_START.exec(text.trimStart())?.[1] ?? null;
}

/**
 * Whether the installation runs `name`, as a name or as an alias.
 *
 * Asked of the **whole** list, hidden entries included: a command the menu leaves out still exists,
 * and typing it is the person's call. What is refused is only what the CLI does not have at all.
 */
export function offers(commands: readonly SlashCommand[], name: string): boolean {
  return commands.some((command) => command.name === name || command.aliases.includes(name));
}

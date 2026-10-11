/**
 * A slash command the installation offers, as `supportedCommands()` describes it.
 *
 * Our shape and not the engine's: the adapter translates, and nothing inside `domain/` learns the
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
   * Whether it is the engine's own — the engine's marker. Absent or `false` for a command or a skill of
   * the project, of a plugin or of an MCP server.
   */
  readonly builtin?: boolean;
}

/**
 * Where a command or a skill comes from — the badge of the menu (plan 08, B-50): the engine's own,
 * the project's, or the skills of the user and of the system, which an engine's extension brings in
 * through plugins of its own.
 */
export type CommandOrigin = 'builtin' | 'project' | 'user' | 'system';

/**
 * How an engine's menu is ordered and badged — said by the engine, never supposed by the core
 * (plan 28, B-37):
 *
 * - `suggested` — the names put first, in this order. A **ranking of names, not a list of
 *   commands**: a name the installation does not offer is simply not shown, which is what keeps it
 *   from becoming a hardcoded menu
 *   ([D-05](../../../../../docs/plans/04-transcript-and-resume/decisions.md#d-05--o-menu-é-descoberta-não-fronteira));
 * - `pluginOrigins` — the namespaces (`<plugin>:<name>`) whose rows are the user's or the system's
 *   skills. Any other namespace is the project's.
 */
export interface CommandMenu {
  readonly suggested: readonly string[];
  readonly pluginOrigins: Readonly<Record<string, 'user' | 'system'>>;
}

/** An engine that says nothing of its menu: nothing first, every namespace the project's. */
export const PLAIN_MENU: CommandMenu = { suggested: [], pluginOrigins: {} };

/** A command as the menu shows it. */
export interface MenuCommand extends SlashCommand {
  /** Whether it belongs to the group shown first. */
  readonly suggested: boolean;
  readonly origin: CommandOrigin;

  /** The name a person reads — without the namespace of a plugin. What is inserted is `name`. */
  readonly label: string;

  /**
   * `/name` runs another row: an unmarked row whose name a command of the engine's own also has.
   * Listed, so nothing vanishes in silence, and said to be covered (S-243).
   */
  readonly shadowed: boolean;
}

/** The order of the origins when two rows share a name — the one `/name` runs first. */
const ORIGIN_ORDER: readonly CommandOrigin[] = ['builtin', 'project', 'user', 'system'];

/** Where a row comes from: the marker, then the namespace of the plugin of a qualified name. */
export function originOf(command: SlashCommand, menu: CommandMenu = PLAIN_MENU): CommandOrigin {
  if (command.builtin === true) {
    return 'builtin';
  }

  const separator = command.name.lastIndexOf(':');
  const plugin = separator === -1 ? null : command.name.slice(0, separator);

  return (plugin === null ? undefined : menu.pluginOrigins[plugin]) ?? 'project';
}

/** The name without the namespace of a plugin. */
function labelOf(name: string): string {
  return name.slice(name.lastIndexOf(':') + 1);
}

/** The prefix an engine gives a command that is not meant for a person. */
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
 * The suggested group follows the engine's {@link CommandMenu}; everything else is sorted by name,
 * so two installations that offer the same commands show them in the same order whatever order
 * the engine listed them in.
 *
 * Two rows may share a name (plan 08, B-50, S-243): both are listed, told apart by their origin.
 * Between a row of the engine's own and an unmarked one, `/name` runs the engine's **whatever the
 * order** — the engine says so of its marker — and the unmarked one is listed as covered. A row
 * listed twice with the same marker is one row.
 */
export function menuOf(
  commands: readonly SlashCommand[],
  menu: CommandMenu = PLAIN_MENU,
): MenuCommand[] {
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
    const position = menu.suggested.indexOf(command.name);
    return position === -1 ? menu.suggested.length : position;
  };

  return visible
    .map((command) => ({
      ...command,
      suggested: rank(command) < menu.suggested.length,
      origin: originOf(command, menu),
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
 * The name takes what an engine's command names take — letters, digits, `-`, `_`, `.` and the `:` of a
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

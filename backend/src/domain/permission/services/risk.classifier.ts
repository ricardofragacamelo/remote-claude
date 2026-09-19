import type { RiskHint } from '../value-objects/risk-hint.value-object';

/**
 * Tools whose worst case is reading something.
 *
 * A fixed list rather than a guess about the name: a tool this build has never heard of gets no
 * benefit of the doubt, because the name of a tool says nothing about what it does.
 */
const READ_ONLY_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'NotebookRead',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'Task',
  'BashOutput',
]);

/** Tools that change files, and nothing worse. */
const WRITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/** The tools whose risk is not in the name but in the input. */
const COMMAND_TOOLS = new Set(['Bash', 'BashTool']);

/**
 * Shell commands whose worst case is printing something.
 *
 * Deliberately short. Everything absent from it is destructive, so the cost of leaving a command
 * out is an extra confirmation, while the cost of putting a wrong one in is an unattended `rm`.
 */
const READ_ONLY_COMMANDS = new Set([
  'basename',
  'cat',
  'cksum',
  'date',
  'df',
  'diff',
  'dirname',
  'du',
  'echo',
  'env',
  'false',
  'fd',
  'file',
  'find',
  'grep',
  'head',
  'hostname',
  'id',
  'ls',
  'md5sum',
  'printenv',
  'pwd',
  'realpath',
  'rg',
  'sha256sum',
  'sort',
  'stat',
  'tail',
  'tree',
  'true',
  'uname',
  'uniq',
  'wc',
  'which',
  'whoami',
]);

/** Shell commands that create or copy, and do not delete or execute. */
const WRITING_COMMANDS = new Set(['cp', 'mkdir', 'tee', 'touch']);

/**
 * Commands whose risk depends on the subcommand, with the subcommands that only read.
 *
 * `git` is the case that matters: `git status` is the most common command anybody runs, and
 * `git push --force` is in the same binary.
 */
const READ_ONLY_SUBCOMMANDS: Readonly<Record<string, ReadonlySet<string>>> = {
  git: new Set([
    'blame',
    'branch',
    'describe',
    'diff',
    'log',
    'remote',
    'rev-parse',
    'shortlog',
    'show',
    'status',
    'tag',
  ]),
};

/** What splits one command from the next in a single shell line. */
const SEPARATORS = /&&|\|\||[;|\n]/;

/**
 * Shell syntax this classifier cannot see through.
 *
 * A substitution, a redirection or a heredoc can turn any line into any other line, and a reader
 * that ignored them would grade `echo $(rm -rf /)` by its first word.
 */
const OPAQUE = /[><`]|\$\(|<<|\\\n/;

/** `FOO=bar cmd` — the assignments are stripped so the command is graded, not the variable. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * The risk of one invocation, by a per-tool list **plus** a heuristic over the input.
 *
 * **It fails closed.** Anything the lists do not recognise is `destructive`: an unknown tool, an
 * unknown command, a line with a redirection in it. A false positive costs one more confirmation;
 * a false negative is an `rm -rf` that looked exactly like an `ls`
 * ([D-08](../../../../../docs/plans/01-live-session/decisions.md)).
 *
 * That guarantee is not cosmetic. The phone's two-step confirmation applies only to `destructive`,
 * so the day this function starts guessing optimistically, that decision reopens
 * (docs/architecture/mobile/04-ui.md#a-tela-de-permissão).
 */
export function classifyRisk(toolName: string, input: Readonly<Record<string, unknown>>): RiskHint {
  if (READ_ONLY_TOOLS.has(toolName)) {
    return 'read';
  }

  if (WRITING_TOOLS.has(toolName)) {
    return 'write';
  }

  if (!COMMAND_TOOLS.has(toolName)) {
    return 'destructive';
  }

  const command = input.command;
  return typeof command === 'string' ? classifyCommand(command) : 'destructive';
}

/**
 * The risk of a shell line: the worst of its parts.
 *
 * A line is graded segment by segment because `ls && rm -rf build` is one string and two very
 * different commands, and grading it by the first word would authorise the second.
 */
function classifyCommand(command: string): RiskHint {
  if (OPAQUE.test(command)) {
    return 'destructive';
  }

  const segments = command
    .split(SEPARATORS)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return 'destructive';
  }

  let worst: RiskHint = 'read';

  for (const segment of segments) {
    const risk = classifySegment(segment);

    if (risk === 'destructive') {
      return 'destructive';
    }

    if (risk === 'write') {
      worst = 'write';
    }
  }

  return worst;
}

/** One command with its arguments, already separated from its neighbours. */
function classifySegment(segment: string): RiskHint {
  const words = segment.split(/\s+/).filter((word) => !ASSIGNMENT.test(word));
  const program = words[0];

  if (program === undefined) {
    return 'destructive';
  }

  // The name as it is typed, without its path: `/usr/bin/ls` and `ls` are the same command, and a
  // table keyed on the full path would recognise neither of them half the time.
  const name = program.split('/').pop() ?? program;

  const subcommands = READ_ONLY_SUBCOMMANDS[name];
  if (subcommands !== undefined) {
    const subcommand = words[1];
    return subcommand !== undefined && subcommands.has(subcommand) ? 'read' : 'destructive';
  }

  if (READ_ONLY_COMMANDS.has(name)) {
    return 'read';
  }

  return WRITING_COMMANDS.has(name) ? 'write' : 'destructive';
}

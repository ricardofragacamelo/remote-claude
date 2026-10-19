import type { CanonicalTool, ToolKind } from '@domain/engine';
import type { RiskHint } from '../value-objects/risk-hint.value-object';
import { SHELL_OPAQUE, SHELL_SEPARATORS } from './shell-syntax';

/**
 * Kinds whose worst case is reading something.
 *
 * A fixed list rather than a guess: a kind this build has never heard of — and `other`, a tool the
 * engine's adapter did not recognise — gets no benefit of the doubt, because what a tool is called
 * says nothing about what it does (plan 28, B-16, R-01).
 */
const READ_ONLY_KINDS: ReadonlySet<ToolKind> = new Set([
  'file.read',
  'search',
  'web.fetch',
  'web.search',
  // The task list (plan 08, D-25): it writes the list of the session, nothing else.
  'tasks',
  // The output of a shell already running: it reads what the shell printed.
  'shell.output',
  // A question to the person (plan 24, D-10): it reads nothing and changes nothing, and grading it
  // `destructive` put a two-step confirmation in front of an answer.
  'question',
]);

/** Kinds that write a file the call names — and only that file. */
const WRITING_KINDS: ReadonlySet<ToolKind> = new Set(['file.edit', 'file.write']);

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

/** `FOO=bar cmd` — the assignments are stripped so the command is graded, not the variable. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * The risk of one invocation, by its kind **plus** a heuristic over a shell command — which is
 * neutral, and parsed here (plan 28, B-16).
 *
 * **It fails closed.** Anything the lists do not recognise is `destructive`: an unknown kind, an
 * unknown command, a line with a redirection in it. A false positive costs one more confirmation;
 * a false negative is an `rm -rf` that looked exactly like an `ls`
 * ([D-08](../../../../../docs/plans/01-live-session/decisions.md)).
 *
 * That guarantee is not cosmetic. The phone's two-step confirmation applies only to `destructive`,
 * so the day this function starts guessing optimistically, that decision reopens
 * (docs/architecture/mobile/04-ui.md#a-tela-de-permissão).
 */
export function classifyRisk(tool: Pick<CanonicalTool, 'kind' | 'subject'>): RiskHint {
  if (READ_ONLY_KINDS.has(tool.kind)) {
    return 'read';
  }

  if (WRITING_KINDS.has(tool.kind)) {
    return 'write';
  }

  if (tool.kind === 'mcp') {
    return classifyMcp();
  }

  if (tool.kind !== 'shell') {
    return 'destructive';
  }

  const command = tool.subject.command;
  return command === undefined ? 'destructive' : classifyCommand(command);
}

/**
 * The risk of an MCP tool call (plan 13, B-26; D-13) — always `destructive`, and deliberately not a
 * function of the server's own `readOnly`/`destructive`/`openWorld` annotations, which are the
 * server's own text, about itself, and this already fails closed for a kind that has no read or
 * write list of its own to begin with. An annotation can say `destructive: true` — it adds nothing
 * `classifyRisk` did not already decide — and `readOnly: true` is not trusted to lower it: a server
 * that lies about being read-only is exactly the case fail-closed exists for. There is no annotation
 * this function reads, because there is no annotation that could change the answer.
 */
function classifyMcp(): RiskHint {
  return 'destructive';
}

/**
 * The risk of a shell line: the worst of its parts.
 *
 * A line is graded segment by segment because `ls && rm -rf build` is one string and two very
 * different commands, and grading it by the first word would authorise the second.
 */
function classifyCommand(command: string): RiskHint {
  // A substitution, a redirection or a heredoc can turn any line into any other line, and a reader
  // that ignored them would grade `echo $(rm -rf /)` by its first word.
  if (SHELL_OPAQUE.test(command)) {
    return 'destructive';
  }

  const segments = command
    .split(SHELL_SEPARATORS)
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

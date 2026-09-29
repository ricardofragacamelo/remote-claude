/**
 * `pnpm allowlist add|remove|list`, as a function of its arguments and of where it runs.
 *
 * Everything the command touches — the two files, the environment, the terminal, the processes —
 * comes in through the context, so a suite drives the whole flow against a directory it made and
 * a process it spawned, never against the developer's own copy or their running backend.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import {
  activeAllowlist,
  addRoot,
  defaultUsers,
  expandPath,
  localFromDefault,
  needsConfirmation,
  refusalFor,
  removeRoot,
  signalBackend,
  validate,
  withFileLock,
  writeAtomically,
} from './allowlist.mjs';
import { bold, dim, fail, hint, info, line, ok, warn } from './ui.mjs';

/**
 * @typedef {object} AllowlistContext
 * @property {string} root the repository, against which the environment's paths resolve
 * @property {string} defaultFile the versioned default
 * @property {string} localFile the local copy
 * @property {NodeJS.ProcessEnv} env
 * @property {string} home
 * @property {string} cwd
 * @property {string | null} pidFile where the backend of `pnpm dev` writes its pid
 * @property {(question: string) => Promise<string>} ask
 * @property {import('./allowlist.mjs').ProcessProbe} processes
 */

/**
 * @typedef {object} ParsedArguments
 * @property {'add' | 'remove' | 'list' | 'help' | null} command
 * @property {string | null} target
 * @property {string[]} users
 * @property {boolean} yes
 * @property {string[]} problems
 */

export const USAGE = [
  'usage: pnpm allowlist add <folder> [--user <sub>]... [--yes]',
  '       pnpm allowlist remove <folder>',
  '       pnpm allowlist list',
];

/**
 * What each option does to what has been parsed so far — `rest` is what follows it on the line.
 * A `Map`, so a word such as `constructor` is never mistaken for an option.
 *
 * @type {ReadonlyMap<string, (parsed: ParsedArguments, rest: string[]) => void>}
 */
const OPTIONS = new Map(
  /** @type {[string, (parsed: ParsedArguments, rest: string[]) => void][]} */ ([
    ['--help', asksForHelp],
    ['-h', asksForHelp],
    ['--yes', confirms],
    ['-y', confirms],
    ['--user', namesAUser],
  ]),
);

/** @param {ParsedArguments} parsed */
function asksForHelp(parsed) {
  parsed.command = 'help';
}

/** @param {ParsedArguments} parsed */
function confirms(parsed) {
  parsed.yes = true;
}

/**
 * @param {ParsedArguments} parsed
 * @param {string[]} rest
 */
function namesAUser(parsed, rest) {
  const user = rest.shift();

  if (user === undefined || user.trim() === '') {
    parsed.problems.push('--user needs a subject');
  } else {
    parsed.users.push(user);
  }
}

/**
 * @param {readonly string[]} argv the arguments after the script's name
 * @returns {ParsedArguments}
 */
export function parseArguments(argv) {
  /** @type {ParsedArguments} */
  const parsed = { command: null, target: null, users: [], yes: false, problems: [] };
  const rest = [...argv];

  while (rest.length > 0) {
    const argument = /** @type {string} */ (rest.shift());
    const option = OPTIONS.get(argument);

    if (option !== undefined) {
      option(parsed, rest);
    } else if (argument.startsWith('-')) {
      parsed.problems.push(`unknown option ${argument}`);
    } else {
      positional(parsed, argument);
    }
  }

  return parsed;
}

/**
 * The command first, then the folder, then nothing.
 *
 * @param {ParsedArguments} parsed
 * @param {string} argument
 */
function positional(parsed, argument) {
  if (parsed.command === null) {
    parsed.command = isCommand(argument) ? argument : null;
    if (parsed.command === null) {
      parsed.problems.push(`unknown command ${argument}`);
    }
  } else if (parsed.target === null) {
    parsed.target = argument;
  } else {
    parsed.problems.push(`unexpected argument ${argument}`);
  }
}

/**
 * @param {string} word
 * @returns {word is 'add' | 'remove' | 'list'}
 */
function isCommand(word) {
  return word === 'add' || word === 'remove' || word === 'list';
}

/**
 * Runs the command.
 *
 * @param {readonly string[]} argv
 * @param {AllowlistContext} context
 * @returns {Promise<number>} the exit code — 0 only when the file is what was asked for
 */
export async function runAllowlist(argv, context) {
  const parsed = parseArguments(argv);

  if (parsed.command === 'help') {
    USAGE.forEach((usage) => {
      line(usage);
    });
    return 0;
  }

  if (parsed.problems.length > 0 || parsed.command === null) {
    parsed.problems.forEach((problem) => {
      fail(problem);
    });
    USAGE.forEach((usage) => {
      hint(usage);
    });
    return 1;
  }

  if (parsed.command === 'list') {
    return list(context);
  }

  if (parsed.target === null) {
    fail(`${parsed.command} needs a folder`);
    hint(USAGE[parsed.command === 'add' ? 0 : 1] ?? '');
    return 1;
  }

  return parsed.command === 'add'
    ? add(parsed.target, parsed, context)
    : remove(parsed.target, context);
}

/** Why a path was refused, in words. */
const REFUSALS = {
  systemRoot: 'is the root of the filesystem — that is every file of every user, not a project',
  missing: 'does not exist',
  notADirectory: 'is not a folder',
};

/**
 * @param {string} raw
 * @param {ParsedArguments} parsed
 * @param {AllowlistContext} context
 * @returns {Promise<number>}
 */
async function add(raw, parsed, context) {
  const absolute = expandPath(raw, context);
  const refusal = refusalFor(absolute, statOf);

  if (refusal !== null) {
    fail(`${absolute} ${REFUSALS[refusal]}`, 'nothing changed');
    return 1;
  }

  if (needsConfirmation(absolute, context.home) && !parsed.yes) {
    warn(
      `${absolute} holds your whole home folder: Claude will be able to read, write and run ` +
        'commands in all of it',
    );
    const answer = (await context.ask('free it anyway? [y/N] ')).trim().toLowerCase();

    if (answer !== 'y' && answer !== 'yes') {
      info('nothing changed');
      return 1;
    }
  }

  const users =
    parsed.users.length > 0
      ? parsed.users
      : defaultUsers(fs.readFileSync(context.defaultFile, 'utf8'));
  const outcome = edit(context, (text) =>
    addRoot(text, { path: absolute, label: path.basename(absolute), users }),
  );

  if (outcome.problems.length > 0) {
    return reportInvalid(outcome.problems);
  }

  if (outcome.changed) {
    ok(`freed ${bold(absolute)}`, `for ${String(users.length)} user(s), in ${context.localFile}`);
  } else {
    ok(`${absolute} was already free`, context.localFile);
  }

  return afterWrite(context, outcome.changed);
}

/**
 * @param {string} raw
 * @param {AllowlistContext} context
 * @returns {number}
 */
function remove(raw, context) {
  const absolute = expandPath(raw, context);

  if (!fs.existsSync(context.localFile)) {
    ok(`${absolute} is not in a local copy`, 'there is none — nothing changed');
    return 0;
  }

  const outcome = edit(context, (text) => removeRoot(text, absolute));

  if (outcome.problems.length > 0) {
    return reportInvalid(outcome.problems);
  }

  if (!outcome.changed) {
    ok(`${absolute} is not in the local copy`, 'nothing changed');
    return 0;
  }

  ok(`removed ${bold(absolute)}`, context.localFile);
  return afterWrite(context, true);
}

/**
 * @param {AllowlistContext} context
 * @returns {number}
 */
function list(context) {
  const active = activeAllowlist(context.env, {
    root: context.root,
    localExists: fs.existsSync(context.localFile),
  });

  info(`active allowlist: ${bold(active.file)} ${dim(`(${active.source})`)}`);

  let text;
  try {
    text = fs.readFileSync(active.file, 'utf8');
  } catch {
    fail(`${active.file} cannot be read`);
    return 1;
  }

  const problems = validate(text);
  if (problems.length > 0) {
    return reportInvalid(problems);
  }

  const document = /** @type {{ roots: { path: string, label: string, users: string[] }[] }} */ (
    parseYaml(text)
  );

  for (const root of document.roots) {
    line(`  ${bold(root.label)}  ${root.path}  ${dim(`${String(root.users.length)} user(s)`)}`);
  }

  return 0;
}

/**
 * Reads the local copy (or the default, the first time), changes it, validates the result by the
 * backend's schema and writes it back — holding the lock the whole time.
 *
 * @param {AllowlistContext} context
 * @param {(text: string) => { text: string, changed: boolean }} change
 * @returns {{ changed: boolean, problems: string[] }}
 */
function edit(context, change) {
  return withFileLock(context.localFile, () => {
    const current = fs.existsSync(context.localFile)
      ? fs.readFileSync(context.localFile, 'utf8')
      : localFromDefault(fs.readFileSync(context.defaultFile, 'utf8'));
    const next = change(current);
    const problems = validate(next.text);

    if (problems.length === 0 && next.changed) {
      writeAtomically(context.localFile, next.text);
    }

    return { changed: next.changed, problems };
  });
}

/**
 * @param {readonly string[]} problems
 * @returns {number}
 */
function reportInvalid(problems) {
  fail('the result would not pass the backend’s own validation — nothing was written');
  problems.forEach((problem) => {
    hint(problem);
  });
  return 1;
}

/**
 * Tells the running backend, and says where the change will apply.
 *
 * @param {AllowlistContext} context
 * @param {boolean} changed
 * @returns {number}
 */
function afterWrite(context, changed) {
  const active = activeAllowlist(context.env, { root: context.root, localExists: true });

  if (active.source === 'configured') {
    warn(
      `RC_WORKSPACE_ALLOWLIST_FILE points at ${active.file}`,
      '`pnpm dev` runs with that file, not with the local copy',
    );
  }

  if (!changed) {
    return 0;
  }

  const reload = signalBackend(context.pidFile, context.processes);

  if (reload.kind === 'signalled') {
    ok('reloaded', `SIGHUP sent to the backend (pid ${String(reload.pid)}) — nothing restarts`);
  } else {
    info('no backend of `pnpm dev` is running: the change applies when it starts');
    hint('a backend started some other way reloads on `kill -HUP <pid>`');
  }

  return 0;
}

/**
 * @param {string} target
 * @returns {{ isDirectory(): boolean } | null}
 */
function statOf(target) {
  try {
    return fs.statSync(target);
  } catch {
    return null;
  }
}

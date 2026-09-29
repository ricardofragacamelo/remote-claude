/**
 * The local copy of the workspace allowlist: what `pnpm allowlist` writes, and which file the
 * development stack runs with.
 *
 * The default the repository ships (`infra/workspace-allowlist.yaml`) declares only a scratch root,
 * and it has to stay that way: the path of one developer's project on their machine does not belong
 * in a versioned file. Freeing a real folder is a copy beside it, ignored by git, written through
 * this module — validated by **the same schema** the backend boots with, so the script can never
 * write a file the backend reads differently (docs/plans/06-workbench/decisions.md#d-09).
 */

import fs from 'node:fs';
import path from 'node:path';

import { parse as parseYaml, parseDocument, isMap, isScalar, isSeq } from 'yaml';

import { workspaceAllowlistSchema } from '../../packages/config/src/workspace-allowlist.ts';
import { ALLOWLIST_FILE } from './workspaces.mjs';

/** The local copy, beside the default and ignored by git. */
export const LOCAL_ALLOWLIST_FILE = path.join(
  path.dirname(ALLOWLIST_FILE),
  'workspace-allowlist.local.yaml',
);

/** The comment a local copy opens with, in place of the default's. */
const LOCAL_HEADER = [
  ' The workspace allowlist of THIS machine — written by `pnpm allowlist`, ignored by git.',
  '',
  ' It started as a copy of infra/workspace-allowlist.yaml, and `pnpm dev` runs with it instead of',
  ' the default whenever it exists and RC_WORKSPACE_ALLOWLIST_FILE was left at the default.',
  ' A root listed here is a directory Claude may read, write and run commands in.',
  '',
  ' `pnpm allowlist add <folder>` · `pnpm allowlist remove <folder>` · `pnpm allowlist list`',
].join('\n');

/** The comment above a root the script added. */
const ADDED_COMMENT = ' Added by `pnpm allowlist add`.';

/**
 * @typedef {object} RootEntry
 * @property {string} path absolute
 * @property {string} label
 * @property {readonly string[]} users OIDC subjects
 */

/**
 * `~` expanded against the home directory, and a relative path resolved against the current one.
 *
 * Resolved here, and the result shown to whoever typed it: a relative path written to the file
 * would mean something different depending on where the backend happens to be started.
 *
 * @param {string} raw
 * @param {{ home: string, cwd: string }} where
 * @returns {string} absolute and normalised
 */
export function expandPath(raw, where) {
  if (raw === '~' || raw.startsWith('~/')) {
    return path.resolve(where.home, raw.slice(2));
  }

  return path.resolve(where.cwd, raw);
}

/**
 * Why a path cannot be freed at all, or `null` when it can.
 *
 * The filesystem root is refused outright: it is not "the machine", it is everything on it,
 * including every other user's home and the system itself. Anything that is not an existing
 * directory is almost always a typo, and a typo in this file either locks somebody out or opens
 * something nobody meant to open.
 *
 * @param {string} absolute
 * @param {(path: string) => { isDirectory(): boolean } | null} statOf `null` for nothing there
 * @returns {'systemRoot' | 'missing' | 'notADirectory' | null}
 */
export function refusalFor(absolute, statOf) {
  if (absolute === path.parse(absolute).root) {
    return 'systemRoot';
  }

  const stat = statOf(absolute);

  if (stat === null) {
    return 'missing';
  }

  return stat.isDirectory() ? null : 'notADirectory';
}

/**
 * Whether freeing a path reaches the whole home directory — the home itself, or a folder above it —
 * which is asked out loud before it happens (plan 06, D-03).
 *
 * @param {string} absolute
 * @param {string} home
 * @returns {boolean}
 */
export function needsConfirmation(absolute, home) {
  const relative = path.relative(absolute, home);

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * The users of the development realm: every subject the default file declares.
 *
 * Read from the file rather than repeated here, so a realm user added to the default reaches every
 * root added afterwards.
 *
 * @param {string} defaultText
 * @returns {string[]}
 */
export function defaultUsers(defaultText) {
  const parsed = workspaceAllowlistSchema.parse(parseYaml(defaultText));

  return [...new Set(parsed.roots.flatMap((root) => root.users))];
}

/**
 * The text a local copy starts from: the default's roots, under a header that says what it is.
 *
 * @param {string} defaultText
 * @returns {string}
 */
export function localFromDefault(defaultText) {
  const document = parseDocument(defaultText);
  document.commentBefore = LOCAL_HEADER;

  // A header with no blank line under it belongs to the first key rather than to the document;
  // either way it describes the default, and the copy says what it is itself.
  const first = isMap(document.contents) ? document.contents.items[0] : undefined;
  if (first !== undefined && isScalar(first.key)) {
    first.key.commentBefore = null;
  }

  return String(document);
}

/**
 * The roots a document declares, as its nodes, or an error naming what is wrong with its shape.
 *
 * @param {import('yaml').Document} document
 * @returns {import('yaml').YAMLSeq}
 */
function rootsOf(document) {
  const roots = document.get('roots');

  if (!isSeq(roots)) {
    throw new Error('the allowlist has no `roots` list');
  }

  return roots;
}

/**
 * The absolute path a root node declares, or `null` when it declares none.
 *
 * @param {unknown} node
 * @returns {string | null}
 */
function pathOf(node) {
  const value = isMap(node) ? node.get('path') : undefined;

  return typeof value === 'string' ? path.resolve(value) : null;
}

/**
 * The same document with one more root — or unchanged, when the root is already there.
 *
 * The document is edited in place, so every comment of the file survives: a boundary that loses
 * the note saying why a root is on it stops being reviewable.
 *
 * @param {string} text
 * @param {RootEntry} root
 * @returns {{ text: string, changed: boolean }}
 */
export function addRoot(text, root) {
  const document = parseDocument(text);
  const roots = rootsOf(document);

  if (roots.items.some((item) => pathOf(item) === root.path)) {
    return { text, changed: false };
  }

  const node = document.createNode({ path: root.path, label: root.label, users: [...root.users] });
  node.commentBefore = ADDED_COMMENT;
  roots.add(node);

  return { text: String(document), changed: true };
}

/**
 * The same document without a root — or unchanged, when the root is not there.
 *
 * @param {string} text
 * @param {string} absolute
 * @returns {{ text: string, changed: boolean }}
 */
export function removeRoot(text, absolute) {
  const document = parseDocument(text);
  const roots = rootsOf(document);
  const kept = roots.items.filter((item) => pathOf(item) !== absolute);

  if (kept.length === roots.items.length) {
    return { text, changed: false };
  }

  roots.items = kept;

  return { text: String(document), changed: true };
}

/**
 * Every problem the backend's schema finds in a text, in the words the boot would use; empty when
 * there is none.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function validate(text) {
  let document;

  try {
    document = parseYaml(text);
  } catch {
    return ['the workspace allowlist is not a valid YAML document'];
  }

  const parsed = workspaceAllowlistSchema.safeParse(document);

  return parsed.success
    ? []
    : parsed.error.issues.map(
        (issue) =>
          `roots${issue.path
            .slice(1)
            .map((segment) =>
              typeof segment === 'number' ? `[${String(segment)}]` : `.${String(segment)}`,
            )
            .join('')}: ${issue.message}`,
      );
}

/**
 * @typedef {object} ActiveAllowlist
 * @property {string} file absolute
 * @property {'local' | 'default' | 'configured'} source why this file: the local copy, the
 *   shipped default, or whatever RC_WORKSPACE_ALLOWLIST_FILE was set to by hand
 */

/**
 * Which allowlist `pnpm dev` runs with.
 *
 * The local copy wins when it exists **and** RC_WORKSPACE_ALLOWLIST_FILE was left at the default —
 * an unset variable, or the value `.env.example` ships. A value set by hand is a decision, and it
 * wins over the copy (D-09).
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {{ root: string, localExists: boolean }} where
 * @returns {ActiveAllowlist}
 */
export function activeAllowlist(env, where) {
  const configured = env['RC_WORKSPACE_ALLOWLIST_FILE']?.trim();
  const file =
    configured === undefined || configured === ''
      ? ALLOWLIST_FILE
      : path.resolve(where.root, configured);

  if (file !== ALLOWLIST_FILE) {
    return { file, source: 'configured' };
  }

  return where.localExists
    ? { file: LOCAL_ALLOWLIST_FILE, source: 'local' }
    : { file: ALLOWLIST_FILE, source: 'default' };
}

/**
 * The environment of `pnpm dev`'s backend, pointed at the active allowlist.
 *
 * @param {NodeJS.ProcessEnv} env already resolved by `watchEnvironment`
 * @param {{ root: string, localExists: boolean }} where
 * @returns {NodeJS.ProcessEnv}
 */
export function withActiveAllowlist(env, where) {
  return { ...env, RC_WORKSPACE_ALLOWLIST_FILE: activeAllowlist(env, where).file };
}

/**
 * What `pnpm doctor` says about the allowlist: which file `pnpm dev` runs with, why that one, and
 * whether the backend would boot on it (plan 06, S-61).
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {{ root: string, localExists: boolean }} where
 * @param {(file: string) => string} read throws when the file cannot be read
 * @returns {import('./prerequisites.mjs').CheckResult}
 */
export function allowlistCheck(env, where, read) {
  const active = activeAllowlist(env, where);
  const shown = path.relative(where.root, active.file) || active.file;
  const name = 'workspace allowlist';
  let problems;

  try {
    problems = validate(read(active.file));
  } catch {
    problems = [`${shown} cannot be read`];
  }

  if (problems.length > 0) {
    return {
      name,
      status: 'fail',
      detail: `${shown} (${active.source}): ${problems.join('; ')}`,
      fix: 'the backend refuses to boot on it — fix the file, or `pnpm allowlist list` to see it',
    };
  }

  return { name, status: 'ok', detail: `${shown} (${active.source})` };
}

/**
 * Writes a file whole or not at all: to a temporary beside it, then renamed over it.
 *
 * A reader — the backend reloading on `SIGHUP`, or another `pnpm allowlist` — never sees half a
 * file, and a crash halfway leaves the previous one intact.
 *
 * @param {string} file
 * @param {string} text
 */
export function writeAtomically(file, text) {
  const temporary = `${file}.${String(process.pid)}.tmp`;

  fs.writeFileSync(temporary, text, 'utf8');
  fs.renameSync(temporary, file);
}

/** How long a lock may be held before it is taken for the leftover of a crashed run. */
export const STALE_LOCK_MS = 10_000;

/** How long a run waits for the lock before it gives up. */
export const LOCK_TIMEOUT_MS = 5_000;

/**
 * Runs `work` holding the lock of a file, so two runs never read the same old copy and both write
 * over each other — the atomic rename alone keeps the file whole, not both changes (plan 06, S-60).
 *
 * @template T
 * @param {string} file the file the lock guards
 * @param {() => T} work
 * @param {{ timeoutMs?: number, staleMs?: number, now?: () => number }} [options]
 * @returns {T}
 * @throws {Error} when the lock cannot be taken in time
 */
export function withFileLock(file, work, options = {}) {
  const lock = `${file}.lock`;
  const now = options.now ?? Date.now;
  const deadline = now() + (options.timeoutMs ?? LOCK_TIMEOUT_MS);
  const staleMs = options.staleMs ?? STALE_LOCK_MS;

  for (;;) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      break;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') {
        throw error;
      }

      if (isStale(lock, now(), staleMs)) {
        fs.rmSync(lock, { force: true });
        continue;
      }

      if (now() >= deadline) {
        throw new Error(`${lock} is held by another run — try again, or delete it if none is`, {
          cause: error,
        });
      }

      pause(25);
    }
  }

  try {
    return work();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

/**
 * @param {string} lock
 * @param {number} now
 * @param {number} staleMs
 * @returns {boolean}
 */
function isStale(lock, now, staleMs) {
  try {
    return now - fs.statSync(lock).mtimeMs > staleMs;
  } catch {
    // Released between the failed open and this look: not stale, just free — try again.
    return false;
  }
}

/** @param {number} ms */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * @typedef {{ kind: 'signalled', pid: number } | { kind: 'off' } | { kind: 'noBackend' }} ReloadOutcome
 */

/**
 * @typedef {object} ProcessProbe
 * @property {(file: string) => string | null} read the pid file's text, or `null` when absent
 * @property {(pid: number) => string | null} commandOf the command line of a process, or `null`
 *   when there is no such process
 * @property {(pid: number, signal: NodeJS.Signals) => void} kill
 */

/**
 * Sends `SIGHUP` to the backend of `pnpm dev`, which reloads its allowlist without restarting
 * (plan 06, D-15).
 *
 * The pid comes from the file the backend itself writes, and it is checked before the signal goes:
 * a backend that crashed leaves its file behind, and the operating system hands its pid to the next
 * process — a `SIGHUP` there would end somebody's shell. Only a process whose command line runs the
 * backend's `main.ts` gets it.
 *
 * @param {string | null} pidFile absolute, or `null` when the backend writes none
 * @param {ProcessProbe} probe
 * @returns {ReloadOutcome}
 */
export function signalBackend(pidFile, probe) {
  if (pidFile === null) {
    return { kind: 'off' };
  }

  const pid = Number.parseInt(probe.read(pidFile)?.trim() ?? '', 10);

  if (!Number.isInteger(pid) || pid <= 0 || !/\bmain\.ts\b/.test(probe.commandOf(pid) ?? '')) {
    return { kind: 'noBackend' };
  }

  try {
    probe.kill(pid, 'SIGHUP');
    return { kind: 'signalled', pid };
  } catch {
    // Gone between the look and the signal: there is no backend to reload.
    return { kind: 'noBackend' };
  }
}

/**
 * Where the backend of `pnpm dev` writes its pid, from the environment the stack runs with.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} root
 * @returns {string | null}
 */
export function pidFileOf(env, root) {
  const configured = env['RC_PID_FILE']?.trim();

  return configured === undefined || configured === '' || configured === 'off'
    ? null
    : path.resolve(root, configured);
}

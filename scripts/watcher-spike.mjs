#!/usr/bin/env node
/**
 * The B-19 spike of plan 07 (D-08): which watcher costs the machine how many inotify watches.
 *
 *   node scripts/watcher-spike.mjs --tree <dir> --libs <dir> [--limit <n> | --midflight] [--json]
 *
 * For each candidate — `fs.watch({ recursive: true })`, `chokidar` and `@parcel/watcher` — a child
 * process starts the watcher over `--tree` with the D-10 exclusions, waits until it is ready, and
 * counts the `inotify wd:` lines of its own `/proc/self/fdinfo`. Then it writes one probe file in a
 * watched directory and one in an excluded one, and reports which it heard. The libraries are not
 * the repository's: `--libs` is a folder where they were installed for the spike
 * (`npm install chokidar @parcel/watcher` there), and a missing one is reported as such.
 *
 * `--limit <n>` runs every child inside a user namespace of its own whose
 * `/proc/sys/user/max_inotify_watches` is `n` (`unshare -Ur`, no root needed on Linux ≥ 5.11), to
 * see what each candidate does when the system refuses a watch **at start**: an explicit error, or
 * silence. `--midflight` runs them in such a namespace with the limit untouched, and the child, once
 * its watcher is ready, lowers the limit to the watches it already holds and creates a few folders
 * with a file each — what each candidate does when the limit is spent **after** it started.
 *
 * Linux only, like inotify. Exits 0 when every installed candidate was measured.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { fail, line, title } from './lib/ui.mjs';
import {
  isExcludedPath,
  markdownTable,
  parseSpikeArgs,
  inotifyWatchesIn,
  spikeTable,
  WATCHER_OPTIONS,
} from './lib/watcher-spike.mjs';

const SELF = fileURLToPath(import.meta.url);

/** How long the probes get to be heard. */
const PROBE_WAIT_MS = 1_500;

/** How long a watcher that has no "ready" of its own gets to settle. */
const SETTLE_MAX_MS = 60_000;

/** How many folders the mid-flight phase creates past the limit. */
const GROWN_FOLDERS = 3;

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @typedef {import('./lib/watcher-spike.mjs').SpikeReport} SpikeReport
 * @typedef {(path: string) => void} Heard
 * @typedef {(cause: unknown) => void} Failed
 * @typedef {() => unknown} Close
 * @typedef {(tree: string, libs: string, heard: Heard, failed: Failed) => Promise<Close | null>}
 *   Starter
 * @typedef {{ on(event: string, listener: (...args: any[]) => void): unknown,
 *             close(): unknown }} Emitting
 */

/** The inotify watches this process holds right now. */
function ownWatches() {
  return fs
    .readdirSync('/proc/self/fdinfo')
    .map((fd) => {
      try {
        return inotifyWatchesIn(fs.readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8'));
      } catch {
        // The fd of the directory listing itself is gone by the time it is read.
        return 0;
      }
    })
    .reduce((sum, count) => sum + count, 0);
}

/** Until the watch count stops moving — the "ready" of a watcher that has none. */
async function settled() {
  let previous = -1;
  let stable = 0;
  const deadline = Date.now() + SETTLE_MAX_MS;

  while (stable < 5 && Date.now() < deadline) {
    const now = ownWatches();
    stable = now === previous ? stable + 1 : 0;
    previous = now;
    await sleep(100);
  }
}

/**
 * Loads a candidate library from `--libs`, or `null` when it is not installed there — and only from
 * there: a copy found through `NODE_PATH` (which pnpm sets) is not the one the spike was given.
 *
 * @param {string} libs
 * @param {string} name
 * @returns {Promise<any>}
 */
async function load(libs, name) {
  const root = path.resolve(libs);
  let resolved;

  try {
    resolved = createRequire(path.join(root, 'package.json')).resolve(name);
  } catch {
    // Not installed: the report says `not installed`, which is the answer.
    return null;
  }

  return resolved.startsWith(`${root}${path.sep}`) ? import(pathToFileURL(resolved).href) : null;
}

/** @param {string} tree */
const excludedAbsolute = (tree) => (/** @type {string} */ absolute) =>
  isExcludedPath(path.relative(tree, absolute).split(path.sep).join('/'));

/**
 * Starts one candidate. Resolves once it is ready; `heard` gets every path it reports.
 *
 * @type {Record<string, Starter>}
 */
const STARTERS = {
  async fs(tree, _libs, heard, failed) {
    const watcher = fs.watch(tree, { recursive: true }, (_kind, name) => {
      heard(path.join(tree, String(name)));
    });
    watcher.on('error', failed);
    await settled();
    return () => watcher.close();
  },

  async chokidar(tree, libs, heard, failed) {
    const chokidar = await load(libs, 'chokidar');
    if (chokidar === null) {
      return null;
    }

    /** @type {Emitting} */
    const watcher = chokidar.watch(tree, { ignored: excludedAbsolute(tree), ignoreInitial: true });
    watcher.on('all', (/** @type {string} */ _kind, /** @type {string} */ changed) =>
      heard(changed),
    );
    watcher.on('error', failed);
    await new Promise((resolve) => watcher.on('ready', resolve));
    return () => watcher.close();
  },

  async parcel(tree, libs, heard) {
    const parcel = await load(libs, '@parcel/watcher');
    if (parcel === null) {
      return null;
    }

    const ignore = ['.git', 'node_modules', 'dist', 'build', '.venv', 'target'].map(
      (name) => `**/${name}`,
    );
    const subscription = await (parcel.default ?? parcel).subscribe(
      tree,
      (/** @type {Error | null} */ error, /** @type {{ path: string }[]} */ events) => {
        if (error !== null) {
          throw error;
        }
        for (const event of events) {
          heard(event.path);
        }
      },
      { ignore },
    );
    return () => subscription.unsubscribe();
  },
};

/**
 * Writes the two probes and counts which of them were heard.
 *
 * @param {string} tree
 * @param {readonly string[]} paths every path heard so far
 */
async function probe(tree, paths) {
  const watched = path.join(tree, '.spike-probe');
  const excludedDir = path.join(tree, 'node_modules');
  const excluded = path.join(excludedDir, '.spike-probe');

  fs.mkdirSync(excludedDir, { recursive: true });
  fs.writeFileSync(watched, 'probe');
  fs.writeFileSync(excluded, 'probe');
  await sleep(PROBE_WAIT_MS);
  fs.rmSync(watched, { force: true });
  fs.rmSync(excluded, { force: true });

  const probes = paths.filter((heard) => heard.endsWith('.spike-probe'));

  return {
    excluded: probes.filter((heard) => heard === excluded).length,
    watched: probes.filter((heard) => heard === watched).length,
  };
}

/**
 * Spends the limit, then grows the tree: whether the candidate says so, or goes quiet.
 *
 * @param {string} tree
 * @param {readonly string[]} paths every path heard so far
 * @returns {Promise<{ heard: number }>} how many of the grown files it reported
 */
async function growPastTheLimit(tree, paths) {
  fs.writeFileSync('/proc/sys/user/max_inotify_watches', String(ownWatches()));
  const grown = Array.from({ length: GROWN_FOLDERS }, (_, index) =>
    path.join(tree, `.spike-grown-${String(index)}`),
  );

  for (const folder of grown) {
    fs.mkdirSync(folder);
  }
  await sleep(PROBE_WAIT_MS);
  for (const folder of grown) {
    fs.writeFileSync(path.join(folder, 'file'), 'grown');
  }
  await sleep(PROBE_WAIT_MS);
  for (const folder of grown) {
    fs.rmSync(folder, { recursive: true, force: true });
  }

  return { heard: paths.filter((heard) => heard.endsWith(`${path.sep}file`)).length };
}

/**
 * Starts a candidate; what its start threw goes to `failed`.
 *
 * @param {string} option
 * @param {string} tree
 * @param {string} libs
 * @param {Heard} heard
 * @param {Failed} failed
 * @returns {Promise<Close | null>} `null` when it is not installed, or its start failed
 */
async function start(option, tree, libs, heard, failed) {
  try {
    return (await STARTERS[option]?.(tree, libs, heard, failed)) ?? null;
  } catch (cause) {
    failed(cause);
    return null;
  }
}

/**
 * The child: one candidate, measured, as one line of JSON.
 *
 * @param {string} option
 * @param {string} tree
 * @param {string} libs
 * @param {boolean} midflight
 * @returns {Promise<SpikeReport>}
 */
async function measure(option, tree, libs, midflight) {
  /** @type {string[]} */
  const paths = [];
  /** @type {string | null} */
  let error = null;
  /** @type {Failed} */
  const failed = (cause) => {
    const known = /** @type {{ code?: unknown, message?: unknown } | null} */ (cause);
    error ??= String(known?.code ?? known?.message ?? cause);
  };

  const started = performance.now();
  const close = await start(option, tree, libs, (heard) => paths.push(heard), failed);

  if (close === null && error === null) {
    return { option, status: 'missing', readyMs: null, watches: null, events: null, error: null };
  }

  const readyMs = performance.now() - started;
  const watches = ownWatches();
  const events = close === null ? null : await probe(tree, paths);
  const grown = close !== null && midflight ? await growPastTheLimit(tree, paths) : null;
  await close?.();

  return {
    option,
    status: error === null ? 'measured' : 'failed',
    readyMs,
    watches,
    events,
    grown,
    error,
  };
}

/**
 * The parent: one child per candidate, under the lowered limit when asked.
 *
 * @param {string} option
 * @param {{ tree: string, libs: string, limit: number | null, midflight: boolean }} args
 * @returns {SpikeReport}
 */
function runChild(option, args) {
  const child = [SELF, '--option', option, '--tree', args.tree, '--libs', args.libs];
  const lower =
    args.limit === null
      ? ''
      : `echo ${String(args.limit)} > /proc/sys/user/max_inotify_watches && `;
  const command =
    args.limit === null && !args.midflight
      ? { file: process.execPath, argv: child }
      : {
          file: 'unshare',
          argv: [
            '-Ur',
            'sh',
            '-c',
            `${lower}exec "$0" "$@"`,
            process.execPath,
            ...child,
            ...(args.midflight ? ['--midflight'] : []),
          ],
        };

  const result = spawnSync(command.file, command.argv, { encoding: 'utf8', timeout: 300_000 });
  const last = result.stdout.trim().split('\n').at(-1) ?? '';

  try {
    return JSON.parse(last);
  } catch {
    return {
      option,
      status: 'failed',
      readyMs: null,
      watches: null,
      events: null,
      grown: null,
      error: (result.stderr.trim().split('\n').at(-1) ?? '') || `exit ${String(result.status)}`,
    };
  }
}

function usage() {
  line(
    'usage: node scripts/watcher-spike.mjs --tree <dir> --libs <dir> [--limit <n> | --midflight] [--json]',
  );
}

async function main() {
  const args = parseSpikeArgs(process.argv.slice(2));

  if (args.help) {
    usage();
    return 0;
  }

  if (args.tree === null || args.libs === null) {
    usage();
    fail('--tree and --libs are required');
    return 2;
  }

  if (args.option !== null) {
    const tree = path.resolve(args.tree);
    line(JSON.stringify(await measure(args.option, tree, args.libs, args.midflight)));
    return 0;
  }

  const { tree, libs } = args;
  const reports = WATCHER_OPTIONS.map((option) => runChild(option, { ...args, tree, libs }));

  if (args.json) {
    line(JSON.stringify(reports));
  } else {
    title(`watcher spike — ${args.tree}`);
    line(markdownTable(spikeTable(reports, args)));
  }

  const strained = args.limit !== null || args.midflight;
  return reports.some((report) => report.status === 'failed' && !strained) ? 1 : 0;
}

process.exitCode = await main();

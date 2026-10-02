/**
 * The pure half of `scripts/watcher-spike.mjs` — the B-19 spike of plan 07 (D-08).
 *
 * The spike starts each candidate watcher over a real tree, in a child process of its own, and asks
 * the kernel how many inotify watches that process holds. What the measurement needs that is not
 * I/O lives here, where it can be proved: reading `/proc/<pid>/fdinfo`, telling an excluded
 * directory from a watched one, and turning the children's reports into the table the decision
 * quotes.
 */

/** The candidates, by the name the command line takes. */
export const WATCHER_OPTIONS = /** @type {const} */ (['fs', 'chokidar', 'parcel']);

/**
 * What the watcher must not watch: `.git` whole (B-20) and the D-10 list of folders shown and not
 * watched. The backend's own copy is a domain constant (`UNWATCHED_PATHS`); this one is the spike's,
 * kept beside it because a script cannot import the backend's TypeScript.
 */
export const EXCLUDED_PATHS = [
  '.git',
  'node_modules',
  '.git/objects',
  '.git/subtree-cache',
  'dist',
  'build',
  '.venv',
  'target',
];

/**
 * How many inotify watches an fdinfo file declares — one `inotify wd:` line per watch.
 *
 * @param {string} fdinfo the text of one `/proc/<pid>/fdinfo/<fd>`
 * @returns {number}
 */
export function inotifyWatchesIn(fdinfo) {
  return fdinfo.split('\n').filter((line) => line.startsWith('inotify wd:')).length;
}

/**
 * Whether a path relative to the watched root falls under an excluded one, at any depth.
 *
 * @param {string} relative POSIX, relative to the root; `''` is the root itself
 * @param {readonly string[]} [excluded]
 * @returns {boolean}
 */
export function isExcludedPath(relative, excluded = EXCLUDED_PATHS) {
  const segments = relative.split('/').filter((segment) => segment.length > 0);

  return excluded.some((entry) => containsRun(segments, entry.split('/')));
}

/**
 * @param {readonly string[]} segments
 * @param {readonly string[]} run
 */
function containsRun(segments, run) {
  for (let start = 0; start + run.length <= segments.length; start += 1) {
    if (run.every((segment, index) => segments[start + index] === segment)) {
      return true;
    }
  }

  return false;
}

/**
 * The options of the command line.
 *
 * @param {readonly string[]} argv
 * @returns {{ tree: string | null, libs: string | null, option: string | null,
 *             limit: number | null, midflight: boolean, json: boolean, help: boolean }}
 */
export function parseSpikeArgs(argv) {
  /** @type {Record<string, string>} */
  const values = {};
  const flags = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    const next = argv[index + 1];

    if (['--tree', '--libs', '--option', '--limit'].includes(argument) && next !== undefined) {
      values[argument.slice(2)] = next;
      index += 1;
    } else {
      flags.add(argument);
    }
  }

  return {
    tree: values['tree'] ?? null,
    libs: values['libs'] ?? null,
    option: values['option'] ?? null,
    limit: values['limit'] === undefined ? null : Number(values['limit']),
    midflight: flags.has('--midflight'),
    json: flags.has('--json'),
    help: flags.has('--help') || flags.has('-h'),
  };
}

/**
 * What one child reports about one candidate.
 *
 * @typedef {object} SpikeReport
 * @property {string} option
 * @property {'measured' | 'missing' | 'failed'} status `missing`: the library is not installed
 * @property {number | null} readyMs
 * @property {number | null} watches inotify watches the process held once the watcher was ready
 * @property {{ excluded: number, watched: number } | null} events probe events heard
 * @property {{ heard: number } | null} [grown] files heard in folders created past the limit
 * @property {string | null} error what the start threw, or the first error the watcher emitted
 */

/**
 * The table the decision quotes: one row per candidate, the cells as text.
 *
 * @param {readonly SpikeReport[]} reports
 * @param {{ limit: number | null, midflight: boolean }} run the `max_user_watches` the run started
 *   under, when it was lowered, and whether the limit was spent after the start
 * @returns {string[][]}
 */
export function spikeTable(reports, run) {
  const header = [
    'option',
    'watches',
    'ready (ms)',
    'excluded dir events',
    'watched dir events',
    ...(run.midflight ? ['grown files heard'] : []),
    run.limit === null ? 'error' : `at limit ${String(run.limit)}`,
  ];

  return [header, ...reports.map((report) => spikeRow(report, run.midflight))];
}

/**
 * @param {SpikeReport} report
 * @param {boolean} midflight
 */
function spikeRow(report, midflight) {
  if (report.status === 'missing') {
    return [report.option, '—', '—', '—', '—', ...(midflight ? ['—'] : []), 'not installed'];
  }

  return [
    report.option,
    cell(report.watches),
    cell(report.readyMs === null ? null : Math.round(report.readyMs)),
    ...eventCells(report, midflight),
    report.error ?? 'none (silent)',
  ];
}

/**
 * The probes heard: in a watched folder, in an excluded one, and — mid-flight — past the limit.
 *
 * @param {SpikeReport} report
 * @param {boolean} midflight
 */
function eventCells(report, midflight) {
  return [
    cell(report.events?.excluded ?? null),
    cell(report.events?.watched ?? null),
    ...(midflight ? [cell(report.grown?.heard ?? null)] : []),
  ];
}

/** @param {number | null} value */
function cell(value) {
  return value === null ? '—' : String(value);
}

/**
 * The table as Markdown, ready to paste into the decision.
 *
 * @param {readonly (readonly string[])[]} rows
 * @returns {string}
 */
export function markdownTable(rows) {
  const [header = [], ...body] = rows;
  const lines = [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ];

  return lines.join('\n');
}

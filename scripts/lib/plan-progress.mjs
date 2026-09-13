/**
 * Recalculating the counters of a plan's `progress.md` from its phase files.
 *
 * The counters used to be kept by hand, which is the same as saying they were wrong. The source
 * of truth is the state marker at the end of each `### B-nn` heading, and the state column of
 * `scenarios.md`.
 *
 * Every function here is a pure string transformation, so the suite can drive it without a
 * plan on disk.
 */

const TASK_HEADING = /^###\s+(B-\d+)\b(.*)$/;
const SCENARIO_ROW = /^\|\s*(S-\d+)\s*\|.*\|\s*([⬜🟡✅⛔])\s*\|\s*$/u;
const TASK_STATES = ['🔲', '🔄', '✅', '⛔'];
const SCENARIO_STATES = ['⬜', '🟡', '✅', '⛔'];
const BAR_WIDTH = 20;

/** @type {Record<string, string>} */
const PHASE_LABEL = {
  '🔲': 'não iniciada',
  '🔄': 'em andamento',
  '✅': 'concluída',
  '⛔': 'bloqueada',
};

/**
 * @typedef {object} Task
 * @property {string} id e.g. `B-07`
 * @property {string} state one of 🔲 🔄 ✅ ⛔
 */

/**
 * @typedef {object} PhaseSummary
 * @property {number} index
 * @property {string} file
 * @property {Task[]} tasks
 * @property {number} done
 * @property {string} range e.g. `B-01…B-06, B-48`
 * @property {string} state
 */

/**
 * @typedef {object} PlanSummary
 * @property {PhaseSummary[]} phases
 * @property {number} taskTotal
 * @property {number} taskDone
 * @property {string} taskRange
 * @property {string} state
 * @property {{ total: number, counts: Record<string, number> }} scenarios
 */

/**
 * Tasks of one phase file. A heading with no state marker counts as not started — absence is
 * never read as done.
 *
 * @param {string} content
 * @returns {Task[]}
 */
export function parseTasks(content) {
  /** @type {Task[]} */
  const tasks = [];

  for (const rawLine of content.split('\n')) {
    const heading = TASK_HEADING.exec(rawLine);
    if (heading === null) {
      continue;
    }

    const title = (heading[2] ?? '').trim();
    const marker = TASK_STATES.find((state) => title.endsWith(state));
    tasks.push({ id: heading[1] ?? '', state: marker ?? '🔲' });
  }

  return tasks;
}

/**
 * Scenario counts, taken from the state column of the matrix.
 *
 * @param {string} content
 * @returns {{ total: number, counts: Record<string, number> }}
 */
export function parseScenarios(content) {
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(SCENARIO_STATES.map((state) => [state, 0]));
  /** @type {Set<string>} */
  const seen = new Set();

  for (const rawLine of content.split('\n')) {
    const row = SCENARIO_ROW.exec(rawLine);
    if (row === null) {
      continue;
    }

    const id = row[1] ?? '';
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);

    const state = row[2] ?? '⬜';
    counts[state] = (counts[state] ?? 0) + 1;
  }

  return { total: seen.size, counts };
}

/**
 * `[B-01, B-02, B-03, B-07]` → `B-01…B-03, B-07`.
 *
 * Only runs of three or more collapse: `B-48, B-49` reads better than `B-48…B-49`, and that is
 * the convention the existing plans already use.
 *
 * @param {readonly string[]} ids
 * @returns {string}
 */
export function formatTaskRange(ids) {
  const numbers = ids
    .map((id) => Number(id.replace('B-', '')))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (numbers.length === 0) {
    return '—';
  }

  /** @param {number} value */
  const label = (value) => `B-${String(value).padStart(2, '0')}`;

  /**
   * @param {number} start
   * @param {number} end
   * @returns {string[]}
   */
  const run = (start, end) => {
    if (end - start >= 2) {
      return [`${label(start)}…${label(end)}`];
    }
    const ids = [];
    for (let value = start; value <= end; value += 1) {
      ids.push(label(value));
    }
    return ids;
  };

  /** @type {string[]} */
  const parts = [];
  let start = numbers[0] ?? 0;
  let previous = start;

  for (const value of numbers.slice(1)) {
    if (value === previous + 1) {
      previous = value;
      continue;
    }
    parts.push(...run(start, previous));
    start = value;
    previous = value;
  }
  parts.push(...run(start, previous));

  return parts.join(', ');
}

/**
 * @param {readonly Task[]} tasks
 * @returns {string}
 */
function stateOf(tasks) {
  if (tasks.some((task) => task.state === '⛔')) {
    return '⛔';
  }
  if (tasks.length > 0 && tasks.every((task) => task.state === '✅')) {
    return '✅';
  }
  if (tasks.some((task) => task.state !== '🔲')) {
    return '🔄';
  }
  return '🔲';
}

/**
 * @param {ReadonlyArray<{ index: number, file: string, content: string }>} phaseFiles
 * @param {string} scenariosContent
 * @returns {PlanSummary}
 */
export function summarizePlan(phaseFiles, scenariosContent) {
  const phases = phaseFiles
    .map((phase) => {
      const tasks = parseTasks(phase.content);
      return {
        index: phase.index,
        file: phase.file,
        tasks,
        done: tasks.filter((task) => task.state === '✅').length,
        range: formatTaskRange(tasks.map((task) => task.id)),
        state: stateOf(tasks),
      };
    })
    .sort((left, right) => left.index - right.index);

  const allTasks = phases.flatMap((phase) => phase.tasks);

  return {
    phases,
    taskTotal: allTasks.length,
    taskDone: allTasks.filter((task) => task.state === '✅').length,
    taskRange: formatTaskRange(allTasks.map((task) => task.id)),
    state: stateOf(allTasks),
    scenarios: parseScenarios(scenariosContent),
  };
}

/**
 * @param {number} done
 * @param {number} total
 * @returns {{ bar: string, percent: number }}
 */
function progressBar(done, total) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  return { bar: '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled), percent };
}

/**
 * @param {PlanSummary} summary
 * @returns {string}
 */
function barsBlock(summary) {
  return summary.phases
    .map((phase) => {
      const { bar, percent } = progressBar(phase.done, phase.tasks.length);
      const percentLabel = `${String(percent).padStart(3, ' ')}%`;
      return `F${phase.index} ${bar} ${percentLabel}   ${phase.state} ${PHASE_LABEL[phase.state] ?? ''}`;
    })
    .join('\n');
}

/**
 * Rewrites the counters of a `progress.md`, leaving every hand-written section untouched.
 *
 * Throws when the document does not have the expected rows: a counter that silently fails to
 * update is worse than no counter at all.
 *
 * @param {string} content
 * @param {PlanSummary} summary
 * @param {{ date: string }} options
 * @returns {string}
 */
export function applyProgress(content, summary, options) {
  /** @type {string[]} */
  const missing = [];
  let result = content;

  /**
   * @param {RegExp} pattern
   * @param {string} replacement
   * @param {string} what
   */
  const replaceOnce = (pattern, replacement, what) => {
    if (!pattern.test(result)) {
      missing.push(what);
      return;
    }
    result = result.replace(pattern, replacement);
  };

  replaceOnce(
    /^\*\*Última atualização:\*\*.*$/m,
    `**Última atualização:** ${options.date}`,
    '"Última atualização" line',
  );

  replaceOnce(
    /(## Estado atual[\s\S]*?```\n)[\s\S]*?(\n```)/,
    `$1${barsBlock(summary)}$2`,
    'progress bar block under "Estado atual"',
  );

  for (const phase of summary.phases) {
    const pattern = new RegExp(`^\\|\\s*\\[F${phase.index}\\]\\([^)]*\\)\\s*\\|.*$`, 'm');
    replaceOnce(
      pattern,
      `| [F${phase.index}](${phase.file}) | ${phase.range} | ${phase.done}/${phase.tasks.length} | ${phase.state} |`,
      `table row for F${phase.index}`,
    );
  }

  replaceOnce(
    /^\|\s*\*\*Total\*\*\s*\|.*$/m,
    `| **Total** | **${summary.taskRange}** | **${summary.taskDone}/${summary.taskTotal}** | ${summary.state} |`,
    'total row',
  );

  const { counts, total } = summary.scenarios;
  replaceOnce(
    /^\|\s*\[Matriz\]\(scenarios\.md\)\s*\|.*$/m,
    `| [Matriz](scenarios.md) | ${total} | ${counts['⬜'] ?? 0} | ${counts['🟡'] ?? 0} | ${counts['✅'] ?? 0} | ${counts['⛔'] ?? 0} |`,
    'scenario counts row',
  );

  if (missing.length > 0) {
    throw new Error(
      `progress.md is not in the normative format — could not find: ${missing.join(', ')}`,
    );
  }

  return result;
}

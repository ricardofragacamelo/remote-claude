/**
 * Recalculating the counters of a plan's `progress.md` from its phase files.
 *
 * The counters used to be kept by hand, which is the same as saying they were wrong. The source
 * of truth is the state marker at the end of each `### B-nn` heading, and the state column of
 * `scenarios.md` and `decisions.md`.
 *
 * Every function here is a pure string transformation, so the suite can drive it without a
 * plan on disk.
 */

const TASK_HEADING = /^###\s+(B-\d+)\b(.*)$/;
const SCENARIO_ROW = /^\|\s*(S-\d+)\s*\|.*\|\s*([⬜🟡✅⛔])\s*\|\s*$/u;
const DECISION_ROW = /^\|\s*(D-\d+)\s*\|.*\|\s*([🔲🔄✅⛔])\s*\|\s*$/u;
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

/** The same four states, agreeing with "plano" instead of "fase". */
/** @type {Record<string, string>} */
const PLAN_LABEL = {
  '🔲': 'não iniciado',
  '🔄': 'em andamento',
  '✅': 'concluído',
  '⛔': 'bloqueado',
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
 * @property {Tally} scenarios
 * @property {Tally} decisions
 */

/**
 * @typedef {object} Tally
 * @property {number} total
 * @property {Record<string, number>} counts how many are in each state
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

    // Both groups of TASK_HEADING are mandatory, so a match always fills them; a `?? ''` here
    // would be a branch nothing can take, and an untakeable branch is a lie in the report.
    const title = String(heading[2]).trim();
    const marker = TASK_STATES.find((state) => title.endsWith(state));
    tasks.push({ id: String(heading[1]), state: marker ?? '🔲' });
  }

  return tasks;
}

/**
 * How many rows of a table are in each state, counting an ID only once.
 *
 * Both matrices of a plan — the scenarios and the open decisions — are one row per ID with the
 * state in the last column, so one counter serves the two.
 *
 * @param {string} content
 * @param {RegExp} rowPattern captures the ID and the state
 * @param {readonly string[]} states every state the table can carry
 * @returns {Tally}
 */
function countByState(content, rowPattern, states) {
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(states.map((state) => [state, 0]));
  /** @type {Set<string>} */
  const seen = new Set();

  for (const rawLine of content.split('\n')) {
    const row = rowPattern.exec(rawLine);
    if (row === null) {
      continue;
    }

    const id = String(row[1]);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);

    // The row matched, so the state is one of `states`, and `counts` was seeded with all of them.
    const state = String(row[2]);
    counts[state] = Number(counts[state]) + 1;
  }

  return { total: seen.size, counts };
}

/**
 * Scenario counts, taken from the state column of the matrix.
 *
 * @param {string} content
 * @returns {Tally}
 */
export function parseScenarios(content) {
  return countByState(content, SCENARIO_ROW, SCENARIO_STATES);
}

/**
 * Decision counts, taken from the state column of `decisions.md`.
 *
 * A decision nobody tracks is a decision taken by default, and by omission — which is how a
 * plan starts building on an answer nobody gave.
 *
 * @param {string} content
 * @returns {Tally}
 */
export function parseDecisions(content) {
  return countByState(content, DECISION_ROW, TASK_STATES);
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
  // The empty case returned above, so there is a first number; a `?? 0` here would be a branch
  // nothing can take.
  let start = Number(numbers[0]);
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
 * The state of a whole from the state of its parts — of a phase from its tasks, and of the
 * project from its plans. Blocked wins; done requires everyone; anything started is ongoing.
 *
 * @param {ReadonlyArray<{ state: string }>} parts
 * @returns {string}
 */
function stateOf(parts) {
  if (parts.some((part) => part.state === '⛔')) {
    return '⛔';
  }
  if (parts.length > 0 && parts.every((part) => part.state === '✅')) {
    return '✅';
  }
  if (parts.some((part) => part.state !== '🔲')) {
    return '🔄';
  }
  return '🔲';
}

/**
 * @param {ReadonlyArray<{ index: number, file: string, content: string }>} phaseFiles
 * @param {string} scenariosContent
 * @param {string} [decisionsContent] `decisions.md`, when the plan already has one
 * @returns {PlanSummary}
 */
export function summarizePlan(phaseFiles, scenariosContent, decisionsContent = '') {
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
    decisions: parseDecisions(decisionsContent),
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
 * @typedef {object} BarRow
 * @property {string} label what the bar is about, e.g. `F3` or `01-live-session`
 * @property {number} done
 * @property {number} total
 * @property {string} state one of 🔲 🔄 ✅ ⛔
 * @property {string} stateLabel the state in words
 */

/**
 * One bar per row, aligned by the widest label.
 *
 * @param {readonly BarRow[]} rows
 * @returns {string}
 */
function barsBlock(rows) {
  const width = rows.reduce((widest, row) => Math.max(widest, row.label.length), 0);

  return rows
    .map((row) => {
      const { bar, percent } = progressBar(row.done, row.total);
      const percentLabel = `${String(percent).padStart(3, ' ')}%`;

      return `${row.label.padEnd(width)} ${bar} ${percentLabel}   ${row.state} ${row.stateLabel}`;
    })
    .join('\n');
}

/**
 * @param {PlanSummary} summary
 * @returns {BarRow[]}
 */
function phaseBars(summary) {
  return summary.phases.map((phase) => ({
    label: `F${phase.index}`,
    done: phase.done,
    total: phase.tasks.length,
    state: phase.state,
    // `stateOf` answers one of the four states, and PHASE_LABEL carries all four.
    stateLabel: String(PHASE_LABEL[phase.state]),
  }));
}

/**
 * `| [Matriz](scenarios.md) | 8 | 1 | 0 | 7 | 0 |`
 *
 * @param {string} link the first cell, already in Markdown
 * @param {Tally} tally
 * @param {readonly string[]} states the column order
 * @returns {string}
 */
function countsRow(link, tally, states) {
  // `countByState` seeds every state, so each of these is a number.
  const cells = states.map((state) => Number(tally.counts[state])).join(' | ');

  return `| ${link} | ${tally.total} | ${cells} |`;
}

/**
 * A rewriter over one progress document, collecting the anchors it could not find.
 *
 * The plan's `progress.md` and the general one are rewritten the same way: a handful of
 * anchored replacements, and a refusal to half-update when an anchor is gone.
 *
 * @param {string} content
 * @param {string} what the document, for the error message
 */
function rewriterOf(content, what) {
  /** @type {string[]} */
  const missing = [];
  let result = content;

  return {
    /**
     * @param {RegExp} pattern
     * @param {string} replacement
     * @param {string} anchor
     */
    replace(pattern, replacement, anchor) {
      if (!pattern.test(result)) {
        missing.push(anchor);
        return;
      }
      result = result.replace(pattern, replacement);
    },

    /** @returns {string} */
    finish() {
      if (missing.length > 0) {
        throw new Error(
          `${what} is not in the normative format — could not find: ${missing.join(', ')}`,
        );
      }
      return result;
    },
  };
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
  const rewriter = rewriterOf(content, 'progress.md');
  const replaceOnce = rewriter.replace;

  replaceOnce(
    /^\*\*Última atualização:\*\*.*$/m,
    `**Última atualização:** ${options.date}`,
    '"Última atualização" line',
  );

  replaceOnce(
    /(## Estado atual[\s\S]*?```\n)[\s\S]*?(\n```)/,
    `$1${barsBlock(phaseBars(summary))}$2`,
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

  replaceOnce(
    /^\|\s*\[Matriz\]\(scenarios\.md\)\s*\|.*$/m,
    countsRow('[Matriz](scenarios.md)', summary.scenarios, SCENARIO_STATES),
    'scenario counts row',
  );

  replaceOnce(
    /^\|\s*\[Decisões\]\(decisions\.md\)\s*\|.*$/m,
    countsRow('[Decisões](decisions.md)', summary.decisions, TASK_STATES),
    'decision counts row',
  );

  return rewriter.finish();
}

/**
 * @typedef {object} PlanEntry
 * @property {string} dir plan directory, e.g. `01-live-session`
 * @property {PlanSummary} summary
 */

/**
 * @typedef {object} OverallPlan
 * @property {string} dir
 * @property {number} phasesDone
 * @property {number} phaseTotal
 * @property {number} taskDone
 * @property {number} taskTotal
 * @property {number} scenarioTotal
 * @property {number} scenarioDone scenarios in the ✅ state
 * @property {number} decisionTotal
 * @property {number} decisionDone decisions already taken
 * @property {string} state
 */

/**
 * @typedef {object} OverallSummary
 * @property {OverallPlan[]} plans
 * @property {number} phasesDone
 * @property {number} phaseTotal
 * @property {number} taskDone
 * @property {number} taskTotal
 * @property {number} scenarioDone
 * @property {number} scenarioTotal
 * @property {number} decisionDone
 * @property {number} decisionTotal
 * @property {string} state
 */

/**
 * The whole road seen at once: one line per plan, and the totals.
 *
 * @param {readonly PlanEntry[]} plans in the order they appear on disk
 * @returns {OverallSummary}
 */
export function summarizeOverall(plans) {
  const rows = plans.map((plan) => ({
    dir: plan.dir,
    phasesDone: plan.summary.phases.filter((phase) => phase.state === '✅').length,
    phaseTotal: plan.summary.phases.length,
    taskDone: plan.summary.taskDone,
    taskTotal: plan.summary.taskTotal,
    scenarioTotal: plan.summary.scenarios.total,
    // `countByState` seeds every state, so these are numbers.
    scenarioDone: Number(plan.summary.scenarios.counts['✅']),
    decisionTotal: plan.summary.decisions.total,
    decisionDone: Number(plan.summary.decisions.counts['✅']),
    state: plan.summary.state,
  }));

  /** @param {(plan: OverallPlan) => number} pick */
  const total = (pick) => rows.reduce((sum, row) => sum + pick(row), 0);

  return {
    plans: rows,
    phasesDone: total((row) => row.phasesDone),
    phaseTotal: total((row) => row.phaseTotal),
    taskDone: total((row) => row.taskDone),
    taskTotal: total((row) => row.taskTotal),
    scenarioDone: total((row) => row.scenarioDone),
    scenarioTotal: total((row) => row.scenarioTotal),
    decisionDone: total((row) => row.decisionDone),
    decisionTotal: total((row) => row.decisionTotal),
    // A plan carries the same four states a task does, so the same rule aggregates them.
    state: stateOf(rows),
  };
}

/**
 * Rewrites the counters of `docs/plans/progress.md` — the general progress, across plans.
 *
 * It exists because the per-plan diary answers "how is this plan going" and nobody was
 * answering "how is the project going". Kept by hand, that answer would be wrong by the second
 * week; so it is derived from the same source as everything else — the task markers in the
 * phase files and the state column of each matrix.
 *
 * @param {string} content
 * @param {OverallSummary} overall
 * @param {{ date: string }} options
 * @returns {string}
 */
export function applyOverallProgress(content, overall, options) {
  const rewriter = rewriterOf(content, 'docs/plans/progress.md');
  const replaceOnce = rewriter.replace;

  replaceOnce(
    /^\*\*Última atualização:\*\*.*$/m,
    `**Última atualização:** ${options.date}`,
    '"Última atualização" line',
  );

  const bars = overall.plans.map((plan) => ({
    label: plan.dir,
    done: plan.taskDone,
    total: plan.taskTotal,
    state: plan.state,
    // `stateOf` answers one of the four states, and PLAN_LABEL carries all four.
    stateLabel: String(PLAN_LABEL[plan.state]),
  }));

  replaceOnce(
    /(## Panorama[\s\S]*?```\n)[\s\S]*?(\n```)/,
    `$1${barsBlock(bars)}$2`,
    'progress bar block under "Panorama"',
  );

  for (const plan of overall.plans) {
    // Only the five-column row of the panel, ending in a state marker: the same document links
    // to every plan from prose tables, and a looser pattern rewrites one of those instead.
    replaceOnce(
      new RegExp(
        `^\\|\\s*(\\[[^\\]]*\\]\\(${plan.dir}/README\\.md\\))\\s*\\|[^|]*\\|[^|]*\\|[^|]*\\|[^|]*\\|\\s*[🔲🔄✅⛔]\\s*\\|\\s*$`,
        'mu',
      ),
      `| $1 | ${plan.phasesDone}/${plan.phaseTotal} | ${plan.taskDone}/${plan.taskTotal} | ` +
        `${plan.scenarioDone}/${plan.scenarioTotal} | ${plan.decisionDone}/${plan.decisionTotal} | ` +
        `${plan.state} |`,
      `table row for ${plan.dir}`,
    );
  }

  replaceOnce(
    /^\|\s*\*\*Total\*\*\s*\|.*$/m,
    `| **Total** | **${overall.phasesDone}/${overall.phaseTotal}** | ` +
      `**${overall.taskDone}/${overall.taskTotal}** | ` +
      `**${overall.scenarioDone}/${overall.scenarioTotal}** | ` +
      `**${overall.decisionDone}/${overall.decisionTotal}** | ${overall.state} |`,
    'total row',
  );

  return rewriter.finish();
}

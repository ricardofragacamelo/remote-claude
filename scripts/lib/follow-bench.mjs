/**
 * What the follower of plan 22 costs (B-19, D-11): the reads of a tick, on the store of whoever runs it.
 *
 * Read only, through the Agent SDK: `listSessions` to find the largest transcripts, `getSessionInfo`
 * — what every tick asks — and `getSessionMessages` — what a tick asks only when the conversation was
 * written. It prints times, sizes and heap, and **never** a word of a conversation: not a summary, not
 * a path, only the first group of an id.
 */

/**
 * @typedef {object} BenchSdk
 * @property {(options: { includeWorktrees: boolean }) => Promise<{ sessionId: string, fileSize?: number }[]>} listSessions
 * @property {(id: string) => Promise<unknown>} getSessionInfo
 * @property {(id: string) => Promise<unknown[]>} getSessionMessages
 */

/**
 * @typedef {object} BenchClock
 * @property {() => number} now milliseconds, fine-grained
 * @property {() => number} heap bytes of heap in use now
 */

/**
 * @typedef {object} Timing
 * @property {number} medianMs
 * @property {number} maxMs
 */

/**
 * @typedef {object} BenchReport
 * @property {{ id: string, megabytes: number, entries: number }[]} conversations the largest first
 * @property {Timing} info `getSessionInfo` of the largest — one tick that finds nothing written
 * @property {Timing} messages `getSessionMessages` of the largest — one tick after a write
 * @property {number} heapMegabytes heap the read of the largest left behind it, at most
 * @property {Timing} tickOfFour the four looked at together — `getSessionInfo` of each, at once
 * @property {number} rereadOfFourMs the four read again, two at a time, as the limiter lets them
 */

/** How many conversations followed at once the bench measures — the ceiling of one connection. */
export const FOLLOWED = 4;

/** How many times each read is repeated; the median says the usual, the maximum the worst. */
export const REPEATS = { info: 20, messages: 5, ticks: 10 };

/** @param {readonly number[]} samples */
export function timingOf(samples) {
  if (samples.length === 0) {
    return { medianMs: 0, maxMs: 0 };
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const at = (/** @type {number} */ index) => Number(sorted[index]);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (at(middle - 1) + at(middle)) / 2 : at(middle);

  return { medianMs: round(median), maxMs: round(at(sorted.length - 1)) };
}

/** @param {number} value */
function round(value) {
  return Math.round(value * 10) / 10;
}

/**
 * The largest conversations of the store, by the size the SDK reports.
 *
 * @param {readonly { sessionId: string, fileSize?: number }[]} sessions
 * @param {number} count
 */
export function largest(sessions, count) {
  return [...sessions]
    .filter((session) => typeof session.fileSize === 'number')
    .sort((left, right) => Number(right.fileSize) - Number(left.fileSize))
    .slice(0, count);
}

/**
 * Runs `task` `times` times, one after the other, and times each.
 *
 * @param {BenchClock} clock
 * @param {number} times
 * @param {() => Promise<unknown>} task
 */
async function timed(clock, times, task) {
  const samples = [];

  for (let run = 0; run < times; run += 1) {
    const started = clock.now();
    await task();
    samples.push(clock.now() - started);
  }

  return samples;
}

/**
 * At most `capacity` tasks at once, the rest in order — the `ReadLimiter` of the backend.
 *
 * @param {readonly (() => Promise<unknown>)[]} tasks
 * @param {number} capacity
 */
export async function limited(tasks, capacity) {
  const queue = [...tasks];
  const lanes = Array.from({ length: Math.min(capacity, queue.length) }, async () => {
    for (let task = queue.shift(); task !== undefined; task = queue.shift()) {
      await task();
    }
  });

  await Promise.all(lanes);
}

/**
 * Measures the reads of the follower on the store `sdk` reads.
 *
 * @param {BenchSdk} sdk
 * @param {BenchClock} clock
 * @returns {Promise<BenchReport | null>} `null` when the store has nothing to measure
 */
export async function measureFollow(sdk, clock) {
  const chosen = largest(await sdk.listSessions({ includeWorktrees: false }), FOLLOWED);
  const biggest = chosen[0];

  if (biggest === undefined) {
    return null;
  }

  const info = await timed(clock, REPEATS.info, () => sdk.getSessionInfo(biggest.sessionId));

  let heapPeak = 0;
  const messages = await timed(clock, REPEATS.messages, async () => {
    const before = clock.heap();
    const read = await sdk.getSessionMessages(biggest.sessionId);
    heapPeak = Math.max(heapPeak, clock.heap() - before);
    return read;
  });

  const conversations = [];
  for (const session of chosen) {
    conversations.push({
      id: session.sessionId.slice(0, 8),
      megabytes: round(Number(session.fileSize) / 1_048_576),
      entries: (await sdk.getSessionMessages(session.sessionId)).length,
    });
  }

  const ticks = await timed(clock, REPEATS.ticks, () =>
    Promise.all(chosen.map((session) => sdk.getSessionInfo(session.sessionId))),
  );

  const started = clock.now();
  await limited(
    chosen.map((session) => () => sdk.getSessionMessages(session.sessionId)),
    2,
  );

  return {
    conversations,
    info: timingOf(info),
    messages: timingOf(messages),
    heapMegabytes: round(Math.max(0, heapPeak) / 1_048_576),
    tickOfFour: timingOf(ticks),
    rereadOfFourMs: round(clock.now() - started),
  };
}

/**
 * The report as lines a person reads — and pastes into D-11.
 *
 * @param {BenchReport} report
 * @returns {string[]}
 */
export function reportLines(report) {
  return [
    ...report.conversations.map(
      (each) => `${each.id}…  ${String(each.megabytes)} MB  ${String(each.entries)} entries`,
    ),
    `getSessionInfo (largest)       median ${String(report.info.medianMs)} ms · max ${String(report.info.maxMs)} ms`,
    `getSessionMessages (largest)   median ${String(report.messages.medianMs)} ms · max ${String(report.messages.maxMs)} ms · heap +${String(report.heapMegabytes)} MB`,
    `tick of ${String(report.conversations.length)} conversations   median ${String(report.tickOfFour.medianMs)} ms · max ${String(report.tickOfFour.maxMs)} ms`,
    `reread of ${String(report.conversations.length)}, two at a time  ${String(report.rereadOfFourMs)} ms`,
  ];
}

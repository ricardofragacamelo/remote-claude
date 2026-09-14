/**
 * Waiting for a service to come up.
 *
 * The rule that gives this module its reason to exist: **a wait must notice the process it is
 * waiting for dying.** A loop that only polls a health endpoint hangs for the entire timeout
 * after the backend has already exited with a config error — and what the user sees is "timed
 * out after 120s", not the error that actually happened. So every wait takes a liveness check,
 * and aborts the moment it fails.
 */

/** A wait that hit its deadline, or whose subject died first. */
export class WaitError extends Error {
  /**
   * @param {string} message
   * @param {{ target: string, waitedMs: number, died: boolean }} detail
   */
  constructor(message, detail) {
    super(message);
    this.name = 'WaitError';
    this.target = detail.target;
    this.waitedMs = detail.waitedMs;
    this.died = detail.died;
  }
}

/**
 * @typedef {object} WaitOptions
 * @property {string} target what is being waited for, for the error message
 * @property {() => Promise<boolean>} probe resolves true once the target is ready
 * @property {() => string | null} [abortIf] reason to stop early — a dead process, typically
 * @property {number} [timeoutMs]
 * @property {number} [intervalMs]
 * @property {() => number} [now] injected clock, so the suite does not wait in real time
 * @property {(ms: number) => Promise<void>} [sleep]
 */

const defaultSleep = (/** @type {number} */ ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Polls `probe` until it answers true, the deadline passes, or `abortIf` gives a reason.
 *
 * @param {WaitOptions} options
 * @returns {Promise<void>}
 * @throws {WaitError}
 */
export async function waitUntil(options) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 500;
  const startedAt = now();

  for (;;) {
    const abort = options.abortIf?.() ?? null;
    if (abort !== null) {
      throw new WaitError(`${options.target} ${abort}`, {
        target: options.target,
        waitedMs: now() - startedAt,
        died: true,
      });
    }

    if (await options.probe()) {
      return;
    }

    if (now() - startedAt >= timeoutMs) {
      throw new WaitError(`${options.target} did not answer within ${timeoutMs}ms`, {
        target: options.target,
        waitedMs: now() - startedAt,
        died: false,
      });
    }

    await sleep(intervalMs);
  }
}

/**
 * The liveness check for a child process, in the shape `waitUntil` expects.
 *
 * @param {import('node:child_process').ChildProcess | undefined} proc
 * @returns {() => string | null}
 */
export function processAbort(proc) {
  return () => {
    if (proc === undefined || (proc.exitCode === null && proc.signalCode === null)) {
      return null;
    }

    const cause = proc.signalCode ?? `code ${String(proc.exitCode)}`;
    return `exited with ${cause} before it was ready`;
  };
}

/**
 * Waits for an HTTP endpoint to answer, giving up early if `proc` dies first.
 *
 * @param {string} url
 * @param {{ proc?: import('node:child_process').ChildProcess, timeoutMs?: number,
 *           intervalMs?: number, accept?: (status: number) => boolean }} [options]
 * @returns {Promise<void>}
 */
export function waitForHttp(url, options = {}) {
  const accept = options.accept ?? ((status) => status < 500);

  return waitUntil({
    target: url,
    abortIf: processAbort(options.proc),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.intervalMs === undefined ? {} : { intervalMs: options.intervalMs }),
    probe: async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
        return accept(response.status);
      } catch {
        // Connection refused while the service is still booting is the normal case here, not an
        // error to report: the deadline in waitUntil is what decides when to give up.
        return false;
      }
    },
  });
}

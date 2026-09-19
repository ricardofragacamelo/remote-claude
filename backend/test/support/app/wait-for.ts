/**
 * Polls until a condition holds, or gives up with what it last saw.
 *
 * It exists for the handful of facts that are **deliberately** not awaited by the code under
 * test — a decision written to the trail after the agent loop has already been released, say.
 * Asserting on those immediately would be asserting on a race, and asserting after a fixed sleep
 * would be asserting on the speed of the machine.
 *
 * The failure message carries the last value rather than only "timed out", because a poll that
 * ends in silence tells a reader nothing about which half went wrong.
 *
 * @param what the fact being waited for, for the failure message
 * @param read produces the current value
 * @param holds whether that value is the one the test is waiting for
 */
export async function waitFor<T>(
  what: string,
  read: () => Promise<T>,
  holds: (value: T) => boolean,
  timeoutMs = 2_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T = await read();

  while (!holds(last)) {
    if (Date.now() > deadline) {
      throw new Error(`${what} never happened; last saw ${JSON.stringify(last)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
    last = await read();
  }

  return last;
}

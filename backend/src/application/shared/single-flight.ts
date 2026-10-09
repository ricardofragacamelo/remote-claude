/**
 * One call in flight per key: whoever asks while the first call runs gets the first's answer — or
 * its failure — instead of making a second (plan 04, S-36; plan 13, S-18, S-33). Nothing is kept
 * once the call settles: what to remember of it is the caller's to decide.
 */
export class SingleFlight<T> {
  private readonly running = new Map<string, Promise<T>>();

  /** @throws whatever `ask` threw — to every caller that waited on it */
  run(key: string, ask: () => Promise<T>): Promise<T> {
    const pending = this.running.get(key);
    if (pending !== undefined) {
      return pending;
    }

    const asked = ask().finally(() => {
      this.running.delete(key);
    });
    this.running.set(key, asked);

    return asked;
  }
}

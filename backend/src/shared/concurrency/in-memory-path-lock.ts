import type { PathLock } from '@application/shared';

/**
 * One writer per real path, in this process — a queue per path, and nothing kept once it is empty.
 *
 * Each `run` waits for the work queued before it on the same path, then runs; a work that fails
 * still lets the next one go (S-127). A path nobody is writing costs no memory: the last one out
 * removes its entry, so the map holds only paths being written right now.
 */
export class InMemoryPathLock implements PathLock {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(realPath: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(realPath) ?? Promise.resolve();
    let release!: () => void;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => done);

    this.tails.set(realPath, tail);

    try {
      await previous;
      return await work();
    } finally {
      release();

      if (this.tails.get(realPath) === tail) {
        this.tails.delete(realPath);
      }
    }
  }

  /** How many paths are held or waited on right now. For the suite that proves nothing leaks. */
  get held(): number {
    return this.tails.size;
  }
}

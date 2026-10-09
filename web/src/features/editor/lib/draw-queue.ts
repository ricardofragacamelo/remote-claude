/** A drawing: given the signal that gives it up, it ends — or fails — on its own. */
export type Drawing = (signal: AbortSignal) => Promise<void>;

/** A queue of drawings, a few at a time. */
export interface DrawQueue {
  /**
   * Draws when a place frees up.
   *
   * @returns what gives it up — out of the queue if it had not started, aborted if it had
   */
  draw(drawing: Drawing, failed: (error: unknown) => void): () => void;

  /** How many are drawing now. */
  running(): number;
}

interface Queued {
  readonly drawing: Drawing;
  readonly failed: (error: unknown) => void;
  readonly controller: AbortController;
}

/**
 * At most `limit` drawings at a time, the others waiting their turn in the order they came (21 · D-11,
 * S-42) — the thumbnails of a long PDF, drawn as they come near the view, never all at once.
 */
export function createDrawQueue(limit: number): DrawQueue {
  const waiting: Queued[] = [];
  let running = 0;

  const next = (): void => {
    while (running < limit && waiting.length > 0) {
      const queued = waiting.shift() as Queued;
      running += 1;
      queued
        .drawing(queued.controller.signal)
        .catch((error: unknown) => {
          if (!queued.controller.signal.aborted) queued.failed(error);
        })
        .finally(() => {
          running -= 1;
          next();
        });
    }
  };

  return {
    draw: (drawing, failed) => {
      const queued: Queued = { drawing, failed, controller: new AbortController() };
      waiting.push(queued);
      next();

      return () => {
        const at = waiting.indexOf(queued);
        if (at === -1) {
          queued.controller.abort();
        } else {
          waiting.splice(at, 1);
        }
      };
    },
    running: () => running,
  };
}

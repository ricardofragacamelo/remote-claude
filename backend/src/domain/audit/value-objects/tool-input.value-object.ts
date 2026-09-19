/**
 * The input a tool was called with, exactly as it was called.
 *
 * "Exactly" is the whole value of this type. The log truncates — a prompt can carry a secret and a
 * `Read` result can carry a file — but the **trail** does not: a record that says "the command
 * began with `rm -rf /ho…`" answers none of the questions anybody asks of an audit trail. The two
 * are different artefacts with different rules, and this is the one that keeps everything (S-49).
 *
 * Immutable, because a trail whose entries can be edited after the fact is not a trail.
 */
export class ToolInput {
  private constructor(private readonly captured: string) {}

  /** Captures the input by serialising it once, so a later mutation cannot reach back into it. */
  static capture(input: Readonly<Record<string, unknown>>): ToolInput {
    return new ToolInput(JSON.stringify(input));
  }

  /** Rehydrates what the repository read back. */
  static restore(serialised: string): ToolInput {
    return new ToolInput(serialised);
  }

  /** The input as data. A fresh object each time, so nobody can mutate the record through it. */
  get value(): Record<string, unknown> {
    return JSON.parse(this.captured) as Record<string, unknown>;
  }

  /** The input as it is stored. */
  toString(): string {
    return this.captured;
  }
}

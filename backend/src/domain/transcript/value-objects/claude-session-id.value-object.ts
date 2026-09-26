import { InvalidClaudeSessionIdError } from '../errors/invalid-claude-session-id.error';

/** A UUID in the canonical form the Agent SDK hands out: lowercase, hyphenated. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Identity of a conversation as Claude stores it — the name of its JSONL, and what `resume` takes.
 *
 * It is **not** our `SessionId`. Ours is a ULID and names a live session of this process; this one
 * names a transcript on disk, which outlives every process and may have been started by the
 * editor. Two types, so the two can never be passed for each other.
 *
 * Only the canonical form is accepted. An uppercase variant is not the same id on a case-sensitive
 * filesystem, and it is not an id the SDK ever produced.
 */
export class ClaudeSessionId {
  private constructor(readonly value: string) {}

  /**
   * @param raw candidate identifier, as it arrived from the outside
   * @throws {InvalidClaudeSessionIdError} when it is not a canonical UUID
   */
  static create(raw: string): ClaudeSessionId {
    if (!UUID.test(raw)) {
      throw new InvalidClaudeSessionIdError(raw);
    }

    return new ClaudeSessionId(raw);
  }

  /**
   * The same rule as a question, for a caller that filters rather than refuses: `null` for what
   * {@link create} would reject.
   */
  static parse(raw: string): ClaudeSessionId | null {
    return UUID.test(raw) ? new ClaudeSessionId(raw) : null;
  }

  equals(other: ClaudeSessionId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

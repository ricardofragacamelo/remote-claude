import { InvalidConversationRefError } from '../errors/invalid-conversation-ref.error';
import { EngineId } from './engine-id.value-object';

/** The longest id of a conversation the core carries — what an engine hands out is far shorter. */
const MAX_ID = 256;

/**
 * Which conversation of which coding agent — `{ engine, id }`, in every port, table and frame.
 *
 * It is **not** our `SessionId`. Ours names a live session of this process; this one names a
 * conversation in the agent's own store, which outlives every process and may have been started
 * elsewhere. Whether `id` is an id that engine would hand out is the engine's question, asked by its
 * adapter: the core only refuses what no engine could mean.
 */
export class ConversationRef {
  private constructor(
    readonly engine: EngineId,
    readonly id: string,
  ) {}

  /**
   * @throws {InvalidConversationRefError} an engine that is not the form of one, or an empty id,
   *   one with whitespace, or one too long
   */
  static create(engine: string, id: string): ConversationRef {
    const ref = ConversationRef.parse(engine, id);
    if (ref === null) {
      throw new InvalidConversationRefError(engine, id);
    }
    return ref;
  }

  /** The same rule as a question, for a caller that filters rather than refuses. */
  static parse(engine: string, id: string): ConversationRef | null {
    const named = EngineId.parse(engine);
    const valid = id.length > 0 && id.length <= MAX_ID && !/\s/.test(id);
    return named !== null && valid ? new ConversationRef(named, id) : null;
  }

  /** One string for a map key or a log line — `engine:id`. */
  get key(): string {
    return `${this.engine.value}:${this.id}`;
  }

  equals(other: ConversationRef): boolean {
    return this.engine.equals(other.engine) && this.id === other.id;
  }

  toString(): string {
    return this.key;
  }
}

import { InvalidConversationRefError } from '../errors/invalid-conversation-ref.error';

/** How an engine is named: lowercase, a letter first, at most 32 characters. */
const ENGINE = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * The name of a coding agent the backend can drive.
 *
 * Which ones exist is configuration (`RC_ENGINES_ENABLED`), not domain: the domain only knows the
 * form of the name, and the registry of engines refuses one that is not enabled.
 */
export class EngineId {
  private constructor(readonly value: string) {}

  /**
   * @throws {InvalidConversationRefError} a name that is not the form of one
   */
  static create(raw: string): EngineId {
    const engine = EngineId.parse(raw);
    if (engine === null) {
      throw new InvalidConversationRefError(raw, '');
    }
    return engine;
  }

  /** The same rule as a question: `null` for what {@link create} would refuse. */
  static parse(raw: string): EngineId | null {
    return ENGINE.test(raw) ? new EngineId(raw) : null;
  }

  equals(other: EngineId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

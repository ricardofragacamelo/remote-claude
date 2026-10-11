import { AgentUnavailableError, InvalidConversationRefError } from '@domain/engine';
import type { ConversationRef, EngineDescription, EngineId } from '@domain/engine';
import type {
  AgentEnginePort,
  AgentSessionHandle,
  AgentSessionStart,
  EngineSelfDescription,
} from './ports/agent-engine.port';
import { SECURITY_CLAUSES, SECURITY_UNMET_REASON } from './ports/engine-security.port';
import type { SecurityClause } from './ports/engine-security.port';

/** An engine enabled whose security assertion failed, and the clauses it could not prove. */
export interface RefusedEngine {
  readonly engine: string;
  readonly unmet: readonly SecurityClause[];
}

/**
 * Which coding agents this installation drives, and which one a session opens on when nobody says
 * (ADR-025). The core asks it for an engine by name and never names one itself.
 *
 * Built at boot from the adapters the composition registered and the configuration
 * (`RC_ENGINES_ENABLED`, `RC_ENGINE_DEFAULT`); an engine that is not enabled is not here, and a
 * conversation of it is refused as if it never existed.
 */
export class EngineRegistry {
  private readonly ports: ReadonlyMap<string, AgentEnginePort>;

  /** The engines whose security assertion failed, in the order they were enabled (S-102). */
  readonly refused: readonly RefusedEngine[];

  /**
   * Each engine's security assertion runs here, once (plan 28, B-35). One that fails is kept — it is
   * listed, `unavailable` with {@link SECURITY_UNMET_REASON}, and no session opens on it — and the
   * boot goes on with the others (S-102).
   *
   * @param ports the engines enabled, at least one
   * @param defaultEngine the one a session opens on when the client names none — one of [ports]
   * @throws {Error} no engine, or a default that is not enabled — a configuration nobody can run
   */
  constructor(
    ports: readonly AgentEnginePort[],
    private readonly defaultEngine: string,
  ) {
    const refused: RefusedEngine[] = [];
    this.ports = new Map(
      ports.map((port) => {
        const unmet = unmetClauses(port);
        if (unmet.length === 0) {
          return [port.engine.value, port];
        }
        refused.push({ engine: port.engine.value, unmet });
        return [port.engine.value, new UnsafeEngine(port)];
      }),
    );
    this.refused = refused;
    if (!this.ports.has(defaultEngine)) {
      throw new Error(`the default engine "${defaultEngine}" is not one of the enabled engines`);
    }
  }

  /** The engine a session opens on when the client names none. */
  get default(): AgentEnginePort {
    return this.require(this.defaultEngine);
  }

  /** Every enabled engine, in the order the configuration listed them. */
  get all(): readonly AgentEnginePort[] {
    return [...this.ports.values()];
  }

  /** Whether [engine] is enabled here. */
  has(engine: string): boolean {
    return this.ports.has(engine);
  }

  /**
   * @throws {InvalidConversationRefError} an engine that is not enabled — the same answer as one
   *   that does not exist
   */
  require(engine: EngineId | string): AgentEnginePort {
    const name = typeof engine === 'string' ? engine : engine.value;
    const port = this.ports.get(name);
    if (port === undefined) {
      throw new InvalidConversationRefError(name, '');
    }
    return port;
  }

  /**
   * The conversation [id] of [engine], checked by the engine's own rule.
   *
   * @throws {InvalidConversationRefError} an engine not enabled, or an id it never hands out
   */
  conversation(engine: string, id: string): ConversationRef {
    const ref = this.require(engine).conversationOf(id);
    if (ref === null) {
      throw new InvalidConversationRefError(engine, id);
    }
    return ref;
  }

  /** What each enabled engine says of itself, asked together. No quota spent. */
  describeAll(): Promise<readonly EngineDescription[]> {
    return Promise.all(this.all.map((port) => port.describe()));
  }
}

/**
 * The clauses [port]'s assertion could not prove — none when it holds. An assertion that throws
 * proved nothing, and every clause is unmet: an engine is never let through on an error.
 */
function unmetClauses(port: AgentEnginePort): readonly SecurityClause[] {
  try {
    const assertion = port.security.assert();
    return assertion.holds ? [] : assertion.unmet;
  } catch {
    return SECURITY_CLAUSES;
  }
}

/**
 * An engine whose security assertion failed: it describes itself as `unavailable`, with the reason,
 * and refuses to open a session — before a conversation is minted and recorded for it, and again at
 * the start. Naming a conversation of it spawns nothing and stays the engine's own rule.
 */
class UnsafeEngine implements AgentEnginePort {
  constructor(private readonly port: AgentEnginePort) {}

  get engine(): EngineId {
    return this.port.engine;
  }

  get capabilities(): AgentEnginePort['capabilities'] {
    return this.port.capabilities;
  }

  get security(): AgentEnginePort['security'] {
    return this.port.security;
  }

  get commandMenu(): AgentEnginePort['commandMenu'] {
    return this.port.commandMenu;
  }

  async describe(): Promise<EngineSelfDescription> {
    return { ...(await this.port.describe()), state: 'unavailable', reason: SECURITY_UNMET_REASON };
  }

  newConversation(): ConversationRef {
    throw this.refusal('a new conversation');
  }

  conversationOf(id: string): ConversationRef | null {
    return this.port.conversationOf(id);
  }

  start(input: AgentSessionStart): Promise<AgentSessionHandle> {
    return Promise.reject(this.refusal(input.sessionId.value));
  }

  private refusal(subject: string): AgentUnavailableError {
    return new AgentUnavailableError(this.port.engine.value, subject);
  }
}

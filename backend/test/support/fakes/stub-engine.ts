import type {
  AgentEnginePort,
  AgentSessionHandle,
  AgentSessionStart,
  EngineSecurityContract,
  EngineSelfDescription,
  SessionEvent,
} from '@application/session';
import { ConversationRef, EngineId } from '@domain/engine';
import type { EngineCapabilities } from '@domain/engine';
import type { CommandMenu } from '@domain/session';
import { ALL_CAPABILITIES, RecordingHandle } from '../builders/session.builder';
import { SequentialUuids } from './sequential-uuids';

/** A UUID in the canonical form — the ids this engine hands out, like the adapter of the product. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * An engine that hands back a recording handle and keeps the callbacks the use case installed — the
 * port of ADR-025, with nothing behind it. Named `claude` by default, so a test of the product as it
 * is reads like one; any other name proves the core does not care.
 */
export class StubEngine implements AgentEnginePort {
  readonly engine: EngineId;
  /** What it can do — every capability, unless a test takes one away. */
  capabilities: EngineCapabilities = ALL_CAPABILITIES;
  readonly starts: AgentSessionStart[] = [];
  readonly handle = new RecordingHandle();
  readonly ids = new SequentialUuids();
  failWith: Error | null = null;
  describedTimes = 0;
  /** How it orders its menu — nothing said, unless a test says it (plan 28, B-37). */
  commandMenu: CommandMenu | undefined = undefined;
  /** Its security contract — one that holds, with one configuration file, unless a test breaks it. */
  security: EngineSecurityContract = {
    configFiles: ['.stub/config.json'],
    assert: () => ({ holds: true }),
  };

  /**
   * @param engine its name — `claude` by default
   * @param version the version it says of itself at boot
   */
  constructor(
    engine = 'claude',
    private readonly version: string | null = '1.0.0',
  ) {
    this.engine = EngineId.create(engine);
  }

  describe(): Promise<EngineSelfDescription> {
    this.describedTimes += 1;
    return Promise.resolve({
      engine: this.engine,
      displayName: 'Stub',
      state: 'available',
      reason: null,
      version: this.version,
      authenticated: null,
      capabilities: this.capabilities,
      components: {
        binary:
          this.version === null
            ? { version: null, reason: 'notInstalled' }
            : { version: this.version, reason: null },
        library: null,
      },
    });
  }

  newConversation(): ConversationRef {
    return ConversationRef.create(this.engine.value, this.ids.next());
  }

  conversationOf(id: string): ConversationRef | null {
    return UUID.test(id) ? ConversationRef.create(this.engine.value, id) : null;
  }

  start(input: AgentSessionStart): Promise<AgentSessionHandle> {
    this.starts.push(input);
    return this.failWith === null ? Promise.resolve(this.handle) : Promise.reject(this.failWith);
  }

  /** Replays an event as the runner would. */
  emit(event: SessionEvent): void {
    this.starts[0]?.onEvent(event);
  }
}

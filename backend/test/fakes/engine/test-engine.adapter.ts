import { randomUUID } from 'node:crypto';

import type {
  AgentEnginePort,
  AgentSessionHandle,
  AgentSessionStart,
  EngineSelfDescription,
} from '@application/session';
import { ConversationRef, EngineId } from '@domain/engine';
import { TEST_CAPABILITIES } from './test-capabilities';
import { TEST_ENGINE, TEST_ENGINE_DISPLAY_NAME, TEST_ENGINE_VERSION } from './test-engine';
import { testEngineSecurityContract } from './security-contract';
import { TestEngineSession } from './test-engine-session';
import type { TestEngineSessionDeps } from './test-engine-session';
import { TEST_SCRIPTS } from './script';
import type { TestEngineScript } from './script';

/** A UUID, the shape of id this engine hands out for a conversation — its own choice (ADR-025). */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The fake engine of plan 28, B-43: a second, honest implementation of {@link AgentEnginePort}, with
 * other native tool names, fewer capabilities, and its own scripted turns — built so the port
 * contract suite (`backend/test/integration/port-contract/`), and later the web/app e2e of
 * B-44/B-45, have a real second engine to run against, never only Claude's fixtures replayed under
 * a different label.
 *
 * It is never composed into production (S-121): this whole folder lives under `backend/test/`, and
 * `dependency-cruiser.config.mjs`'s `no-test-engine-in-production` rule fails the build on any import
 * of it from `backend/src/`. The only place that ever builds one is a suite's own test harness
 * (`backend/test/fakes/engine/compose.ts`), the same way `engine-security.gateway.spec.ts` wires in
 * its own `StubEngine` — except this one actually drives a session.
 */
export class TestEngineAdapter implements AgentEnginePort {
  readonly engine = EngineId.create(TEST_ENGINE);
  readonly capabilities = TEST_CAPABILITIES;
  readonly security = testEngineSecurityContract();

  constructor(
    private readonly deps: TestEngineSessionDeps,
    private readonly script: TestEngineScript = TEST_SCRIPTS,
    private readonly defaultTurn: string = 'text-turn',
  ) {}

  /**
   * What this fake says of itself: always installed, with a fixed version — it drives no real
   * binary to ask. `authenticated` is `null`, the same answer Claude's own `describe()` gives: there
   * is no login to ask about without spending a subprocess, and this fake spends none at all.
   */
  describe(): Promise<EngineSelfDescription> {
    return Promise.resolve({
      engine: this.engine,
      displayName: TEST_ENGINE_DISPLAY_NAME,
      state: 'available',
      reason: null,
      version: TEST_ENGINE_VERSION,
      authenticated: null,
      capabilities: TEST_CAPABILITIES,
      components: { binary: { version: TEST_ENGINE_VERSION, reason: null }, library: null },
    });
  }

  newConversation(): ConversationRef {
    return ConversationRef.create(TEST_ENGINE, randomUUID());
  }

  conversationOf(id: string): ConversationRef | null {
    return ID.test(id) ? ConversationRef.create(TEST_ENGINE, id) : null;
  }

  start(input: AgentSessionStart): Promise<AgentSessionHandle> {
    // Synchronous, like Claude's own `start()`: there is nothing here that could need a promise, and
    // the signature stays one so a future, slower engine does not change every caller.
    return Promise.resolve(new TestEngineSession(input, this.deps, this.script, this.defaultTurn));
  }
}

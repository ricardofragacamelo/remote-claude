import type { TestingModuleBuilder } from '@nestjs/testing';

import {
  EngineRegistry,
  SESSION_FILE_JOURNAL,
  SESSION_PERMISSION_GATE,
  TOOL_INVOCATION_RECORDER,
} from '@application/session';
import type {
  AgentEnginePort,
  SessionFileJournal,
  SessionPermissionGate,
  ToolInvocationRecorder,
} from '@application/session';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { APP_CONFIG } from '@infra/config/environment';
import type { AppConfig } from '@infra/config/environment';
import { engineRegistryOf } from '@infra/modules/engines';
import { CLAUDE_SESSION_ENGINE } from '@infra/modules/engines/claude.providers';
import { LOGGER } from '@shared/logging/logger';
import type { Logger } from '@shared/logging/logger';
import { TestEngineAdapter } from './test-engine.adapter';
import { TEST_SCRIPTS } from './script';
import type { TestEngineScript } from './script';

/**
 * Wires the test engine into a suite's `TestingModule`, beside Claude — the one entry point a
 * production boot can never reach, because the class only exists under `backend/test/`, and nothing
 * a production composition (`backend/src/infrastructure/modules/engines/`) imports reaches it (S-121,
 * `no-test-engine-in-production` of `dependency-cruiser.config.mjs`).
 *
 * The same shape `engine-security.gateway.spec.ts` already uses to replace `EngineRegistry` with its
 * own `StubEngine` beside Claude — here with an engine that actually drives a session, built from the
 * **same** generic ports (`SESSION_PERMISSION_GATE`, `TOOL_INVOCATION_RECORDER`,
 * `SESSION_FILE_JOURNAL`) Claude's own adapter is built from, read out of the container that the real
 * `AppModule` already wires them into (`session.module.ts`, `claude.providers.ts`) — nothing about
 * this fake is special-cased at the DI level.
 *
 * @param script what the engine replays — `TEST_SCRIPTS` unless a suite hands its own
 * @param defaultTurn the turn a prompt with no `[fixture:…]` tag of its own replays
 */
export function withTestEngine(
  script: TestEngineScript = TEST_SCRIPTS,
  defaultTurn = 'text-turn',
): (builder: TestingModuleBuilder) => TestingModuleBuilder {
  return (builder) =>
    builder.overrideProvider(EngineRegistry).useFactory({
      inject: [
        APP_CONFIG,
        LOGGER,
        CLAUDE_SESSION_ENGINE,
        SESSION_PERMISSION_GATE,
        TOOL_INVOCATION_RECORDER,
        SESSION_FILE_JOURNAL,
        CLOCK,
      ],
      factory: (
        config: AppConfig,
        logger: Logger,
        claude: AgentEnginePort,
        permissions: SessionPermissionGate,
        recorder: ToolInvocationRecorder,
        journal: SessionFileJournal,
        clock: Clock,
      ) => {
        const test = new TestEngineAdapter(
          { permissions, recorder, journal, clock, logger },
          script,
          defaultTurn,
        );
        return engineRegistryOf([claude, test], config.engines, logger);
      },
    });
}

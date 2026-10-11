import { Inject, Injectable } from '@nestjs/common';

import {
  SESSION_FILE_JOURNAL,
  SESSION_PERMISSION_GATE,
  TOOL_INVOCATION_RECORDER,
} from '@application/session';
import type {
  AgentEnginePort,
  AgentSessionHandle,
  AgentSessionStart,
  EngineSelfDescription,
  SessionFileJournal,
  SessionPermissionGate,
  ToolInvocationRecorder,
} from '@application/session';
import { CLOCK, SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { EngineId } from '@domain/engine';
import type { ConversationRef } from '@domain/engine';
import { CLAUDE_COMMAND_MENU } from '@domain/engines/claude';
import type { Clock, IdGenerator } from '@domain/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { CLAUDE_CAPABILITIES } from './claude-capabilities';
import { CLAUDE_CONVERSATION_IDS, claudeConversation } from './claude-conversation';
import { CLAUDE_ENGINE } from './claude-engine';
import { CLAUDE_INSTALLATION } from './claude-installation';
import type { ClaudeInstallation } from './claude-installation';
import { BUNDLED_CLI_VERSION } from './cli-version';
import { QUERY_FACTORY } from './query.factory';
import type { QueryFactory } from './query.factory';
import { SESSION_LIMITS } from './session-limits';
import type { SessionLimits } from './sdk-options.factory';
import { SessionRunner } from './session-runner';
import { CLAUDE_SECURITY_CONTRACT } from './security-contract';

/**
 * The Agent SDK, behind the port.
 *
 * The technology is in the name on purpose: reading it tells you what breaks the day the SDK
 * changes. It is also the only class in the application allowed to know the SDK exists — the
 * dependency-cruiser rule `sdk-is-isolated` fails the build on any import of `@anthropic-ai/*`
 * outside this folder, and that rule was written before the folder was.
 */
@Injectable()
export class AgentSdkClaudeSessionAdapter implements AgentEnginePort {
  readonly engine = EngineId.create(CLAUDE_ENGINE);

  /** What a session of Claude can do — the same for every session today (ADR-025). */
  readonly capabilities = CLAUDE_CAPABILITIES;

  /**
   * How Claude keeps the security contract of every engine (plan 28, B-35): asserted when the
   * registry is built, and again by the factory of every `query()` this adapter opens.
   */
  readonly security = CLAUDE_SECURITY_CONTRACT;

  /** Claude's menu: its suggested commands first, and the skills of the user and of the system badged (B-37). */
  readonly commandMenu = CLAUDE_COMMAND_MENU;

  constructor(
    @Inject(QUERY_FACTORY) private readonly createQuery: QueryFactory,
    @Inject(TOOL_INVOCATION_RECORDER) private readonly recorder: ToolInvocationRecorder,
    @Inject(SESSION_FILE_JOURNAL) private readonly journal: SessionFileJournal,
    @Inject(SESSION_PERMISSION_GATE) private readonly permissions: SessionPermissionGate,
    @Inject(SESSION_LIMITS) private readonly limits: SessionLimits,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SCHEDULER) private readonly scheduler: Scheduler,
    // Read once, when the container is built: the binary the SDK spawns does not change while the
    // process runs.
    @Inject(BUNDLED_CLI_VERSION) private readonly cliVersion: string | null,
    @Inject(LOGGER) private readonly logger: Logger,
    // Mints the UUID the SDK is told to use for a new conversation, before the subprocess exists.
    @Inject(CLAUDE_CONVERSATION_IDS) private readonly conversationIds: IdGenerator,
    // The CLI and the SDK as the files that pin them say, read once — what the "About" screen lists.
    @Inject(CLAUDE_INSTALLATION) private readonly installation: ClaudeInstallation,
  ) {}

  /**
   * What the installation says of itself without spawning anything: the version of the binary the
   * SDK spawns, read at boot. Whether the CLI is logged in is not known without asking it, which
   * costs a subprocess — `null` (ADR-025). The parts are the CLI binary and the SDK it is driven
   * through, each with its version or why there is none.
   */
  describe(): Promise<EngineSelfDescription> {
    return Promise.resolve({
      engine: this.engine,
      displayName: 'Claude Code',
      state: this.cliVersion === null ? 'unavailable' : 'available',
      reason: this.cliVersion === null ? 'engine.error.notInstalled' : null,
      version: this.cliVersion,
      authenticated: null,
      capabilities: CLAUDE_CAPABILITIES,
      components: { binary: this.installation.cli, library: this.installation.sdk },
    });
  }

  newConversation(): ConversationRef {
    const conversation = claudeConversation(this.conversationIds.next());
    if (conversation === null) {
      throw new Error('the generator of conversation ids minted something that is not a UUID');
    }
    return conversation;
  }

  conversationOf(id: string): ConversationRef | null {
    return claudeConversation(id);
  }

  start(input: AgentSessionStart): Promise<AgentSessionHandle> {
    const runner = new SessionRunner(input, {
      createQuery: this.createQuery,
      recorder: this.recorder,
      journal: this.journal,
      permissions: this.permissions,
      limits: this.limits,
      clock: this.clock,
      scheduler: this.scheduler,
      bundledCliVersion: this.cliVersion,
      logger: this.logger,
    });

    // Synchronous, and the signature is still a promise: spawning is synchronous today and the
    // port must not promise otherwise, because a future SDK that awaits the subprocess would
    // change every caller if this were typed as returning a value.
    runner.run();

    return Promise.resolve(runner);
  }
}

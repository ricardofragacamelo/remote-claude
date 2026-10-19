import type { Provider } from '@nestjs/common';

import {
  ApplyPermissionModeUseCase,
  EndSessionPermissionsUseCase,
  RequestPermissionUseCase,
} from '@application/permission';
import {
  AGENT_LOOP_RELEASE,
  SESSION_BROADCASTER,
  SESSION_PERMISSION_GATE,
  SessionRegistry,
} from '@application/session';
import type { SessionBroadcaster } from '@application/session';
import type { EngineToolClassifier } from '@application/engine';
import { AgentSdkClaudeSessionAdapter } from '@adapter/outbound/engines/claude/agent-sdk.adapter';
import { CLAUDE_ENGINE } from '@adapter/outbound/engines/claude/claude-engine';
import { PermissionBridge } from '@adapter/outbound/engines/claude/permission-bridge';
import { SESSION_LIMITS } from '@adapter/outbound/engines/claude/session-limits';
import { claudeMcpEngineDialect } from '@adapter/outbound/engines/claude/mcp-engine-dialect';
import { AgentSdkMcpServerConnectionTest } from '@adapter/outbound/engines/claude/mcp-server-connection-test.adapter';
import { ClaudeProjectMcpFileReader } from '@adapter/outbound/engines/claude/project-mcp-file.reader';
import { claudeRuleDialect } from '@adapter/outbound/engines/claude/rule-dialect';
import { classifyTool } from '@adapter/outbound/engines/claude/tool-classifier';
import { AgentSdkTranscriptAdapter } from '@adapter/outbound/engines/claude/transcript.adapter';
import {
  TRANSCRIPT_LIMITS,
  TRANSCRIPT_READ_LIMITS,
} from '@adapter/outbound/engines/claude/transcript-reads';
import { realTranscriptSdk, TRANSCRIPT_SDK } from '@adapter/outbound/engines/claude/transcript-sdk';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { APP_CONFIG } from '../../config/environment';
import type { AppConfig } from '../../config/environment';

/**
 * What a session of the engine `claude` needs from the session module, composed here (ADR-025):
 * its limits, the bridge that answers the SDK's permission callback — and releases it — and the
 * adapter itself.
 */
export const claudeSessionProviders: readonly Provider[] = [
  {
    provide: SESSION_LIMITS,
    inject: [APP_CONFIG],
    useFactory: (config: AppConfig) => config.session.limits,
  },
  {
    // Built by factory rather than by reflection, because it needs the broadcaster token and a
    // token cannot be inferred from a type.
    provide: PermissionBridge,
    inject: [
      RequestPermissionUseCase,
      EndSessionPermissionsUseCase,
      ApplyPermissionModeUseCase,
      SessionRegistry,
      SESSION_BROADCASTER,
      LOGGER,
    ],
    useFactory: (
      request: RequestPermissionUseCase,
      endPermissions: EndSessionPermissionsUseCase,
      applyMode: ApplyPermissionModeUseCase,
      registry: SessionRegistry,
      broadcaster: SessionBroadcaster,
      logger: Logger,
    ) => new PermissionBridge(request, endPermissions, applyMode, registry, broadcaster, logger),
  },
  { provide: SESSION_PERMISSION_GATE, useExisting: PermissionBridge },
  // The same bridge lets the loop go when a request is settled: the consumer of
  // `permission.resolved` asks the port, and never knows the engine behind it (plan 28, B-34).
  { provide: AGENT_LOOP_RELEASE, useExisting: PermissionBridge },
  AgentSdkClaudeSessionAdapter,
];

/** The engine port of `claude`, as a token the registry is built from. */
export const CLAUDE_SESSION_ENGINE = AgentSdkClaudeSessionAdapter;

/** What the history of `claude` needs from the transcript module. */
export const claudeTranscriptProviders: readonly Provider[] = [
  { provide: TRANSCRIPT_SDK, useValue: realTranscriptSdk },
  { provide: TRANSCRIPT_LIMITS, useValue: TRANSCRIPT_READ_LIMITS },
  AgentSdkTranscriptAdapter,
];

/** The history store of `claude`, as a token the registry of stores is built from. */
export const CLAUDE_TRANSCRIPT_STORE = AgentSdkTranscriptAdapter;

/** The token of the classifier of the engine `claude`, for the registry of classifiers. */
export const CLAUDE_TOOL_CLASSIFIER = Symbol('ClaudeToolClassifier');

/** How the engine `claude` reads a call kept in its own words — pure, needing nothing (D-31). */
export const claudeToolClassifierProviders: readonly Provider[] = [
  {
    provide: CLAUDE_TOOL_CLASSIFIER,
    useValue: { engine: CLAUDE_ENGINE, classify: classifyTool } satisfies EngineToolClassifier,
  },
];

/** The token of the rule dialect of the engine `claude`, for the registry of dialects. */
export const CLAUDE_RULE_DIALECT = Symbol('ClaudeRuleDialect');

/** How the engine `claude` translates a rule written in its grammar — pure (plan 28, B-31). */
export const claudeRuleDialectProviders: readonly Provider[] = [
  { provide: CLAUDE_RULE_DIALECT, useValue: claudeRuleDialect },
];

/**
 * How the engine `claude` keeps the security contract — its configuration files among it — known
 * without building the adapter, so the files are sensitive whether the engine is enabled or not.
 */
export { CLAUDE_SECURITY_CONTRACT } from '@adapter/outbound/engines/claude/security-contract';

/** The token of the MCP dialect of the engine `claude`, for the registry of dialects (plan 13, B-18). */
export const CLAUDE_MCP_DIALECT = Symbol('ClaudeMcpDialect');

/** What the engine `claude` refuses of an MCP server name, and reserves of an env var — pure. */
export const claudeMcpDialectProviders: readonly Provider[] = [
  { provide: CLAUDE_MCP_DIALECT, useValue: claudeMcpEngineDialect },
];

/** The token of the project MCP reader of the engine `claude` (`.mcp.json`), for its registry (B-24). */
export const CLAUDE_PROJECT_MCP_SOURCE = Symbol('ClaudeProjectMcpSource');

/** How the engine `claude` reads its own project MCP file — stateless, so one instance is enough. */
export const claudeProjectMcpSourceProviders: readonly Provider[] = [
  { provide: CLAUDE_PROJECT_MCP_SOURCE, useClass: ClaudeProjectMcpFileReader },
];

/** The token of the connection tester of the engine `claude`, for its registry (plan 13, B-25). */
export const CLAUDE_MCP_SERVER_CONNECTION_TESTER = Symbol('ClaudeMcpServerConnectionTester');

/** How the engine `claude` tests one server's connection — a throwaway probe, through `EphemeralClaude`. */
export const claudeMcpServerConnectionTesterProviders: readonly Provider[] = [
  { provide: CLAUDE_MCP_SERVER_CONNECTION_TESTER, useClass: AgentSdkMcpServerConnectionTest },
];

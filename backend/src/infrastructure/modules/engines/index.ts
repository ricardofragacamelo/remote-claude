import type { Provider } from '@nestjs/common';

import { ToolClassifiers } from '@application/engine';
import type { EngineToolClassifier } from '@application/engine';
import {
  McpEngineCapabilities,
  McpEngineDialects,
  ProjectMcpServersSources,
} from '@application/mcp';
import type { ProjectMcpServersSource } from '@application/mcp';
import { RuleDialects } from '@application/permission';
import type { RuleDialect } from '@application/permission';
import { EngineRegistry } from '@application/session';
import type { AgentEnginePort, EngineSecurityContract } from '@application/session';
import { TRANSCRIPT_STORE, TranscriptStoreRegistry } from '@application/transcript';
import type { EngineTranscriptStore } from '@application/transcript';
import { EngineId } from '@domain/engine';
import type { McpEngineDialect } from '@domain/mcp';
import { SensitiveFiles } from '@domain/files';
import { CLAUDE_CAPABILITIES } from '@adapter/outbound/engines/claude/claude-capabilities';
import { CLAUDE_ENGINE } from '@adapter/outbound/engines/claude/claude-engine';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { APP_CONFIG } from '../../config/environment';
import type { AppConfig, EngineEnvironment } from '../../config/environment';
import { claudeEnvironment, forgetEmptyClaudeConfigDir } from './claude.environment';
import { ClaudeSettingsModule } from './claude-settings.module';
import { enabledEngines } from './engine-selection';
import {
  CLAUDE_MCP_DIALECT,
  CLAUDE_PROJECT_MCP_SOURCE,
  CLAUDE_RULE_DIALECT,
  CLAUDE_SECURITY_CONTRACT,
  CLAUDE_SESSION_ENGINE,
  CLAUDE_TOOL_CLASSIFIER,
  CLAUDE_TRANSCRIPT_STORE,
  claudeMcpDialectProviders,
  claudeProjectMcpSourceProviders,
  claudeRuleDialectProviders,
  claudeSessionProviders,
  claudeToolClassifierProviders,
  claudeTranscriptProviders,
} from './claude.providers';

/**
 * The composition of the engines (ADR-025): the one place of the core that knows which engine
 * extensions exist. Each extension adds its providers and tokens here, and the core asks the
 * registries built below — never an engine by name.
 */
/** The one enabled today, under the neutral name the core asks the composition by. */
export { ClaudeEngineModule as EngineModule } from './claude.module';
export { enabledEngines } from './engine-selection';

/**
 * The variables of every engine's extension, validated at boot with the core's (plan 28, B-37) —
 * the default model of each engine among them.
 */
export const ENGINE_ENVIRONMENTS: readonly EngineEnvironment[] = [claudeEnvironment];

/**
 * Quirks of an engine's own process environment, fixed before anything else reads it — ahead of DI,
 * ahead of the core's own validation (plan 04, F5). Each is the core asking an extension to fix what
 * only it knows is broken, never fixing it by the engine's name itself.
 */
export const ENGINE_ENVIRONMENT_FIXUPS: readonly ((env: NodeJS.ProcessEnv) => void)[] = [
  forgetEmptyClaudeConfigDir,
];

/** The modules of the engines' extensions: what only one engine has, with its routes. */
export const ENGINE_MODULES = [ClaudeSettingsModule];

/**
 * The registry of the engines [registered] that the configuration enables — each one's security
 * assertion run as it is built (plan 28, B-35). An engine whose assertion fails is said at `warn`,
 * with the clauses it could not prove, and stays listed as `unavailable`; the others start (S-102).
 *
 * @throws {Error} an unknown name — see {@link enabledEngines}
 */
export function engineRegistryOf(
  registered: readonly AgentEnginePort[],
  engines: AppConfig['engines'],
  logger: Logger,
): EngineRegistry {
  const { enabled, defaultEngine } = enabledEngines(registered, engines);
  const registry = new EngineRegistry(enabled, defaultEngine);
  for (const { engine, unmet } of registry.refused) {
    logger.warn(
      { op: 'engine.security.assert', layer: 'infrastructure', engine, unmet },
      'an engine failed its security assertion and stays unavailable',
    );
  }
  return registry;
}

/** What the session module wires of the engines: each engine's providers, and the registry. */
export const engineSessionProviders: readonly Provider[] = [
  ...claudeSessionProviders,
  {
    provide: EngineRegistry,
    inject: [APP_CONFIG, LOGGER, CLAUDE_SESSION_ENGINE],
    useFactory: (config: AppConfig, logger: Logger, ...ports: AgentEnginePort[]) =>
      engineRegistryOf(ports, config.engines, logger),
  },
];

/**
 * The security contract of every engine an adapter registers — enabled or not: the configuration of
 * an engine that is off is still a file another agent can rewrite (plan 28, B-35).
 */
const REGISTERED_SECURITY_CONTRACTS: readonly EngineSecurityContract[] = [CLAUDE_SECURITY_CONTRACT];

/** The sensitive files of a folder: the configuration files each of [contracts] declares (S-103). */
export function sensitiveFilesOf(contracts: readonly EngineSecurityContract[]): SensitiveFiles {
  return SensitiveFiles.of(contracts.flatMap((contract) => contract.configFiles));
}

/** DI token of the {@link SensitiveFiles} the writes of the files module take the second step for. */
export const ENGINE_SENSITIVE_FILES = Symbol('EngineSensitiveFiles');

/** What the files module wires of the engines: the configuration files they all declare. */
export const engineSensitiveFileProviders: readonly Provider[] = [
  { provide: ENGINE_SENSITIVE_FILES, useValue: sensitiveFilesOf(REGISTERED_SECURITY_CONTRACTS) },
];

/** What the transcript module wires of the engines: each engine's store, and the one that routes. */
export const engineTranscriptProviders: readonly Provider[] = [
  ...claudeTranscriptProviders,
  {
    provide: TranscriptStoreRegistry,
    inject: [APP_CONFIG, CLAUDE_TRANSCRIPT_STORE],
    useFactory: (config: AppConfig, ...stores: EngineTranscriptStore[]) => {
      const { enabled, defaultEngine } = enabledEngines(stores, config.engines);
      return new TranscriptStoreRegistry(enabled, defaultEngine);
    },
  },
  { provide: TRANSCRIPT_STORE, useExisting: TranscriptStoreRegistry },
];

/**
 * What a module that reads calls kept in an engine's own words wires: each engine's classifier, and
 * the registry that routes by engine (plan 28, D-31) — the trail's query today, the migration of the
 * rules in F5.
 */
export const engineToolClassifierProviders: readonly Provider[] = [
  ...claudeToolClassifierProviders,
  {
    provide: ToolClassifiers,
    inject: [APP_CONFIG, CLAUDE_TOOL_CLASSIFIER],
    useFactory: (config: AppConfig, ...classifiers: EngineToolClassifier[]) => {
      const { enabled, defaultEngine } = enabledEngines(
        classifiers.map((classifier) => ({
          ...classifier,
          engine: EngineId.create(classifier.engine),
        })),
        config.engines,
      );
      return new ToolClassifiers(
        enabled.map(({ engine, classify }) => ({ engine: engine.value, classify })),
        defaultEngine,
      );
    },
  },
];

/**
 * What the migration of the rules wires: each engine's rule dialect, and the registry that routes by
 * engine — the default engine for a rule that does not say (plan 28, B-31, B-33).
 */
export const engineRuleDialectProviders: readonly Provider[] = [
  ...claudeRuleDialectProviders,
  {
    provide: RuleDialects,
    inject: [APP_CONFIG, CLAUDE_RULE_DIALECT],
    useFactory: (config: AppConfig, ...dialects: RuleDialect[]) => {
      const { enabled, defaultEngine } = enabledEngines(
        dialects.map((dialect) => ({ dialect, engine: EngineId.create(dialect.engine) })),
        config.engines,
      );
      return new RuleDialects(
        enabled.map(({ dialect }) => dialect),
        defaultEngine,
      );
    },
  },
];

/** Which enabled engines carry the `mcp` capability — a static fact of each, read with none built. */
const MCP_CAPABLE_ENGINES: readonly { readonly engine: EngineId; readonly capable: boolean }[] = [
  { engine: EngineId.create(CLAUDE_ENGINE), capable: CLAUDE_CAPABILITIES.mcp },
];

/**
 * What the `mcp` module wires of the engines (plan 13, B-18, B-19): which enabled engines carry the
 * capability, and each one's dialect — the engine's own refusal of a server name and the env vars
 * it reserves. Neither reaches `application/mcp` except through these two registries.
 */
export const engineMcpProviders: readonly Provider[] = [
  ...claudeMcpDialectProviders,
  ...claudeProjectMcpSourceProviders,
  {
    provide: McpEngineCapabilities,
    inject: [APP_CONFIG],
    useFactory: (config: AppConfig) => {
      const { enabled } = enabledEngines(MCP_CAPABLE_ENGINES, config.engines);
      return new McpEngineCapabilities(
        enabled.filter(({ capable }) => capable).map(({ engine }) => engine.value),
      );
    },
  },
  {
    provide: McpEngineDialects,
    inject: [APP_CONFIG, CLAUDE_MCP_DIALECT],
    useFactory: (config: AppConfig, ...dialects: McpEngineDialect[]) => {
      const { enabled } = enabledEngines(
        dialects.map((dialect) => ({ dialect, engine: EngineId.create(dialect.engine) })),
        config.engines,
      );
      return new McpEngineDialects(enabled.map(({ dialect }) => dialect));
    },
  },
  {
    provide: ProjectMcpServersSources,
    inject: [APP_CONFIG, CLAUDE_PROJECT_MCP_SOURCE],
    useFactory: (config: AppConfig, claudeSource: ProjectMcpServersSource) => {
      const { enabled } = enabledEngines(
        [{ engine: EngineId.create('claude'), source: claudeSource }],
        config.engines,
      );
      return new ProjectMcpServersSources(
        enabled.map(({ engine, source }) => ({ engine: engine.value, source })),
      );
    },
  },
];

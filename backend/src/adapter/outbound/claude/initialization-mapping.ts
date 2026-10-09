import type {
  AccountInfo,
  AgentInfo,
  SDKControlInitializeResponse,
} from '@anthropic-ai/claude-agent-sdk';

import type {
  InstallationAccount,
  InstallationAgent,
  SessionInitialization,
} from '@domain/session';
import { toInstallationModel } from './installation-mapping';
import { toSlashCommand } from './slash-command-mapping';

/** A string the CLI gave, or nothing — an empty string is nothing too. */
function text(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

/**
 * The account as the CLI describes it → ours: who and which plan, and of the sources of the
 * credential only their **names** — never a token, never the path of a credential file (D-07).
 */
export function toInstallationAccount(account: AccountInfo | undefined): InstallationAccount {
  return {
    email: text(account?.email),
    organization: text(account?.organization),
    plan: text(account?.subscriptionType),
    provider: text(account?.apiProvider),
    tokenSource: text(account?.tokenSource),
    apiKeySource: text(account?.apiKeySource),
  };
}

/** A subagent as the CLI lists it → ours. */
export function toInstallationAgent(agent: AgentInfo): InstallationAgent {
  return { name: agent.name, description: agent.description, model: text(agent.model) };
}

/**
 * The answer of `initializationResult()` → ours: one question that brings the commands, the agents,
 * the models, the output styles and the account together (plan 13, D-05).
 */
export function toSessionInitialization(init: SDKControlInitializeResponse): SessionInitialization {
  return {
    commands: init.commands.map(toSlashCommand),
    agents: init.agents.map(toInstallationAgent),
    models: init.models.map(toInstallationModel),
    outputStyle: init.output_style,
    outputStyles: init.available_output_styles,
    account: toInstallationAccount(init.account),
  };
}

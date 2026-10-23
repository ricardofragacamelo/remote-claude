import type { TFunction } from 'i18next';

import type { HelpExtra } from '@/shared/components/HelpPanel';

/**
 * The help of "Servidores MCP", written for somebody who has never seen MCP (plan 13, B-30, S-138):
 * what a server is, the difference between a command on this machine and a network endpoint, why
 * adding one is as sensitive as a permission rule that never asks again and what the second step
 * checks, what "needs sign-in" means and how it is resolved — on the machine, never through this
 * product —, why the project's own MCP file needs approval and goes back to pending when it changes,
 * and what is never recorded. Core, so `{{agent}}` is the only name a body ever uses — never this
 * installation's one engine by name.
 */
export function mcpSectionHelp(t: TFunction, engine: string): HelpExtra[] {
  return [
    {
      id: 'mcp-what',
      heading: t('agentSettings.help.mcpWhatHeading'),
      body: t('agentSettings.help.mcpWhatBody', { engine }),
    },
    {
      id: 'mcp-transport',
      heading: t('agentSettings.help.mcpTransportHeading'),
      body: t('agentSettings.help.mcpTransportBody', { engine }),
    },
    {
      id: 'mcp-second-step',
      heading: t('agentSettings.help.mcpSecondStepHeading'),
      body: t('agentSettings.help.mcpSecondStepBody', { engine }),
    },
    {
      id: 'mcp-needs-auth',
      heading: t('agentSettings.help.mcpNeedsAuthHeading'),
      body: t('agentSettings.help.mcpNeedsAuthBody', { engine }),
    },
    {
      id: 'mcp-project-file',
      heading: t('agentSettings.help.mcpProjectFileHeading'),
      body: t('agentSettings.help.mcpProjectFileBody', { engine }),
    },
    {
      id: 'mcp-secrets',
      heading: t('agentSettings.help.mcpSecretsHeading'),
      body: t('agentSettings.help.mcpSecretsBody'),
    },
  ];
}

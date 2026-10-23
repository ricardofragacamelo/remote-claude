import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';

import { createI18n } from '@/shared/i18n';
import { mcpSectionHelp } from '@/features/mcp';

const en = createI18n('en').t as TFunction;
const pt = createI18n('pt-BR').t as TFunction;

/**
 * The help of "Servidores MCP" (plan 13, B-30, S-138) — core, `{{agent}}` resolved from the engine it
 * is given, in both languages, never the engine's own name written in.
 */
describe('mcpSectionHelp — written for somebody who has never seen MCP', () => {
  it('has one entry per topic the plan names, each with a unique id', () => {
    const entries = mcpSectionHelp(en, 'claude');

    expect(entries.map((entry) => entry.id)).toEqual([
      'mcp-what',
      'mcp-transport',
      'mcp-second-step',
      'mcp-needs-auth',
      'mcp-project-file',
      'mcp-secrets',
    ]);
  });

  it('explains what an MCP server is, naming the engine it is given', () => {
    const [what] = mcpSectionHelp(en, 'claude');

    expect(what?.heading).toBe(en('agentSettings.help.mcpWhatHeading'));
    expect(what?.body).toBe(en('agentSettings.help.mcpWhatBody', { engine: 'claude' }));
    expect(what?.body).toContain('claude');
  });

  it('explains the difference between a command and a network endpoint', () => {
    const [, transport] = mcpSectionHelp(en, 'claude');

    expect(transport?.heading).toBe(en('agentSettings.help.mcpTransportHeading'));
    expect(transport?.body).toBe(en('agentSettings.help.mcpTransportBody', { engine: 'claude' }));
  });

  it('explains why the second step exists, by the same name as a permission rule', () => {
    const [, , secondStep] = mcpSectionHelp(en, 'claude');

    expect(secondStep?.heading).toBe(en('agentSettings.help.mcpSecondStepHeading'));
    expect(secondStep?.body).toBe(en('agentSettings.help.mcpSecondStepBody', { engine: 'claude' }));
  });

  it('explains "needs sign-in" and that it is resolved on the machine', () => {
    const [, , , needsAuth] = mcpSectionHelp(en, 'claude');

    expect(needsAuth?.heading).toBe(en('agentSettings.help.mcpNeedsAuthHeading'));
    expect(needsAuth?.body).toBe(en('agentSettings.help.mcpNeedsAuthBody', { engine: 'claude' }));
    expect(needsAuth?.body).toMatch(/machine/);
  });

  it("explains the project's own MCP file going back to pending when it changes", () => {
    const [, , , , projectFile] = mcpSectionHelp(en, 'claude');

    expect(projectFile?.heading).toBe(en('agentSettings.help.mcpProjectFileHeading'));
    expect(projectFile?.body).toBe(
      en('agentSettings.help.mcpProjectFileBody', { engine: 'claude' }),
    );
  });

  it('says secret values are never shown back, sent back or recorded', () => {
    const [, , , , , secrets] = mcpSectionHelp(en, 'claude');

    expect(secrets?.heading).toBe(en('agentSettings.help.mcpSecretsHeading'));
    expect(secrets?.body).toBe(en('agentSettings.help.mcpSecretsBody'));
    expect(secrets?.body).toMatch(/never/i);
  });

  it('is translated in pt-BR too, by the same ids', () => {
    const entries = mcpSectionHelp(pt, 'claude');

    expect(entries.map((entry) => entry.id)).toEqual([
      'mcp-what',
      'mcp-transport',
      'mcp-second-step',
      'mcp-needs-auth',
      'mcp-project-file',
      'mcp-secrets',
    ]);
    expect(entries[0]?.heading).toBe(pt('agentSettings.help.mcpWhatHeading'));
    expect(entries[0]?.body).toBe(pt('agentSettings.help.mcpWhatBody', { engine: 'claude' }));
  });

  it('names whichever engine it is given, not a fixed one', () => {
    const [other] = mcpSectionHelp(en, 'other-engine');

    expect(other?.body).toContain('other-engine');
    expect(other?.body).not.toContain('claude');
  });
});

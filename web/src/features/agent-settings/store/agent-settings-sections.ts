import { Server, Sparkles } from 'lucide-react';

import { McpSection, mcpSectionHelp } from '@/features/mcp';
import { canDo } from '@/features/session';
import type { EngineCapabilities } from '@/features/session';
import { createRegistry } from '@/shared/lib/registry';
import type { Registry } from '@/shared/lib/registry';
import { ModelsSection } from '../components/ModelsSection';
import { modelsSectionHelp } from '../lib/agent-settings-help';
import type { AgentSettingsSection } from '../types/section';

/**
 * The sections every engine has, in the order the navigation shows them (plan 13, B-09; plan 28,
 * B-36, D-06): its models and the defaults a session opens with, and its MCP servers. `engine` is
 * left out of both — they are every engine's, not one's.
 */
const DECLARED: readonly AgentSettingsSection[] = [
  {
    id: 'models',
    position: 300,
    icon: Sparkles,
    titleKey: 'agentSettings.models.title',
    purposeKey: 'agentSettings.models.purpose',
    Body: ModelsSection,
    help: modelsSectionHelp,
  },
  {
    // Shown only for an engine with the `mcp` capability — `AgentSettingsScreen` filters by it
    // before this is ever reached (plan 13, B-28, D-82).
    id: 'mcp',
    position: 400,
    icon: Server,
    titleKey: 'agentSettings.mcp.title',
    purposeKey: 'agentSettings.mcp.purpose',
    Body: McpSection,
    capability: 'mcp',
    help: mcpSectionHelp,
  },
];

/** A registry of its own — the app has one; a test builds another. */
export function createAgentSettingsSections(
  declared: readonly AgentSettingsSection[] = DECLARED,
): Registry<AgentSettingsSection> {
  return createRegistry('agent settings sections', declared);
}

/**
 * The sections of an engine's settings screen — the core's own (every engine has them) and the ones
 * an engine's extension registers for itself alone, through `engine.register()` (D-06).
 */
export const agentSettingsSections = createAgentSettingsSections();

/** The sections that apply to one engine: the core's, and the ones its own extension registered. */
export function sectionsForEngine(
  entries: readonly AgentSettingsSection[],
  engine: string,
): readonly AgentSettingsSection[] {
  return entries.filter((entry) => entry.engine === undefined || entry.engine === engine);
}

/**
 * [entries], further narrowed to the ones the engine can actually do (plan 13, B-28, D-82): a
 * section with no `capability` applies regardless (its models) — one that names a capability shows
 * only while the engine has not explicitly said it cannot (`canDo`'s own "innocent until told
 * otherwise", the same rule a control inside a session already follows). The tab itself disappears,
 * not just its body: `AgentSettingsScreen` builds its tabs from this, never from `sectionsForEngine`
 * alone.
 */
export function sectionsForCapabilities(
  entries: readonly AgentSettingsSection[],
  capabilities: EngineCapabilities | null,
): readonly AgentSettingsSection[] {
  return entries.filter(
    (entry) => entry.capability === undefined || canDo(capabilities, entry.capability),
  );
}

/**
 * The section an address names, or the first one of the engine when it names none this screen has —
 * an old link, a section of a plan not installed. Never an error: the settings are still there.
 */
export function sectionFor(
  entries: readonly AgentSettingsSection[],
  id: string,
): AgentSettingsSection | undefined {
  return entries.find((entry) => entry.id === id) ?? entries[0];
}

/** Where `/settings/agents/$engine` alone leads: the first section registered for it. */
export function firstAgentSectionId(entries: readonly AgentSettingsSection[]): string {
  return entries[0]?.id ?? 'models';
}

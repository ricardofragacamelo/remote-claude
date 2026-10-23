import { z } from 'zod';

import type {
  ClaudePluginListPayload,
  ClaudePluginPreviewPayload,
  EnginePlugin,
  EnginePluginManifest,
} from '@remote-claude/contracts';
import type { LocalPluginPreview, PluginView } from '@application/engines/claude';
import type { PluginDescription, PluginManifest } from '@domain/engines/claude';
import { folderField } from '../../agent-settings/agent-settings.dto';

/** `POST /engines/claude/plugins/preview`, `POST /engines/claude/plugins` — a local directory. */
export const localPluginPathSchema = z.object({ path: folderField }).strict();
export type LocalPluginPathBody = z.infer<typeof localPluginPathSchema>;

/** `PATCH /engines/claude/plugins/:id`. */
export const setPluginEnabledSchema = z.object({ enabled: z.boolean() }).strict();
export type SetPluginEnabledBody = z.infer<typeof setPluginEnabledSchema>;

function toManifestDto(manifest: PluginManifest): EnginePluginManifest {
  return {
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    commands: [...manifest.commands],
    agents: [...manifest.agents],
    hookCount: manifest.hookCount,
    skills: [...manifest.skills],
    mcpServerNames: manifest.mcpServers.map((server) => server.name),
  };
}

function stringParamsOf(description: PluginDescription): Record<string, string> {
  return Object.fromEntries(
    Object.entries(description.params).map(([key, value]) => [key, String(value)]),
  );
}

export function toPluginDto(view: PluginView): EnginePlugin {
  return {
    id: view.id,
    origin: view.origin,
    path: view.path,
    marketplace: view.marketplace,
    name: view.name,
    state: view.state,
    enabled: view.enabled,
    manifest: view.manifest === null ? null : toManifestDto(view.manifest),
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}

export function toPluginListDto(views: readonly PluginView[]): ClaudePluginListPayload {
  return { plugins: views.map(toPluginDto) };
}

export function toPluginPreviewDto(preview: LocalPluginPreview): ClaudePluginPreviewPayload {
  return {
    manifest: toManifestDto(preview.manifest),
    messageKey: preview.description.messageKey,
    params: stringParamsOf(preview.description),
  };
}

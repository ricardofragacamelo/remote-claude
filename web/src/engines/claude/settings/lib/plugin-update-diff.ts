import type { Hunk, HunkLine } from '@/shared/lib/diff-hunk';
import type { PluginManifestDiffView } from '../types/plugin';

function category(label: string, added: readonly string[], removed: readonly string[]): HunkLine[] {
  const lines: HunkLine[] = [];
  if (added.length === 0 && removed.length === 0) {
    return lines;
  }

  lines.push({ kind: 'context', text: `${label}:` });
  for (const name of removed) {
    lines.push({ kind: 'removed', text: `  ${name}` });
  }
  for (const name of added) {
    lines.push({ kind: 'added', text: `  ${name}` });
  }
  return lines;
}

/**
 * [diff] turned into the lines `DiffHunks` draws — names added or removed per category, and the hook
 * count as one context line showing before → after (plan 13, B-47, B-29, S-205). Mirrors
 * `mcp`'s own `project-entry-diff.ts`: one hunk, a small deterministic rendering, never the
 * por-extenso sentence (`plugin.descriptionUpdate`), which reads as a sentence and would reshuffle
 * at every field — exactly the reason that lib gives for its own line diff instead.
 */
export function pluginUpdateDiffHunks(diff: PluginManifestDiffView): readonly Hunk[] {
  const lines: HunkLine[] = [
    ...category('commands', diff.commandsAdded, diff.commandsRemoved),
    ...category('agents', diff.agentsAdded, diff.agentsRemoved),
    ...category('skills', diff.skillsAdded, diff.skillsRemoved),
    ...category('MCP servers', diff.mcpServersAdded, diff.mcpServersRemoved),
    {
      kind: 'context',
      text: `hooks: ${String(diff.hookCountBefore)} → ${String(diff.hookCountAfter)}`,
    },
  ];

  return [{ id: 'plugin-update', oldStart: 1, newStart: 1, lines }];
}

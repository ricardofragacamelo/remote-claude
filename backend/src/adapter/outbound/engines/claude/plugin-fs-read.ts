import { promises as fs } from 'node:fs';
import path from 'node:path';

import { WorkspacePath } from '@domain/workspace';

/** A manifest or `.mcp.json`/`marketplace.json` larger than this is not read (plan 13, B-27, B-47). */
export const MAX_PLUGIN_FILE_BYTES = 65_536;

/**
 * Reads a small JSON file within [root], refusing one above the size limit or one a symlink would
 * carry outside of it (plan 13, B-27; B-47 reuses this for a marketplace's own manifest, the same
 * refusal shape a plugin's own manifest already has). `undefined` when nothing is at that path.
 */
export async function readJsonWithin(
  root: string,
  relativeSegments: readonly string[],
): Promise<unknown> {
  const filePath = path.join(root, ...relativeSegments);

  const stat = await fs.lstat(filePath).catch(() => null);
  if (stat === null) {
    return undefined;
  }
  if (stat.size > MAX_PLUGIN_FILE_BYTES) {
    throw new Error('file too large');
  }

  const real = await fs.realpath(filePath);
  if (!WorkspacePath.create(real).isWithin(WorkspacePath.create(root))) {
    throw new Error('escapes plugin root');
  }

  const raw = await fs.readFile(real, 'utf8');
  return JSON.parse(raw);
}

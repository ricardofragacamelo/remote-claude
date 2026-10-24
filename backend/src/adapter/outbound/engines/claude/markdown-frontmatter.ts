import { parse as parseYaml } from 'yaml';

import { isPlainObject } from '@shared/utils/plain-object';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * The YAML frontmatter of a `.claude/commands/`, `.claude/agents/` or `.claude/output-styles/` file,
 * the same block the CLI itself reads — `{}` for a file with none, or one whose block does not parse
 * to an object: tolerant, because a file a person is mid-editing is not this reader's business to
 * reject (D-16, S-143). Never throws.
 */
export function parseFrontmatter(raw: string): Record<string, unknown> {
  const block = FRONTMATTER.exec(raw)?.[1];
  if (block === undefined) {
    return {};
  }

  try {
    const parsed: unknown = parseYaml(block);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

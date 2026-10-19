import type { McpSecretFieldInput } from './commands/mcp-server-fields.command';
import type { McpSecretField } from './ports/mcp-server-repository.port';

/**
 * Applies the omitted/null/replace rule of a write (plan 13, B-19, S-71) to one list of secret
 * fields (env, or headers): a name whose `value` is a string gets that value; `null` drops the
 * name entirely; a name present with `value` omitted keeps whatever [existing] already has for it,
 * or an empty string when there was nothing to keep — a create has nothing, by construction.
 *
 * Pure: no I/O, no knowledge of which server this is for. The field order is the proposal's, not
 * the old one's, so a reorder in the request reorders the stored list too.
 */
export function mergeSecretFields(
  existing: readonly McpSecretField[],
  proposed: readonly McpSecretFieldInput[] | undefined,
): readonly McpSecretField[] {
  if (proposed === undefined) {
    return [];
  }

  const existingByName = new Map(existing.map((entry) => [entry.name, entry.value]));
  const merged: McpSecretField[] = [];

  for (const entry of proposed) {
    if (entry.value === null) {
      continue;
    }
    merged.push({
      name: entry.name,
      value: entry.value === undefined ? (existingByName.get(entry.name) ?? '') : entry.value,
    });
  }

  return merged;
}

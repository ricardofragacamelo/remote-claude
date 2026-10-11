import { effectiveValue, nearestOverride } from '@domain/agent-settings';
import type { EffectiveValue } from '@domain/agent-settings';

/** The output style of one folder: it applies to the folder and to everything under it. */
export interface FolderOutputStyle {
  readonly folder: string;
  readonly value: string;
}

/**
 * The output style a user set for Claude's sessions — their own, and each folder's (plan 13, D-04,
 * D-06): a style of Claude's answers, so the extension's, kept beside the defaults of the core
 * (plan 28, D-06). `null` is "not set here".
 */
export interface OutputStyleDefaults {
  readonly user: string | null;
  readonly overrides: readonly FolderOutputStyle[];
}

/** No output style set anywhere. */
export const NO_OUTPUT_STYLE: OutputStyleDefaults = { user: null, overrides: [] };

/**
 * The output style that applies in a folder, and where it came from: the nearest folder's over the
 * user's over the installation's — the same layers as every default.
 */
export function effectiveOutputStyle(
  stored: OutputStyleDefaults,
  folder: string | null,
): EffectiveValue<string> {
  return effectiveValue(nearestOverride(stored.overrides, folder), stored.user);
}

/**
 * The output style a new session opens with (plan 13, B-15): the effective one — unless the
 * installation no longer has it, deleted since it was set, which drops it for the installation's
 * and names it stale for the log (S-53). A list that is not known yet drops nothing.
 *
 * @param offered the styles the installation offers now, or `null` when they are not known
 */
export function outputStyleForSession(
  effective: EffectiveValue<string>,
  offered: readonly string[] | null,
): { readonly outputStyle: string | null; readonly stale: readonly string[] } {
  const style = effective.value;
  if (style === null || offered === null || offered.includes(style)) {
    return { outputStyle: style, stale: [] };
  }
  return { outputStyle: null, stale: ['outputStyle'] };
}

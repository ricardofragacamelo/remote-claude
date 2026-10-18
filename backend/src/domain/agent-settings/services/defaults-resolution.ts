import { DEFAULT_FIELDS, NO_DEFAULTS } from '../value-objects/agent-defaults.value-object';
import type {
  AgentDefaults,
  DefaultField,
  EffectiveDefaults,
  EffectiveValue,
  FolderDefaults,
} from '../value-objects/agent-defaults.value-object';

/**
 * Whether `path` is `folder` or somewhere under it — by segment, never by prefix: `/repo-old` is not
 * in `/repo`. The same form "the folder and its subfolders" the allowlist uses.
 */
export function isWithin(path: string, folder: string): boolean {
  const base = folder.endsWith('/') ? folder.slice(0, -1) : folder;
  return path === base || path.startsWith(`${base}/`) || base === '';
}

/**
 * The override that applies in a folder: the one of the folder itself, or of its nearest ancestor
 * that has one (plan 13, D-04). `null` when none applies. Any override of a folder will do — the
 * defaults of the core, or what an engine's extension keeps by folder the same way.
 */
export function nearestOverride<T extends { readonly folder: string }>(
  overrides: readonly T[],
  folder: string | null,
): T | null {
  if (folder === null) {
    return null;
  }

  return overrides
    .filter((override) => isWithin(folder, override.folder))
    .reduce<T | null>(
      (nearest, override) =>
        nearest === null || override.folder.length > nearest.folder.length ? override : nearest,
      null,
    );
}

/**
 * The override stored for exactly `folder` — never an ancestor's, unlike {@link nearestOverride}.
 * What a screen shows as "this folder's own override", `null` when it has none of its own.
 */
export function exactOverride<T extends { readonly folder: string }>(
  overrides: readonly T[],
  folder: string | null,
): T | null {
  return folder === null
    ? null
    : (overrides.find((override) => override.folder === folder) ?? null);
}

/**
 * One field as it applies: the override's value when it sets one, over the user's, over the
 * installation's (D-04).
 *
 * @param override the folder override that applies, with its value of the field — or `null`
 * @param user the user's own value of the field
 */
export function effectiveValue<T>(
  override: { readonly folder: string; readonly value: T | null } | null,
  user: T | null,
): EffectiveValue<T> {
  if (override !== null && override.value !== null) {
    return { value: override.value, from: 'folder', folder: override.folder };
  }

  return user === null ? { value: null, from: 'installation' } : { value: user, from: 'user' };
}

/**
 * The defaults that apply in a folder, field by field, with where each came from: the nearest
 * folder override over the user's default over the installation's (D-04). What the client sends in
 * `session.start` still wins over all of them — that is the session's to decide, not this.
 */
export function effectiveDefaults(input: {
  readonly user: AgentDefaults | null;
  readonly overrides: readonly FolderDefaults[];
  readonly folder: string | null;
}): EffectiveDefaults {
  const override = nearestOverride(input.overrides, input.folder);
  const user = input.user ?? NO_DEFAULTS;

  const resolve = <K extends DefaultField>(field: K): EffectiveValue<AgentDefaults[K]> =>
    effectiveValue(
      override === null ? null : { folder: override.folder, value: override.values[field] },
      user[field],
    );

  return Object.fromEntries(
    DEFAULT_FIELDS.map((field) => [field, resolve(field)]),
  ) as unknown as EffectiveDefaults;
}

/** The value of every field, without where it came from — what a session is opened with. */
export function valuesOf(effective: EffectiveDefaults): AgentDefaults {
  return Object.fromEntries(
    DEFAULT_FIELDS.map((field) => [field, effective[field].value]),
  ) as unknown as AgentDefaults;
}

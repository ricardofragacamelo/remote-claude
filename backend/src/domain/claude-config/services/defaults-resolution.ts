import { DEFAULT_FIELDS, NO_DEFAULTS } from '../value-objects/claude-defaults.value-object';
import type {
  ClaudeDefaults,
  DefaultField,
  EffectiveDefaults,
  EffectiveValue,
  FolderDefaults,
} from '../value-objects/claude-defaults.value-object';

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
 * that has one (plan 13, D-04). `null` when none applies.
 */
export function nearestOverride(
  overrides: readonly FolderDefaults[],
  folder: string | null,
): FolderDefaults | null {
  if (folder === null) {
    return null;
  }

  return overrides
    .filter((override) => isWithin(folder, override.folder))
    .reduce<FolderDefaults | null>(
      (nearest, override) =>
        nearest === null || override.folder.length > nearest.folder.length ? override : nearest,
      null,
    );
}

/**
 * The defaults that apply in a folder, field by field, with where each came from: the nearest
 * folder override over the user's default over the installation's (D-04). What the client sends in
 * `session.start` still wins over all of them — that is the session's to decide, not this.
 */
export function effectiveDefaults(input: {
  readonly user: ClaudeDefaults | null;
  readonly overrides: readonly FolderDefaults[];
  readonly folder: string | null;
}): EffectiveDefaults {
  const override = nearestOverride(input.overrides, input.folder);
  const user = input.user ?? NO_DEFAULTS;

  const resolve = <K extends DefaultField>(field: K): EffectiveValue<ClaudeDefaults[K]> => {
    const fromFolder = override?.values[field] ?? null;
    if (override !== null && fromFolder !== null) {
      return { value: fromFolder, from: 'folder', folder: override.folder };
    }

    const fromUser = user[field];
    return fromUser === null
      ? { value: null, from: 'installation' }
      : { value: fromUser, from: 'user' };
  };

  return Object.fromEntries(
    DEFAULT_FIELDS.map((field) => [field, resolve(field)]),
  ) as unknown as EffectiveDefaults;
}

/** The value of every field, without where it came from — what a session is opened with. */
export function valuesOf(effective: EffectiveDefaults): ClaudeDefaults {
  return Object.fromEntries(
    DEFAULT_FIELDS.map((field) => [field, effective[field].value]),
  ) as unknown as ClaudeDefaults;
}

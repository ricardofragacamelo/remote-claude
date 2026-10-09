import type { RecordAuditEventUseCase } from '@application/audit';
import type { UserId } from '@domain/auth';
import {
  DEFAULT_FIELDS,
  effectiveDefaults,
  needsCatalogue,
  NO_DEFAULTS,
  sameDefaults,
  validateDefaults,
} from '@domain/claude-config';
import type { ClaudeDefaults, EffectiveDefaults, FolderDefaults } from '@domain/claude-config';
import type { Clock } from '@domain/shared';
import type { ClaudeInstallationCatalog } from './installation-catalog';
import type { ClaudeDefaultsRepository } from './ports/claude-defaults.repository';
import type { FolderAccess } from './ports/folder-access.port';

/** The defaults as the screen shows them: what applies, the user's own, and the folder's override. */
export interface DefaultsView {
  readonly effective: EffectiveDefaults;
  readonly user: ClaudeDefaults;
  readonly folder: FolderDefaults | null;
}

/** What the defaults use cases share: where they are, the fence, the catalogue and the trail. */
export interface DefaultsDependencies {
  readonly defaults: ClaudeDefaultsRepository;
  readonly folders: FolderAccess;
  readonly catalog: ClaudeInstallationCatalog;
  readonly trail: RecordAuditEventUseCase;
  readonly clock: Clock;
}

/** `GET /claude/defaults?folder=` — what applies, field by field, and where it came from (S-37). */
export class ReadDefaultsUseCase {
  constructor(private readonly deps: DefaultsDependencies) {}

  async execute(userId: UserId, rawFolder: string | null): Promise<DefaultsView> {
    const folder =
      rawFolder === null ? null : (await this.deps.folders.resolve(rawFolder, userId)).value;
    return viewOf(await this.deps.defaults.read(userId), folder);
  }
}

/**
 * `PUT /claude/defaults` and `PUT /claude/defaults/folder` — writes the user's default, or a folder's
 * override, whole (plan 13, B-14).
 *
 * The order is the rule: the folder clears the fence; the values are checked against the catalogue
 * of the installation **now** — a catalogue that does not answer refuses rather than saving unchecked
 * (S-47); the trail records `claude.defaultsChanged` **before** the row, and only when something
 * changed (S-43, S-44). A trail that cannot take it is a default that is not saved.
 */
export class SaveDefaultsUseCase {
  constructor(private readonly deps: DefaultsDependencies) {}

  /**
   * @param rawFolder `null` for the user's own default
   * @throws the folder's refusals, `DEFAULT_MODE_NOT_ALLOWED`, `MODEL_NOT_AVAILABLE`, `INVALID_INPUT`,
   *   the catalogue's failures, and the trail's
   */
  async execute(
    userId: UserId,
    rawFolder: string | null,
    values: ClaudeDefaults,
  ): Promise<DefaultsView> {
    const folder =
      rawFolder === null ? null : (await this.deps.folders.resolve(rawFolder, userId)).value;
    await this.checked(userId, folder, values);

    const stored = await this.deps.defaults.read(userId);
    const before =
      folder === null ? (stored.user ?? NO_DEFAULTS) : overrideOf(stored.overrides, folder);

    if (!sameDefaults(before, values)) {
      await this.deps.trail.execute({
        userId,
        kind: 'claude.defaultsChanged',
        subjectId: folder ?? userId.value,
        subjectLabel: folder ?? 'user',
        details: {
          changed: DEFAULT_FIELDS.filter((field) => before[field] !== values[field]),
          ...values,
        },
        at: this.deps.clock.now(),
      });
      await this.deps.defaults.save(userId, folder, values);
    }

    return viewOf(await this.deps.defaults.read(userId), folder);
  }

  /**
   * Checks the values against the installation **now** — asked in the folder, or in the user's first
   * root for their own default. Nothing to check against is a list of none: a model is then refused.
   */
  private async checked(
    userId: UserId,
    folder: string | null,
    values: ClaudeDefaults,
  ): Promise<void> {
    if (!needsCatalogue(values)) {
      validateDefaults(values, []);
      return;
    }

    const where =
      folder === null
        ? await this.deps.folders.firstRoot(userId)
        : await this.deps.folders.resolve(folder, userId);
    validateDefaults(
      values,
      where === null ? [] : (await this.deps.catalog.of(userId, where)).initialization.models,
    );
  }
}

/** `DELETE /claude/defaults/folder?folder=` — the folder goes back to the user's default (204 always). */
export class ClearFolderDefaultsUseCase {
  constructor(private readonly deps: DefaultsDependencies) {}

  async execute(userId: UserId, rawFolder: string): Promise<void> {
    const folder = await this.deps.folders.resolve(rawFolder, userId);
    const stored = await this.deps.defaults.read(userId);

    if (stored.overrides.some((override) => override.folder === folder.value)) {
      await this.deps.trail.execute({
        userId,
        kind: 'claude.defaultsChanged',
        subjectId: folder.value,
        subjectLabel: folder.value,
        details: { cleared: true },
        at: this.deps.clock.now(),
      });
      await this.deps.defaults.remove(userId, folder.value);
    }
  }
}

function overrideOf(overrides: readonly FolderDefaults[], folder: string): ClaudeDefaults {
  return overrides.find((override) => override.folder === folder)?.values ?? NO_DEFAULTS;
}

function viewOf(
  stored: { readonly user: ClaudeDefaults | null; readonly overrides: readonly FolderDefaults[] },
  folder: string | null,
): DefaultsView {
  return {
    effective: effectiveDefaults({ user: stored.user, overrides: stored.overrides, folder }),
    user: stored.user ?? NO_DEFAULTS,
    folder:
      folder === null
        ? null
        : (stored.overrides.find((override) => override.folder === folder) ?? null),
  };
}

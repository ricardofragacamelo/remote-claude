import type { RecordAuditEventCommand, RecordAuditEventUseCase } from '@application/audit';
import {
  DEFAULT_FIELDS,
  effectiveDefaults,
  exactOverride,
  needsCatalogue,
  NO_DEFAULTS,
  sameDefaults,
  validateDefaults,
} from '@domain/agent-settings';
import type { AgentDefaults, EffectiveDefaults, FolderDefaults } from '@domain/agent-settings';
import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import type { EngineSettings } from './engine-settings';
import type { AgentDefaultsRepository, StoredDefaults } from './ports/agent-defaults.repository';
import type { FolderAccess } from './ports/folder-access.port';

/** The defaults as the screen shows them: what applies, the user's own, and the folder's override. */
export interface DefaultsView {
  readonly effective: EffectiveDefaults;
  readonly user: AgentDefaults;
  readonly folder: FolderDefaults | null;
}

/** What the defaults use cases share: where they are, the fence, the engines and the trail. */
export interface DefaultsDependencies {
  readonly defaults: AgentDefaultsRepository;
  readonly folders: FolderAccess;
  readonly engines: EngineSettings;
  readonly trail: RecordAuditEventUseCase;
  readonly clock: Clock;
}

/** The audit kind of a change to the defaults of a session, of any engine (plan 28, D-10). */
export const DEFAULTS_CHANGED = 'agentSettings.defaultsChanged';

/**
 * The envelope every change of a default is recorded under — the core's own fields and an
 * extension's output style alike, told apart only by `details` (plan 28, D-10).
 */
export function defaultsChangedEvent(
  userId: UserId,
  folder: string | null,
  at: Date,
  details: Readonly<Record<string, unknown>>,
): RecordAuditEventCommand {
  return {
    userId,
    kind: DEFAULTS_CHANGED,
    subjectId: folder ?? userId.value,
    subjectLabel: folder ?? 'user',
    details,
    at,
  };
}

/** `GET /engines/:engine/defaults?folder=` — what applies, field by field, and where it came from (S-37). */
export class ReadDefaultsUseCase {
  constructor(private readonly deps: DefaultsDependencies) {}

  /** @throws `NOT_FOUND` for an engine not enabled, and the folder's refusals */
  async execute(userId: UserId, engine: string, rawFolder: string | null): Promise<DefaultsView> {
    this.deps.engines.catalog(engine);
    const folder =
      rawFolder === null ? null : (await this.deps.folders.resolve(rawFolder, userId)).value;
    return viewOf(await this.deps.defaults.read(userId, engine), folder);
  }
}

/**
 * `PUT /engines/:engine/defaults` and `PUT /engines/:engine/defaults/folder` — writes the user's
 * default, or a folder's override, whole (plan 13, B-14).
 *
 * The order is the rule: the engine has to be one this installation drives; the folder clears the
 * fence; the values are checked against the catalogue of the engine's installation **now** — a
 * catalogue that does not answer refuses rather than saving unchecked (S-47); the trail records
 * `agentSettings.defaultsChanged`, with the engine, **before** the row, and only when something
 * changed (S-43, S-44). A trail that cannot take it is a default that is not saved.
 */
export class SaveDefaultsUseCase {
  constructor(private readonly deps: DefaultsDependencies) {}

  /**
   * @param rawFolder `null` for the user's own default
   * @param values the defaults — a mode outside the canonical ones is refused, not cast
   * @throws `NOT_FOUND` for an engine not enabled, the folder's refusals,
   *   `DEFAULT_MODE_NOT_ALLOWED`, `MODEL_NOT_AVAILABLE`, `INVALID_INPUT`, the catalogue's failures,
   *   and the trail's
   */
  async execute(
    userId: UserId,
    engine: string,
    rawFolder: string | null,
    values: Omit<AgentDefaults, 'permissionMode'> & { readonly permissionMode: string | null },
  ): Promise<DefaultsView> {
    this.deps.engines.catalog(engine);
    const folder =
      rawFolder === null ? null : (await this.deps.folders.resolve(rawFolder, userId)).value;
    const checked = await this.checked(userId, engine, folder, values);

    const stored = await this.deps.defaults.read(userId, engine);
    const before =
      folder === null ? (stored.user ?? NO_DEFAULTS) : overrideOf(stored.overrides, folder);

    if (!sameDefaults(before, checked)) {
      await this.deps.trail.execute(
        defaultsChangedEvent(userId, folder, this.deps.clock.now(), {
          engine,
          changed: DEFAULT_FIELDS.filter((field) => before[field] !== checked[field]),
          ...checked,
        }),
      );
      await this.deps.defaults.save(userId, engine, folder, checked);
    }

    return viewOf(await this.deps.defaults.read(userId, engine), folder);
  }

  /**
   * Checks the values against the installation **now** — asked in the folder, or in the user's first
   * root for their own default. Nothing to check against is a list of none: a model is then refused.
   */
  private async checked(
    userId: UserId,
    engine: string,
    folder: string | null,
    values: Omit<AgentDefaults, 'permissionMode'> & { readonly permissionMode: string | null },
  ): Promise<AgentDefaults> {
    if (!needsCatalogue(values)) {
      return validateDefaults(values, []);
    }

    const where =
      folder === null
        ? await this.deps.folders.firstRoot(userId)
        : await this.deps.folders.resolve(folder, userId);
    return validateDefaults(
      values,
      where === null
        ? []
        : (await this.deps.engines.catalog(engine).modelsOf(userId, where)).models,
    );
  }
}

/**
 * `DELETE /engines/:engine/defaults/folder?folder=` — the folder goes back to the user's default
 * (204 always).
 */
export class ClearFolderDefaultsUseCase {
  constructor(private readonly deps: DefaultsDependencies) {}

  /** @throws `NOT_FOUND` for an engine not enabled, the folder's refusals, and the trail's */
  async execute(userId: UserId, engine: string, rawFolder: string): Promise<void> {
    this.deps.engines.catalog(engine);
    const folder = await this.deps.folders.resolve(rawFolder, userId);
    const stored = await this.deps.defaults.read(userId, engine);

    if (stored.overrides.some((override) => override.folder === folder.value)) {
      await this.deps.trail.execute(
        defaultsChangedEvent(userId, folder.value, this.deps.clock.now(), {
          engine,
          cleared: true,
        }),
      );
      await this.deps.defaults.remove(userId, engine, folder.value);
    }
  }
}

function overrideOf(overrides: readonly FolderDefaults[], folder: string): AgentDefaults {
  return overrides.find((override) => override.folder === folder)?.values ?? NO_DEFAULTS;
}

function viewOf(stored: StoredDefaults, folder: string | null): DefaultsView {
  return {
    effective: effectiveDefaults({ user: stored.user, overrides: stored.overrides, folder }),
    user: stored.user ?? NO_DEFAULTS,
    folder: exactOverride(stored.overrides, folder),
  };
}

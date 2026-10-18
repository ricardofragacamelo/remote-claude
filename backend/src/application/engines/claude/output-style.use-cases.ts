import { defaultsChangedEvent } from '@application/agent-settings';
import type {
  EngineSessionDefaults,
  EngineSessionOptions,
  FolderAccess,
} from '@application/agent-settings';
import type { RecordAuditEventUseCase } from '@application/audit';
import { exactOverride } from '@domain/agent-settings';
import type { EffectiveValue } from '@domain/agent-settings';
import type { UserId } from '@domain/auth';
import { effectiveOutputStyle, outputStyleForSession } from '@domain/engines/claude';
import type { FolderOutputStyle, OutputStyleDefaults } from '@domain/engines/claude';
import type { Clock } from '@domain/shared';
import type { WorkspacePath } from '@domain/workspace';
import type { ClaudeInstallationCatalog } from './installation-catalog';
import type { OutputStyleDefaultsRepository } from './ports/output-style-defaults.repository';

/** The output style as the screen shows it: what applies, the user's own, and the folder's. */
export interface OutputStyleView {
  readonly effective: EffectiveValue<string>;
  readonly user: string | null;
  readonly folder: FolderOutputStyle | null;
}

/** What the output-style use cases share. */
export interface OutputStyleDependencies {
  /** The name the engine's port registers — what the trail says the change was of. */
  readonly engine: string;
  readonly styles: OutputStyleDefaultsRepository;
  readonly folders: FolderAccess;
  readonly trail: RecordAuditEventUseCase;
  readonly clock: Clock;
}

/** The view of [stored] in [folder]. */
export function outputStyleView(
  stored: OutputStyleDefaults,
  folder: string | null,
): OutputStyleView {
  return {
    effective: effectiveOutputStyle(stored, folder),
    user: stored.user,
    folder: exactOverride(stored.overrides, folder),
  };
}

/** The folder a route names, through the fence — or `null` for the user's own. */
async function folderOf(
  deps: OutputStyleDependencies,
  userId: UserId,
  rawFolder: string | null,
): Promise<string | null> {
  return rawFolder === null ? null : (await deps.folders.resolve(rawFolder, userId)).value;
}

/** `GET /engines/claude/output-style?folder=` — what applies, and where it came from. */
export class ReadOutputStyleUseCase {
  constructor(private readonly deps: OutputStyleDependencies) {}

  /** @throws the folder's refusals */
  async execute(userId: UserId, rawFolder: string | null): Promise<OutputStyleView> {
    const folder = await folderOf(this.deps, userId, rawFolder);
    return outputStyleView(await this.deps.styles.read(userId), folder);
  }
}

/**
 * `PUT /engines/claude/output-style` and `PUT /engines/claude/output-style/folder` — sets, or with
 * `null` unsets, the output style of the user or of a folder (plan 13, B-14; plan 28, D-06).
 *
 * A change of a default of the session like any other: recorded as `agentSettings.defaultsChanged`,
 * with the engine, **before** the row, and only when something changed. A trail that cannot take it
 * is a style that is not saved.
 */
export class SaveOutputStyleUseCase {
  constructor(private readonly deps: OutputStyleDependencies) {}

  /** @throws the folder's refusals, and the trail's */
  async execute(
    userId: UserId,
    rawFolder: string | null,
    style: string | null,
  ): Promise<OutputStyleView> {
    const folder = await folderOf(this.deps, userId, rawFolder);
    const stored = await this.deps.styles.read(userId);
    const before =
      folder === null
        ? stored.user
        : (stored.overrides.find((override) => override.folder === folder)?.value ?? null);

    if (before !== style) {
      await this.deps.trail.execute(
        defaultsChangedEvent(userId, folder, this.deps.clock.now(), {
          engine: this.deps.engine,
          changed: ['outputStyle'],
          outputStyle: style,
        }),
      );
      await (style === null
        ? this.deps.styles.remove(userId, folder)
        : this.deps.styles.save(userId, folder, style));
    }

    return outputStyleView(await this.deps.styles.read(userId), folder);
  }
}

/**
 * The defaults Claude's extension keeps for a session beside the core's: the output style that
 * applies in the folder, dropped when the installation is known not to have it any more (S-53).
 * Nothing is probed — a session opens on what is already known.
 */
export class ClaudeSessionDefaults implements EngineSessionDefaults {
  constructor(
    readonly engine: string,
    private readonly styles: OutputStyleDefaultsRepository,
    private readonly catalog: ClaudeInstallationCatalog,
  ) {}

  async optionsFor(userId: UserId, folder: WorkspacePath): Promise<EngineSessionOptions> {
    const effective = effectiveOutputStyle(await this.styles.read(userId), folder.value);
    const offered = this.catalog.known(folder)?.initialization.outputStyles ?? null;
    return outputStyleForSession(effective, offered);
  }
}

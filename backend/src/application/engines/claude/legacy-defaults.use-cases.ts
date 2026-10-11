import type {
  ClearFolderDefaultsUseCase,
  ReadDefaultsUseCase,
  SaveDefaultsUseCase,
} from '@application/agent-settings';
import type { DefaultsView } from '@application/agent-settings';
import type { AgentDefaults, EffectiveValue } from '@domain/agent-settings';
import type { UserId } from '@domain/auth';
import type { OutputStyleView, ReadOutputStyleUseCase, SaveOutputStyleUseCase } from './output-style.use-cases';

/** A default as the first protocol of plan 13 wrote it: the core's fields and the output style. */
export type LegacyDefaults = Omit<AgentDefaults, 'permissionMode'> & {
  readonly permissionMode: string | null;
  readonly outputStyle: string | null;
};

/** The defaults as `/claude/defaults` answered them before the split (plan 28, D-07: `v-1`). */
export interface LegacyDefaultsView {
  readonly effective: DefaultsView['effective'] & { readonly outputStyle: EffectiveValue<string> };
  readonly user: AgentDefaults & { readonly outputStyle: string | null };
  readonly folder: {
    readonly folder: string;
    readonly values: AgentDefaults & { readonly outputStyle: string | null };
  } | null;
}

/** The use cases the first protocol is answered with — the core's, and the extension's style. */
export interface LegacyDefaultsDependencies {
  /** The name the engine's port registers. */
  readonly engine: string;
  readonly read: ReadDefaultsUseCase;
  readonly save: SaveDefaultsUseCase;
  readonly clear: ClearFolderDefaultsUseCase;
  readonly readStyle: ReadOutputStyleUseCase;
  readonly saveStyle: SaveOutputStyleUseCase;
}

/** The two halves of a default, put back together in the shape of the first protocol. */
function merged(core: DefaultsView, style: OutputStyleView): LegacyDefaultsView {
  const folder = core.folder?.folder ?? style.folder?.folder ?? null;
  return {
    effective: { ...core.effective, outputStyle: style.effective },
    user: { ...core.user, outputStyle: style.user },
    folder:
      folder === null
        ? null
        : {
            folder,
            values: {
              model: core.folder?.values.model ?? null,
              permissionMode: core.folder?.values.permissionMode ?? null,
              effort: core.folder?.values.effort ?? null,
              thinking: core.folder?.values.thinking ?? null,
              fallbackModel: core.folder?.values.fallbackModel ?? null,
              outputStyle: style.folder?.value ?? null,
            },
          },
  };
}

/**
 * `GET/PUT/DELETE /claude/defaults…`, the routes of plan 13 kept answering the same for the window of
 * the previous protocol (plan 28, D-07): the defaults of the core for Claude, and the output style
 * its extension keeps, read and written together. The core's half is checked and saved first — a
 * default it refuses leaves the style alone.
 */
export class LegacyDefaultsUseCases {
  constructor(private readonly deps: LegacyDefaultsDependencies) {}

  /** @throws the folder's refusals */
  async read(userId: UserId, rawFolder: string | null): Promise<LegacyDefaultsView> {
    const core = await this.deps.read.execute(userId, this.deps.engine, rawFolder);
    return merged(core, await this.deps.readStyle.execute(userId, rawFolder));
  }

  /** @throws what saving the core's defaults, or the style, throws */
  async save(
    userId: UserId,
    rawFolder: string | null,
    values: LegacyDefaults,
  ): Promise<LegacyDefaultsView> {
    const { outputStyle, ...core } = values;
    const saved = await this.deps.save.execute(userId, this.deps.engine, rawFolder, core);
    return merged(saved, await this.deps.saveStyle.execute(userId, rawFolder, outputStyle));
  }

  /** @throws the folder's refusals, and the trail's */
  async clear(userId: UserId, rawFolder: string): Promise<void> {
    await this.deps.clear.execute(userId, this.deps.engine, rawFolder);
    await this.deps.saveStyle.execute(userId, rawFolder, null);
  }
}

import { EngineSettingsNotFoundError } from '@domain/agent-settings';
import type {
  EngineModelCatalog,
  EngineSessionDefaults,
  EngineSessionOptions,
} from './ports/engine-settings.ports';

/** What a session of an engine with no extension of its own opens with. */
const NO_OPTIONS: EngineSessionOptions = { outputStyle: null, stale: [] };

/**
 * The engines whose settings this installation keeps, by name (plan 28, B-36): each one's catalogue
 * of models and, when its extension has some, the defaults it keeps beside the core's. Built by the
 * composition from the engines it enables; the core asks for an engine by name and never names one.
 */
export class EngineSettings {
  private readonly catalogs: ReadonlyMap<string, EngineModelCatalog>;
  private readonly extensions: ReadonlyMap<string, EngineSessionDefaults>;

  constructor(
    catalogs: readonly EngineModelCatalog[],
    extensions: readonly EngineSessionDefaults[] = [],
  ) {
    this.catalogs = new Map(catalogs.map((catalog) => [catalog.engine, catalog]));
    this.extensions = new Map(extensions.map((extension) => [extension.engine, extension]));
  }

  /** The engines, in the order the composition registered them. */
  get engines(): readonly string[] {
    return [...this.catalogs.keys()];
  }

  /**
   * The catalogue of [engine] — and the proof that it is one this installation drives.
   *
   * @throws {EngineSettingsNotFoundError} an engine not registered, or not enabled
   */
  catalog(engine: string): EngineModelCatalog {
    const catalog = this.catalogs.get(engine);
    if (catalog === undefined) {
      throw new EngineSettingsNotFoundError(engine);
    }
    return catalog;
  }

  /** What [engine]'s extension adds to [userId]'s session in [folder] — nothing, without one. */
  optionsFor(
    engine: string,
    ...where: Parameters<EngineSessionDefaults['optionsFor']>
  ): Promise<EngineSessionOptions> {
    return this.extensions.get(engine)?.optionsFor(...where) ?? Promise.resolve(NO_OPTIONS);
  }
}

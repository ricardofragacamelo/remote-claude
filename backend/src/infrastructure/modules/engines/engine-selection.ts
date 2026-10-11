import type { EngineId } from '@domain/engine';
import type { AppConfig } from '../../config/environment';

/**
 * The engines [registered] that the configuration enables, and the default among them.
 *
 * An empty list enables every registered engine; a name no adapter registers — enabled or default —
 * refuses the boot: a configuration nobody can run is caught before the first session (S-28).
 *
 * @throws {Error} an unknown name
 */
export function enabledEngines<T extends { readonly engine: EngineId }>(
  registered: readonly T[],
  engines: AppConfig['engines'],
): { readonly enabled: readonly T[]; readonly defaultEngine: string } {
  const known = new Map(registered.map((each) => [each.engine.value, each]));
  const names = engines.enabled.length === 0 ? [...known.keys()] : engines.enabled;
  const unknown = [...names, ...(engines.default === null ? [] : [engines.default])].filter(
    (name) => !known.has(name),
  );
  if (unknown.length > 0) {
    throw new Error(
      `RC_ENGINES_ENABLED/RC_ENGINE_DEFAULT name engines no adapter registers: ${unknown.join(', ')}`,
    );
  }
  const defaultEngine = engines.default ?? names[0] ?? '';
  if (!names.includes(defaultEngine)) {
    throw new Error(`RC_ENGINE_DEFAULT "${defaultEngine}" is not one of RC_ENGINES_ENABLED`);
  }
  return { enabled: names.map((name) => known.get(name) as T), defaultEngine };
}

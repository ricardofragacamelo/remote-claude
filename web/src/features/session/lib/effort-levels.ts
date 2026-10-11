import type { TFunction } from 'i18next';

import type { EngineCapabilities } from '../types/engine';
import type { InstallationModel } from '../types/insight';

/**
 * The levels of effort a conversation offers for `model` (plan 28, B-28, S-83): the ones the engine
 * announces, in its order, that the model takes too — none for a model that takes none (plan 08,
 * D-16), and none for an engine that announces none, which leaves no choice to show at all. Before
 * the engine is known, the model's own.
 */
export function offeredEfforts(
  capabilities: EngineCapabilities | null,
  model: InstallationModel | undefined,
): readonly string[] {
  if (model?.supportsEffort !== true) {
    return [];
  }

  const announced = capabilities?.effortLevels;
  return announced === undefined
    ? model.supportedEffortLevels
    : announced.filter((level) => model.supportedEffortLevels.includes(level));
}

/**
 * The effort a draft starts its session with: the one chosen, while the engine announces it — or
 * nobody knows yet what it announces —, and the model's default otherwise; the server refuses a
 * level its engine does not take (`session.error.effortUnsupported`).
 */
export function effortToStart(
  capabilities: EngineCapabilities | null,
  chosen: string | null,
): string | null {
  return chosen !== null && (capabilities?.effortLevels.includes(chosen) ?? true) ? chosen : null;
}

/**
 * What a level of effort is called, by the key `names` gives its canonical name — and, for a level
 * this build has no name for, as the engine names it.
 */
export function levelName(names: ReadonlyMap<string, string>, level: string, t: TFunction): string {
  const key = names.get(level);
  return key === undefined ? level : t(key);
}

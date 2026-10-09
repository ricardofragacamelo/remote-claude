import type { InstallationModel } from '@domain/session';
import { ClaudeConfigInputInvalidError } from '../errors/claude-config-input-invalid.error';
import { DefaultModeNotAllowedError } from '../errors/default-mode-not-allowed.error';
import { ModelNotAvailableError } from '../errors/model-not-available.error';
import type { ClaudeDefaults } from '../value-objects/claude-defaults.value-object';

/** The model a default names, among the ones the installation offers — by value or by what an alias resolves to. */
function modelNamed(
  models: readonly InstallationModel[],
  name: string,
): InstallationModel | undefined {
  return models.find((model) => model.value === name || model.resolvedModel === name);
}

/** Whether saving these defaults needs the installation's catalogue to be checked against. */
export function needsCatalogue(values: ClaudeDefaults): boolean {
  return values.model !== null || values.fallbackModel !== null || values.effort !== null;
}

/**
 * Refuses defaults that could never open a session as written (plan 13, B-14):
 *
 * - `bypassPermissions` — it switches the approval off; never a default (S-40);
 * - a model, or a fallback model, the installation does not offer **now** — checked when saved,
 *   against the installation's catalogue, never a list of ours (S-39);
 * - an effort the model does not take, or at a level it does not declare (S-41) — the model is
 *   the one set beside it, or the installation's `default` entry when none is;
 * - a fallback equal to the main model: the SDK throws on it (S-41).
 *
 * @param models the installation's models — required whenever {@link needsCatalogue} says so
 */
export function validateDefaults(
  values: Omit<ClaudeDefaults, 'permissionMode'> & { readonly permissionMode: string | null },
  models: readonly InstallationModel[],
): void {
  if (values.permissionMode === 'bypassPermissions') {
    throw new DefaultModeNotAllowedError(values.permissionMode);
  }

  for (const name of [values.model, values.fallbackModel]) {
    if (name !== null && modelNamed(models, name) === undefined) {
      throw new ModelNotAvailableError(name);
    }
  }

  refuseEffortNotTaken(values, models);

  if (values.fallbackModel !== null && values.fallbackModel === values.model) {
    throw new ClaudeConfigInputInvalidError('fallbackSameAsModel', { model: values.model });
  }
}

/** Refuses an effort the model set beside it — or the installation's `default` — does not take. */
function refuseEffortNotTaken(
  values: Pick<ClaudeDefaults, 'effort' | 'model'>,
  models: readonly InstallationModel[],
): void {
  if (values.effort === null) {
    return;
  }

  const target = modelNamed(models, values.model ?? 'default');
  if (target !== undefined && !target.supportedEffortLevels.includes(values.effort)) {
    throw new ClaudeConfigInputInvalidError('effortUnsupported', {
      model: target.value,
      level: values.effort,
    });
  }
}

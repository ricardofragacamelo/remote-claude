import { isPermissionMode } from '@domain/engine';
import type { InstallationModel } from '@domain/session';
import { AgentSettingsInputInvalidError } from '../errors/agent-settings-input-invalid.error';
import { DefaultModeNotAllowedError } from '../errors/default-mode-not-allowed.error';
import { ModelNotAvailableError } from '../errors/model-not-available.error';
import type { AgentDefaults } from '../value-objects/agent-defaults.value-object';

/** The model a default names, among the ones the installation offers — by value or by what an alias resolves to. */
function modelNamed(
  models: readonly InstallationModel[],
  name: string,
): InstallationModel | undefined {
  return models.find((model) => model.value === name || model.resolvedModel === name);
}

/** Whether saving these defaults needs the installation's catalogue to be checked against. */
export function needsCatalogue(
  values: Pick<AgentDefaults, 'model' | 'fallbackModel' | 'effort'>,
): boolean {
  return values.model !== null || values.fallbackModel !== null || values.effort !== null;
}

/**
 * Refuses defaults that could never open a session as written (plan 13, B-14):
 *
 * - a mode that is not one of the canonical ones — an engine's own mode that switches the approval
 *   off is never a default (S-40);
 * - a model, or a fallback model, the installation does not offer **now** — checked when saved,
 *   against the installation's catalogue, never a list of ours (S-39);
 * - an effort the model does not take, or at a level it does not declare (S-41) — the model is
 *   the one set beside it, or the installation's `default` entry when none is;
 * - a fallback equal to the main model: the engine refuses it (S-41).
 *
 * @param models the installation's models — required whenever {@link needsCatalogue} says so
 * @returns the defaults, as checked
 */
export function validateDefaults(
  values: Omit<AgentDefaults, 'permissionMode'> & { readonly permissionMode: string | null },
  models: readonly InstallationModel[],
): AgentDefaults {
  const { permissionMode } = values;
  if (permissionMode !== null && !isPermissionMode(permissionMode)) {
    throw new DefaultModeNotAllowedError(permissionMode);
  }

  for (const name of [values.model, values.fallbackModel]) {
    if (name !== null && modelNamed(models, name) === undefined) {
      throw new ModelNotAvailableError(name);
    }
  }

  refuseEffortNotTaken(values, models);

  if (values.fallbackModel !== null && values.fallbackModel === values.model) {
    throw new AgentSettingsInputInvalidError('fallbackSameAsModel', { model: values.model });
  }

  return { ...values, permissionMode };
}

/** Refuses an effort the model set beside it — or the installation's `default` — does not take. */
function refuseEffortNotTaken(
  values: Pick<AgentDefaults, 'effort' | 'model'>,
  models: readonly InstallationModel[],
): void {
  if (values.effort === null) {
    return;
  }

  const target = modelNamed(models, values.model ?? 'default');
  if (target !== undefined && !target.supportedEffortLevels.includes(values.effort)) {
    throw new AgentSettingsInputInvalidError('effortUnsupported', {
      model: target.value,
      level: values.effort,
    });
  }
}

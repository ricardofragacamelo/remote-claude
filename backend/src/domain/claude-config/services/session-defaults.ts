import type { EffortLevel, InstallationModel, PermissionMode } from '@domain/session';
import type {
  ClaudeDefaults,
  DefaultField,
  EffectiveDefaults,
} from '../value-objects/claude-defaults.value-object';

/** Where the model a session opens with came from — what `session.started` says (`defaultsFrom`). */
export type SessionDefaultsSource = 'client' | 'folder' | 'user' | 'installation';

/** What a session is opened with, once the client's choice and the defaults are put together. */
export interface SessionDefaults extends Omit<ClaudeDefaults, 'permissionMode'> {
  readonly permissionMode: PermissionMode | null;

  /** Where the model came from. */
  readonly from: SessionDefaultsSource;

  /** The fields a default set and the installation no longer has — dropped, and logged. */
  readonly stale: readonly DefaultField[];
}

/** What the installation offers now, for a default to be checked against when a session opens. */
export interface InstallationOffer {
  /** `null` when the catalogue is not known yet: nothing is dropped for being unknown. */
  readonly models: readonly InstallationModel[] | null;
  readonly outputStyles: readonly string[] | null;
}

/** What the client sent in `session.start`. */
export interface ClientChoice {
  readonly model: string | null;
  readonly permissionMode: PermissionMode | null;
  readonly effort: EffortLevel | null;
}

/** The entry of a model in a list, by value or by what an alias resolves to. */
function entryOf(
  models: readonly InstallationModel[] | null,
  name: string,
): InstallationModel | undefined {
  return models?.find((model) => model.value === name || model.resolvedModel === name);
}

/** Whether the installation offers a model — or is not known, which drops nothing. */
function offers(models: readonly InstallationModel[] | null, name: string): boolean {
  return models === null || entryOf(models, name) !== undefined;
}

/** Whether an effort holds for a model: unknown models and lists drop nothing. */
function takesEffort(
  models: readonly InstallationModel[] | null,
  model: string | null,
  effort: EffortLevel,
): boolean {
  const entry = entryOf(models, model ?? 'default');
  return entry === undefined || entry.supportedEffortLevels.includes(effort);
}

/** Where a model that came from the defaults came from. */
function sourceOf(effective: EffectiveDefaults, kept: string | null): SessionDefaultsSource {
  if (kept === null) {
    return 'installation';
  }
  return effective.model.from === 'folder' ? 'folder' : 'user';
}

/**
 * The defaults a new session opens with (plan 13, B-15): the client's model, mode and effort win;
 * the rest comes from the effective defaults of its folder. A default the installation no longer
 * has — the model gone after an update, the output style deleted — does not stop the session: it is
 * dropped for the installation's, and named in `stale` for the log (S-51, S-53). An effort the model
 * does not take is dropped the same way, and so is a fallback equal to the main model.
 */
export function defaultsForSession(
  effective: EffectiveDefaults,
  offer: InstallationOffer,
  client: ClientChoice,
): SessionDefaults {
  const stale: DefaultField[] = [];
  const kept = <T>(
    field: DefaultField,
    value: T | null,
    holds: (value: T) => boolean,
  ): T | null => {
    if (value === null || holds(value)) {
      return value;
    }
    stale.push(field);
    return null;
  };

  const defaultModel = kept('model', effective.model.value, (name) => offers(offer.models, name));
  const model = client.model ?? defaultModel;
  const effort =
    client.effort ??
    kept('effort', effective.effort.value, (level) => takesEffort(offer.models, model, level));
  const outputStyle = kept(
    'outputStyle',
    effective.outputStyle.value,
    (style) => offer.outputStyles === null || offer.outputStyles.includes(style),
  );
  const fallbackModel = kept(
    'fallbackModel',
    effective.fallbackModel.value,
    (name) => name !== model && offers(offer.models, name),
  );

  return {
    model,
    permissionMode: client.permissionMode ?? effective.permissionMode.value,
    effort,
    thinking: effective.thinking.value,
    outputStyle,
    fallbackModel,
    from: client.model === null ? sourceOf(effective, defaultModel) : 'client',
    stale,
  };
}

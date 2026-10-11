import type { InstallationModel } from '@domain/session';

/**
 * A model of an installation as the clients read it: the domain's, and whether it takes an effort
 * at all — said by the levels it takes, and kept on the wire for the clients that read the flag.
 */
export interface ModelDto extends InstallationModel {
  readonly supportsEffort: boolean;
}

/** [model] on the wire. */
export function toModelDto(model: InstallationModel): ModelDto {
  return { ...model, supportsEffort: model.supportedEffortLevels.length > 0 };
}

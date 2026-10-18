import type { AgentModel } from '@remote-claude/contracts';

import type { InstallationModel } from '@domain/session';

/** [model] on the wire. Named `AgentModel` to match the web's own hand-written type (plan 28, B-48). */
export function toModelDto(model: InstallationModel): AgentModel {
  return { ...model, supportsEffort: model.supportedEffortLevels.length > 0 };
}

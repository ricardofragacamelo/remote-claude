import { DomainError } from '@domain/shared';

/**
 * A default naming a model this installation does not offer — checked when it is saved, against
 * the catalogue of the installation, never a list of ours. `422`.
 */
export class ModelNotAvailableError extends DomainError {
  readonly code = 'MODEL_NOT_AVAILABLE';
  readonly messageKey = 'claudeConfig.error.modelNotAvailable';

  constructor(model: string) {
    super(`the installation does not offer ${model}`, { model });
  }
}

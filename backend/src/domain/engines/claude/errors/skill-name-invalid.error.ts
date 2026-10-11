import { DomainError } from '@domain/shared';

/**
 * A skill name outside its form — lower-case letters, digits and hyphens, up to 64 characters.
 * `INVALID_INPUT`, like every refusal of that kind in the product, with its own text.
 */
export class SkillNameInvalidError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'engines.claude.error.skillNameInvalid';

  constructor(name: string) {
    super(`not a skill name: ${name}`, { name });
  }
}

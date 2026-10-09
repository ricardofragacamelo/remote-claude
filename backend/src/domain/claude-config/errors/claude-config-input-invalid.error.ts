import { DomainError } from '@domain/shared';

/** The rules of the configuration a well-formed body can still break, each with its own text. */
const MESSAGE_KEYS = {
  effortUnsupported: 'claudeConfig.error.effortUnsupported',
  fallbackSameAsModel: 'claudeConfig.error.fallbackSameAsModel',
  skillNameInvalid: 'claudeConfig.error.skillNameInvalid',
} as const;

export type ClaudeConfigInputRule = keyof typeof MESSAGE_KEYS;

/**
 * What the format took and the rules of the configuration do not: an effort the model does not take,
 * a fallback model equal to the main one, a skill name outside its form. `INVALID_INPUT`, like every
 * refusal of that kind in the product, and a key per rule — the screen says which, translated.
 */
export class ClaudeConfigInputInvalidError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey: string;

  constructor(
    readonly rule: ClaudeConfigInputRule,
    params: Readonly<Record<string, unknown>> = {},
  ) {
    super(`claude configuration refused: ${rule}`, params);
    this.messageKey = MESSAGE_KEYS[rule];
  }
}

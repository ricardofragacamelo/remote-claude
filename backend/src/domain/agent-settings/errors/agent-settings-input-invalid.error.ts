import { DomainError } from '@domain/shared';

/** The rules of the defaults a well-formed body can still break, each with its own text. */
const MESSAGE_KEYS = {
  effortUnsupported: 'agentSettings.error.effortUnsupported',
  fallbackSameAsModel: 'agentSettings.error.fallbackSameAsModel',
} as const;

export type AgentSettingsInputRule = keyof typeof MESSAGE_KEYS;

/**
 * What the format took and the rules of the defaults do not: an effort the model does not take, a
 * fallback model equal to the main one. `INVALID_INPUT`, like every refusal of that kind in the
 * product, and a key per rule — the screen says which, translated.
 */
export class AgentSettingsInputInvalidError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey: string;

  constructor(
    readonly rule: AgentSettingsInputRule,
    params: Readonly<Record<string, unknown>> = {},
  ) {
    super(`agent settings refused: ${rule}`, params);
    this.messageKey = MESSAGE_KEYS[rule];
  }
}

import { DomainError } from '@domain/shared';

/**
 * A prompt invoked a slash command this installation does not have.
 *
 * `INVALID_INPUT`, and refused before anything reaches Claude: sent on, the CLI would answer with
 * prose of its own, in English, inside the conversation — and the person on the phone would read a
 * turn that did nothing as if it were an answer (S-34).
 */
export class UnknownCommandError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'session.error.unknownCommand';

  constructor(command: string) {
    super(`this installation has no slash command named ${command}`, { command });
  }
}

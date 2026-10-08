import { DomainError } from '@domain/shared';

/**
 * The image of a prompt above the ceiling of the route — `413` (plan 22, D-10).
 *
 * The prompt took it, so the transcript has it; the route still serves only so much at once, and says
 * how much, so the screen can name it.
 */
export class PromptImageTooLargeError extends DomainError {
  readonly code = 'PAYLOAD_TOO_LARGE';
  readonly messageKey = 'transcript.error.imageTooLarge';

  constructor(size: number, limit: number) {
    super(`the image is ${String(size)} bytes, above the ${String(limit)} served`, { size, limit });
  }
}

import { DomainError } from '@domain/shared';

/**
 * The image of a prompt in a type the route does not serve — `415` (plan 22, D-10).
 *
 * The image is the user's data read back from the transcript, and it is served as itself: an SVG
 * executes script in the page that opens it, so only the raster types the Messages API reads go out.
 */
export class PromptImageTypeUnsupportedError extends DomainError {
  readonly code = 'UNSUPPORTED_MEDIA_TYPE';
  readonly messageKey = 'transcript.error.imageTypeUnsupported';

  constructor(mediaType: string) {
    super(`images of type ${mediaType} are not served`, { mediaType });
  }
}

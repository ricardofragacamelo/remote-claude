import { isEnvelope, PROTOCOL_VERSION } from '@remote-claude/contracts';
import type { Envelope } from '@remote-claude/contracts';

import { InputValidationError } from '@shared/errors/input-validation.error';
import { PayloadTooLargeError } from '@shared/errors/payload-too-large.error';
import { UnsupportedProtocolVersionError } from '@shared/errors/unsupported-protocol-version.error';
import { SUPPORTED_VERSIONS, WS_LIMITS } from './limits';

/**
 * Bytes in, envelope out.
 *
 * The frame is checked against the generated guard, which comes from the JSON Schema in
 * `packages/contracts/` — the same source the Dart client is generated from. Validating against a
 * hand-written shape here is how the three ends drift apart.
 */
export function decodeFrame(raw: string, maxBytes: number = WS_LIMITS.maxFrameBytes): Envelope {
  const bytes = Buffer.byteLength(raw, 'utf8');
  if (bytes > maxBytes) {
    throw new PayloadTooLargeError(bytes, maxBytes);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InputValidationError([{ field: 'frame', rule: 'mustBeJson' }]);
  }

  // The version is read before the envelope is validated: a frame from a future protocol may not
  // even have the shape this build knows, and the client still deserves to be told why.
  const version = (parsed as { v?: unknown } | null)?.v;
  if (version !== PROTOCOL_VERSION) {
    throw new UnsupportedProtocolVersionError(version, SUPPORTED_VERSIONS);
  }

  if (!isEnvelope(parsed)) {
    throw new InputValidationError([{ field: 'frame', rule: 'mustMatchEnvelope' }]);
  }

  return parsed;
}

/** Envelope out, bytes in. */
export function encodeFrame(frame: Envelope): string {
  return JSON.stringify(frame);
}
